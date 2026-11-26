-- Apply regular member pricing to wigs on new orders. Existing order prices are preserved.
BEGIN;

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
   unit:=ROUND(p.price*CASE WHEN p.category IS NULL THEN 1 ELSE vip*stored END,2);
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

COMMIT;
