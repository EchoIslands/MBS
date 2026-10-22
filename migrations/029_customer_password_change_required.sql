-- 仅结构，不初始化任何客户密码；须先完成 025–028。
BEGIN;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_weak_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS password_reset_at timestamptz;
COMMENT ON COLUMN public.customers.is_weak_password IS '受限初始密码：必须本人修改后才能访问业务接口；与身份核实独立';
CREATE TABLE IF NOT EXISTS public.customer_password_initialization_runs (
  run_key text PRIMARY KEY,
  executed_at timestamptz NOT NULL DEFAULT now(),
  affected_count bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.customer_password_initialization_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_password_initialization_runs FROM PUBLIC, anon, authenticated;

-- 余额付款在同一个行锁事务内复核改密标记，避免员工先核实或并发重置绕过。
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


COMMIT;
