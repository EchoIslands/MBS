-- Failed-password quota; successful verification does not spend it.
-- Legacy daily_attempts mixes success/failure and cannot be converted reliably.
ALTER TABLE public.customer_auth_limits
  ADD COLUMN IF NOT EXISTS failure_day DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Asia/Shanghai')::DATE),
  ADD COLUMN IF NOT EXISTS daily_failures INTEGER NOT NULL DEFAULT 0 CHECK (daily_failures >= 0);

-- Short-lived reservations bound concurrent guesses before their outcomes are known.
CREATE TABLE IF NOT EXISTS public.customer_auth_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL REFERENCES public.customer_auth_limits(ip_hash) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 minutes')
);
CREATE INDEX IF NOT EXISTS customer_auth_reservations_ip_expiry
  ON public.customer_auth_reservations(ip_hash, expires_at);
ALTER TABLE public.customer_auth_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_auth_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.customer_auth_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.begin_customer_auth_attempt_v2(p_ip_hash TEXT)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER, reason TEXT, attempt_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.customer_auth_limits%ROWTYPE;
  today DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
  pending INTEGER;
  earliest TIMESTAMPTZ;
  ticket UUID;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_AUTH_KEY'; END IF;
  INSERT INTO public.customer_auth_limits(ip_hash) VALUES(p_ip_hash) ON CONFLICT(ip_hash) DO NOTHING;
  SELECT * INTO r FROM public.customer_auth_limits WHERE ip_hash=p_ip_hash FOR UPDATE;
  IF r.failure_day <> today THEN
    UPDATE public.customer_auth_limits SET failure_day=today, daily_failures=0, updated_at=NOW() WHERE ip_hash=p_ip_hash;
    r.daily_failures := 0;
  END IF;
  IF r.locked_until IS NOT NULL AND r.locked_until > NOW() THEN
    RETURN QUERY SELECT FALSE, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.locked_until-NOW())))::INTEGER), 'temporary_lock'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  IF r.locked_until IS NOT NULL THEN
    UPDATE public.customer_auth_limits SET failed_attempts=0, locked_until=NULL, updated_at=NOW() WHERE ip_hash=p_ip_hash;
  END IF;
  IF r.daily_failures >= 10 THEN
    RETURN QUERY SELECT FALSE,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (((today+1)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai')-NOW())))::INTEGER),
      'daily_limit'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  DELETE FROM public.customer_auth_reservations WHERE ip_hash=p_ip_hash AND expires_at<=NOW();
  SELECT COUNT(*)::INTEGER, MIN(expires_at) INTO pending, earliest
    FROM public.customer_auth_reservations WHERE ip_hash=p_ip_hash;
  IF r.daily_failures + pending >= 10 THEN
    RETURN QUERY SELECT FALSE, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (earliest-NOW())))::INTEGER), 'verification_busy'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  INSERT INTO public.customer_auth_reservations(ip_hash) VALUES(p_ip_hash) RETURNING id INTO ticket;
  RETURN QUERY SELECT TRUE, 0, 'allowed'::TEXT, ticket;
END $$;

CREATE OR REPLACE FUNCTION public.finish_customer_auth_attempt_v2(p_ip_hash TEXT, p_attempt_id UUID, p_outcome TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.customer_auth_limits%ROWTYPE;
  expiry TIMESTAMPTZ;
  today DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('success','failure','cancelled') THEN RAISE EXCEPTION 'INVALID_AUTH_OUTCOME'; END IF;
  -- Always lock parent before reservation, matching begin's lock order.
  SELECT * INTO r FROM public.customer_auth_limits WHERE ip_hash=p_ip_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  DELETE FROM public.customer_auth_reservations WHERE ip_hash=p_ip_hash AND id=p_attempt_id RETURNING expires_at INTO expiry;
  IF NOT FOUND OR expiry<=NOW() THEN RETURN FALSE; END IF;
  IF p_outcome='cancelled' THEN RETURN TRUE; END IF;
  IF r.failure_day <> today THEN
    UPDATE public.customer_auth_limits SET failure_day=today, daily_failures=0 WHERE ip_hash=p_ip_hash;
  END IF;
  IF p_outcome='success' THEN
    -- A late admitted success must never remove a newer failure lock.
    UPDATE public.customer_auth_limits SET failed_attempts=0, locked_until=NULL, updated_at=NOW()
      WHERE ip_hash=p_ip_hash AND (locked_until IS NULL OR locked_until<=NOW());
  ELSE
    UPDATE public.customer_auth_limits SET daily_failures=daily_failures+1,
      failed_attempts=CASE WHEN locked_until IS NOT NULL AND locked_until<=NOW() THEN 1 ELSE failed_attempts+1 END,
      locked_until=CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until<=NOW() THEN 1 ELSE failed_attempts+1 END)>=5
        THEN GREATEST(locked_until,NOW()+INTERVAL '15 minutes') ELSE NULL END,
      updated_at=NOW() WHERE ip_hash=p_ip_hash;
  END IF;
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.begin_customer_auth_attempt_v2(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_customer_auth_attempt_v2(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_customer_auth_attempt_v2(TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.finish_customer_auth_attempt_v2(TEXT,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_customer_auth_attempt_v2(TEXT,UUID,TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_customer_auth_attempt_v2(TEXT,UUID,TEXT) TO service_role;
