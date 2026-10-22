-- Customer identity verification and durable customer-auth throttling.
-- Additive: existing customers remain unverified until staff confirms identity.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_verified_by TEXT;

CREATE TABLE IF NOT EXISTS customer_auth_limits (
  ip_hash TEXT PRIMARY KEY,
  attempt_day DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_attempts INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_auth_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION begin_customer_auth_attempt(p_ip_hash TEXT)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r customer_auth_limits%ROWTYPE;
BEGIN
  INSERT INTO customer_auth_limits(ip_hash) VALUES (p_ip_hash) ON CONFLICT (ip_hash) DO NOTHING;
  SELECT * INTO r FROM customer_auth_limits WHERE ip_hash = p_ip_hash FOR UPDATE;
  IF r.attempt_day <> CURRENT_DATE THEN
    UPDATE customer_auth_limits SET attempt_day=CURRENT_DATE, daily_attempts=0, updated_at=NOW()
      WHERE ip_hash=p_ip_hash;
    r.daily_attempts := 0;
  END IF;
  IF r.locked_until IS NOT NULL AND r.locked_until<=NOW() THEN
    UPDATE customer_auth_limits SET failed_attempts=0, locked_until=NULL WHERE ip_hash=p_ip_hash;
  END IF;
  IF r.locked_until IS NOT NULL AND r.locked_until > NOW() THEN
    RETURN QUERY SELECT FALSE, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.locked_until-NOW())))::INTEGER); RETURN;
  END IF;
  IF r.daily_attempts >= 10 THEN RETURN QUERY SELECT FALSE, 86400; RETURN; END IF;
  UPDATE customer_auth_limits SET daily_attempts=daily_attempts+1, updated_at=NOW() WHERE ip_hash=p_ip_hash;
  RETURN QUERY SELECT TRUE, 0;
END $$;

CREATE OR REPLACE FUNCTION finish_customer_auth_attempt(p_ip_hash TEXT, p_succeeded BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_succeeded THEN
    -- A previously admitted concurrent success must not erase a newer failure lock.
    UPDATE customer_auth_limits SET failed_attempts=0, locked_until=NULL, updated_at=NOW()
      WHERE ip_hash=p_ip_hash AND (locked_until IS NULL OR locked_until<=NOW());
  ELSE
    UPDATE customer_auth_limits
      SET failed_attempts=failed_attempts+1,
          locked_until=CASE WHEN failed_attempts+1 >= 5 THEN NOW()+INTERVAL '15 minutes' ELSE locked_until END,
          updated_at=NOW()
      WHERE ip_hash=p_ip_hash;
  END IF;
END $$;

REVOKE ALL ON FUNCTION begin_customer_auth_attempt(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finish_customer_auth_attempt(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION begin_customer_auth_attempt(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION finish_customer_auth_attempt(TEXT, BOOLEAN) TO service_role;
