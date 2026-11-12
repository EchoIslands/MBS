-- Live queue: server-owned ordering, optimistic concurrency and durable notices.
ALTER TABLE public.bookings
 ADD COLUMN IF NOT EXISTS queue_version integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS queue_priority_at timestamptz,
 ADD COLUMN IF NOT EXISTS expected_return_at timestamptz,
 ADD COLUMN IF NOT EXISTS return_requested_at timestamptz,
 ADD COLUMN IF NOT EXISTS ready_at timestamptz,
 ADD COLUMN IF NOT EXISTS progress_remaining_minutes integer,
 ADD COLUMN IF NOT EXISTS progress_updated_at timestamptz,
 ADD COLUMN IF NOT EXISTS missed_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS queue_ack_event_id bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS queue_call_event_id bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS queue_help_requested_at timestamptz,
 ADD COLUMN IF NOT EXISTS queue_contacted_at timestamptz;
ALTER TABLE public.booking_queue_events DROP CONSTRAINT IF EXISTS booking_queue_events_event_type_check;
ALTER TABLE public.booking_queue_events ADD CONSTRAINT booking_queue_events_event_type_check CHECK
 (event_type IN ('arrived','left_reported','returned','called','contact_attempted','missed','rescheduled','service_started','service_finished','correction','ready','return_requested','progress_updated','help_requested','reordered','acknowledged'));
CREATE INDEX IF NOT EXISTS bookings_live_queue_idx ON public.bookings(shop_id,scheduled_time,queue_state);

CREATE OR REPLACE FUNCTION public.live_queue_action(p_booking_id text,p_shop_id text,p_actor_id text,p_actor_type text,p_action text,p_version integer,p_minutes integer DEFAULT NULL,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings%ROWTYPE; t timestamptz:=clock_timestamp(); e bigint; role_name text;
BEGIN
 -- Serialize the whole shop so two devices cannot start the same stylist concurrently.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_id,481));
 SELECT * INTO b FROM public.bookings WHERE id=p_booking_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUEUE_NOT_FOUND'; END IF;
 IF p_actor_type='customer' THEN
   IF b.customer_id IS DISTINCT FROM p_actor_id OR p_action NOT IN ('left_reported','return_requested','acknowledged','help_requested') THEN RAISE EXCEPTION 'QUEUE_FORBIDDEN'; END IF;
 ELSIF p_actor_type='staff' THEN
   SELECT role INTO role_name FROM public.employees WHERE id=p_actor_id AND shop_id=p_shop_id AND is_active=true;
   IF role_name IS NULL OR role_name NOT IN ('ceo','shop_manager','customer_service','stylist') THEN RAISE EXCEPTION 'QUEUE_FORBIDDEN'; END IF;
   IF role_name='stylist' AND (b.stylist_id IS DISTINCT FROM p_actor_id OR p_action NOT IN ('called','ready','service_started','service_finished','progress_updated','contact_attempted')) THEN RAISE EXCEPTION 'QUEUE_FORBIDDEN'; END IF;
 ELSE RAISE EXCEPTION 'QUEUE_FORBIDDEN'; END IF;
 IF p_version IS NULL OR p_version<>b.queue_version THEN RAISE EXCEPTION 'QUEUE_STALE_VERSION'; END IF;
 IF (t AT TIME ZONE 'Asia/Shanghai')::date<>(b.scheduled_time AT TIME ZONE 'Asia/Shanghai')::date OR
    (b.status<>'confirmed' AND NOT (b.status='completed' AND b.queue_state='serving' AND p_action IN ('progress_updated','service_finished'))) OR b.queue_state='finished' THEN RAISE EXCEPTION 'QUEUE_CLOSED'; END IF;
 IF p_action NOT IN ('arrived','left_reported','returned','return_requested','called','ready','missed','service_started','service_finished','progress_updated','acknowledged','help_requested','contact_attempted','reordered') THEN RAISE EXCEPTION 'QUEUE_ACTION_INVALID'; END IF;
 IF p_action='arrived' THEN
   IF b.queue_state IS NOT NULL OR b.actual_start_time IS NOT NULL THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET queue_state='arrived',arrived_at=t,queue_priority_at=t WHERE id=b.id;
 ELSIF p_action='left_reported' THEN
   IF b.queue_state IS NULL OR b.queue_state NOT IN ('arrived','returned') OR p_minutes IS NULL OR p_minutes NOT BETWEEN 5 AND 120 THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET queue_state='away',expected_return_at=t+make_interval(mins=>p_minutes),return_requested_at=NULL WHERE id=b.id;
 ELSIF p_action='return_requested' THEN
   IF b.queue_state IS NULL OR b.queue_state NOT IN ('away','missed') OR b.return_requested_at IS NOT NULL THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET return_requested_at=t WHERE id=b.id;
 ELSIF p_action='returned' THEN
   IF b.queue_state IS NULL OR b.queue_state NOT IN ('away','missed') THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET queue_state='returned',returned_at=t,expected_return_at=NULL,return_requested_at=NULL,
    queue_priority_at=CASE WHEN b.missed_count<=1 AND (b.missed_at IS NULL OR t-b.missed_at<=interval '60 minutes') THEN COALESCE(b.arrived_at,t) ELSE t END WHERE id=b.id;
 ELSIF p_action='ready' THEN
   IF b.queue_state IS NULL OR b.queue_state NOT IN ('arrived','returned','away') OR b.ready_at IS NOT NULL THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET ready_at=t WHERE id=b.id;
 ELSIF p_action='called' THEN
   IF EXISTS(SELECT 1 FROM employees WHERE id=b.stylist_id AND queue_pause_until>t) THEN RAISE EXCEPTION 'QUEUE_STYLIST_PAUSED'; END IF;
   IF b.stylist_id IS NULL OR EXISTS(SELECT 1 FROM bookings WHERE shop_id=p_shop_id AND stylist_id=b.stylist_id AND id<>b.id AND (queue_state='serving' OR actual_start_time IS NOT NULL) AND actual_end_time IS NULL AND status<>'cancelled') THEN RAISE EXCEPTION 'QUEUE_STYLIST_BUSY'; END IF;
   IF b.queue_state IS NULL OR b.queue_state NOT IN ('arrived','returned','away') THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET queue_state='called',called_at=t,grace_deadline_at=t+interval '10 minutes' WHERE id=b.id;
 ELSIF p_action='missed' THEN
   IF b.queue_state IS DISTINCT FROM 'called' OR b.grace_deadline_at IS NULL OR t<b.grace_deadline_at THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET queue_state='missed',missed_at=t,missed_count=missed_count+1,return_requested_at=NULL WHERE id=b.id;
 ELSIF p_action='service_started' THEN
   IF b.queue_state IS NULL OR b.queue_state NOT IN ('arrived','returned','called') OR b.actual_start_time IS NOT NULL OR b.stylist_id IS NULL THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   IF NOT EXISTS(SELECT 1 FROM employees WHERE id=b.stylist_id AND shop_id=p_shop_id AND is_active=true AND role IN ('stylist','shop_manager')) THEN RAISE EXCEPTION 'QUEUE_STYLIST_BUSY'; END IF;
   IF EXISTS(SELECT 1 FROM employees WHERE id=b.stylist_id AND queue_pause_until>t) THEN RAISE EXCEPTION 'QUEUE_STYLIST_PAUSED'; END IF;
   IF EXISTS(SELECT 1 FROM bookings WHERE shop_id=p_shop_id AND stylist_id=b.stylist_id AND id<>b.id AND (queue_state='serving' OR (actual_start_time IS NOT NULL AND actual_end_time IS NULL AND status<>'cancelled'))) THEN RAISE EXCEPTION 'QUEUE_STYLIST_BUSY'; END IF;
   -- Explicit reason is required to override an earlier waiting guest on the same stylist lane.
   IF EXISTS(SELECT 1 FROM bookings q WHERE q.shop_id=p_shop_id AND q.stylist_id=b.stylist_id AND q.id<>b.id AND q.status='confirmed' AND q.queue_state IN ('arrived','returned','called') AND
     (q.scheduled_time AT TIME ZONE 'Asia/Shanghai')::date=(t AT TIME ZONE 'Asia/Shanghai')::date AND
     (COALESCE(q.queue_priority_at,q.arrived_at,q.scheduled_time),q.id)<(COALESCE(b.queue_priority_at,b.arrived_at,b.scheduled_time),b.id)) AND length(trim(COALESCE(p_note,'')))<4 THEN RAISE EXCEPTION 'QUEUE_ORDER_REASON_REQUIRED'; END IF;
   UPDATE bookings SET queue_state='serving',actual_start_time=t,expected_return_at=NULL,return_requested_at=NULL,progress_remaining_minutes=COALESCE(planned_duration_minutes,30),progress_updated_at=t WHERE id=b.id;
 ELSIF p_action='service_finished' THEN
   IF b.queue_state IS DISTINCT FROM 'serving' OR b.actual_end_time IS NOT NULL THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET queue_state='finished',actual_end_time=t,progress_remaining_minutes=0,progress_updated_at=t WHERE id=b.id;
 ELSIF p_action='progress_updated' THEN
   IF b.queue_state IS DISTINCT FROM 'serving' OR p_minutes IS NULL OR p_minutes NOT BETWEEN 5 AND 180 THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET progress_remaining_minutes=p_minutes,progress_updated_at=t WHERE id=b.id;
 ELSIF p_action='reordered' THEN
   IF role_name NOT IN ('ceo','shop_manager','customer_service') OR b.queue_state IS NULL OR b.queue_state NOT IN ('arrived','returned') OR length(trim(COALESCE(p_note,'')))<4 THEN RAISE EXCEPTION 'QUEUE_ORDER_REASON_REQUIRED'; END IF;
   UPDATE bookings SET queue_priority_at=t-interval '12 hours' WHERE id=b.id;
 ELSIF p_action='acknowledged' THEN
   IF b.queue_state IS DISTINCT FROM 'called' THEN RAISE EXCEPTION 'QUEUE_STATE_CONFLICT'; END IF;
   UPDATE bookings SET queue_ack_event_id=COALESCE((SELECT max(id) FROM booking_queue_events WHERE booking_id=b.id),0) WHERE id=b.id;
 ELSIF p_action='contact_attempted' THEN
   UPDATE bookings SET queue_contacted_at=t WHERE id=b.id;
 ELSIF p_action='help_requested' THEN
   IF EXISTS(SELECT 1 FROM booking_queue_events WHERE booking_id=b.id AND event_type='help_requested' AND id>COALESCE((SELECT max(id) FROM booking_queue_events WHERE booking_id=b.id AND event_type='contact_attempted'),0)) THEN RAISE EXCEPTION 'QUEUE_HELP_PENDING'; END IF;
   UPDATE bookings SET queue_help_requested_at=t WHERE id=b.id;
 END IF;
 UPDATE bookings SET queue_version=queue_version+1 WHERE id=b.id;
 INSERT INTO booking_queue_events(booking_id,shop_id,event_type,occurred_at,actor_id,actor_type,note,expected_return_at)
 VALUES(b.id,p_shop_id,p_action,t,p_actor_id,p_actor_type,left(p_note,300),CASE WHEN p_action='left_reported' THEN t+make_interval(mins=>p_minutes) END) RETURNING id INTO e;
 IF p_action='called' THEN UPDATE bookings SET queue_call_event_id=e WHERE id=b.id; END IF;
 RETURN jsonb_build_object('eventId',e,'version',b.queue_version+1,'recordedAt',t);
END $$;
REVOKE ALL ON FUNCTION public.live_queue_action(text,text,text,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.live_queue_action(text,text,text,text,text,integer,integer,text) TO service_role;

-- Corrections are also visible to optimistic concurrency clients.
CREATE OR REPLACE FUNCTION public.bump_queue_correction_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.event_type='correction' THEN UPDATE public.bookings SET queue_version=queue_version+1 WHERE id=NEW.booking_id; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_correction_version ON public.booking_queue_events;
CREATE TRIGGER queue_correction_version AFTER INSERT ON public.booking_queue_events FOR EACH ROW EXECUTE FUNCTION public.bump_queue_correction_version();
REVOKE ALL ON FUNCTION public.bump_queue_correction_version() FROM PUBLIC,anon,authenticated;
-- Prevent the superseded RPC from bypassing the new shop lock/version checks.
REVOKE EXECUTE ON FUNCTION public.record_booking_queue_event(text,text,text,text) FROM service_role;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS queue_pause_until timestamptz,
 ADD COLUMN IF NOT EXISTS queue_availability_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.queue_staff_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 shop_id text NOT NULL REFERENCES public.shops(id),stylist_id text NOT NULL REFERENCES public.employees(id),
 actor_id text NOT NULL,action text NOT NULL CHECK(action IN ('pause','resume')),pause_until timestamptz,recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.queue_staff_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.queue_staff_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.queue_staff_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.queue_staff_events_id_seq TO service_role;
CREATE OR REPLACE FUNCTION public.live_queue_availability(p_shop_id text,p_actor_id text,p_stylist_id text,p_version integer,p_minutes integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role text; target public.employees%ROWTYPE; until_time timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_id,481));
 SELECT role INTO actor_role FROM employees WHERE id=p_actor_id AND shop_id=p_shop_id AND is_active=true;
 IF actor_role IS NULL OR actor_role NOT IN ('ceo','shop_manager','customer_service','stylist') OR (actor_role='stylist' AND p_stylist_id<>p_actor_id) THEN RAISE EXCEPTION 'QUEUE_FORBIDDEN'; END IF;
 SELECT * INTO target FROM employees WHERE id=p_stylist_id AND shop_id=p_shop_id AND is_active=true AND role IN ('stylist','shop_manager') FOR UPDATE;
 IF NOT FOUND OR p_version IS NULL OR target.queue_availability_version<>p_version THEN RAISE EXCEPTION 'QUEUE_STALE_VERSION'; END IF;
 IF p_minutes IS NULL OR p_minutes<>0 AND p_minutes NOT BETWEEN 5 AND 180 THEN RAISE EXCEPTION 'QUEUE_ACTION_INVALID'; END IF;
 until_time:=CASE WHEN p_minutes=0 THEN NULL ELSE clock_timestamp()+make_interval(mins=>p_minutes) END;
 UPDATE employees SET queue_pause_until=until_time,queue_availability_version=queue_availability_version+1 WHERE id=p_stylist_id;
 INSERT INTO queue_staff_events(shop_id,stylist_id,actor_id,action,pause_until) VALUES(p_shop_id,p_stylist_id,p_actor_id,CASE WHEN p_minutes=0 THEN 'resume' ELSE 'pause' END,until_time);
END $$;
REVOKE ALL ON FUNCTION public.live_queue_availability(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.live_queue_availability(text,text,text,integer,integer) TO service_role;

-- Correcting an arrival timestamp also corrects its default priority, without undoing deliberate reorders.
CREATE OR REPLACE FUNCTION public.sync_queue_arrival_priority() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.arrived_at IS NOT NULL AND NEW.arrived_at IS DISTINCT FROM OLD.arrived_at AND OLD.queue_priority_at=OLD.arrived_at THEN
   NEW.queue_priority_at:=NEW.arrived_at;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_arrival_priority ON public.bookings;
CREATE TRIGGER queue_arrival_priority BEFORE UPDATE OF arrived_at ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_queue_arrival_priority();
REVOKE ALL ON FUNCTION public.sync_queue_arrival_priority() FROM PUBLIC,anon,authenticated;
