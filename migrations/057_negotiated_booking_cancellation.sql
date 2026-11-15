-- 协商取消：记录门店与顾客达成的取消结果，不写入爽约记录。
ALTER TABLE booking_changes ADD COLUMN IF NOT EXISTS reason text;
CREATE OR REPLACE FUNCTION decide_booking_attendance(p_id text,p_actor text,p_action text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; role_name text;
BEGIN
 SELECT role INTO role_name FROM employees WHERE id=p_actor AND is_active AND shop_id=(SELECT shop_id FROM bookings WHERE id=p_id);
 IF role_name IS NULL OR role_name NOT IN ('ceo','shop_manager','customer_service') THEN RAISE EXCEPTION 'BOOKING_ATTENDANCE_FORBIDDEN'; END IF;
 IF length(trim(COALESCE(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'BOOKING_REASON_REQUIRED'; END IF;
 PERFORM 1 FROM shops WHERE id=(SELECT shop_id FROM bookings WHERE id=p_id) FOR UPDATE;
 SELECT * INTO b FROM bookings WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
 IF p_action='reverse' THEN
  IF role_name NOT IN ('ceo','shop_manager') THEN RAISE EXCEPTION 'BOOKING_ATTENDANCE_FORBIDDEN'; END IF;
  UPDATE booking_attendance_decisions SET reversed_at=clock_timestamp(),reversed_by=p_actor,reversal_reason=p_reason WHERE booking_id=p_id AND reversed_at IS NULL;
 ELSIF p_action='negotiated_cancel' THEN
  IF b.status NOT IN ('pending','confirmed') OR b.actual_start_time IS NOT NULL THEN RAISE EXCEPTION 'BOOKING_ALREADY_STARTED'; END IF;
  UPDATE bookings SET status='cancelled',updated_at=clock_timestamp() WHERE id=p_id;
  INSERT INTO booking_changes(booking_id,shop_id,customer_id,action,old_time,late,actor_id,reason)
  VALUES(b.id,b.shop_id,b.customer_id,'negotiated_cancel',b.scheduled_time,false,p_actor,p_reason);
 ELSIF p_action='no_show' THEN
  IF EXISTS(SELECT 1 FROM booking_attendance_decisions WHERE booking_id=p_id AND reversed_at IS NULL) THEN RETURN; END IF;
  IF b.status<>'confirmed' OR b.arrived_at IS NOT NULL OR b.queue_state IS NOT NULL OR b.actual_start_time IS NOT NULL OR b.scheduled_time>clock_timestamp()-interval '60 minutes' OR b.delay_state IN ('needs_action','no_response') THEN RAISE EXCEPTION 'BOOKING_NOT_NO_SHOW'; END IF;
  INSERT INTO booking_attendance_decisions(booking_id,shop_id,customer_id,actor_id,reason) VALUES(b.id,b.shop_id,b.customer_id,p_actor,p_reason);
  UPDATE bookings SET status='cancelled',updated_at=clock_timestamp() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'BOOKING_ACTION_INVALID'; END IF;
END $$;
REVOKE ALL ON FUNCTION decide_booking_attendance(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION decide_booking_attendance(text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
