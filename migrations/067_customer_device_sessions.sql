BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  shop_id text NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS customer_device_sessions_expiry_idx
  ON public.customer_device_sessions (last_seen_at);
ALTER TABLE public.customer_device_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_device_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.customer_device_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.touch_customer_device_session(p_id uuid, p_customer_id text, p_shop_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  current_time_at timestamptz := clock_timestamp();
  last_seen timestamptz;
BEGIN
  SELECT last_seen_at INTO last_seen
  FROM public.customer_device_sessions
  WHERE id=p_id AND customer_id=p_customer_id AND shop_id=p_shop_id;
  IF NOT FOUND OR last_seen <= current_time_at - interval '30 days' THEN
    RETURN false;
  END IF;

  -- Read-only traffic usually stays off the write path, including frequent queue polling.
  IF last_seen <= current_time_at - interval '5 minutes' THEN
    UPDATE public.customer_device_sessions
    SET last_seen_at=current_time_at
    WHERE id=p_id AND customer_id=p_customer_id AND shop_id=p_shop_id
      AND last_seen_at=last_seen;
    IF NOT FOUND THEN
      RETURN EXISTS (
        SELECT 1 FROM public.customer_device_sessions
        WHERE id=p_id AND customer_id=p_customer_id AND shop_id=p_shop_id
          AND last_seen_at > current_time_at - interval '30 days'
      );
    END IF;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.touch_customer_device_session(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_customer_device_session(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.open_customer_device_session(p_customer_id text, p_shop_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  session_id uuid;
BEGIN
  DELETE FROM public.customer_device_sessions WHERE id IN (
    SELECT id FROM public.customer_device_sessions
    WHERE last_seen_at <= clock_timestamp() - interval '30 days'
    ORDER BY last_seen_at LIMIT 100 FOR UPDATE SKIP LOCKED
  );
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id=p_customer_id AND shop_id=p_shop_id) THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;
  INSERT INTO public.customer_device_sessions(customer_id,shop_id)
    VALUES(p_customer_id,p_shop_id) RETURNING id INTO session_id;
  RETURN session_id;
END $$;
REVOKE ALL ON FUNCTION public.open_customer_device_session(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_customer_device_session(text,text) TO service_role;

COMMIT;
