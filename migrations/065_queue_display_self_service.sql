BEGIN;

-- 大屏快捷操作必须锁定预约，再核对服务归属。店长也只操作本人服务。
CREATE OR REPLACE FUNCTION public.live_queue_kiosk_action(
  p_booking_id text, p_shop_id text, p_actor_id text, p_action text,
  p_version integer, p_minutes integer DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  assigned_stylist text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN (
    'called', 'ready', 'service_started', 'service_finished', 'progress_updated', 'contact_attempted'
  ) THEN
    RAISE EXCEPTION 'QUEUE_FORBIDDEN';
  END IF;

  -- 与常规排队操作按相同顺序加锁，归属校验与写入在同一事务内。
  PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_id, 481));
  SELECT stylist_id INTO assigned_stylist
  FROM public.bookings
  WHERE id = p_booking_id AND shop_id = p_shop_id
  FOR UPDATE;

  IF NOT FOUND OR assigned_stylist IS DISTINCT FROM p_actor_id OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'QUEUE_FORBIDDEN';
  END IF;

  PERFORM 1 FROM public.employees
  WHERE id = p_actor_id AND shop_id = p_shop_id AND is_active
    AND role IN ('stylist', 'shop_manager')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUEUE_FORBIDDEN';
  END IF;

  RETURN public.live_queue_action(
    p_booking_id, p_shop_id, p_actor_id, 'staff', p_action, p_version, p_minutes, p_note
  );
END $$;

REVOKE ALL ON FUNCTION public.live_queue_kiosk_action(text,text,text,text,integer,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_queue_kiosk_action(text,text,text,text,integer,integer,text) TO service_role;

COMMIT;
