-- Durable, atomic OTP quotas for customer mini-program login. No plaintext code or phone is stored here.
CREATE TABLE IF NOT EXISTS public.customer_sms_ip_limits (
  ip_hash text PRIMARY KEY CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  send_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Shanghai')::date),
  send_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.customer_sms_challenges (
  phone_hash text PRIMARY KEY CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text NOT NULL,
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  send_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Shanghai')::date),
  send_count integer NOT NULL DEFAULT 0,
  failed_checks integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS customer_sms_challenges_expiry ON public.customer_sms_challenges(expires_at);
ALTER TABLE public.customer_sms_ip_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sms_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_sms_ip_limits, public.customer_sms_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_sms_ip_limits, public.customer_sms_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.begin_customer_sms_code(p_phone_hash text, p_ip_hash text, p_code_hash text)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.customer_sms_challenges%ROWTYPE; i public.customer_sms_ip_limits%ROWTYPE;
  today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
  IF p_phone_hash !~ '^[0-9a-f]{64}$' OR p_ip_hash !~ '^[0-9a-f]{64}$' OR p_code_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_SMS_KEY'; END IF;
  INSERT INTO public.customer_sms_ip_limits(ip_hash) VALUES(p_ip_hash) ON CONFLICT DO NOTHING;
  SELECT * INTO i FROM public.customer_sms_ip_limits WHERE ip_hash=p_ip_hash FOR UPDATE;
  IF i.send_day=today AND i.send_count>=20 THEN RETURN QUERY SELECT false, 3600; RETURN; END IF;
  INSERT INTO public.customer_sms_challenges(phone_hash,ip_hash,code_hash,expires_at)
    VALUES(p_phone_hash,p_ip_hash,p_code_hash,now()-interval '1 second') ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.customer_sms_challenges WHERE phone_hash=p_phone_hash FOR UPDATE;
  IF r.sent_at>now()-interval '60 seconds' AND r.expires_at>now() THEN
    RETURN QUERY SELECT false, greatest(1,ceil(extract(epoch from (r.sent_at+interval '60 seconds'-now())))::integer); RETURN;
  END IF;
  IF r.send_day=today AND r.send_count>=5 THEN RETURN QUERY SELECT false, 3600; RETURN; END IF;
  UPDATE public.customer_sms_ip_limits SET send_day=today,send_count=CASE WHEN send_day=today THEN send_count+1 ELSE 1 END,updated_at=now() WHERE ip_hash=p_ip_hash;
  UPDATE public.customer_sms_challenges SET ip_hash=p_ip_hash,code_hash=p_code_hash,expires_at=now()+interval '5 minutes',sent_at=now(),
    send_day=today,send_count=CASE WHEN send_day=today THEN send_count+1 ELSE 1 END,failed_checks=0 WHERE phone_hash=p_phone_hash;
  RETURN QUERY SELECT true,0;
END $$;

CREATE OR REPLACE FUNCTION public.verify_customer_sms_code(p_phone_hash text,p_code_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.customer_sms_challenges%ROWTYPE;
BEGIN
  IF p_phone_hash !~ '^[0-9a-f]{64}$' OR p_code_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  SELECT * INTO r FROM public.customer_sms_challenges WHERE phone_hash=p_phone_hash FOR UPDATE;
  IF NOT FOUND OR r.expires_at<=now() OR r.failed_checks>=5 THEN RETURN false; END IF;
  IF r.code_hash=p_code_hash THEN
    DELETE FROM public.customer_sms_challenges WHERE phone_hash=p_phone_hash;
    RETURN true;
  END IF;
  UPDATE public.customer_sms_challenges SET failed_checks=failed_checks+1 WHERE phone_hash=p_phone_hash;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_customer_sms_code(p_phone_hash text,p_code_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM public.customer_sms_challenges WHERE phone_hash=p_phone_hash AND code_hash=p_code_hash;
END $$;
REVOKE ALL ON FUNCTION public.begin_customer_sms_code(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_customer_sms_code(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_customer_sms_code(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_customer_sms_code(text,text,text), public.verify_customer_sms_code(text,text), public.cancel_customer_sms_code(text,text) TO service_role;
