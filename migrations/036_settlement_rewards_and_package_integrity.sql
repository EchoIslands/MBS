-- 保留既有奖励率、到账字段、活动赠送规则；不补发历史奖励。
-- 新完成的结算在原事务内记奖励，取代响应后异步写余额。
CREATE OR REPLACE FUNCTION public.grant_settlement_rewards() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customers%ROWTYPE; r customers%ROWTYPE; ref referral_records%ROWTYPE;
  cfg jsonb; rate numeric; reward numeric; ref_id text;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'completed' OR NEW.total<=0 THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.payment_status='completed' THEN RETURN NEW; END IF; END IF;
  SELECT * INTO c FROM customers WHERE id=NEW.customer_id AND shop_id=NEW.shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  SELECT stockholder_config INTO cfg FROM shops WHERE id=NEW.shop_id;
  IF c.is_stockholder AND (cfg IS NULL OR cfg='null'::jsonb OR cfg->>'enabled'='true') THEN
    rate:=CASE WHEN jsonb_typeof(cfg->'cashbackRate')='number' THEN (cfg->>'cashbackRate')::numeric ELSE 0.05 END;
    reward:=round(NEW.total*rate,2);
    IF reward>0 AND NOT EXISTS(SELECT 1 FROM stockholder_benefit_records WHERE id='settlement_cashback_'||NEW.id
      OR (NEW.booking_id IS NOT NULL AND source_booking_id=NEW.booking_id AND type='cashback')) THEN
      INSERT INTO stockholder_benefit_records(id,shop_id,customer_id,type,amount,source_booking_id,status)
        VALUES('settlement_cashback_'||NEW.id,NEW.shop_id,c.id,'cashback',reward,NEW.booking_id,'granted');
      UPDATE customers SET withdrawable_referral_amount=COALESCE(withdrawable_referral_amount,0)+reward WHERE id=c.id;
    END IF;
  END IF;
  -- 同一被推荐人的记录在客户行锁下只转化一次；失败一起回滚。
  IF EXISTS(SELECT 1 FROM referral_records WHERE shop_id=NEW.shop_id AND referred_id=c.id AND status='confirmed') THEN RETURN NEW; END IF;
  SELECT * INTO ref FROM referral_records WHERE shop_id=NEW.shop_id AND referred_id=c.id AND status IN ('pending','couponed') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN ref_id:=ref.referrer_id;
  ELSIF c.is_referred AND NULLIF(c.referrer_phone,'') IS NOT NULL THEN
    SELECT id INTO ref_id FROM customers WHERE shop_id=NEW.shop_id AND phone=c.referrer_phone ORDER BY id LIMIT 1;
  END IF;
  IF ref_id IS NULL OR ref_id=c.id THEN RETURN NEW; END IF;
  SELECT * INTO r FROM customers WHERE id=ref_id AND shop_id=NEW.shop_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF ref.id IS NULL THEN
    INSERT INTO referral_records(id,shop_id,referrer_id,referrer_name,referred_id,referred_name,referred_phone,status)
      VALUES('settlement_referral_'||NEW.id,NEW.shop_id,r.id,r.name,c.id,c.name,c.phone,'pending') RETURNING * INTO ref;
  END IF;
  rate:=CASE WHEN r.referral_bonus_rate>0 THEN r.referral_bonus_rate ELSE 0.10 END;
  reward:=round(NEW.total*rate,2);
  UPDATE customers SET withdrawable_referral_amount=COALESCE(withdrawable_referral_amount,0)+reward,
    referral_earnings=COALESCE(referral_earnings,0)+reward,is_stockholder=true,
    stockholder_since=CASE WHEN is_stockholder THEN stockholder_since ELSE NOW() END,membership_level='stockholder' WHERE id=r.id;
  UPDATE referral_records SET status='confirmed',confirmed_at=NOW(),bonus_amount=reward,first_spent_amount=NEW.total,source_booking_id=NEW.booking_id WHERE id=ref.id;
  INSERT INTO stockholder_benefit_records(id,shop_id,customer_id,type,amount,source_booking_id,status)
    VALUES('settlement_referral_bonus_'||NEW.id,NEW.shop_id,r.id,'referral_bonus',reward,NEW.booking_id,'granted');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.grant_settlement_rewards() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grant_settlement_rewards() TO service_role;
DROP TRIGGER IF EXISTS settlement_rewards_atomic ON public.settlements;
CREATE TRIGGER settlement_rewards_atomic AFTER INSERT OR UPDATE OF payment_status ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.grant_settlement_rewards();

CREATE OR REPLACE FUNCTION public.create_customer_package_atomic(p_package jsonb,p_shop_id text)
RETURNS SETOF public.customer_packages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customers%ROWTYPE; pkg customer_packages%ROWTYPE; svc jsonb; gift jsonb; expiry timestamptz;
BEGIN
  SELECT * INTO c FROM customers WHERE id=p_package->>'customer_id' AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF NOT EXISTS(SELECT 1 FROM shops s,jsonb_array_elements(COALESCE(s.services,'[]'::jsonb)) x WHERE s.id=p_shop_id AND x->>'id'=p_package->>'service_id') THEN RAISE EXCEPTION 'PACKAGE_SERVICE_NOT_FOUND'; END IF;
  IF (p_package->>'total_times')::integer<=0 OR (p_package->>'price')::numeric<0 OR (p_package->>'expires_at')::timestamptz<=NOW() THEN RAISE EXCEPTION 'INVALID_PACKAGE'; END IF;
  INSERT INTO customer_packages(id,shop_id,customer_id,name,service_id,total_times,used_times,price,expires_at,allow_holiday_use,status,source,activity_type)
    VALUES(COALESCE(p_package->>'id',gen_random_uuid()::text),p_shop_id,c.id,p_package->>'name',p_package->>'service_id',(p_package->>'total_times')::integer,0,
      (p_package->>'price')::numeric,(p_package->>'expires_at')::timestamptz,COALESCE((p_package->>'allow_holiday_use')::boolean,true),'active','shop',p_package->>'activity_type') RETURNING * INTO pkg;
  IF pkg.activity_type='99_3times' THEN
    expiry:=GREATEST(COALESCE(c.purchase_vip_expires_at,NOW()),NOW())+INTERVAL '365 days';
    IF c.purchase_vip_level IS DISTINCT FROM 'diamond' THEN
      SELECT x INTO svc FROM shops s,jsonb_array_elements(COALESCE(s.services,'[]'::jsonb)) x
        WHERE s.id=p_shop_id AND (x->>'name'='设计师洗剪吹' OR (x->>'name' LIKE '%剪%' AND (x->>'price')::numeric=58))
        ORDER BY (x->>'name'='设计师洗剪吹') DESC LIMIT 1;
      IF svc IS NOT NULL THEN gift:=jsonb_build_object('id','pkg_'||gen_random_uuid()::text,'name','钻石会员赠送·'||(svc->>'name')||'3次','service_id',svc->>'id','total_times',3,'expires_at',NOW()+INTERVAL '365 days'); END IF;
    END IF;
    PERFORM apply_membership_atomic(c.id,p_shop_id,'{}'::jsonb,
      jsonb_build_object('purchase_vip_level','diamond','purchase_vip_expires_at',expiry,'is_member',true,'membership_level',CASE WHEN c.is_stockholder THEN 'stockholder' ELSE 'premium' END),
      jsonb_build_object('id','enr_'||gen_random_uuid()::text,'level','diamond','source','package','activity_type',pkg.activity_type,'package_id',pkg.id,'enrolled_at',NOW(),'expires_at',expiry,'note','购买活动「'||pkg.name||'」自动入会'),NULL,'[]'::jsonb,gift);
  END IF;
  RETURN NEXT pkg;
END $$;
REVOKE ALL ON FUNCTION public.create_customer_package_atomic(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_package_atomic(jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_used_group_buy_voucher_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.status='used' OR OLD.used_order_id IS NOT NULL THEN RAISE EXCEPTION 'VOUCHER_HISTORY_REQUIRED'; END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.guard_used_group_buy_voucher_delete() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_used_group_buy_voucher_delete() TO service_role;
DROP TRIGGER IF EXISTS guard_used_voucher_delete ON public.group_buy_vouchers;
CREATE TRIGGER guard_used_voucher_delete BEFORE DELETE ON public.group_buy_vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_used_group_buy_voucher_delete();

CREATE OR REPLACE FUNCTION public.revoke_membership_atomic(p_customer_id text,p_shop_id text,p_enrollment_id text,p_employee_id text,p_employee_name text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customers%ROWTYPE; e membership_enrollments%ROWTYPE; has_stored boolean;
BEGIN
  SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  SELECT * INTO e FROM membership_enrollments WHERE customer_id=c.id AND shop_id=p_shop_id AND status='active'
    AND (p_enrollment_id IS NULL OR id=p_enrollment_id) ORDER BY enrolled_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND'; END IF;
  UPDATE membership_enrollments SET status='revoked',revoked_at=NOW(),revoked_by=p_employee_id,revoked_by_name=p_employee_name,
    note=COALESCE(NULLIF(p_note,''),note),updated_at=NOW() WHERE id=e.id RETURNING * INTO e;
  has_stored:=COALESCE(c.stored_value_level<>'none',false);
  UPDATE customers SET purchase_vip_level='regular',purchase_vip_expires_at=NULL,is_member=has_stored,
    membership_level=CASE WHEN is_stockholder THEN 'stockholder' WHEN has_stored THEN 'premium' ELSE 'regular' END,updated_at=NOW()
    WHERE id=c.id RETURNING * INTO c;
  RETURN jsonb_build_object('customer',to_jsonb(c),'enrollment',to_jsonb(e));
END $$;
REVOKE ALL ON FUNCTION public.revoke_membership_atomic(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_membership_atomic(text,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.request_service_refund_atomic(p_customer_id text,p_shop_id text,p_booking_id text,p_reason text)
RETURNS SETOF public.refund_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid numeric; previous refund_requests%ROWTYPE;
BEGIN
  PERFORM 1 FROM bookings WHERE id=p_booking_id AND customer_id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT * INTO previous FROM refund_requests WHERE booking_id=p_booking_id AND shop_id=p_shop_id AND status IN ('pending','approved','completed') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN NEXT previous; RETURN; END IF;
  SELECT SUM(total) INTO paid FROM settlements WHERE booking_id=p_booking_id AND customer_id=p_customer_id AND shop_id=p_shop_id AND payment_status='completed';
  IF COALESCE(paid,0)<=0 THEN RAISE EXCEPTION 'ORDER_NOT_REFUNDABLE'; END IF;
  IF NULLIF(trim(p_reason),'') IS NULL OR length(p_reason)>2000 THEN RAISE EXCEPTION 'INVALID_REFUND_REASON'; END IF;
  INSERT INTO refund_requests(id,shop_id,booking_id,customer_id,customer_name,amount,reason,status)
    SELECT 'refund_'||gen_random_uuid()::text,p_shop_id,p_booking_id,c.id,c.name,paid,p_reason,'pending' FROM customers c WHERE c.id=p_customer_id AND c.shop_id=p_shop_id RETURNING * INTO previous;
  RETURN NEXT previous;
END $$;
REVOKE ALL ON FUNCTION public.request_service_refund_atomic(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_service_refund_atomic(text,text,text,text) TO service_role;

-- 导券和批次数量保持原有“现值+导入数”的语义，改为锁定批次后一起提交。
CREATE OR REPLACE FUNCTION public.import_group_buy_vouchers_atomic(p_batch_id uuid,p_shop_id text,p_vouchers jsonb)
RETURNS SETOF public.group_buy_vouchers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b group_buy_batches%ROWTYPE; item jsonb;
BEGIN
  SELECT * INTO b FROM group_buy_batches WHERE id=p_batch_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND'; END IF;
  IF jsonb_typeof(p_vouchers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_vouchers)=0 THEN RAISE EXCEPTION 'INVALID_VOUCHER_CODES'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_vouchers) LOOP
    IF NULLIF(trim(item->>'code'),'') IS NULL OR length(item->>'code')>500 THEN RAISE EXCEPTION 'INVALID_VOUCHER_CODES'; END IF;
    INSERT INTO group_buy_vouchers(id,batch_id,shop_id,code,status,platform)
      VALUES((item->>'id')::uuid,b.id,p_shop_id,trim(item->>'code'),'unused',b.platform);
  END LOOP;
  UPDATE group_buy_batches SET total_quantity=COALESCE(total_quantity,0)+jsonb_array_length(p_vouchers),updated_at=NOW() WHERE id=b.id;
  RETURN QUERY SELECT * FROM group_buy_vouchers WHERE batch_id=b.id AND id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(p_vouchers));
END $$;
REVOKE ALL ON FUNCTION public.import_group_buy_vouchers_atomic(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_group_buy_vouchers_atomic(uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.update_group_buy_usage_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE group_buy_batches SET used_quantity=GREATEST(0,COALESCE(used_quantity,0)+CASE WHEN NEW.status='used' THEN 1 ELSE -1 END),updated_at=NOW() WHERE id=NEW.batch_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.update_group_buy_usage_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_group_buy_usage_count() TO service_role;
DROP TRIGGER IF EXISTS group_buy_usage_count_atomic ON public.group_buy_vouchers;
CREATE TRIGGER group_buy_usage_count_atomic AFTER UPDATE OF status ON public.group_buy_vouchers FOR EACH ROW EXECUTE FUNCTION public.update_group_buy_usage_count();
