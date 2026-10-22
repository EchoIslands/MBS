-- 2026-10-22：已只读核对生产字段；仅安装函数/触发器，不回填业务记录。
CREATE OR REPLACE FUNCTION claim_coupon_atomic(p_coupon_id TEXT,p_customer_id TEXT,p_shop_id TEXT,p_referral_id TEXT DEFAULT NULL)
RETURNS SETOF customer_coupons LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cp coupons%ROWTYPE; c customers%ROWTYPE; cc customer_coupons%ROWTYPE; r referral_records%ROWTYPE; expiry TIMESTAMPTZ;
BEGIN
  IF p_referral_id IS NOT NULL THEN
    SELECT * INTO r FROM referral_records WHERE id=p_referral_id AND shop_id=p_shop_id FOR UPDATE;
    IF NOT FOUND OR r.status='confirmed' OR r.referrer_id=p_customer_id THEN RAISE EXCEPTION 'REFERRAL_UNAVAILABLE'; END IF;
    IF r.referred_id IS NOT NULL THEN
      IF r.referred_id=p_customer_id THEN
        RETURN QUERY SELECT * FROM customer_coupons WHERE source_referral_id=r.id AND customer_id=p_customer_id; RETURN;
      END IF;
      RAISE EXCEPTION 'REFERRAL_UNAVAILABLE';
    END IF;
    IF r.coupon_id IS NOT NULL AND r.coupon_id<>p_coupon_id THEN RAISE EXCEPTION 'REFERRAL_UNAVAILABLE'; END IF;
  END IF;
  SELECT * INTO cp FROM coupons WHERE id=p_coupon_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR cp.is_active IS NOT TRUE THEN RAISE EXCEPTION 'COUPON_UNAVAILABLE'; END IF;
  SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=p_shop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF p_referral_id IS NULL AND (cp.start_at>NOW() OR cp.end_at<NOW()) THEN RAISE EXCEPTION 'COUPON_EXPIRED'; END IF;
  IF cp.remaining_quantity=0 THEN RAISE EXCEPTION 'COUPON_EXHAUSTED'; END IF;
  IF (SELECT COUNT(*) FROM customer_coupons WHERE coupon_id=cp.id AND customer_id=c.id)>=GREATEST(1,COALESCE(cp.per_customer_limit,1)) THEN
    RAISE EXCEPTION 'COUPON_LIMIT_REACHED';
  END IF;
  expiry:=cp.end_at;
  IF p_referral_id IS NOT NULL THEN
    -- 保留现有邀请券领取后30天规则，模板扩展与领券一并提交。
    expiry:=NOW()+INTERVAL '30 days';
    IF cp.end_at IS NULL OR cp.end_at<expiry THEN UPDATE coupons SET start_at=NOW(),end_at=expiry,updated_at=NOW() WHERE id=cp.id; END IF;
  END IF;
  INSERT INTO customer_coupons(id,shop_id,customer_id,coupon_id,coupon_name,type,value,min_order_amount,
    customer_name,customer_phone,status,source,source_referral_id,valid_start,valid_end,updated_at)
    VALUES(gen_random_uuid()::TEXT,p_shop_id,c.id,cp.id,cp.name,cp.type,cp.value,cp.min_order_amount,
      c.name,c.phone,'unused',CASE WHEN p_referral_id IS NULL THEN 'claim' ELSE 'referral_scan' END,p_referral_id,NOW(),expiry,NOW()) RETURNING * INTO cc;
  UPDATE coupons SET remaining_quantity=CASE WHEN remaining_quantity>0 THEN remaining_quantity-1 ELSE remaining_quantity END,updated_at=NOW() WHERE id=cp.id;
  IF p_referral_id IS NOT NULL THEN
    UPDATE referral_records SET referred_id=c.id,referred_name=c.name,referred_phone=c.phone,status='couponed',couponed_at=NOW(),coupon_id=cp.id WHERE id=r.id;
  END IF;
  RETURN NEXT cc;
END $$;
REVOKE ALL ON FUNCTION claim_coupon_atomic(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_coupon_atomic(TEXT,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION request_product_refund_atomic(p_order_id TEXT,p_customer_id TEXT,p_shop_id TEXT,p_reason TEXT)
RETURNS SETOF product_order_refunds LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE; r product_order_refunds%ROWTYPE;
BEGIN
  SELECT * INTO o FROM product_orders WHERE id=p_order_id AND customer_id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT * INTO r FROM product_order_refunds WHERE order_id=o.id AND status='pending';
  IF FOUND THEN RETURN NEXT r; RETURN; END IF;
  IF o.status NOT IN ('paid','preparing','ready') OR o.payment_method<>'balance' OR o.payment_status<>'paid' THEN RAISE EXCEPTION 'ORDER_NOT_REFUNDABLE'; END IF;
  IF length(btrim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  INSERT INTO product_order_refunds(id,order_id,shop_id,customer_id,customer_name,amount,reason,status,previous_status)
    VALUES(gen_random_uuid()::TEXT,o.id,o.shop_id,o.customer_id,COALESCE(o.customer_name,''),o.payable_amount,btrim(p_reason),'pending',o.status) RETURNING * INTO r;
  UPDATE product_orders SET status='refunding',updated_at=NOW() WHERE id=o.id;
  RETURN NEXT r;
END $$;
REVOKE ALL ON FUNCTION request_product_refund_atomic(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION request_product_refund_atomic(TEXT,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION confirm_product_receipt_atomic(p_order_id TEXT,p_customer_id TEXT,p_shop_id TEXT)
RETURNS SETOF product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM product_orders WHERE id=p_order_id AND customer_id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.status='completed' AND o.confirmed_at IS NOT NULL THEN RETURN NEXT o; RETURN; END IF;
  IF o.status<>'shipped' THEN RAISE EXCEPTION 'ORDER_NOT_SHIPPED'; END IF;
  UPDATE product_orders SET status='completed',confirmed_at=NOW(),completed_at=NOW(),updated_at=NOW() WHERE id=o.id RETURNING * INTO o;
  INSERT INTO shipment_tracking(order_id,shipping_company,shipping_no,event_time,event_description,location)
    VALUES(o.id,o.shipping_company,o.shipping_no,NOW(),'确认收货','');
  RETURN NEXT o;
END $$;
REVOKE ALL ON FUNCTION confirm_product_receipt_atomic(TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION confirm_product_receipt_atomic(TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION adjust_product_inventory_atomic(p_product_id TEXT,p_shop_id TEXT,p_stock INTEGER,p_reason TEXT,p_employee_id TEXT,p_employee_name TEXT)
RETURNS SETOF products LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p products%ROWTYPE; previous_stock INTEGER;
BEGIN
  IF p_stock IS NULL OR p_stock<0 OR length(btrim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'INVALID_INVENTORY_ADJUSTMENT'; END IF;
  SELECT * INTO p FROM products WHERE id=p_product_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  previous_stock:=COALESCE(p.stock,0);
  UPDATE products SET stock=p_stock,updated_at=NOW() WHERE id=p.id RETURNING * INTO p;
  INSERT INTO product_inventory_logs(id,shop_id,product_id,product_name,change_amount,stock_after,type,reason,operator_id,operator_name)
    VALUES(gen_random_uuid()::TEXT,p_shop_id,p.id,p.name,p_stock-previous_stock,p_stock,'manual_adjust',p_reason,p_employee_id,p_employee_name);
  RETURN NEXT p;
END $$;
REVOKE ALL ON FUNCTION adjust_product_inventory_atomic(TEXT,TEXT,INTEGER,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION adjust_product_inventory_atomic(TEXT,TEXT,INTEGER,TEXT,TEXT,TEXT) TO service_role;

-- 不删除历史重复评价；通过锁预约行避免新并发提交同一预约两条评价。
CREATE OR REPLACE FUNCTION guard_review_booking_once() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    PERFORM id FROM bookings WHERE id=NEW.booking_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM reviews WHERE booking_id=NEW.booking_id AND id<>NEW.id) THEN RAISE EXCEPTION 'BOOKING_ALREADY_REVIEWED'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_review_booking_once() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION guard_review_booking_once() TO service_role;
DROP TRIGGER IF EXISTS review_booking_once ON reviews;
CREATE TRIGGER review_booking_once BEFORE INSERT OR UPDATE OF booking_id ON reviews FOR EACH ROW EXECUTE FUNCTION guard_review_booking_once();
