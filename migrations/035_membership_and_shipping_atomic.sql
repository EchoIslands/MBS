-- 保留门店原有计价/赠送规则；只把已在服务端计算的变更合并为事务。
-- 不回填历史数据，不增加客户字段。部署前 runner 必须核对既有表结构。
CREATE OR REPLACE FUNCTION public.apply_membership_atomic(
  p_customer_id text,p_shop_id text,p_expected jsonb,p_patch jsonb,
  p_enrollment jsonb,p_transaction jsonb,p_benefits jsonb,p_package jsonb
) RETURNS SETOF public.customers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customers%ROWTYPE; n customers%ROWTYPE; b jsonb;
BEGIN
  SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_expected) x WHERE (to_jsonb(c)->x.key) IS DISTINCT FROM x.value) THEN
    RAISE EXCEPTION 'MEMBERSHIP_CONFLICT';
  END IF;
  n:=jsonb_populate_record(c,p_patch);
  IF n.stored_value_balance<0 OR n.balance<0 THEN RAISE EXCEPTION 'INVALID_MEMBERSHIP_BALANCE'; END IF;
  UPDATE customers SET purchase_vip_level=n.purchase_vip_level,purchase_vip_expires_at=n.purchase_vip_expires_at,
    stored_value_level=n.stored_value_level,stored_value_balance=n.stored_value_balance,balance=n.balance,
    has_recharged=n.has_recharged,recharge_level=n.recharge_level,stored_value_expires_at=n.stored_value_expires_at,
    is_member=n.is_member,membership_level=n.membership_level,updated_at=NOW() WHERE id=c.id;
  IF p_enrollment IS NOT NULL AND p_enrollment<>'null'::jsonb THEN
    INSERT INTO membership_enrollments(id,shop_id,customer_id,level,source,activity_type,package_id,enrolled_at,expires_at,status,note)
    VALUES(p_enrollment->>'id',p_shop_id,c.id,p_enrollment->>'level',COALESCE(p_enrollment->>'source','manual'),
      p_enrollment->>'activity_type',p_enrollment->>'package_id',(p_enrollment->>'enrolled_at')::timestamptz,
      (p_enrollment->>'expires_at')::timestamptz,'active',p_enrollment->>'note');
  END IF;
  IF p_transaction IS NOT NULL AND p_transaction<>'null'::jsonb THEN
    INSERT INTO stored_value_transactions(id,customer_id,type,amount,balance_after,referral_portion,note,created_at,created_by)
    VALUES(p_transaction->>'id',c.id,p_transaction->>'type',(p_transaction->>'amount')::numeric,n.stored_value_balance,
      0,p_transaction->>'note',NOW(),p_transaction->>'created_by');
  END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(COALESCE(p_benefits,'[]'::jsonb)) LOOP
    INSERT INTO member_benefit_records(id,shop_id,customer_id,type,name,description,status,granted_at,granted_by,expires_at)
    VALUES(b->>'id',p_shop_id,c.id,b->>'type',b->>'name',b->>'description','available',NOW(),b->>'granted_by',(b->>'expires_at')::timestamptz);
  END LOOP;
  IF p_package IS NOT NULL AND p_package<>'null'::jsonb THEN
    INSERT INTO customer_packages(id,shop_id,customer_id,name,service_id,total_times,used_times,price,expires_at,allow_holiday_use,status,source,activity_type)
    VALUES(p_package->>'id',p_shop_id,c.id,p_package->>'name',p_package->>'service_id',(p_package->>'total_times')::integer,0,0,
      (p_package->>'expires_at')::timestamptz,true,'active','vip_benefit',NULL);
  END IF;
  RETURN QUERY SELECT * FROM customers WHERE id=c.id;
END $$;
REVOKE ALL ON FUNCTION public.apply_membership_atomic(text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_membership_atomic(text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.ship_product_order_atomic(p_order_id text,p_shop_id text,p_company text,p_no text)
RETURNS SETOF public.product_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o product_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM product_orders WHERE id=p_order_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.status='shipped' AND o.shipping_company=p_company AND o.shipping_no=p_no THEN RETURN NEXT o; RETURN; END IF;
  IF o.status NOT IN ('paid','preparing','ready') OR o.payment_status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'ORDER_NOT_SHIPPABLE'; END IF;
  IF NULLIF(trim(p_company),'') IS NULL OR NULLIF(trim(p_no),'') IS NULL THEN RAISE EXCEPTION 'INVALID_SHIPPING'; END IF;
  UPDATE product_orders SET status='shipped',shipping_company=p_company,shipping_no=p_no,shipped_at=NOW(),updated_at=NOW()
    WHERE id=o.id RETURNING * INTO o;
  INSERT INTO shipment_tracking(order_id,shipping_company,shipping_no,event_time,event_description,location)
    VALUES(o.id,p_company,p_no,NOW(),'订单已发货','');
  RETURN NEXT o;
END $$;
REVOKE ALL ON FUNCTION public.ship_product_order_atomic(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ship_product_order_atomic(text,text,text,text) TO service_role;
