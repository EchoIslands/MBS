-- 服务退款引用真实结算单，兼容没有预约的直接开单。不执行退款或回填历史数据。
ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS settlement_id TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.refund_requests'::regclass AND conname='refund_requests_settlement_fk') THEN
    ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_settlement_fk
      FOREIGN KEY (settlement_id) REFERENCES public.settlements(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS service_refund_active_settlement_unique
  ON public.refund_requests(settlement_id) WHERE settlement_id IS NOT NULL AND status IN ('pending','approved','completed');

CREATE OR REPLACE FUNCTION public.get_service_refund_candidates(p_customer_id TEXT,p_shop_id TEXT,p_after_id TEXT DEFAULT '')
RETURNS TABLE(settlement_id TEXT,booking_id TEXT,amount NUMERIC,payment_method TEXT,created_at TIMESTAMPTZ,service_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id,s.booking_id,s.total,s.payment_method,s.created_at,
    COALESCE((SELECT i->>'name' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.items)='array' THEN s.items ELSE '[]'::jsonb END) i WHERE i->>'type'='service' LIMIT 1),
      (SELECT i.name FROM settlement_items i WHERE i.settlement_id=s.id AND i.type='service' ORDER BY i.id LIMIT 1),'服务结算')
  FROM settlements s
  WHERE s.customer_id=p_customer_id AND s.shop_id=p_shop_id AND s.id>COALESCE(p_after_id,'')
    AND EXISTS(SELECT 1 FROM customers c WHERE c.id=p_customer_id AND c.shop_id=p_shop_id)
    AND s.payment_status='completed' AND s.total>0 AND s.total::text NOT IN ('NaN','Infinity','-Infinity')
    AND (EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.items)='array' THEN s.items ELSE '[]'::jsonb END) i WHERE i->>'type'='service')
      OR EXISTS(SELECT 1 FROM settlement_items i WHERE i.settlement_id=s.id AND i.type='service'))
    AND (s.payment_method IS DISTINCT FROM 'wechat' OR EXISTS(SELECT 1 FROM payments p WHERE p.settlement_id=s.id
      AND p.shop_id=s.shop_id AND p.customer_id=s.customer_id AND p.status='paid' AND p.amount=s.total
      AND p.paid_at_source='wechat_success_time' AND p.paid_at IS NOT NULL AND NULLIF(trim(p.transaction_id),'') IS NOT NULL))
    AND NOT EXISTS(SELECT 1 FROM refund_requests r WHERE r.shop_id=s.shop_id AND r.status IN ('pending','approved','completed')
      AND (r.settlement_id=s.id OR (r.settlement_id IS NULL AND s.booking_id IS NOT NULL AND r.booking_id=s.booking_id)))
  ORDER BY s.id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.get_service_refund_candidates(TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_service_refund_candidates(TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.request_settlement_refund_atomic(p_customer_id TEXT,p_shop_id TEXT,p_settlement_id TEXT,p_reason TEXT)
RETURNS SETOF public.refund_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s settlements%ROWTYPE; previous refund_requests%ROWTYPE; linked_booking TEXT; customer_name TEXT;
BEGIN
  IF NULLIF(trim(p_reason),'') IS NULL OR length(p_reason)>2000 THEN RAISE EXCEPTION 'INVALID_REFUND_REASON'; END IF;
  SELECT booking_id INTO linked_booking FROM settlements WHERE id=p_settlement_id AND customer_id=p_customer_id AND shop_id=p_shop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  -- 与旧预约申请使用同一锁顺序；预约为空时仅锁原结算。
  IF linked_booking IS NOT NULL THEN
    PERFORM 1 FROM bookings WHERE id=linked_booking AND customer_id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  END IF;
  SELECT * INTO s FROM settlements WHERE id=p_settlement_id AND customer_id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR s.booking_id IS DISTINCT FROM linked_booking THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT name INTO customer_name FROM customers WHERE id=p_customer_id AND shop_id=p_shop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT * INTO previous FROM refund_requests WHERE settlement_id=s.id AND shop_id=p_shop_id AND customer_id=p_customer_id
    AND status IN ('pending','approved','completed') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN NEXT previous; RETURN; END IF;
  IF linked_booking IS NOT NULL AND EXISTS(SELECT 1 FROM refund_requests WHERE booking_id=linked_booking AND shop_id=p_shop_id
    AND settlement_id IS NULL AND status IN ('pending','approved','completed')) THEN
    RAISE EXCEPTION 'LEGACY_REFUND_REVIEW_REQUIRED';
  END IF;
  IF s.payment_status IS DISTINCT FROM 'completed' OR s.total IS NULL OR s.total<=0 OR s.total::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'ORDER_NOT_REFUNDABLE';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.items)='array' THEN s.items ELSE '[]'::jsonb END) i WHERE i->>'type'='service')
    AND NOT EXISTS(SELECT 1 FROM settlement_items WHERE settlement_id=s.id AND type='service') THEN RAISE EXCEPTION 'ORDER_NOT_REFUNDABLE'; END IF;
  IF s.payment_method='wechat' AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.settlement_id=s.id AND p.shop_id=s.shop_id AND p.customer_id=s.customer_id
    AND p.status='paid' AND p.amount=s.total AND p.paid_at_source='wechat_success_time' AND p.paid_at IS NOT NULL AND NULLIF(trim(p.transaction_id),'') IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYMENT_RECEIPT_REQUIRED';
  END IF;
  INSERT INTO refund_requests(id,shop_id,settlement_id,booking_id,customer_id,customer_name,amount,reason,status)
    VALUES('refund_'||gen_random_uuid()::text,p_shop_id,s.id,s.booking_id,p_customer_id,customer_name,s.total,trim(p_reason),'pending') RETURNING * INTO previous;
  RETURN NEXT previous;
END $$;
REVOKE ALL ON FUNCTION public.request_settlement_refund_atomic(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_settlement_refund_atomic(TEXT,TEXT,TEXT,TEXT) TO service_role;

-- 旧客户端仍可按预约申请，但必须唯一定位原结算，禁止把多个收款合并猜选。
CREATE OR REPLACE FUNCTION public.request_service_refund_atomic(p_customer_id TEXT,p_shop_id TEXT,p_booking_id TEXT,p_reason TEXT)
RETURNS SETOF public.refund_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing refund_requests%ROWTYPE; chosen TEXT; paid_count INTEGER;
BEGIN
  IF NULLIF(trim(p_reason),'') IS NULL OR length(p_reason)>2000 THEN RAISE EXCEPTION 'INVALID_REFUND_REASON'; END IF;
  PERFORM 1 FROM bookings WHERE id=p_booking_id AND customer_id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM refund_requests WHERE booking_id=p_booking_id AND customer_id=p_customer_id AND shop_id=p_shop_id
    AND settlement_id IS NULL AND status IN ('pending','approved','completed') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN NEXT existing; RETURN; END IF;
  SELECT count(*),min(id) INTO paid_count,chosen FROM settlements WHERE booking_id=p_booking_id AND customer_id=p_customer_id AND shop_id=p_shop_id AND payment_status='completed' AND total>0;
  IF paid_count=0 THEN RAISE EXCEPTION 'ORDER_NOT_REFUNDABLE'; END IF;
  IF paid_count<>1 THEN RAISE EXCEPTION 'REFUND_SETTLEMENT_SELECTION_REQUIRED'; END IF;
  RETURN QUERY SELECT * FROM request_settlement_refund_atomic(p_customer_id,p_shop_id,chosen,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.request_service_refund_atomic(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_service_refund_atomic(TEXT,TEXT,TEXT,TEXT) TO service_role;
