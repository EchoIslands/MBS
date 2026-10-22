-- 仅在支付初始化认领过期且完全没有 payments 行时，释放未完成的认领。
-- 网关单必须先有 payments 映射，因此此函数不触碰任何真实支付单。
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS checkout_payment_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION stamp_checkout_payment_claim() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.checkout_payment_started IS DISTINCT FROM OLD.checkout_payment_started THEN
    NEW.checkout_payment_started_at := CASE WHEN NEW.checkout_payment_started THEN NOW() ELSE NULL END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS settlement_payment_claim_stamp ON settlements;
CREATE TRIGGER settlement_payment_claim_stamp BEFORE UPDATE OF checkout_payment_started ON settlements
FOR EACH ROW EXECUTE FUNCTION stamp_checkout_payment_claim();
REVOKE ALL ON FUNCTION stamp_checkout_payment_claim() FROM PUBLIC;
REVOKE ALL ON FUNCTION stamp_checkout_payment_claim() FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION stamp_checkout_payment_claim() TO service_role;

CREATE OR REPLACE FUNCTION release_stale_settlement_payment_claim(p_settlement_id TEXT,p_shop_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s settlements%ROWTYPE;
BEGIN
  SELECT * INTO s FROM settlements WHERE id=p_settlement_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR s.payment_status NOT IN ('pending','failed') THEN RAISE EXCEPTION 'SETTLEMENT_NOT_RECOVERABLE'; END IF;
  -- 任何 payments 记录都交给人工对账，不按“无二维码”猜测其可以重下单。
  IF EXISTS(SELECT 1 FROM payments WHERE settlement_id=s.id) THEN RAISE EXCEPTION 'PAYMENT_RECORD_EXISTS'; END IF;
  IF NOT s.checkout_payment_started THEN RETURN TRUE; END IF;
  -- 仅兼容032之前无时间戳的历史认领；新版请求即使超时也不自动释放，
  -- 避免慢请求仍在插入支付映射时被当作过期重试。需另行网关对账恢复。
  IF s.checkout_payment_started_at IS NOT NULL OR s.created_at IS NULL
    OR s.created_at > NOW()-INTERVAL '5 minutes' THEN RETURN FALSE; END IF;
  UPDATE settlements SET checkout_payment_started=FALSE,checkout_request_key=NULL WHERE id=s.id;
  RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION release_stale_settlement_payment_claim(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_stale_settlement_payment_claim(TEXT,TEXT) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION release_stale_settlement_payment_claim(TEXT,TEXT) TO service_role;
