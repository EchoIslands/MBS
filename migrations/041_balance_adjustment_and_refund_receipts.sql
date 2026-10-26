-- New settlement safeguards: balance adjustments and refund receipt evidence.
-- Historical test settlements are not backfilled.
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS refund_receipt_ref TEXT,
  ADD COLUMN IF NOT EXISTS refund_receipt_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS refund_receipt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_receipt_recorded_by TEXT,
  ADD COLUMN IF NOT EXISTS refund_receipt_recorded_by_name TEXT;

CREATE OR REPLACE FUNCTION public.adjust_customer_balance_atomic(
  p_customer_id TEXT, p_shop_id TEXT, p_expected_balance NUMERIC,
  p_new_balance NUMERIC, p_employee_id TEXT, p_employee_name TEXT, p_note TEXT DEFAULT ''
) RETURNS SETOF public.customers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customers%ROWTYPE; delta NUMERIC;
BEGIN
  IF p_expected_balance IS NULL OR p_new_balance IS NULL OR p_expected_balance::TEXT IN ('NaN','Infinity','-Infinity')
     OR p_new_balance::TEXT IN ('NaN','Infinity','-Infinity') OR p_new_balance < 0 THEN RAISE EXCEPTION 'INVALID_BALANCE_ADJUSTMENT'; END IF;
  IF NULLIF(trim(COALESCE(p_note,'')),'') IS NULL OR length(p_note)>500 THEN RAISE EXCEPTION 'BALANCE_ADJUSTMENT_NOTE_REQUIRED'; END IF;
  SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF ROUND(COALESCE(c.stored_value_balance,0)::NUMERIC,2) IS DISTINCT FROM ROUND(p_expected_balance,2) THEN
    RAISE EXCEPTION 'BALANCE_CONFLICT';
  END IF;
  delta:=ROUND((p_new_balance-COALESCE(c.stored_value_balance,0))::NUMERIC,2);
  IF delta=0 THEN RETURN NEXT c; RETURN; END IF;
  UPDATE customers SET stored_value_balance=ROUND(p_new_balance,2), balance=ROUND(p_new_balance,2), updated_at=NOW()
    WHERE id=c.id AND shop_id=p_shop_id RETURNING * INTO c;
  INSERT INTO stored_value_transactions(id,customer_id,type,amount,balance_after,principal_portion,referral_portion,note,created_at,created_by,created_by_name)
    VALUES('manual_adjust_'||gen_random_uuid()::TEXT,c.id,'manual_adjust',delta,c.stored_value_balance,0,0,trim(p_note),NOW(),p_employee_id,p_employee_name);
  RETURN NEXT c;
END $$;
REVOKE ALL ON FUNCTION public.adjust_customer_balance_atomic(TEXT,TEXT,NUMERIC,NUMERIC,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_customer_balance_atomic(TEXT,TEXT,NUMERIC,NUMERIC,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_service_refund_atomic(
  p_refund_id TEXT, p_shop_id TEXT, p_employee_id TEXT, p_employee_name TEXT,
  p_refund_method TEXT, p_receipt_ref TEXT, p_receipt_amount NUMERIC, p_receipt_at TIMESTAMPTZ
) RETURNS SETOF public.refund_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r refund_requests%ROWTYPE;
BEGIN
  IF p_refund_method NOT IN ('original','balance','bank') THEN RAISE EXCEPTION 'INVALID_REFUND_METHOD'; END IF;
  IF NULLIF(trim(COALESCE(p_receipt_ref,'')),'') IS NULL OR length(p_receipt_ref)>300 THEN RAISE EXCEPTION 'REFUND_RECEIPT_REQUIRED'; END IF;
  IF p_receipt_amount IS NULL OR p_receipt_amount::TEXT IN ('NaN','Infinity','-Infinity') OR p_receipt_amount<0 OR ROUND(p_receipt_amount,2)<>ROUND(COALESCE((SELECT amount FROM refund_requests WHERE id=p_refund_id AND shop_id=p_shop_id),-1),2) THEN RAISE EXCEPTION 'REFUND_RECEIPT_AMOUNT_MISMATCH'; END IF;
  IF p_receipt_at IS NULL OR NOT isfinite(p_receipt_at) OR p_receipt_at>clock_timestamp()+INTERVAL '5 minutes' THEN RAISE EXCEPTION 'INVALID_REFUND_RECEIPT_TIME'; END IF;
  SELECT * INTO r FROM refund_requests WHERE id=p_refund_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_NOT_FOUND'; END IF;
  IF r.status='completed' THEN RETURN NEXT r; RETURN; END IF;
  IF r.status<>'approved' THEN RAISE EXCEPTION 'REFUND_NOT_APPROVED'; END IF;
  IF ROUND(p_receipt_amount,2)<>ROUND(r.amount,2) THEN RAISE EXCEPTION 'REFUND_RECEIPT_AMOUNT_MISMATCH'; END IF;
  UPDATE refund_requests SET status='completed',refund_method=p_refund_method,processed_by=p_employee_id,processed_by_name=p_employee_name,
    processed_at=NOW(),refund_receipt_ref=trim(p_receipt_ref),refund_receipt_amount=ROUND(p_receipt_amount,2),refund_receipt_at=p_receipt_at,
    refund_receipt_recorded_by=p_employee_id,refund_receipt_recorded_by_name=p_employee_name
    WHERE id=r.id RETURNING * INTO r;
  RETURN NEXT r;
END $$;
REVOKE ALL ON FUNCTION public.complete_service_refund_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service_refund_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TIMESTAMPTZ) TO service_role;

-- Refund a new balance-paid product order back to the same principal/referral sources.
CREATE OR REPLACE FUNCTION public.handle_product_refund_atomic(p_refund_id TEXT,p_shop_id TEXT,p_status TEXT,p_employee_id TEXT,p_employee_name TEXT,p_reason TEXT DEFAULT '')
RETURNS SETOF public.product_order_refunds LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r product_order_refunds%ROWTYPE; o product_orders%ROWTYPE; c customers%ROWTYPE; i product_order_items%ROWTYPE;
  stock_after INTEGER; source_tx stored_value_transactions%ROWTYPE; principal NUMERIC; referral NUMERIC;
BEGIN
  SELECT * INTO r FROM product_order_refunds WHERE id=p_refund_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_NOT_FOUND'; END IF;
  IF r.status=p_status THEN RETURN NEXT r; RETURN; END IF;
  IF r.status<>'pending' OR p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_REFUND_STATUS'; END IF;
  SELECT * INTO o FROM product_orders WHERE id=r.order_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR o.status='refunded' OR o.payment_method<>'balance' OR o.payment_status<>'paid' OR r.amount<>o.payable_amount THEN RAISE EXCEPTION 'ORDER_NOT_REFUNDABLE'; END IF;
  IF p_status='approved' THEN
    SELECT * INTO source_tx FROM stored_value_transactions WHERE order_id=o.id AND type='consume' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR source_tx.amount>=0 THEN RAISE EXCEPTION 'REFUND_SOURCE_LEDGER_MISSING'; END IF;
    principal:=GREATEST(0,ROUND(-COALESCE(source_tx.principal_portion,0),2));
    referral:=GREATEST(0,ROUND(-COALESCE(source_tx.referral_portion,0),2));
    IF ROUND(principal+referral,2)<>ROUND(r.amount,2) THEN RAISE EXCEPTION 'REFUND_SOURCE_LEDGER_MISMATCH'; END IF;
    FOR i IN SELECT * FROM product_order_items WHERE order_id=o.id ORDER BY product_id LOOP
      UPDATE products SET stock=stock+i.quantity,sales=GREATEST(0,sales-i.quantity),updated_at=NOW() WHERE id=i.product_id AND shop_id=p_shop_id RETURNING stock INTO stock_after;
      IF FOUND THEN INSERT INTO product_inventory_logs(id,shop_id,product_id,product_name,change_amount,stock_after,type,order_id,reason,operator_id,operator_name)
        VALUES(gen_random_uuid()::TEXT,p_shop_id,i.product_id,i.name,i.quantity,stock_after,'refund',o.id,'退款库存退回',p_employee_id,p_employee_name); END IF;
    END LOOP;
    SELECT * INTO c FROM customers WHERE id=r.customer_id AND shop_id=p_shop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
    UPDATE customers SET stored_value_balance=COALESCE(stored_value_balance,0)+r.amount,balance=COALESCE(stored_value_balance,0)+r.amount,
      withdrawable_referral_amount=COALESCE(withdrawable_referral_amount,0)+referral,updated_at=NOW() WHERE id=c.id RETURNING * INTO c;
    INSERT INTO stored_value_transactions(id,customer_id,type,amount,balance_after,principal_portion,referral_portion,order_id,note,created_by,created_by_name)
      VALUES('refund_'||o.id,c.id,'refund',r.amount,c.stored_value_balance,principal,referral,o.id,'商品退款按原消费来源退回',p_employee_id,p_employee_name);
    UPDATE product_orders SET status='refunded',payment_status='refunded',updated_at=NOW() WHERE id=o.id;
  ELSE UPDATE product_orders SET status=r.previous_status,updated_at=NOW() WHERE id=o.id;
  END IF;
  UPDATE product_order_refunds SET status=p_status,reject_reason=CASE WHEN p_status='rejected' THEN p_reason ELSE NULL END,
    handler_id=p_employee_id,handler_name=p_employee_name,handled_at=NOW(),updated_at=NOW() WHERE id=r.id RETURNING * INTO r;
  RETURN NEXT r;
END $$;
REVOKE ALL ON FUNCTION public.handle_product_refund_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_product_refund_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
