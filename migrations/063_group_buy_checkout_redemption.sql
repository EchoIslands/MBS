-- Reserve a voucher when a settlement is created. Consume it only when settlement completes.
BEGIN;

CREATE OR REPLACE FUNCTION finalize_settlement_atomic(
  p_settlement_id TEXT,
  p_shop_id TEXT,
  p_employee_id TEXT,
  p_employee_name TEXT,
  p_booking_id TEXT DEFAULT NULL,
  p_package_id TEXT DEFAULT NULL,
  p_package_note TEXT DEFAULT ''
) RETURNS SETOF settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s settlements%ROWTYPE; c customers%ROWTYPE; pkg customer_packages%ROWTYPE;
  used_principal NUMERIC; used_referral NUMERIC; next_balance NUMERIC; svc_ids TEXT[]; svc_names TEXT[];
BEGIN
  -- 固定锁顺序：客户 -> 预约 -> 结算；串行化同一预约的不同收银单。
  PERFORM 1 FROM customers WHERE id=(SELECT customer_id FROM settlements WHERE id=p_settlement_id AND shop_id=p_shop_id) FOR UPDATE;
  PERFORM 1 FROM bookings WHERE id=(SELECT booking_id FROM settlements WHERE id=p_settlement_id AND shop_id=p_shop_id) FOR UPDATE;
  SELECT * INTO s FROM settlements WHERE id=p_settlement_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETTLEMENT_NOT_FOUND'; END IF;
  IF s.payment_status='completed' THEN RETURN NEXT s; RETURN; END IF;
  IF s.booking_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM bookings WHERE id=s.booking_id AND shop_id=s.shop_id AND customer_id=s.customer_id) THEN RAISE EXCEPTION 'BOOKING_OWNER_MISMATCH'; END IF;
    IF EXISTS(SELECT 1 FROM settlements WHERE booking_id=s.booking_id AND id<>s.id AND payment_status='completed') THEN RAISE EXCEPTION 'BOOKING_ALREADY_SETTLED'; END IF;
    IF EXISTS(SELECT 1 FROM settlements other WHERE other.booking_id=s.booking_id AND other.id<>s.id AND
      (other.checkout_payment_started OR EXISTS(SELECT 1 FROM payments WHERE settlement_id=other.id))) THEN RAISE EXCEPTION 'BOOKING_PAYMENT_IN_PROGRESS'; END IF;
  END IF;
  IF NOT s.server_priced OR s.total<0 THEN RAISE EXCEPTION 'LEGACY_SETTLEMENT_REQUIRES_RECONCILIATION'; END IF;
  IF s.payment_status NOT IN ('pending','paid') THEN RAISE EXCEPTION 'SETTLEMENT_NOT_PAYABLE'; END IF;

  SELECT * INTO c FROM customers WHERE id=s.customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF s.payment_method='balance' THEN
    IF COALESCE(c.stored_value_balance,0) < s.total THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
    used_principal := LEAST(s.total, GREATEST(0, COALESCE(c.stored_value_balance,0)-COALESCE(c.withdrawable_referral_amount,0)));
    used_referral := s.total-used_principal;
    next_balance := ROUND((COALESCE(c.stored_value_balance,0)-s.total)::NUMERIC, 2);
  END IF;

  p_package_id := s.customer_package_id;
  IF p_package_id IS NOT NULL THEN
    SELECT * INTO pkg FROM customer_packages WHERE id=p_package_id AND shop_id=p_shop_id AND customer_id=s.customer_id FOR UPDATE;
    IF NOT FOUND OR pkg.status <> 'active' OR pkg.used_times >= pkg.total_times OR
      (NOT EXISTS (SELECT 1 FROM settlement_package_reservations WHERE settlement_id=s.id AND package_id=p_package_id)
       AND (pkg.expires_at <= NOW() OR pkg.used_times+pkg.reserved_times>=pkg.total_times)) THEN
      RAISE EXCEPTION 'PACKAGE_UNAVAILABLE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.items) item WHERE item->>'type'='service' AND item->>'id'=pkg.service_id) THEN
      RAISE EXCEPTION 'PACKAGE_SERVICE_MISMATCH';
    END IF;
  END IF;

  IF cardinality(COALESCE(s.used_benefit_ids, '{}')) > 0 THEN
    IF (SELECT COUNT(*) FROM member_benefit_records WHERE id=ANY(s.used_benefit_ids) AND customer_id=s.customer_id AND shop_id=p_shop_id AND status='available' AND (reserved_settlement_id IS NULL OR reserved_settlement_id=s.id)) <> cardinality(s.used_benefit_ids) THEN
      RAISE EXCEPTION 'BENEFIT_UNAVAILABLE';
    END IF;
    UPDATE member_benefit_records SET status='used', used_at=NOW(), used_by=p_employee_id, reserved_settlement_id=NULL,
      used_by_name=p_employee_name, used_order_id=s.id
      WHERE id=ANY(s.used_benefit_ids) AND customer_id=s.customer_id AND shop_id=p_shop_id AND status='available';
  END IF;

  UPDATE customers SET
    visit_count=COALESCE(visit_count,0)+1,
    total_spent=COALESCE(total_spent,0)+COALESCE(s.total,0),
    last_visit_at=NOW(), points=COALESCE(points,0)+ROUND(COALESCE(s.total,0))::INTEGER,
    stored_value_balance=CASE WHEN s.payment_method='balance' THEN next_balance ELSE stored_value_balance END,
    balance=CASE WHEN s.payment_method='balance' THEN next_balance ELSE balance END,
    withdrawable_referral_amount=CASE WHEN s.payment_method='balance' THEN GREATEST(0, COALESCE(withdrawable_referral_amount,0)-used_referral) ELSE withdrawable_referral_amount END
    WHERE id=s.customer_id AND shop_id=p_shop_id;

  IF s.payment_method='balance' THEN
    INSERT INTO stored_value_transactions(id, customer_id, type, amount, balance_after, principal_portion, referral_portion, order_id, note, created_at, created_by, created_by_name)
      VALUES ('settle_'||s.id, s.customer_id, 'consume', -s.total, next_balance, -used_principal, -used_referral, s.id, '消费结算', NOW(), p_employee_id, p_employee_name);
  END IF;

  IF p_package_id IS NOT NULL THEN
    UPDATE customer_packages SET used_times=used_times+1,
      reserved_times=reserved_times-CASE WHEN EXISTS(SELECT 1 FROM settlement_package_reservations WHERE settlement_id=s.id) THEN 1 ELSE 0 END,
      status=CASE WHEN used_times+1 >= total_times THEN 'used_up' ELSE 'active' END, updated_at=NOW()
      WHERE id=p_package_id;
    INSERT INTO package_usage_logs(package_id, booking_id, customer_id, shop_id, used_at, used_by, note)
      VALUES (p_package_id, s.booking_id, s.customer_id, p_shop_id, NOW(), p_employee_id, COALESCE(p_package_note,''));
    DELETE FROM settlement_package_reservations WHERE settlement_id=s.id;
  END IF;

  SELECT COALESCE(array_agg(item->>'id') FILTER (WHERE item->>'type'='service'), '{}'),
         COALESCE(array_agg(item->>'name') FILTER (WHERE item->>'type'='service'), '{}')
    INTO svc_ids, svc_names FROM jsonb_array_elements(s.items) item;
  INSERT INTO customer_visit_records(id, customer_id, shop_id, booking_id, stylist_id, stylist_name, service_ids, service_names, total_amount, payment_method, check_in_time, created_at)
    VALUES ('visit_'||s.id, s.customer_id, p_shop_id, s.booking_id,
      COALESCE((SELECT stylist_id FROM bookings WHERE id=s.booking_id),(SELECT item->>'employeeId' FROM jsonb_array_elements(s.items) item WHERE item->>'type'='service' LIMIT 1)),
      COALESCE((SELECT stylist_name FROM bookings WHERE id=s.booking_id),(SELECT item->>'employeeName' FROM jsonb_array_elements(s.items) item WHERE item->>'type'='service' LIMIT 1),'未指定设计师'), svc_ids, svc_names, s.total, s.payment_method, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

  UPDATE bookings SET status='completed' WHERE id=s.booking_id AND shop_id=s.shop_id AND customer_id=s.customer_id;
  UPDATE group_buy_vouchers SET status='used', used_at=NOW(), used_by_customer_id=s.customer_id
    WHERE used_order_id=s.id AND shop_id=s.shop_id AND status='unused';
  UPDATE settlements SET payment_status='completed' WHERE id=s.id RETURNING * INTO s;
  UPDATE payments SET status='paid', paid_at=COALESCE(paid_at,NOW()) WHERE settlement_id=s.id;
  RETURN NEXT s;
END $$;

REVOKE ALL ON FUNCTION finalize_settlement_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_settlement_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION create_settlement_atomic(p_settlement JSONB, p_employee_id TEXT, p_employee_name TEXT, p_complete BOOLEAN)
RETURNS SETOF settlements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s settlements%ROWTYPE; p customer_packages%ROWTYPE; c customers%ROWTYPE; b member_benefit_records%ROWTYPE; voucher_item JSONB; v group_buy_vouchers%ROWTYPE; batch group_buy_batches%ROWTYPE; previous settlements%ROWTYPE;
BEGIN
  s.id := p_settlement->>'id'; s.shop_id := p_settlement->>'shop_id'; s.customer_id := p_settlement->>'customer_id';
  -- Serialize same-customer creation with completion and balance operations.
  SELECT * INTO c FROM customers WHERE id=s.customer_id AND shop_id=s.shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;

  s.booking_id := NULLIF(p_settlement->>'booking_id','');
  IF s.booking_id IS NOT NULL THEN
    PERFORM 1 FROM bookings WHERE id=s.booking_id AND shop_id=s.shop_id AND customer_id=s.customer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_OWNER_MISMATCH'; END IF;
    IF EXISTS(SELECT 1 FROM settlements WHERE booking_id=s.booking_id AND id<>s.id AND payment_status='completed') THEN RAISE EXCEPTION 'BOOKING_ALREADY_SETTLED'; END IF;
    IF EXISTS(SELECT 1 FROM settlements other WHERE other.booking_id=s.booking_id AND other.id<>s.id AND
      (other.checkout_payment_started OR EXISTS(SELECT 1 FROM payments WHERE settlement_id=other.id))) THEN RAISE EXCEPTION 'BOOKING_PAYMENT_IN_PROGRESS'; END IF;
  END IF;
  SELECT * INTO previous FROM settlements WHERE id=s.id FOR UPDATE;
  IF FOUND THEN
    IF previous.shop_id IS DISTINCT FROM s.shop_id OR previous.customer_id IS DISTINCT FROM s.customer_id OR previous.booking_id IS DISTINCT FROM s.booking_id THEN RAISE EXCEPTION 'DRAFT_OWNER_MISMATCH'; END IF;
    IF previous.payment_status='completed' AND previous.checkout_request_key IS NOT DISTINCT FROM p_settlement->>'checkout_request_key' THEN RETURN NEXT previous; RETURN; END IF;
    IF previous.payment_status NOT IN ('pending','failed') THEN RAISE EXCEPTION 'SETTLEMENT_NOT_PAYABLE'; END IF;
    IF previous.checkout_payment_started OR EXISTS(SELECT 1 FROM payments WHERE settlement_id=s.id) THEN RAISE EXCEPTION 'PAYMENT_ORDER_EXISTS'; END IF;
    -- 释放并重新预占在同一个事务中，后续任何失败会恢复原草稿。
    UPDATE customer_packages SET reserved_times=reserved_times-1 WHERE id IN (SELECT package_id FROM settlement_package_reservations WHERE settlement_id=s.id);
    DELETE FROM settlement_package_reservations WHERE settlement_id=s.id;
    UPDATE member_benefit_records SET reserved_settlement_id=NULL WHERE reserved_settlement_id=s.id;
    UPDATE group_buy_vouchers SET used_order_id=NULL WHERE used_order_id=s.id;
  END IF;
  IF s.booking_id IS NOT NULL AND EXISTS(SELECT 1 FROM bookings WHERE id=s.booking_id AND status='cancelled') THEN RAISE EXCEPTION 'BOOKING_CANCELLED'; END IF;
  s.total := (p_settlement->>'total')::NUMERIC;
  IF s.total IS NULL OR s.total<0 OR s.total<>ROUND(s.total,2) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF previous.id IS NOT NULL THEN
    UPDATE settlements SET customer_name=c.name,items=p_settlement->'items',subtotal=(p_settlement->>'subtotal')::NUMERIC,
      discount_detail=COALESCE(p_settlement->'discount_detail','{}'),discount=(p_settlement->>'discount')::NUMERIC,
      tax=0,total=s.total,payment_method=p_settlement->>'payment_method',payment_status='pending',
      used_benefit_ids=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_settlement->'used_benefit_ids','[]'))),
      processed_by=p_employee_name,customer_package_id=p_settlement->>'customer_package_id'
      WHERE id=s.id RETURNING * INTO s;
  ELSE
  INSERT INTO settlements(id,shop_id,customer_id,customer_name,booking_id,items,subtotal,discount_detail,discount,tax,total,payment_method,payment_status,used_benefit_ids,processed_by,customer_package_id)
    VALUES(s.id,s.shop_id,s.customer_id,c.name,p_settlement->>'booking_id',p_settlement->'items',
      (p_settlement->>'subtotal')::NUMERIC,COALESCE(p_settlement->'discount_detail','{}'),(p_settlement->>'discount')::NUMERIC,0,s.total,
      p_settlement->>'payment_method','pending',ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_settlement->'used_benefit_ids','[]'))),p_employee_name,p_settlement->>'customer_package_id')
    RETURNING * INTO s;
  END IF;
  UPDATE settlements SET checkout_request_key=p_settlement->>'checkout_request_key',
    checkout_payment_started=COALESCE((p_settlement->>'start_payment')::BOOLEAN,FALSE),server_priced=TRUE WHERE id=s.id RETURNING * INTO s;
  IF s.customer_package_id IS NOT NULL THEN
    SELECT * INTO p FROM customer_packages WHERE id=s.customer_package_id AND shop_id=s.shop_id AND customer_id=s.customer_id FOR UPDATE;
    IF FOUND AND s.booking_id IS NOT NULL AND EXISTS(SELECT 1 FROM package_usage_logs WHERE package_id=p.id AND booking_id=s.booking_id AND shop_id=s.shop_id) THEN RAISE EXCEPTION 'BOOKING_PACKAGE_ALREADY_CONSUMED'; END IF;
    IF NOT FOUND OR p.status<>'active' OR p.expires_at<=NOW() OR p.used_times+p.reserved_times>=p.total_times THEN RAISE EXCEPTION 'PACKAGE_UNAVAILABLE'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.items) item WHERE item->>'type'='service' AND item->>'id'=p.service_id AND (item->>'quantity')::INTEGER=1 AND (item->>'originalPrice')::NUMERIC=0) THEN RAISE EXCEPTION 'PACKAGE_SERVICE_MISMATCH'; END IF;
    UPDATE customer_packages SET reserved_times=reserved_times+1 WHERE id=p.id;
    INSERT INTO settlement_package_reservations(settlement_id,package_id) VALUES(s.id,p.id);
  END IF;
  FOR b IN SELECT * FROM member_benefit_records WHERE id=ANY(s.used_benefit_ids) ORDER BY id FOR UPDATE LOOP
    IF b.customer_id<>s.customer_id OR b.shop_id<>s.shop_id OR b.status<>'available' OR b.reserved_settlement_id IS NOT NULL OR (b.expires_at IS NOT NULL AND b.expires_at<=NOW()) THEN RAISE EXCEPTION 'BENEFIT_UNAVAILABLE'; END IF;
    UPDATE member_benefit_records SET reserved_settlement_id=s.id WHERE id=b.id;
  END LOOP;
  IF (SELECT COUNT(*) FROM member_benefit_records WHERE id=ANY(s.used_benefit_ids))<>cardinality(s.used_benefit_ids) THEN RAISE EXCEPTION 'BENEFIT_UNAVAILABLE'; END IF;
  FOR voucher_item IN SELECT value FROM jsonb_array_elements(s.items) WHERE value->>'groupBuyVoucherId' IS NOT NULL ORDER BY value->>'groupBuyVoucherId' LOOP
    SELECT * INTO v FROM group_buy_vouchers WHERE id=(voucher_item->>'groupBuyVoucherId')::UUID AND shop_id=s.shop_id FOR UPDATE;
    IF NOT FOUND OR v.used_order_id IS NOT NULL OR NOT COALESCE(
      v.status='unused' OR (v.status='used' AND v.used_by_customer_id=s.customer_id),FALSE
    ) THEN RAISE EXCEPTION 'VOUCHER_UNAVAILABLE'; END IF;
    SELECT * INTO batch FROM group_buy_batches WHERE id=v.batch_id AND shop_id=s.shop_id FOR SHARE;
    IF NOT FOUND OR batch.is_active IS DISTINCT FROM TRUE OR batch.valid_from > NOW() OR batch.valid_to <= NOW()
       OR voucher_item->>'type' IS DISTINCT FROM 'service'
       OR voucher_item->>'quantity' IS DISTINCT FROM '1'
       OR NOT COALESCE((voucher_item->>'id')=ANY(batch.service_ids),FALSE) THEN
      RAISE EXCEPTION 'VOUCHER_UNAVAILABLE';
    END IF;
    UPDATE group_buy_vouchers SET used_order_id=s.id WHERE id=v.id;
  END LOOP;
  IF p_complete THEN
    RETURN QUERY SELECT * FROM finalize_settlement_atomic(s.id,s.shop_id,p_employee_id,p_employee_name,s.booking_id,s.customer_package_id,'结算核销');
  ELSE RETURN NEXT s;
  END IF;
END $$;
REVOKE ALL ON FUNCTION create_settlement_atomic(JSONB,TEXT,TEXT,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_settlement_atomic(JSONB,TEXT,TEXT,BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION create_settlement_atomic(JSONB,TEXT,TEXT,BOOLEAN) FROM anon,authenticated;
REVOKE ALL ON FUNCTION finalize_settlement_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM anon,authenticated;
COMMIT;
