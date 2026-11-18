-- 058: idempotent checkout, locked price confirmation, unpaid stock expiry (30 minutes).
ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS sales_counted BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS request_key TEXT;
ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS product_order_request_unique ON product_orders(customer_id,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_order_reservation_due ON product_orders(reservation_expires_at) WHERE status='pending' AND payment_status='pending';
-- Legacy reservations also get a finite lifetime; never expires a paid order.
UPDATE product_orders SET reservation_expires_at=created_at+INTERVAL '30 minutes'
 WHERE status='pending' AND payment_status='pending' AND reservation_expires_at IS NULL;

CREATE OR REPLACE FUNCTION create_product_order_reserved_atomic(p_order JSONB,p_items JSONB,p_coupon_id TEXT DEFAULT NULL)
RETURNS SETOF product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; i JSONB; p products%ROWTYPE; cc customer_coupons%ROWTYPE;
BEGIN
  IF jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  INSERT INTO product_orders(id,shop_id,customer_id,customer_name,customer_phone,order_no,total_amount,discount_amount,payable_amount,status,payment_method,payment_status,pickup_code,pickup_name,pickup_phone,notes,sales_counted)
    VALUES(p_order->>'id',p_order->>'shop_id',p_order->>'customer_id',p_order->>'customer_name',p_order->>'customer_phone',p_order->>'order_no',
      (p_order->>'total_amount')::NUMERIC,(p_order->>'discount_amount')::NUMERIC,(p_order->>'payable_amount')::NUMERIC,
      'pending',p_order->>'payment_method','pending',p_order->>'pickup_code',p_order->>'pickup_name',p_order->>'pickup_phone',p_order->>'notes',FALSE) RETURNING * INTO o;
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
    UPDATE products SET stock=stock-(i->>'quantity')::INTEGER,updated_at=NOW() WHERE id=p.id;
    INSERT INTO product_order_items(order_id,product_id,name,image,price,original_price,quantity,total_amount,category)
      VALUES(o.id,p.id,p.name,i->>'image',(i->>'price')::NUMERIC,(i->>'original_price')::NUMERIC,(i->>'quantity')::INTEGER,(i->>'total_amount')::NUMERIC,p.category);
    INSERT INTO product_inventory_logs(id,shop_id,product_id,product_name,change_amount,stock_after,type,order_id,reason)
      VALUES(gen_random_uuid()::TEXT,o.shop_id,p.id,p.name,-(i->>'quantity')::INTEGER,p.stock-(i->>'quantity')::INTEGER,'sale',o.id,'商品订单占用库存');
  END LOOP;
  IF o.payment_method='balance' THEN RETURN QUERY SELECT * FROM pay_product_order_atomic(o.id,o.customer_id);
  ELSE RETURN NEXT o; END IF;
END $$;
REVOKE ALL ON FUNCTION create_product_order_reserved_atomic(JSONB,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_product_order_reserved_atomic(JSONB,JSONB,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION create_product_order_atomic(p_order JSONB,p_items JSONB,p_coupon_id TEXT DEFAULT NULL)
RETURNS SETOF product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; c customers%ROWTYPE; p products%ROWTYPE; i JSONB;
 cc customer_coupons%ROWTYPE; co coupons%ROWTYPE; total NUMERIC:=0; base NUMERIC:=0; reduction NUMERIC:=0;
 vip NUMERIC:=1; stored NUMERIC:=1; unit NUMERIC; key TEXT:=p_order->>'request_key'; fingerprint TEXT:=p_order->>'request_fingerprint';
BEGIN
 IF key IS NULL OR key !~ '^[A-Za-z0-9_-]{16,100}$' OR fingerprint IS NULL OR fingerprint !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CHECKOUT_REQUEST_REQUIRED'; END IF;
 -- Serialize retries before looking at changed stock, wallet or a now consumed coupon.
 PERFORM pg_advisory_xact_lock(hashtextextended((p_order->>'customer_id')||':'||key,0));
 SELECT * INTO o FROM product_orders WHERE customer_id=p_order->>'customer_id' AND request_key=key;
 IF FOUND THEN
   IF o.shop_id<>p_order->>'shop_id' OR o.request_fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'CHECKOUT_REQUEST_CONFLICT'; END IF;
   RETURN NEXT o; RETURN;
 END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
 IF (SELECT COUNT(DISTINCT x->>'product_id') FROM jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'DUPLICATE_ITEMS'; END IF;
 -- Product -> customer lock order agrees with reservation and wallet/refund functions.
 FOR i IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'product_id' LOOP
   SELECT * INTO p FROM products WHERE id=i->>'product_id' AND shop_id=p_order->>'shop_id' FOR UPDATE;
   IF NOT FOUND OR NOT p.is_active OR (i->>'quantity')::INTEGER<1 OR (i->>'quantity')::INTEGER>100 OR p.stock<(i->>'quantity')::INTEGER THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
 END LOOP;
 SELECT * INTO c FROM customers WHERE id=p_order->>'customer_id' AND shop_id=p_order->>'shop_id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 IF c.purchase_vip_expires_at IS NULL OR c.purchase_vip_expires_at>clock_timestamp() THEN
 vip:=CASE c.purchase_vip_level WHEN 'bronze' THEN 0.88 WHEN 'silver' THEN 0.78 WHEN 'gold' THEN 0.68 WHEN 'diamond' THEN 0.58 ELSE 1 END;
 END IF;
 IF c.stored_value_expires_at IS NULL OR c.stored_value_expires_at>clock_timestamp() THEN
 stored:=CASE c.stored_value_level WHEN 'store_500' THEN 0.9 WHEN 'store_1000' THEN 0.85 WHEN 'store_2000' THEN 0.8 WHEN 'store_5000' THEN 0.7 ELSE 1 END;
 END IF;
 IF p_coupon_id IS NOT NULL THEN
 SELECT * INTO cc FROM customer_coupons WHERE id=p_coupon_id AND customer_id=c.id AND shop_id=c.shop_id FOR UPDATE;
 IF NOT FOUND OR cc.status<>'unused' OR cc.valid_start>clock_timestamp() OR cc.valid_end<clock_timestamp() THEN RAISE EXCEPTION 'COUPON_UNAVAILABLE'; END IF;
 SELECT * INTO co FROM coupons WHERE id=cc.coupon_id AND shop_id=c.shop_id FOR SHARE;
 IF NOT FOUND OR NOT co.is_active OR co.start_at>clock_timestamp() OR co.end_at<clock_timestamp() OR co.type NOT IN ('fixed_amount','percentage') OR co.applicable_scope='service' THEN RAISE EXCEPTION 'COUPON_UNAVAILABLE'; END IF;
 END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   SELECT * INTO p FROM products WHERE id=i->>'product_id';
   unit:=ROUND(p.price*CASE WHEN p.category='wig' OR p.category IS NULL THEN 1 ELSE vip*stored END,2);
   IF unit<>(i->>'price')::NUMERIC OR ROUND(unit*(i->>'quantity')::INTEGER,2)<>(i->>'total_amount')::NUMERIC THEN RAISE EXCEPTION 'CHECKOUT_PRICE_CHANGED'; END IF;
   total:=total+ROUND(unit*(i->>'quantity')::INTEGER,2);
   IF p_coupon_id IS NOT NULL AND (COALESCE(co.applicable_scope,'all')='all' OR p.id=ANY(co.applicable_product_ids)) THEN base:=base+ROUND(unit*(i->>'quantity')::INTEGER,2); END IF;
 END LOOP;
 IF p_coupon_id IS NOT NULL THEN
   IF total<COALESCE(co.min_order_amount,0) OR base<=0 THEN RAISE EXCEPTION 'COUPON_UNAVAILABLE'; END IF;
   reduction:=CASE co.type WHEN 'fixed_amount' THEN LEAST(co.value,base) ELSE base*(1-GREATEST(0,LEAST(1,co.value/10))) END;
   IF co.max_discount_amount>0 THEN reduction:=LEAST(reduction,co.max_discount_amount); END IF;
   reduction:=ROUND(reduction,2);
 END IF;
 IF total<>(p_order->>'total_amount')::NUMERIC OR total-reduction<>(p_order->>'payable_amount')::NUMERIC THEN RAISE EXCEPTION 'CHECKOUT_PRICE_CHANGED'; END IF;
 IF p_order->>'payment_method' NOT IN ('balance','store_pickup') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'; END IF;
 SELECT * INTO o FROM create_product_order_reserved_atomic(p_order,p_items,p_coupon_id);
 UPDATE product_orders SET request_key=key, request_fingerprint=fingerprint,
 reservation_expires_at=CASE WHEN o.payment_status='pending' THEN clock_timestamp()+INTERVAL '30 minutes' ELSE NULL END
 WHERE id=o.id RETURNING * INTO o;
 RETURN NEXT o;
END $$;
REVOKE ALL ON FUNCTION create_product_order_atomic(JSONB,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_product_order_atomic(JSONB,JSONB,TEXT) TO service_role;
-- Only the checked wrapper is an externally callable order creator.
REVOKE ALL ON FUNCTION create_product_order_reserved_atomic(JSONB,JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION expire_product_order_reservations(p_shop_id TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; released INTEGER:=0;
BEGIN
 FOR o IN SELECT * FROM product_orders WHERE shop_id=p_shop_id AND status='pending' AND payment_status='pending'
 AND reservation_expires_at<=clock_timestamp() ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
   PERFORM cancel_product_order_atomic(o.id,o.customer_id,o.shop_id,'未付款超过30分钟，自动释放库存');
   released:=released+1;
 END LOOP;
 RETURN released;
END $$;
REVOKE ALL ON FUNCTION expire_product_order_reservations(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION expire_product_order_reservations(TEXT) TO service_role;

-- Atomic product order creation, stock/coupon reservation and wallet payment.
CREATE OR REPLACE FUNCTION pay_product_order_atomic(p_order_id TEXT,p_customer_id TEXT)
RETURNS SETOF product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; c customers%ROWTYPE; principal NUMERIC; referral NUMERIC; next_balance NUMERIC;
BEGIN
  SELECT * INTO o FROM product_orders WHERE id=p_order_id AND customer_id=p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.payment_status='paid' THEN RETURN NEXT o; RETURN; END IF;
  IF o.reservation_expires_at IS NOT NULL AND o.reservation_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'ORDER_RESERVATION_EXPIRED'; END IF;
  IF o.status<>'pending' OR o.payment_status<>'pending' OR o.payable_amount<0 THEN RAISE EXCEPTION 'ORDER_NOT_PAYABLE'; END IF;
  PERFORM 1 FROM products WHERE id IN (SELECT product_id FROM product_order_items WHERE order_id=o.id) ORDER BY id FOR UPDATE;
  SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=o.shop_id FOR UPDATE;
  IF NOT FOUND OR NOT c.identity_verified OR c.is_weak_password THEN RAISE EXCEPTION 'CUSTOMER_IDENTITY_UNVERIFIED'; END IF;
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


CREATE OR REPLACE FUNCTION cancel_product_order_atomic(p_order_id TEXT,p_customer_id TEXT,p_shop_id TEXT,p_reason TEXT DEFAULT '')
RETURNS SETOF product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; i product_order_items%ROWTYPE; next_stock INTEGER;
BEGIN
  SELECT * INTO o FROM product_orders WHERE id=p_order_id AND customer_id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.status='cancelled' THEN RETURN NEXT o; RETURN; END IF;
  IF o.status<>'pending' OR o.payment_status<>'pending' THEN RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE'; END IF;
  FOR i IN SELECT * FROM product_order_items WHERE order_id=o.id ORDER BY product_id LOOP
    UPDATE products SET stock=stock+i.quantity,sales=GREATEST(0,sales-CASE WHEN o.sales_counted THEN i.quantity ELSE 0 END),updated_at=NOW() WHERE id=i.product_id AND shop_id=p_shop_id RETURNING stock INTO next_stock;
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

CREATE OR REPLACE FUNCTION product_paid_sales_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i product_order_items%ROWTYPE;
BEGIN
 IF NEW.payment_status='paid' AND OLD.payment_status<>'paid' THEN
  IF OLD.reservation_expires_at IS NOT NULL AND OLD.reservation_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'ORDER_RESERVATION_EXPIRED'; END IF;
  IF NOT OLD.sales_counted THEN
   FOR i IN SELECT * FROM product_order_items WHERE order_id=OLD.id ORDER BY product_id LOOP
    UPDATE products SET sales=sales+i.quantity WHERE id=i.product_id AND shop_id=OLD.shop_id;
   END LOOP;
   NEW.sales_counted:=TRUE;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS product_paid_sales_guard ON product_orders;
CREATE TRIGGER product_paid_sales_guard BEFORE UPDATE OF payment_status ON product_orders FOR EACH ROW EXECUTE FUNCTION product_paid_sales_guard();
REVOKE ALL ON FUNCTION product_paid_sales_guard() FROM PUBLIC,anon,authenticated;
UPDATE products p SET sales=GREATEST(0,p.sales-x.quantity) FROM (
 SELECT i.product_id,sum(i.quantity)::INTEGER AS quantity FROM product_order_items i JOIN product_orders o ON o.id=i.order_id
 WHERE o.status='pending' AND o.payment_status='pending' AND o.sales_counted GROUP BY i.product_id
) x WHERE p.id=x.product_id;
UPDATE product_orders SET sales_counted=FALSE WHERE status='pending' AND payment_status='pending' AND sales_counted;

CREATE OR REPLACE FUNCTION expire_due_product_reservations() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE shop TEXT; released INTEGER:=0;
BEGIN
 FOR shop IN SELECT DISTINCT shop_id FROM product_orders WHERE status='pending' AND payment_status='pending' AND reservation_expires_at<=clock_timestamp() LIMIT 10 LOOP
 released:=released+expire_product_order_reservations(shop);
 END LOOP;
 RETURN released;
END $$;
REVOKE ALL ON FUNCTION expire_due_product_reservations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION expire_due_product_reservations() TO service_role;
