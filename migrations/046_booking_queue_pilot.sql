-- Queue pilot: immutable event history and transactional snapshots. No historical backfill.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS called_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS missed_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS queue_state text,
  ADD COLUMN IF NOT EXISTS planned_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS duration_source text;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='booking_queue_state_valid') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT booking_queue_state_valid
      CHECK (queue_state IS NULL OR queue_state IN ('arrived','away','called','missed','returned','serving','finished'));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='booking_planned_duration_valid') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT booking_planned_duration_valid
      CHECK (planned_duration_minutes IS NULL OR planned_duration_minutes BETWEEN 1 AND 480);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='booking_duration_source_valid') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT booking_duration_source_valid
      CHECK (duration_source IS NULL OR duration_source IN ('service','stylist','manual'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.booking_queue_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id text NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  shop_id text NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('arrived','left_reported','returned','called','contact_attempted','missed','rescheduled','service_started','service_finished','correction')),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL DEFAULT 'staff' CHECK (actor_type IN ('staff','customer','system')),
  actor_id text NOT NULL,
  note text,
  expected_return_at timestamptz,
  related_event_id bigint REFERENCES public.booking_queue_events(id),
  CHECK (event_type='left_reported' OR expected_return_at IS NULL),
  CHECK (event_type='correction' OR related_event_id IS NULL),
  CHECK (event_type<>'correction' OR related_event_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS booking_queue_events_booking_idx ON public.booking_queue_events(booking_id,id DESC);
CREATE INDEX IF NOT EXISTS booking_queue_events_shop_time_idx ON public.booking_queue_events(shop_id,occurred_at DESC);
ALTER TABLE public.booking_queue_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_queue_events FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON public.booking_queue_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.booking_queue_events_id_seq TO service_role;

-- Capture the service directory duration once, on insert. Existing bookings remain unknown.
CREATE OR REPLACE FUNCTION public.snapshot_booking_queue_duration() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE minutes integer;
BEGIN
  IF NEW.planned_duration_minutes IS NULL THEN
    SELECT CASE WHEN (svc->>'duration') ~ '^[0-9]+$' THEN (svc->>'duration')::integer END INTO minutes
      FROM public.shops s, jsonb_array_elements(COALESCE(to_jsonb(s.services),'[]'::jsonb)) svc
      WHERE s.id=NEW.shop_id AND svc->>'id'=NEW.service_id LIMIT 1;
    NEW.planned_duration_minutes:=LEAST(480,GREATEST(1,COALESCE(minutes,30)));
    NEW.duration_source:='service';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS booking_queue_duration_snapshot ON public.bookings;
CREATE TRIGGER booking_queue_duration_snapshot BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_booking_queue_duration();
REVOKE ALL ON FUNCTION public.snapshot_booking_queue_duration() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_booking_queue_event(p_booking_id text,p_shop_id text,p_event_type text,p_actor_id text)
RETURNS public.booking_queue_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings%ROWTYPE; e public.booking_queue_events%ROWTYPE; t timestamptz:=clock_timestamp(); next_state text;
BEGIN
  IF p_event_type NOT IN ('arrived','left_reported','returned','called','missed','service_started','service_finished') OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'QUEUE_ACTION_INVALID';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR (b.status<>'confirmed' AND NOT (b.status='completed' AND p_event_type='service_finished' AND b.queue_state='serving')) OR
     (t AT TIME ZONE 'Asia/Shanghai')::date <> (b.scheduled_time AT TIME ZONE 'Asia/Shanghai')::date THEN
    RAISE EXCEPTION 'QUEUE_BOOKING_UNAVAILABLE';
  END IF;
  IF (p_event_type='arrived' AND (b.queue_state IS NOT NULL OR b.actual_start_time IS NOT NULL)) OR
     (p_event_type='left_reported' AND b.queue_state NOT IN ('arrived','returned')) OR
     (p_event_type='returned' AND b.queue_state NOT IN ('away','missed')) OR
     (p_event_type='called' AND b.queue_state NOT IN ('arrived','returned')) OR
     (p_event_type='missed' AND (b.queue_state<>'called' OR t<b.grace_deadline_at)) OR
     (p_event_type='service_started' AND (b.queue_state NOT IN ('arrived','returned','called') OR b.actual_start_time IS NOT NULL)) OR
     (p_event_type='service_finished' AND (b.queue_state<>'serving' OR b.actual_end_time IS NOT NULL)) THEN
    RAISE EXCEPTION 'QUEUE_STATE_CONFLICT';
  END IF;
  next_state:=CASE p_event_type WHEN 'left_reported' THEN 'away' WHEN 'service_started' THEN 'serving'
    WHEN 'service_finished' THEN 'finished' ELSE p_event_type END;
  UPDATE public.bookings SET queue_state=next_state,
    arrived_at=CASE WHEN p_event_type='arrived' THEN t ELSE arrived_at END,
    returned_at=CASE WHEN p_event_type='returned' THEN t ELSE returned_at END,
    called_at=CASE WHEN p_event_type='called' THEN t ELSE called_at END,
    grace_deadline_at=CASE WHEN p_event_type='called' THEN t+interval '10 minutes' ELSE grace_deadline_at END,
    missed_at=CASE WHEN p_event_type='missed' THEN t ELSE missed_at END,
    actual_start_time=CASE WHEN p_event_type='service_started' THEN t ELSE actual_start_time END,
    actual_end_time=CASE WHEN p_event_type='service_finished' THEN t ELSE actual_end_time END
    WHERE id=b.id;
  INSERT INTO public.booking_queue_events(booking_id,shop_id,event_type,occurred_at,actor_id)
    VALUES(b.id,p_shop_id,p_event_type,t,p_actor_id) RETURNING * INTO e;
  RETURN e;
END $$;

CREATE OR REPLACE FUNCTION public.correct_booking_queue_event(p_event_id bigint,p_shop_id text,p_actor_id text,p_occurred_at timestamptz)
RETURNS public.booking_queue_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target public.booking_queue_events%ROWTYPE; b public.bookings%ROWTYPE; e public.booking_queue_events%ROWTYPE;
  effective_time timestamptz; previous_time timestamptz; field_name text;
BEGIN
  IF p_actor_id IS NULL OR p_occurred_at IS NULL THEN RAISE EXCEPTION 'QUEUE_CORRECTION_INVALID'; END IF;
  SELECT * INTO target FROM public.booking_queue_events WHERE id=p_event_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR target.event_type NOT IN ('arrived','left_reported','returned','called','missed','service_started','service_finished') THEN
    RAISE EXCEPTION 'QUEUE_EVENT_NOT_CORRECTABLE';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id=target.booking_id AND shop_id=p_shop_id FOR UPDATE;
  IF (p_occurred_at AT TIME ZONE 'Asia/Shanghai')::date <> (b.scheduled_time AT TIME ZONE 'Asia/Shanghai')::date
    OR p_occurred_at>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'QUEUE_CORRECTION_TIME_INVALID'; END IF;
  IF (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date <> (b.scheduled_time AT TIME ZONE 'Asia/Shanghai')::date THEN
    RAISE EXCEPTION 'QUEUE_CORRECTION_DAY_CLOSED';
  END IF;
  SELECT COALESCE((SELECT c.occurred_at FROM public.booking_queue_events c WHERE c.related_event_id=target.id ORDER BY c.id DESC LIMIT 1),target.occurred_at)
    INTO previous_time;
  IF target.event_type='left_reported' THEN
    INSERT INTO public.booking_queue_events(booking_id,shop_id,event_type,occurred_at,actor_id,note,related_event_id)
      VALUES(b.id,p_shop_id,'correction',p_occurred_at,p_actor_id,'previous='||previous_time::text,target.id) RETURNING * INTO e;
    RETURN e;
  END IF;
  IF target.event_type='arrived' THEN field_name:='arrived_at';
  ELSIF target.event_type='returned' THEN field_name:='returned_at';
  ELSIF target.event_type='called' THEN field_name:='called_at';
  ELSIF target.event_type='missed' THEN field_name:='missed_at';
  ELSIF target.event_type='service_started' THEN field_name:='actual_start_time';
  ELSE field_name:='actual_end_time'; END IF;
  -- Only the latest event of its type may update the current snapshot.
  IF (to_jsonb(b)->>field_name)::timestamptz IS DISTINCT FROM previous_time THEN
    RAISE EXCEPTION 'QUEUE_EVENT_NOT_CURRENT';
  END IF;
  IF target.event_type='service_finished' AND b.actual_start_time IS NOT NULL AND p_occurred_at<=b.actual_start_time OR
     target.event_type='service_started' AND b.actual_end_time IS NOT NULL AND p_occurred_at>=b.actual_end_time OR
     target.event_type='missed' AND b.called_at IS NOT NULL AND p_occurred_at<b.called_at OR
     target.event_type='called' AND b.missed_at IS NOT NULL AND b.missed_at>=previous_time AND p_occurred_at>b.missed_at THEN
    RAISE EXCEPTION 'QUEUE_CORRECTION_ORDER_INVALID';
  END IF;
  EXECUTE format('UPDATE public.bookings SET %I=$1 WHERE id=$2',field_name) USING p_occurred_at,b.id;
  IF target.event_type='called' THEN
    UPDATE public.bookings SET grace_deadline_at=p_occurred_at+interval '10 minutes' WHERE id=b.id;
  END IF;
  INSERT INTO public.booking_queue_events(booking_id,shop_id,event_type,occurred_at,actor_id,note,related_event_id)
    VALUES(b.id,p_shop_id,'correction',p_occurred_at,p_actor_id,'previous='||previous_time::text,target.id) RETURNING * INTO e;
  RETURN e;
END $$;
REVOKE ALL ON FUNCTION public.record_booking_queue_event(text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.correct_booking_queue_event(bigint,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_booking_queue_event(text,text,text,text), public.correct_booking_queue_event(bigint,text,text,timestamptz) TO service_role;
