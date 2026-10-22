-- Atomic product order creation, stock/coupon reservation and wallet payment.
CREATE OR REPLACE FUNCTION pay_product_order_atomic(p_order_id TEXT,p_customer_id TEXT)
RETURNS SETOF product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; c customers%ROWTYPE; principal NUMERIC; referral NUMERIC; next_balance NUMERIC;
BEGIN
  SELECT * INTO o FROM product_orders WHERE id=p_order_id AND customer_id=p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.payment_status='paid' THEN RETURN NEXT o; RETURN; END IF;
  IF o.status<>'pending' OR o.payment_status<>'pending' OR o.payable_amount<0 THEN RAISE EXCEPTION 'ORDER_NOT_PAYABLE'; END IF;
  SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=o.shop_id FOR UPDATE;
  IF NOT FOUND OR NOT c.identity_verified THEN RAISE EXCEPTION 'CUSTOMER_IDENTITY_UNVERIFIED'; END IF;
  IF COALESCE(c.stored_value_balance,0)<o.payable_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  principal:=LEAST(o.payable_amount,GREATEST(0,COALESCE(c.stored_value_balance,0)-COALESCE(c.withdrawable_referral_amount,0)));
  referral:=o.payable_amount-principal; next_balance:=ROUND((COALESCE(c.stored_value_balance,0)-o.payable_amount)::NUMERIC,2);
  UPDATE customers SET stored_value_balance=next_balance,balance=next_balance,
    withdrawable_referral_amount=GREATEST(0,COALESCE(withdrawable_referral_amount,0)-referral) WHERE id=c.id;
  INSERT INTO stored_value_transactions(id,customer_id,type,amount,balance_after,principal_portion,referral_portion,order_id,note,created_by,created_by_name)
    VALUES('product_'||o.id,c.id,'consume',-o.payable_amount,next_balance,-principal,-referral,o.id,'商品订单消费',c.id,c.name);
  UPDATE product_orders SET status='paid',payment_status='paid',payment_method='balance',paid_at=NOW(),updated_at=NOW() WHERE id=o.id RETURNING * INTO o;
  RETURN NEXT o;
END $$;
REVOKE ALL ON FUNCTION pay_product_order_atomic(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pay_product_order_atomic(TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION create_product_order_atomic(p_order JSONB,p_items JSONB,p_coupon_id TEXT DEFAULT NULL)
RETURNS SETOF product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; i JSONB; p products%ROWTYPE; cc customer_coupons%ROWTYPE;
BEGIN
  IF jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  INSERT INTO product_orders(id,shop_id,customer_id,customer_name,customer_phone,order_no,total_amount,discount_amount,payable_amount,status,payment_method,payment_status,pickup_code,pickup_name,pickup_phone,notes)
    VALUES(p_order->>'id',p_order->>'shop_id',p_order->>'customer_id',p_order->>'customer_name',p_order->>'customer_phone',p_order->>'order_no',
      (p_order->>'total_amount')::NUMERIC,(p_order->>'discount_amount')::NUMERIC,(p_order->>'payable_amount')::NUMERIC,
      'pending',p_order->>'payment_method','pending',p_order->>'pickup_code',p_order->>'pickup_name',p_order->>'pickup_phone',p_order->>'notes') RETURNING * INTO o;
  IF o.payable_amount<0 OR o.payable_amount>o.total_amount THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM customers WHERE id=o.customer_id AND shop_id=o.shop_id) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF p_coupon_id IS NOT NULL THEN
    SELECT * INTO cc FROM customer_coupons WHERE id=p_coupon_id AND customer_id=o.customer_id AND shop_id=o.shop_id FOR UPDATE;
    IF NOT FOUND OR cc.status<>'unused' THEN RAISE EXCEPTION 'COUPON_UNAVAILABLE'; END IF;
    UPDATE customer_coupons SET status='used',used_at=NOW(),order_id=o.id,updated_at=NOW() WHERE id=cc.id;
  END IF;
  -- Stable product order prevents deadlocks on multi-product baskets.
  FOR i IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'product_id' LOOP
    IF (i->>'quantity')::INTEGER<1 OR (i->>'quantity')::INTEGER>100 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
    SELECT * INTO p FROM products WHERE id=i->>'product_id' AND shop_id=o.shop_id FOR UPDATE;
    IF NOT FOUND OR NOT p.is_active OR p.stock<(i->>'quantity')::INTEGER THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
    UPDATE products SET stock=stock-(i->>'quantity')::INTEGER,sales=sales+(i->>'quantity')::INTEGER,updated_at=NOW() WHERE id=p.id;
    INSERT INTO product_order_items(order_id,product_id,name,image,price,original_price,quantity,total_amount,category)
      VALUES(o.id,p.id,p.name,i->>'image',(i->>'price')::NUMERIC,(i->>'original_price')::NUMERIC,(i->>'quantity')::INTEGER,(i->>'total_amount')::NUMERIC,p.category);
    INSERT INTO product_inventory_logs(id,shop_id,product_id,product_name,change_amount,stock_after,type,order_id,reason)
      VALUES(gen_random_uuid()::TEXT,o.shop_id,p.id,p.name,-(i->>'quantity')::INTEGER,p.stock-(i->>'quantity')::INTEGER,'sale',o.id,'商品订单占用库存');
  END LOOP;
  IF o.payment_method='balance' THEN RETURN QUERY SELECT * FROM pay_product_order_atomic(o.id,o.customer_id);
  ELSE RETURN NEXT o; END IF;
END $$;
REVOKE ALL ON FUNCTION create_product_order_atomic(JSONB,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_product_order_atomic(JSONB,JSONB,TEXT) TO service_role;

-- A concurrent refund must not overwrite a freshly deducted wallet balance.
CREATE OR REPLACE FUNCTION handle_product_refund_atomic(p_refund_id TEXT,p_shop_id TEXT,p_status TEXT,p_employee_id TEXT,p_employee_name TEXT,p_reason TEXT DEFAULT '')
RETURNS SETOF product_order_refunds LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r product_order_refunds%ROWTYPE; o product_orders%ROWTYPE; c customers%ROWTYPE; i product_order_items%ROWTYPE; stock_after INTEGER;
BEGIN
  SELECT * INTO r FROM product_order_refunds WHERE id=p_refund_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_NOT_FOUND'; END IF;
  IF r.status=p_status THEN RETURN NEXT r; RETURN; END IF;
  IF r.status<>'pending' OR p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_REFUND_STATUS'; END IF;
  SELECT * INTO o FROM product_orders WHERE id=r.order_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR o.status='refunded' OR o.payment_method<>'balance' OR o.payment_status<>'paid' OR r.amount<>o.payable_amount THEN RAISE EXCEPTION 'ORDER_NOT_REFUNDABLE'; END IF;
  IF p_status='approved' THEN
    FOR i IN SELECT * FROM product_order_items WHERE order_id=o.id ORDER BY product_id LOOP
      UPDATE products SET stock=stock+i.quantity,sales=GREATEST(0,sales-i.quantity),updated_at=NOW() WHERE id=i.product_id AND shop_id=p_shop_id RETURNING stock INTO stock_after;
      IF FOUND THEN
        INSERT INTO product_inventory_logs(id,shop_id,product_id,product_name,change_amount,stock_after,type,order_id,reason,operator_id,operator_name)
          VALUES(gen_random_uuid()::TEXT,p_shop_id,i.product_id,i.name,i.quantity,stock_after,'refund',o.id,'退款库存退回',p_employee_id,p_employee_name);
      END IF;
    END LOOP;
    SELECT * INTO c FROM customers WHERE id=r.customer_id AND shop_id=p_shop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
    UPDATE customers SET stored_value_balance=COALESCE(stored_value_balance,0)+r.amount,balance=COALESCE(stored_value_balance,0)+r.amount,updated_at=NOW() WHERE id=c.id RETURNING * INTO c;
    INSERT INTO stored_value_transactions(id,customer_id,type,amount,balance_after,principal_portion,referral_portion,order_id,note,created_by,created_by_name)
      VALUES('refund_'||o.id,c.id,'refund',r.amount,c.stored_value_balance,r.amount,0,o.id,'商品订单退款',p_employee_id,p_employee_name);
    UPDATE product_orders SET status='refunded',payment_status='refunded',updated_at=NOW() WHERE id=o.id;
  ELSE UPDATE product_orders SET status=r.previous_status,updated_at=NOW() WHERE id=o.id;
  END IF;
  UPDATE product_order_refunds SET status=p_status,reject_reason=CASE WHEN p_status='rejected' THEN p_reason ELSE NULL END,
    handler_id=p_employee_id,handler_name=p_employee_name,handled_at=NOW(),updated_at=NOW() WHERE id=r.id RETURNING * INTO r;
  RETURN NEXT r;
END $$;
REVOKE ALL ON FUNCTION handle_product_refund_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION handle_product_refund_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION cancel_product_order_atomic(p_order_id TEXT,p_customer_id TEXT,p_shop_id TEXT,p_reason TEXT DEFAULT '')
RETURNS SETOF product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; i product_order_items%ROWTYPE; next_stock INTEGER;
BEGIN
  SELECT * INTO o FROM product_orders WHERE id=p_order_id AND customer_id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.status='cancelled' THEN RETURN NEXT o; RETURN; END IF;
  IF o.status<>'pending' OR o.payment_status<>'pending' THEN RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE'; END IF;
  FOR i IN SELECT * FROM product_order_items WHERE order_id=o.id ORDER BY product_id LOOP
    UPDATE products SET stock=stock+i.quantity,sales=GREATEST(0,sales-i.quantity),updated_at=NOW() WHERE id=i.product_id AND shop_id=p_shop_id RETURNING stock INTO next_stock;
    IF FOUND THEN
      INSERT INTO product_inventory_logs(id,shop_id,product_id,product_name,change_amount,stock_after,type,order_id,reason)
        VALUES(gen_random_uuid()::TEXT,p_shop_id,i.product_id,i.name,i.quantity,next_stock,'cancel',o.id,p_reason);
    END IF;
  END LOOP;
  UPDATE customer_coupons SET status='unused',used_at=NULL,order_id=NULL,updated_at=NOW() WHERE order_id=o.id AND customer_id=o.customer_id AND status='used';
  UPDATE product_orders SET status='cancelled',cancelled_at=NOW(),cancel_reason=p_reason,updated_at=NOW() WHERE id=o.id RETURNING * INTO o;
  RETURN NEXT o;
END $$;
REVOKE ALL ON FUNCTION cancel_product_order_atomic(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_product_order_atomic(TEXT,TEXT,TEXT,TEXT) TO service_role;
