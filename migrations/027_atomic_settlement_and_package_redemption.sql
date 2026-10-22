-- Atomic and idempotent settlement completion. Execute after migrations 019/020.
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS customer_package_id TEXT,
  ADD COLUMN IF NOT EXISTS server_priced BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS reserved_times INTEGER NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE customer_packages ADD CONSTRAINT customer_packages_valid_counters
    CHECK (used_times>=0 AND reserved_times>=0 AND total_times>=used_times+reserved_times) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE member_benefit_records ADD COLUMN IF NOT EXISTS reserved_settlement_id TEXT;
CREATE TABLE IF NOT EXISTS settlement_package_reservations (
  settlement_id TEXT PRIMARY KEY REFERENCES settlements(id),
  package_id TEXT NOT NULL REFERENCES customer_packages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE settlement_package_reservations ENABLE ROW LEVEL SECURITY;

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
  SELECT * INTO s FROM settlements WHERE id=p_settlement_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETTLEMENT_NOT_FOUND'; END IF;
  IF s.payment_status='completed' THEN RETURN NEXT s; RETURN; END IF;
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
      VALUES (p_package_id, COALESCE(p_booking_id,s.booking_id), s.customer_id, p_shop_id, NOW(), p_employee_id, COALESCE(p_package_note,''));
    DELETE FROM settlement_package_reservations WHERE settlement_id=s.id;
  END IF;

  SELECT COALESCE(array_agg(item->>'id') FILTER (WHERE item->>'type'='service'), '{}'),
         COALESCE(array_agg(item->>'name') FILTER (WHERE item->>'type'='service'), '{}')
    INTO svc_ids, svc_names FROM jsonb_array_elements(s.items) item;
  INSERT INTO customer_visit_records(id, customer_id, shop_id, booking_id, stylist_id, stylist_name, service_ids, service_names, total_amount, payment_method, check_in_time, created_at)
    VALUES ('visit_'||s.id, s.customer_id, p_shop_id, COALESCE(p_booking_id,s.booking_id), NULL, p_employee_name, svc_ids, svc_names, s.total, s.payment_method, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

  UPDATE settlements SET payment_status='completed' WHERE id=s.id RETURNING * INTO s;
  UPDATE payments SET status='paid', paid_at=COALESCE(paid_at,NOW()) WHERE settlement_id=s.id;
  RETURN NEXT s;
END $$;

REVOKE ALL ON FUNCTION finalize_settlement_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_settlement_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION consume_customer_package_atomic(
  p_package_id TEXT, p_shop_id TEXT, p_employee_id TEXT, p_booking_id TEXT DEFAULT NULL, p_note TEXT DEFAULT ''
) RETURNS SETOF customer_packages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p customer_packages%ROWTYPE;
BEGIN
  SELECT * INTO p FROM customer_packages WHERE id=p_package_id AND shop_id=p_shop_id FOR UPDATE;
  IF FOUND AND p_booking_id IS NOT NULL AND EXISTS(SELECT 1 FROM package_usage_logs WHERE package_id=p_package_id AND booking_id=p_booking_id AND shop_id=p_shop_id) THEN RETURN NEXT p; RETURN; END IF;
  IF NOT FOUND OR p.status <> 'active' OR p.expires_at <= NOW() OR p.used_times+p.reserved_times >= p.total_times THEN
    RAISE EXCEPTION 'PACKAGE_UNAVAILABLE';
  END IF;
  UPDATE customer_packages SET used_times=used_times+1, status=CASE WHEN used_times+1>=total_times THEN 'used_up' ELSE 'active' END, updated_at=NOW()
    WHERE id=p_package_id RETURNING * INTO p;
  INSERT INTO package_usage_logs(package_id, booking_id, customer_id, shop_id, used_at, used_by, note)
    VALUES (p_package_id,p_booking_id,p.customer_id,p_shop_id,NOW(),p_employee_id,COALESCE(p_note,''));
  RETURN NEXT p;
END $$;
REVOKE ALL ON FUNCTION consume_customer_package_atomic(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_customer_package_atomic(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION create_settlement_atomic(p_settlement JSONB, p_employee_id TEXT, p_employee_name TEXT, p_complete BOOLEAN)
RETURNS SETOF settlements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s settlements%ROWTYPE; p customer_packages%ROWTYPE; c customers%ROWTYPE; b member_benefit_records%ROWTYPE; voucher_item JSONB; v group_buy_vouchers%ROWTYPE;
BEGIN
  s.id := p_settlement->>'id'; s.shop_id := p_settlement->>'shop_id'; s.customer_id := p_settlement->>'customer_id';
  -- Serialize same-customer creation with completion and balance operations.
  SELECT * INTO c FROM customers WHERE id=s.customer_id AND shop_id=s.shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM settlements WHERE id=s.id) THEN RAISE EXCEPTION 'DUPLICATE_SETTLEMENT_ID'; END IF;
  s.total := (p_settlement->>'total')::NUMERIC;
  IF s.total IS NULL OR s.total<0 OR s.total<>ROUND(s.total,2) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  INSERT INTO settlements(id,shop_id,customer_id,customer_name,booking_id,items,subtotal,discount_detail,discount,tax,total,payment_method,payment_status,used_benefit_ids,processed_by,customer_package_id)
    VALUES(s.id,s.shop_id,s.customer_id,c.name,p_settlement->>'booking_id',p_settlement->'items',
      (p_settlement->>'subtotal')::NUMERIC,COALESCE(p_settlement->'discount_detail','{}'),(p_settlement->>'discount')::NUMERIC,0,s.total,
      p_settlement->>'payment_method','pending',ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_settlement->'used_benefit_ids','[]'))),p_employee_name,p_settlement->>'customer_package_id')
    RETURNING * INTO s;
  UPDATE settlements SET server_priced=TRUE WHERE id=s.id RETURNING * INTO s;
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
    IF NOT FOUND OR v.status<>'used' OR v.used_by_customer_id IS DISTINCT FROM s.customer_id OR v.used_order_id IS NOT NULL THEN RAISE EXCEPTION 'VOUCHER_UNAVAILABLE'; END IF;
    UPDATE group_buy_vouchers SET used_order_id=s.id WHERE id=v.id;
  END LOOP;
  IF p_complete THEN
    RETURN QUERY SELECT * FROM finalize_settlement_atomic(s.id,s.shop_id,p_employee_id,p_employee_name,s.booking_id,s.customer_package_id,'结算核销');
  ELSE RETURN NEXT s;
  END IF;
END $$;
REVOKE ALL ON FUNCTION create_settlement_atomic(JSONB,TEXT,TEXT,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_settlement_atomic(JSONB,TEXT,TEXT,BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION delete_settlement_draft_atomic(p_settlement_id TEXT,p_shop_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s settlements%ROWTYPE;
BEGIN
  SELECT * INTO s FROM settlements WHERE id=p_settlement_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR s.payment_status NOT IN ('pending','failed') THEN RAISE EXCEPTION 'NOT_A_DELETABLE_DRAFT'; END IF;
  -- 已生成网关订单不能直接删除；需先对账/关闭网关订单，避免迟到回调丢单。
  IF EXISTS(SELECT 1 FROM payments WHERE settlement_id=s.id) THEN RAISE EXCEPTION 'PAYMENT_ORDER_EXISTS'; END IF;
  UPDATE customer_packages SET reserved_times=reserved_times-1 WHERE id IN (SELECT package_id FROM settlement_package_reservations WHERE settlement_id=s.id);
  DELETE FROM settlement_package_reservations WHERE settlement_id=s.id;
  UPDATE member_benefit_records SET reserved_settlement_id=NULL WHERE reserved_settlement_id=s.id;
  UPDATE group_buy_vouchers SET used_order_id=NULL WHERE used_order_id=s.id;
  DELETE FROM settlements WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION delete_settlement_draft_atomic(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_settlement_draft_atomic(TEXT,TEXT) TO service_role;
