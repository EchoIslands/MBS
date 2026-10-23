-- One stable payment ledger row; retain every gateway order, including closed attempts.
CREATE TABLE IF NOT EXISTS public.wechat_payment_attempts (
 gateway_order_no TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES public.payments(id),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','closed')),
 request_body JSONB, qr_updated_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
 recovery_token TEXT, recovery_started_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS wechat_one_active_attempt ON public.wechat_payment_attempts(payment_id) WHERE state='active';
ALTER TABLE public.wechat_payment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wechat_payment_attempts FROM PUBLIC,anon,authenticated;
DO $$
DECLARE col TEXT;
BEGIN
 FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='wechat_payment_attempts' LOOP
  EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE public.wechat_payment_attempts FROM PUBLIC,anon,authenticated',col,col,col,col);
 END LOOP;
END $$;
GRANT ALL ON TABLE public.wechat_payment_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.claim_wechat_recovery(p_settlement_id TEXT,p_shop_id TEXT,p_token TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s settlements%ROWTYPE; p payments%ROWTYPE; a wechat_payment_attempts%ROWTYPE;
BEGIN
 IF p_token IS NULL OR length(p_token)<16 THEN RAISE EXCEPTION 'INVALID_RECOVERY_TOKEN'; END IF;
 SELECT * INTO s FROM settlements WHERE id=p_settlement_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND OR s.payment_method IS DISTINCT FROM 'wechat' OR (s.payment_status IS NULL OR s.payment_status NOT IN ('pending','completed')) THEN RAISE EXCEPTION 'SETTLEMENT_REQUIRES_REVIEW'; END IF;
 IF s.payment_status='pending' AND s.server_priced IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'LEGACY_SETTLEMENT_REQUIRES_REVIEW'; END IF;
 IF (SELECT COUNT(*) FROM payments WHERE settlement_id=s.id)<>1 THEN RAISE EXCEPTION 'PAYMENT_MAPPING_REQUIRES_REVIEW'; END IF;
 SELECT * INTO p FROM payments WHERE settlement_id=s.id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND OR p.customer_id IS DISTINCT FROM s.customer_id OR p.amount IS DISTINCT FROM s.total OR p.amount IS NULL OR p.amount<=0 OR p.amount<>ROUND(p.amount,2) OR p.channel IS DISTINCT FROM 'wechat_native' OR (p.status IS NULL OR p.status NOT IN ('pending','paid')) THEN RAISE EXCEPTION 'PAYMENT_MAPPING_REQUIRES_REVIEW'; END IF;
 INSERT INTO wechat_payment_attempts(gateway_order_no,payment_id) SELECT p.id,p.id WHERE NOT EXISTS(SELECT 1 FROM wechat_payment_attempts WHERE payment_id=p.id) ON CONFLICT DO NOTHING;
 SELECT * INTO a FROM wechat_payment_attempts WHERE payment_id=p.id AND state='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_PAYMENT_MISSING'; END IF;
 IF a.recovery_token IS NOT NULL AND a.recovery_token<>p_token AND a.recovery_started_at>NOW()-INTERVAL '2 minutes' THEN RAISE EXCEPTION 'RECOVERY_BUSY'; END IF;
 UPDATE wechat_payment_attempts SET recovery_token=p_token,recovery_started_at=NOW() WHERE gateway_order_no=a.gateway_order_no RETURNING * INTO a;
 RETURN jsonb_build_object('settlement',to_jsonb(s),'payment',to_jsonb(p),'attempt',to_jsonb(a));
END $$;

CREATE OR REPLACE FUNCTION public.mutate_wechat_recovery(p_payment_id TEXT,p_shop_id TEXT,p_token TEXT,p_action TEXT,p_data JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s settlements%ROWTYPE; p payments%ROWTYPE; a wechat_payment_attempts%ROWTYPE; new_id TEXT;
BEGIN
 SELECT * INTO s FROM settlements WHERE id=(SELECT settlement_id FROM payments WHERE id=p_payment_id AND shop_id=p_shop_id) AND shop_id=p_shop_id FOR UPDATE;
 SELECT * INTO p FROM payments WHERE id=p_payment_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 SELECT * INTO a FROM wechat_payment_attempts WHERE payment_id=p.id AND state='active' FOR UPDATE;
 IF NOT FOUND OR a.recovery_token IS DISTINCT FROM p_token OR p_token IS NULL OR a.recovery_started_at IS NULL OR a.recovery_started_at<=NOW()-INTERVAL '2 minutes' THEN RAISE EXCEPTION 'RECOVERY_CLAIM_CHANGED'; END IF;
 IF p_action='release' THEN
  UPDATE wechat_payment_attempts SET recovery_token=NULL,recovery_started_at=NULL WHERE gateway_order_no=a.gateway_order_no;
  RETURN '{}'::jsonb;
 END IF;
 IF s.payment_status IS DISTINCT FROM 'pending' OR p.status IS DISTINCT FROM 'pending' OR p.amount IS DISTINCT FROM s.total OR p.customer_id IS DISTINCT FROM s.customer_id THEN RAISE EXCEPTION 'PAYMENT_STATE_CHANGED'; END IF;
 IF p_action='rotate' THEN
  new_id:=p_data->>'gateway_order_no';
  IF p_data->>'closed_order_no' IS DISTINCT FROM a.gateway_order_no OR p_data->>'gateway_state' IS DISTINCT FROM 'CLOSED' OR new_id IS NULL OR new_id !~ '^[a-zA-Z0-9_-]{6,32}$' OR EXISTS(SELECT 1 FROM payments WHERE id=new_id) THEN RAISE EXCEPTION 'INVALID_CLOSED_PAYMENT_PROOF'; END IF;
  UPDATE wechat_payment_attempts SET state='closed',closed_at=NOW(),recovery_token=NULL,recovery_started_at=NULL WHERE gateway_order_no=a.gateway_order_no;
  INSERT INTO wechat_payment_attempts(gateway_order_no,payment_id,recovery_token,recovery_started_at) VALUES(new_id,p.id,p_token,NOW()) RETURNING * INTO a;
  UPDATE payments SET code_url=NULL,prepay_id=NULL WHERE id=p.id;
 ELSIF p_action='request' THEN
  IF a.request_body IS NOT NULL AND a.request_body IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'PAYMENT_REQUEST_CHANGED'; END IF;
  IF p_data->>'out_trade_no' IS DISTINCT FROM a.gateway_order_no OR p_data->'amount'->>'currency' IS DISTINCT FROM 'CNY' OR (p_data->'amount'->>'total')::numeric IS DISTINCT FROM ROUND(p.amount*100) OR NULLIF(p_data->>'mchid','') IS NULL OR NULLIF(p_data->>'appid','') IS NULL OR NULLIF(p_data->>'notify_url','') IS NULL THEN RAISE EXCEPTION 'PAYMENT_REQUEST_MISMATCH'; END IF;
  UPDATE wechat_payment_attempts SET request_body=p_data WHERE gateway_order_no=a.gateway_order_no RETURNING * INTO a;
 ELSIF p_action='qr' THEN
  IF a.request_body IS NULL OR p_data->>'gateway_order_no' IS DISTINCT FROM a.gateway_order_no OR COALESCE(p_data->>'code_url','') NOT LIKE 'weixin://wxpay/%' THEN RAISE EXCEPTION 'INVALID_PAYMENT_QR'; END IF;
  UPDATE payments SET code_url=p_data->>'code_url' WHERE id=p.id;
  UPDATE wechat_payment_attempts SET qr_updated_at=NOW() WHERE gateway_order_no=a.gateway_order_no RETURNING * INTO a;
 ELSE RAISE EXCEPTION 'INVALID_RECOVERY_ACTION';
 END IF;
 RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION public.finalize_wechat_attempt(p_order_no TEXT,p_shop_id TEXT,p_transaction_id TEXT,p_paid_at TIMESTAMPTZ,p_amount NUMERIC,p_employee_id TEXT,p_employee_name TEXT) RETURNS SETOF public.settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payment_key TEXT; settlement_key TEXT; active_no TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mbs.wechat.transaction.'||p_transaction_id));
 SELECT payment_id INTO payment_key FROM wechat_payment_attempts WHERE gateway_order_no=p_order_no;
 IF payment_key IS NULL THEN payment_key:=p_order_no; END IF;
 SELECT settlement_id INTO settlement_key FROM payments WHERE id=payment_key AND shop_id=p_shop_id;
 PERFORM 1 FROM settlements WHERE id=settlement_key AND shop_id=p_shop_id FOR UPDATE;
 PERFORM 1 FROM payments WHERE id=payment_key AND shop_id=p_shop_id FOR UPDATE;
 SELECT gateway_order_no INTO active_no FROM wechat_payment_attempts WHERE payment_id=payment_key AND state='active';
 IF active_no IS NOT NULL AND active_no<>p_order_no THEN RAISE EXCEPTION 'OLD_PAYMENT_ATTEMPT_REQUIRES_REVIEW'; END IF;
 RETURN QUERY SELECT * FROM finalize_verified_wechat_payment(payment_key,p_shop_id,p_transaction_id,p_paid_at,p_amount,p_employee_id,p_employee_name);
END $$;
REVOKE ALL ON FUNCTION public.claim_wechat_recovery(TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_wechat_recovery(TEXT,TEXT,TEXT) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wechat_recovery(TEXT,TEXT,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_wechat_recovery(TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mutate_wechat_recovery(TEXT,TEXT,TEXT,TEXT,JSONB) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_wechat_recovery(TEXT,TEXT,TEXT,TEXT,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_wechat_attempt(TEXT,TEXT,TEXT,TIMESTAMPTZ,NUMERIC,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_wechat_attempt(TEXT,TEXT,TEXT,TIMESTAMPTZ,NUMERIC,TEXT,TEXT) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_wechat_attempt(TEXT,TEXT,TEXT,TIMESTAMPTZ,NUMERIC,TEXT,TEXT) TO service_role;
