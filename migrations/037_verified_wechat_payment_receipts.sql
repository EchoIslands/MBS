-- No historical timestamps are backfilled. NULL source means the old processing time is unverified.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paid_at_source TEXT;
CREATE INDEX IF NOT EXISTS payments_shop_settlement_created_idx ON public.payments(shop_id,settlement_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.finalize_verified_wechat_payment(
  p_payment_id TEXT, p_shop_id TEXT, p_transaction_id TEXT, p_paid_at TIMESTAMPTZ,
  p_amount NUMERIC, p_employee_id TEXT, p_employee_name TEXT
) RETURNS SETOF public.settlements LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p payments%ROWTYPE; s settlements%ROWTYPE; mapped_id TEXT;
BEGIN
  IF p_paid_at IS NULL OR NOT isfinite(p_paid_at) OR p_paid_at>NOW()+INTERVAL '5 minutes' OR
     p_amount IS NULL OR p_amount<=0 OR p_amount<>ROUND(p_amount,2) OR
     p_transaction_id IS NULL OR p_transaction_id !~ '^[0-9]{1,64}$' THEN
    RAISE EXCEPTION 'INVALID_WECHAT_RECEIPT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mbs.wechat.transaction.'||p_transaction_id));
  SELECT settlement_id INTO mapped_id FROM payments WHERE id=p_payment_id AND shop_id=p_shop_id;
  IF mapped_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_MAPPING_NOT_FOUND'; END IF;
  -- Match existing checkout lock order: settlement first, then payment/customer.
  SELECT * INTO s FROM settlements WHERE id=mapped_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETTLEMENT_NOT_FOUND'; END IF;
  SELECT * INTO p FROM payments WHERE id=p_payment_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR p.settlement_id IS DISTINCT FROM s.id OR p.customer_id IS DISTINCT FROM s.customer_id OR
     p.channel IS NULL OR p.channel NOT IN ('wechat_native','wechat_h5','wechat_mini') OR s.payment_method IS DISTINCT FROM 'wechat' OR
     p.amount IS DISTINCT FROM p_amount OR s.total IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'PAYMENT_RECEIPT_MISMATCH';
  END IF;
  IF p.status IS NULL OR p.status NOT IN ('pending','paid') OR s.payment_status IS NULL OR s.payment_status NOT IN ('pending','completed') THEN
    RAISE EXCEPTION 'PAYMENT_STATE_REQUIRES_REVIEW';
  END IF;
  IF EXISTS(SELECT 1 FROM payments WHERE settlement_id=s.id AND id<>p.id) OR
     EXISTS(SELECT 1 FROM payments WHERE transaction_id=p_transaction_id AND id<>p.id) THEN
    RAISE EXCEPTION 'MULTIPLE_PAYMENT_RECORDS_REQUIRE_REVIEW';
  END IF;
  IF p.transaction_id IS NOT NULL AND p.transaction_id<>p_transaction_id THEN RAISE EXCEPTION 'PAYMENT_TRANSACTION_CONFLICT'; END IF;
  IF p.paid_at_source='wechat_success_time' AND p.paid_at IS DISTINCT FROM p_paid_at THEN
    RAISE EXCEPTION 'PAYMENT_TIME_CONFLICT';
  END IF;
  -- Store gateway time before the existing finalizer, which preserves non-null paid_at.
  -- Any finalizer/reward/package failure rolls this update back in the same RPC transaction.
  UPDATE payments SET status='paid',transaction_id=p_transaction_id,paid_at=p_paid_at,paid_at_source='wechat_success_time' WHERE id=p.id;
  SELECT * INTO s FROM finalize_settlement_atomic(s.id,p_shop_id,p_employee_id,p_employee_name,s.booking_id,s.customer_package_id,'结算核销');
  RETURN NEXT s;
END $$;
REVOKE ALL ON FUNCTION public.finalize_verified_wechat_payment(TEXT,TEXT,TEXT,TIMESTAMPTZ,NUMERIC,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_verified_wechat_payment(TEXT,TEXT,TEXT,TIMESTAMPTZ,NUMERIC,TEXT,TEXT) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verified_wechat_payment(TEXT,TEXT,TEXT,TIMESTAMPTZ,NUMERIC,TEXT,TEXT) TO service_role;
