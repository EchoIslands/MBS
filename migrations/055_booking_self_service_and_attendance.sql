-- No historical no-show backfill. Penalties require a recorded staff decision.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_request_key text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scheduled_end_time timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_start_time timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_end_time timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delay_state text;
-- Historical/imported rows remain unchanged; all HTTP-created and self-rescheduled rows opt in server-side.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_policy_enforced boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS booking_request_once ON bookings(shop_id,customer_id,booking_request_key) WHERE booking_request_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS booking_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, booking_id text NOT NULL REFERENCES bookings(id),
 shop_id text NOT NULL, customer_id text NOT NULL, action text NOT NULL,
 old_time timestamptz, new_time timestamptz, late boolean NOT NULL DEFAULT false,
 actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS booking_attendance_decisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, booking_id text NOT NULL REFERENCES bookings(id),
 shop_id text NOT NULL, customer_id text NOT NULL, actor_id text NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500), created_at timestamptz NOT NULL DEFAULT now(),
 reversed_at timestamptz, reversed_by text, reversal_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_one_no_show ON booking_attendance_decisions(booking_id) WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS booking_attendance_customer ON booking_attendance_decisions(shop_id,customer_id,created_at);
CREATE INDEX IF NOT EXISTS booking_changes_customer ON booking_changes(shop_id,customer_id,created_at);
ALTER TABLE booking_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_attendance_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_changes,booking_attendance_decisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON booking_changes,booking_attendance_decisions TO service_role;

CREATE OR REPLACE FUNCTION booking_occupancy_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE phone_key text; ids text[]; strikes integer; last_strike timestamptz; slots integer; capacity integer; local_day date;
BEGIN
 IF NOT NEW.booking_policy_enforced THEN RETURN NEW; END IF;
 IF NEW.status NOT IN ('pending','confirmed') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.scheduled_time IS NOT DISTINCT FROM OLD.scheduled_time
   AND NEW.stylist_id IS NOT DISTINCT FROM OLD.stylist_id AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id AND OLD.status IN ('pending','confirmed') AND OLD.booking_policy_enforced THEN RETURN NEW; END IF;
 -- Same shop lock as the existing slot guard: every concurrent reservation observes the previous commit.
 PERFORM 1 FROM shops WHERE id=NEW.shop_id FOR UPDATE;
 SELECT phone INTO phone_key FROM customers WHERE id=NEW.customer_id AND shop_id=NEW.shop_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_CUSTOMER_INVALID'; END IF;
 SELECT array_agg(id) INTO ids FROM customers WHERE shop_id=NEW.shop_id AND
   (id=NEW.customer_id OR (phone_key IS NOT NULL AND phone_key<>'' AND phone=phone_key));
 local_day:=(NEW.scheduled_time AT TIME ZONE 'Asia/Shanghai')::date;
 IF NEW.scheduled_time<=clock_timestamp() OR local_day>(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date+14 THEN RAISE EXCEPTION 'BOOKING_DATE_RANGE'; END IF;
 SELECT count(*),max(created_at) INTO strikes,last_strike FROM booking_attendance_decisions
   WHERE shop_id=NEW.shop_id AND customer_id=ANY(ids) AND reversed_at IS NULL AND created_at>clock_timestamp()-interval '90 days';
 IF strikes>=3 AND last_strike>clock_timestamp()-interval '30 days' THEN RAISE EXCEPTION 'BOOKING_SUSPENDED'; END IF;
 IF strikes>=2 AND last_strike>clock_timestamp()-interval '14 days' AND local_day<>(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date THEN RAISE EXCEPTION 'BOOKING_TODAY_ONLY'; END IF;
 SELECT count(*) INTO slots FROM bookings WHERE shop_id=NEW.shop_id AND customer_id=ANY(ids) AND id<>NEW.id
   AND status IN ('pending','confirmed') AND (scheduled_time>=clock_timestamp() OR queue_state IN ('arrived','away','returned','called','serving'));
 IF slots>=(CASE WHEN strikes>=2 AND last_strike>clock_timestamp()-interval '14 days' THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'BOOKING_ACTIVE_LIMIT'; END IF;
 IF EXISTS(SELECT 1 FROM bookings WHERE shop_id=NEW.shop_id AND customer_id=ANY(ids) AND id<>NEW.id
   AND status IN ('pending','confirmed') AND (scheduled_time AT TIME ZONE 'Asia/Shanghai')::date=local_day) THEN RAISE EXCEPTION 'BOOKING_DAILY_LIMIT'; END IF;
 IF TG_OP='INSERT' AND (SELECT count(*) FROM bookings WHERE shop_id=NEW.shop_id AND customer_id=ANY(ids) AND created_at>clock_timestamp()-interval '10 minutes')>=5 THEN RAISE EXCEPTION 'BOOKING_RATE_LIMIT'; END IF;
 SELECT greatest(1,count(*)) INTO capacity FROM employees WHERE shop_id=NEW.shop_id AND is_active AND role IN ('stylist','shop_manager');
 SELECT count(*) INTO slots FROM bookings WHERE shop_id=NEW.shop_id AND id<>NEW.id AND status IN ('pending','confirmed')
   AND scheduled_time>=to_timestamp(floor(extract(epoch FROM NEW.scheduled_time)/1800)*1800)
   AND scheduled_time<to_timestamp(floor(extract(epoch FROM NEW.scheduled_time)/1800)*1800)+interval '30 minutes';
 IF slots>=capacity THEN RAISE EXCEPTION 'BOOKING_CAPACITY'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS booking_occupancy_guard ON bookings;
CREATE TRIGGER booking_occupancy_guard BEFORE INSERT OR UPDATE OF scheduled_time,stylist_id,service_id,status ON bookings FOR EACH ROW EXECUTE FUNCTION booking_occupancy_guard();

CREATE OR REPLACE FUNCTION create_booking_once(p_booking jsonb) RETURNS bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; key text:=p_booking->>'booking_request_key';
BEGIN
 PERFORM 1 FROM shops WHERE id=p_booking->>'shop_id' FOR UPDATE;
 IF key IS NOT NULL THEN
  IF length(key) NOT BETWEEN 16 AND 100 THEN RAISE EXCEPTION 'BOOKING_REQUEST_INVALID'; END IF;
  SELECT * INTO b FROM bookings WHERE shop_id=p_booking->>'shop_id' AND customer_id=p_booking->>'customer_id' AND booking_request_key=key;
  IF FOUND THEN
   IF b.service_id<>p_booking->>'service_id' OR b.stylist_id IS DISTINCT FROM NULLIF(p_booking->>'stylist_id','') OR b.scheduled_time<>(p_booking->>'scheduled_time')::timestamptz THEN RAISE EXCEPTION 'BOOKING_REQUEST_CONFLICT'; END IF;
   RETURN b;
  END IF;
 END IF;
 INSERT INTO bookings(id,shop_id,customer_id,customer_name,customer_phone,stylist_id,stylist_name,service_id,service_name,price,scheduled_time,queue_number,status,notes,created_at,booking_request_key,booking_policy_enforced)
 VALUES(p_booking->>'id',p_booking->>'shop_id',p_booking->>'customer_id',p_booking->>'customer_name',p_booking->>'customer_phone',NULLIF(p_booking->>'stylist_id',''),p_booking->>'stylist_name',p_booking->>'service_id',p_booking->>'service_name',(p_booking->>'price')::numeric,(p_booking->>'scheduled_time')::timestamptz,1,p_booking->>'status',p_booking->>'notes',clock_timestamp(),key,true) RETURNING * INTO b;
 RETURN b;
END $$;

CREATE OR REPLACE FUNCTION change_own_booking(p_id text,p_customer text,p_action text,p_time timestamptz DEFAULT NULL) RETURNS bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; old_at timestamptz; is_late boolean;
BEGIN
 -- Serialize with new reservations before taking the booking row lock.
 PERFORM 1 FROM shops WHERE id=(SELECT shop_id FROM bookings WHERE id=p_id AND customer_id=p_customer) FOR UPDATE;
 SELECT * INTO b FROM bookings WHERE id=p_id AND customer_id=p_customer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
 IF p_action NOT IN ('cancel','reschedule') THEN RAISE EXCEPTION 'BOOKING_ACTION_INVALID'; END IF;
 IF p_action='cancel' AND b.status='cancelled' THEN RETURN b; END IF;
 IF b.status NOT IN ('pending','confirmed') OR b.actual_start_time IS NOT NULL OR b.queue_state IN ('serving','finished') THEN RAISE EXCEPTION 'BOOKING_ALREADY_STARTED'; END IF;
 old_at:=b.scheduled_time; is_late:=old_at<clock_timestamp()+interval '2 hours' AND COALESCE(b.delay_state,'')<>'needs_action';
 IF p_action='reschedule' THEN
  IF b.arrived_at IS NOT NULL OR b.queue_state IS NOT NULL THEN RAISE EXCEPTION 'BOOKING_CONTACT_DESK'; END IF;
  IF p_time IS NULL THEN RAISE EXCEPTION 'BOOKING_DATE_RANGE'; END IF;
  IF p_time=b.scheduled_time THEN RETURN b; END IF;
  IF (SELECT count(*) FROM booking_changes WHERE customer_id=p_customer AND action='reschedule' AND created_at>clock_timestamp()-interval '1 day')>=5 THEN RAISE EXCEPTION 'BOOKING_RATE_LIMIT'; END IF;
  UPDATE bookings SET booking_policy_enforced=true,scheduled_time=p_time,scheduled_end_time=NULL,delay_state='rescheduled',updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO b;
 ELSE
  UPDATE bookings SET status='cancelled',updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO b;
 END IF;
 INSERT INTO booking_changes(booking_id,shop_id,customer_id,action,old_time,new_time,late,actor_id)
 VALUES(b.id,b.shop_id,b.customer_id,p_action,old_at,CASE WHEN p_action='reschedule' THEN p_time END,is_late,p_customer);
 RETURN b;
END $$;

CREATE OR REPLACE FUNCTION decide_booking_attendance(p_id text,p_actor text,p_action text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; role_name text;
BEGIN
 SELECT role INTO role_name FROM employees WHERE id=p_actor AND is_active AND shop_id=(SELECT shop_id FROM bookings WHERE id=p_id);
 IF role_name IS NULL OR role_name NOT IN ('ceo','shop_manager','customer_service') THEN RAISE EXCEPTION 'BOOKING_ATTENDANCE_FORBIDDEN'; END IF;
 IF length(trim(COALESCE(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'BOOKING_REASON_REQUIRED'; END IF;
 PERFORM 1 FROM shops WHERE id=(SELECT shop_id FROM bookings WHERE id=p_id) FOR UPDATE;
 SELECT * INTO b FROM bookings WHERE id=p_id FOR UPDATE;
 IF p_action='reverse' THEN
  IF role_name NOT IN ('ceo','shop_manager') THEN RAISE EXCEPTION 'BOOKING_ATTENDANCE_FORBIDDEN'; END IF;
  UPDATE booking_attendance_decisions SET reversed_at=clock_timestamp(),reversed_by=p_actor,reversal_reason=p_reason WHERE booking_id=p_id AND reversed_at IS NULL;
 ELSIF p_action='no_show' THEN
  IF EXISTS(SELECT 1 FROM booking_attendance_decisions WHERE booking_id=p_id AND reversed_at IS NULL) THEN RETURN; END IF;
  IF b.status<>'confirmed' OR b.arrived_at IS NOT NULL OR b.queue_state IS NOT NULL OR b.actual_start_time IS NOT NULL OR b.scheduled_time>clock_timestamp()-interval '60 minutes' OR b.delay_state IN ('needs_action','no_response') THEN RAISE EXCEPTION 'BOOKING_NOT_NO_SHOW'; END IF;
  INSERT INTO booking_attendance_decisions(booking_id,shop_id,customer_id,actor_id,reason) VALUES(b.id,b.shop_id,b.customer_id,p_actor,p_reason);
  UPDATE bookings SET status='cancelled',updated_at=clock_timestamp() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'BOOKING_ACTION_INVALID'; END IF;
END $$;
REVOKE ALL ON FUNCTION booking_occupancy_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION create_booking_once(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION change_own_booking(text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION decide_booking_attendance(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_booking_once(jsonb),change_own_booking(text,text,text,timestamptz),decide_booking_attendance(text,text,text,text) TO service_role;
-- Also refresh RPC discovery when this file is applied directly in the SQL editor.
NOTIFY pgrst, 'reload schema';
