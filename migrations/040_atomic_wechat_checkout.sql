-- Persist a new checkout and its only payment mapping in one transaction.
-- No historical rows are changed and no gateway operation is performed here.
CREATE OR REPLACE FUNCTION public.create_wechat_settlement_atomic(
  p_settlement JSONB, p_employee_id TEXT, p_employee_name TEXT, p_payment_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s settlements%ROWTYPE; p payments%ROWTYPE;
BEGIN
  IF p_settlement->>'payment_method' IS DISTINCT FROM 'wechat' OR
     (p_settlement->>'start_payment')::BOOLEAN IS DISTINCT FROM TRUE OR
     NULLIF(p_settlement->>'checkout_request_key','') IS NULL OR
     p_payment_id IS NULL OR p_payment_id !~ '^[a-zA-Z0-9_-]{6,32}$' OR
     COALESCE((p_settlement->>'total')::NUMERIC,0)<=0 THEN
    RAISE EXCEPTION 'INVALID_WECHAT_CHECKOUT';
  END IF;
  -- Same customer lock as the existing finalizer/creator; concurrent identical
  -- requests cannot both create a gateway mapping.
  PERFORM 1 FROM customers WHERE id=p_settlement->>'customer_id'
    AND shop_id=p_settlement->>'shop_id' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  SELECT * INTO s FROM settlements WHERE id=p_settlement->>'id' FOR UPDATE;
  IF FOUND THEN
    IF s.shop_id IS DISTINCT FROM p_settlement->>'shop_id' OR
       s.customer_id IS DISTINCT FROM p_settlement->>'customer_id' OR
       s.booking_id IS DISTINCT FROM NULLIF(p_settlement->>'booking_id','') THEN
      RAISE EXCEPTION 'DRAFT_OWNER_MISMATCH';
    END IF;
    IF EXISTS(SELECT 1 FROM payments WHERE settlement_id=s.id) THEN
      IF s.checkout_request_key IS DISTINCT FROM p_settlement->>'checkout_request_key' OR
         s.payment_method IS DISTINCT FROM 'wechat' OR s.total IS DISTINCT FROM (p_settlement->>'total')::NUMERIC OR
         s.payment_status NOT IN ('pending','completed') OR s.payment_status IS NULL OR
         (SELECT COUNT(*) FROM payments WHERE settlement_id=s.id)<>1 THEN
        RAISE EXCEPTION 'PAYMENT_ORDER_EXISTS';
      END IF;
      SELECT * INTO p FROM payments WHERE settlement_id=s.id FOR UPDATE;
      IF p.shop_id IS DISTINCT FROM s.shop_id OR p.customer_id IS DISTINCT FROM s.customer_id OR
         p.amount IS DISTINCT FROM s.total OR p.channel IS DISTINCT FROM 'wechat_native' OR
         p.status IS NULL OR p.status NOT IN ('pending','paid') THEN
        RAISE EXCEPTION 'PAYMENT_MAPPING_REQUIRES_REVIEW';
      END IF;
      RETURN jsonb_build_object('settlement',to_jsonb(s),'paymentCreated',FALSE);
    END IF;
  END IF;
  SELECT * INTO s FROM public.create_settlement_with_manual_time_atomic(
    p_settlement,p_employee_id,p_employee_name,FALSE,NULL);
  IF NOT FOUND OR s.payment_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'SETTLEMENT_NOT_PAYABLE';
  END IF;
  INSERT INTO payments(id,shop_id,customer_id,booking_id,settlement_id,channel,amount,status)
    VALUES(p_payment_id,s.shop_id,s.customer_id,s.booking_id,s.id,'wechat_native',s.total,'pending');
  RETURN jsonb_build_object('settlement',to_jsonb(s),'paymentCreated',TRUE);
END $$;
REVOKE ALL ON FUNCTION public.create_wechat_settlement_atomic(JSONB,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_wechat_settlement_atomic(JSONB,TEXT,TEXT,TEXT) TO service_role;
