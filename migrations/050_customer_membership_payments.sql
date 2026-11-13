-- 顾客本人微信会员订单。只有验签后的回调/查单可调用 finalizer；客户端不能直写。
CREATE TABLE IF NOT EXISTS public.membership_payment_orders (
  id text PRIMARY KEY,
  shop_id text NOT NULL REFERENCES public.shops(id),
  customer_id text NOT NULL REFERENCES public.customers(id),
  kind text NOT NULL CHECK (kind IN ('vip','stored')),
  level text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount>0),
  channel text NOT NULL CHECK (channel IN ('wechat_mini','wechat_h5')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','review','closed')),
  expected_level text NOT NULL,
  expected_expires_at timestamptz,
  payer_openid text,
  prepay_id text,
  h5_url text,
  transaction_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS membership_payment_active_customer ON public.membership_payment_orders(customer_id) WHERE status IN ('pending','review');
CREATE UNIQUE INDEX IF NOT EXISTS membership_payment_transaction ON public.membership_payment_orders(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS membership_payment_customer_history ON public.membership_payment_orders(customer_id,created_at DESC);
ALTER TABLE public.membership_payment_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_payment_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.membership_payment_orders TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_paid_membership_order(
  p_order_id text,p_shop_id text,p_transaction_id text,p_paid_at timestamptz,p_amount numeric
) RETURNS SETOF public.membership_payment_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o membership_payment_orders%ROWTYPE; c customers%ROWTYPE; updated customers%ROWTYPE;
  expected jsonb; patch jsonb; enrollment jsonb; benefits jsonb:='[]'::jsonb;
  gift jsonb:=NULL; svc jsonb; expiry timestamptz; wallet_balance numeric;
BEGIN
  IF p_transaction_id IS NULL OR p_transaction_id !~ '^[0-9]{1,64}$' OR p_paid_at IS NULL OR NOT isfinite(p_paid_at)
     OR p_paid_at>now()+interval '5 minutes' OR p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) THEN
    RAISE EXCEPTION 'INVALID_MEMBERSHIP_RECEIPT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mbs.wechat.transaction.'||p_transaction_id));
  SELECT * INTO o FROM membership_payment_orders WHERE id=p_order_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_ORDER_NOT_FOUND'; END IF;
  IF o.transaction_id IS NOT NULL THEN
    IF o.transaction_id<>p_transaction_id OR o.paid_at IS DISTINCT FROM p_paid_at OR o.amount<>p_amount THEN RAISE EXCEPTION 'MEMBERSHIP_RECEIPT_CONFLICT'; END IF;
    RETURN NEXT o; RETURN;
  END IF;
  IF o.status<>'pending' OR o.amount<>p_amount OR
     EXISTS(SELECT 1 FROM payments WHERE transaction_id=p_transaction_id) OR
     EXISTS(SELECT 1 FROM membership_payment_orders WHERE transaction_id=p_transaction_id AND id<>o.id) THEN
    RAISE EXCEPTION 'MEMBERSHIP_RECEIPT_MISMATCH';
  END IF;
  IF o.kind='vip' AND o.amount IS DISTINCT FROM (CASE o.level WHEN 'bronze' THEN 29 WHEN 'silver' THEN 59 WHEN 'gold' THEN 79 WHEN 'diamond' THEN 99 ELSE NULL END) THEN
    RAISE EXCEPTION 'MEMBERSHIP_PRICE_MISMATCH';
  END IF;
  IF o.kind='stored' AND o.amount IS DISTINCT FROM (CASE o.level WHEN 'store_500' THEN 500 WHEN 'store_1000' THEN 1000 WHEN 'store_2000' THEN 2000 WHEN 'store_5000' THEN 5000 ELSE NULL END) THEN
    RAISE EXCEPTION 'MEMBERSHIP_PRICE_MISMATCH';
  END IF;
  SELECT * INTO c FROM customers WHERE id=o.customer_id AND shop_id=o.shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_CUSTOMER_NOT_FOUND'; END IF;
  -- 同笔事务记录统一微信收款台账；review 也已收款，不能遗漏对账。
  INSERT INTO payments(id,shop_id,customer_id,channel,amount,status,transaction_id,prepay_id,paid_at,paid_at_source)
    VALUES('membership_'||o.id,o.shop_id,o.customer_id,o.channel,o.amount,'paid',p_transaction_id,o.prepay_id,p_paid_at,'wechat_success_time');
  IF (o.kind='vip' AND (c.purchase_vip_level IS DISTINCT FROM o.expected_level OR c.purchase_vip_expires_at IS DISTINCT FROM o.expected_expires_at)) OR
     (o.kind='stored' AND (c.stored_value_level IS DISTINCT FROM o.expected_level OR c.stored_value_expires_at IS DISTINCT FROM o.expected_expires_at)) THEN
    -- 钱已收到，但人工改档等并发改变原约定；保留收款凭证供门店核对，绝不静默覆盖。
    UPDATE membership_payment_orders SET status='review',transaction_id=p_transaction_id,paid_at=p_paid_at,updated_at=now() WHERE id=o.id RETURNING * INTO o;
    RETURN NEXT o; RETURN;
  END IF;
  IF o.kind='vip' THEN
    expiry:=greatest(coalesce(c.purchase_vip_expires_at,p_paid_at),p_paid_at)+interval '365 days';
    expected:=jsonb_build_object('purchase_vip_level',c.purchase_vip_level,'purchase_vip_expires_at',c.purchase_vip_expires_at);
    patch:=jsonb_build_object('purchase_vip_level',o.level,'purchase_vip_expires_at',expiry,'is_member',true,
      'membership_level',CASE WHEN c.is_stockholder THEN 'stockholder' ELSE 'premium' END);
    enrollment:=jsonb_build_object('id','enr_'||o.id,'level',o.level,'source','wechat_self','enrolled_at',p_paid_at,'expires_at',expiry,'note','顾客微信支付自助办理/续费');
    benefits:=jsonb_build_array(jsonb_build_object('id','benefit_'||o.id||'_shampoo','type','shampoo','name','洗发水','description','VIP 权益','granted_by','system_wechat','expires_at',now()+interval '90 days'));
    IF o.level IN ('silver','gold','diamond') THEN
      benefits:=benefits||jsonb_build_array(jsonb_build_object('id','benefit_'||o.id||'_conditioner','type','conditioner','name','护发素','description','VIP 权益','granted_by','system_wechat','expires_at',now()+interval '90 days'));
      benefits:=benefits||jsonb_build_array(jsonb_build_object('id','benefit_'||o.id||'_drink','type','drink','name','饮品','description','VIP 权益','granted_by','system_wechat','expires_at',now()+interval '365 days'));
    END IF;
    IF o.level IN ('gold','diamond') THEN
      benefits:=benefits||jsonb_build_array(jsonb_build_object('id','benefit_'||o.id||'_redo','type','redo','name','不满意重做','description','VIP 权益','granted_by','system_wechat','expires_at',now()+interval '7 days'));
    END IF;
    IF o.level='diamond' THEN
      benefits:=benefits||jsonb_build_array(jsonb_build_object('id','benefit_'||o.id||'_haircut','type','free_haircut','name','免费剪发一次','description','VIP 权益','granted_by','system_wechat','expires_at',now()+interval '365 days'));
      IF c.purchase_vip_level IS DISTINCT FROM 'diamond' THEN
        SELECT value INTO svc FROM jsonb_array_elements(coalesce((SELECT services FROM shops WHERE id=o.shop_id),'[]'::jsonb)) AS x(value)
          WHERE value->>'name'='设计师洗剪吹' OR ((value->>'name') LIKE '%剪%' AND value->>'price'='58')
          ORDER BY (value->>'name'='设计师洗剪吹') DESC LIMIT 1;
        IF svc IS NOT NULL AND svc->>'id' IS NOT NULL THEN
          gift:=jsonb_build_object('id','pkg_'||o.id,'name','钻石会员赠送·'||(svc->>'name')||'3次','service_id',svc->>'id','total_times',3,'expires_at',now()+interval '365 days');
        END IF;
      END IF;
    END IF;
    SELECT * INTO updated FROM apply_membership_atomic(c.id,o.shop_id,expected,patch,enrollment,NULL,benefits,gift);
  ELSE
    wallet_balance:=coalesce(c.stored_value_balance,0)+o.amount;
    expiry:=greatest(coalesce(c.stored_value_expires_at,p_paid_at),p_paid_at)+interval '730 days';
    expected:=jsonb_build_object('stored_value_level',c.stored_value_level,'stored_value_expires_at',c.stored_value_expires_at,'stored_value_balance',c.stored_value_balance);
    patch:=jsonb_build_object('stored_value_level',o.level,'stored_value_expires_at',expiry,'stored_value_balance',wallet_balance,'balance',wallet_balance,
      'has_recharged',true,'recharge_level',o.level,'is_member',true,
      'membership_level',CASE WHEN c.is_stockholder THEN 'stockholder' ELSE 'premium' END);
    SELECT * INTO updated FROM apply_membership_atomic(c.id,o.shop_id,expected,patch,NULL,NULL,'[]'::jsonb,NULL);
    INSERT INTO stored_value_transactions(id,customer_id,type,amount,balance_after,principal_portion,referral_portion,order_id,note,created_at,created_by)
      VALUES('svtx_'||o.id,c.id,'recharge',o.amount,wallet_balance,o.amount,0,o.id,'微信支付自助储值·'||o.level,p_paid_at,'system_wechat');
  END IF;
  IF updated.id IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_ACTIVATION_FAILED'; END IF;
  UPDATE membership_payment_orders SET status='paid',transaction_id=p_transaction_id,paid_at=p_paid_at,updated_at=now() WHERE id=o.id RETURNING * INTO o;
  RETURN NEXT o;
END $$;
REVOKE ALL ON FUNCTION public.finalize_paid_membership_order(text,text,text,timestamptz,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_membership_order(text,text,text,timestamptz,numeric) TO service_role;
