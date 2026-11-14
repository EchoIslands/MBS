ALTER TABLE public.membership_payment_orders DROP CONSTRAINT IF EXISTS membership_payment_orders_status_check;
ALTER TABLE public.membership_payment_orders ADD CONSTRAINT membership_payment_orders_status_check CHECK(status IN ('pending','paid','review','closed','refunded'));
CREATE TABLE IF NOT EXISTS public.membership_payment_resolutions(
 order_id text PRIMARY KEY REFERENCES public.membership_payment_orders(id),shop_id text NOT NULL,actor_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('apply','refund')),reason text NOT NULL,request jsonb NOT NULL,
 before_state jsonb NOT NULL,after_state jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 refund_ref text,refund_amount numeric,refund_at timestamptz,
 UNIQUE(shop_id,refund_ref)
);
ALTER TABLE public.membership_payment_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_payment_resolutions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.membership_payment_resolutions TO service_role;
CREATE OR REPLACE FUNCTION public.resolve_membership_payment_review(p_order_id text,p_shop_id text,p_actor_id text,p_request jsonb)
RETURNS SETOF public.membership_payment_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o membership_payment_orders%ROWTYPE; original membership_payment_orders%ROWTYPE; c customers%ROWTYPE;
 r membership_payment_resolutions%ROWTYPE; decision text:=p_request->>'decision'; current_snapshot jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM employees WHERE id=p_actor_id AND shop_id=p_shop_id AND is_active=true AND role IN ('ceo','shop_manager')) THEN RAISE EXCEPTION 'MEMBERSHIP_FORBIDDEN'; END IF;
 SELECT * INTO o FROM membership_payment_orders WHERE id=p_order_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_ORDER_NOT_FOUND'; END IF;
 SELECT * INTO r FROM membership_payment_resolutions WHERE order_id=o.id;
 IF FOUND THEN
  IF r.actor_id<>p_actor_id OR r.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'RESOLUTION_ALREADY_RECORDED'; END IF;
  RETURN NEXT o; RETURN;
 END IF;
 IF o.status<>'review' OR o.transaction_id IS NULL OR o.paid_at IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_REVIEW_REQUIRED'; END IF;
 IF decision IS NULL OR decision NOT IN ('apply','refund') OR length(trim(coalesce(p_request->>'reason','')))<4 THEN RAISE EXCEPTION 'RESOLUTION_REASON_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM payments WHERE id='membership_'||o.id AND shop_id=p_shop_id AND customer_id=o.customer_id AND transaction_id=o.transaction_id AND amount=o.amount AND status='paid' AND paid_at_source='wechat_success_time') THEN RAISE EXCEPTION 'MEMBERSHIP_RECEIPT_MISMATCH'; END IF;
 SELECT * INTO c FROM customers WHERE id=o.customer_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 current_snapshot:=jsonb_build_object('purchase_vip_level',c.purchase_vip_level,'purchase_vip_expires_at',c.purchase_vip_expires_at,'stored_value_level',c.stored_value_level,'stored_value_expires_at',c.stored_value_expires_at,'stored_value_balance',c.stored_value_balance);
 IF current_snapshot IS DISTINCT FROM p_request->'expected' THEN RAISE EXCEPTION 'MEMBERSHIP_CONFLICT'; END IF;
 original:=o;
 IF decision='refund' THEN
  IF length(trim(coalesce(p_request->>'refundRef','')))<6 OR (p_request->>'refundAmount')::numeric IS DISTINCT FROM o.amount OR
   (p_request->>'refundAt')::timestamptz IS NULL OR NOT isfinite((p_request->>'refundAt')::timestamptz) OR
   (p_request->>'refundAt')::timestamptz<o.paid_at OR (p_request->>'refundAt')::timestamptz>now()+interval '5 minutes' THEN RAISE EXCEPTION 'INVALID_REFUND_RECEIPT'; END IF;
  UPDATE membership_payment_orders SET status='refunded',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSE
  -- Upgrade differences cannot be reinterpreted as full annual fees after a conflicting tier change.
  IF o.operation_kind='upgrade' AND (c.purchase_vip_level IS DISTINCT FROM o.expected_level OR c.purchase_vip_expires_at IS DISTINCT FROM o.expected_expires_at) THEN RAISE EXCEPTION 'UPGRADE_REQUIRES_ORIGINAL_AGREEMENT_OR_REFUND'; END IF;
  IF o.kind='vip' AND (CASE c.purchase_vip_level WHEN 'diamond' THEN 99 WHEN 'gold' THEN 79 WHEN 'silver' THEN 59 WHEN 'bronze' THEN 29 ELSE 0 END) > (CASE o.level WHEN 'diamond' THEN 99 WHEN 'gold' THEN 79 WHEN 'silver' THEN 59 WHEN 'bronze' THEN 29 ELSE 0 END) THEN RAISE EXCEPTION 'RESOLUTION_CANNOT_DOWNGRADE'; END IF;
  UPDATE membership_payment_orders SET expected_level=CASE WHEN o.kind='vip' THEN c.purchase_vip_level ELSE c.stored_value_level END,
   expected_expires_at=CASE WHEN o.kind='vip' THEN c.purchase_vip_expires_at ELSE c.stored_value_expires_at END WHERE id=o.id;
  SELECT * INTO o FROM finalize_paid_membership_order(o.id,p_shop_id,o.transaction_id,o.paid_at,o.amount);
  IF o.status<>'paid' THEN RAISE EXCEPTION 'MEMBERSHIP_ACTIVATION_FAILED'; END IF;
 END IF;
 INSERT INTO membership_payment_resolutions(order_id,shop_id,actor_id,decision,reason,request,before_state,after_state,refund_ref,refund_amount,refund_at)
 VALUES(o.id,p_shop_id,p_actor_id,decision,p_request->>'reason',p_request,jsonb_build_object('order',to_jsonb(original),'customer',to_jsonb(c)),
 jsonb_build_object('order',to_jsonb(o),'customer',(SELECT to_jsonb(x) FROM customers x WHERE x.id=c.id)),
 CASE WHEN decision='refund' THEN p_request->>'refundRef' ELSE NULL END,
 CASE WHEN decision='refund' THEN (p_request->>'refundAmount')::numeric ELSE NULL END,
 CASE WHEN decision='refund' THEN (p_request->>'refundAt')::timestamptz ELSE NULL END);
 RETURN NEXT o;
END $$;
REVOKE ALL ON FUNCTION public.resolve_membership_payment_review(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_membership_payment_review(text,text,text,jsonb) TO service_role;
