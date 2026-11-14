-- Explicit staff operations, durable idempotency and an immutable audit snapshot.
CREATE TABLE IF NOT EXISTS public.membership_operation_audit (
  shop_id text NOT NULL, operation_id text NOT NULL, customer_id text NOT NULL,
  actor_id text NOT NULL, request_digest text NOT NULL, operation jsonb NOT NULL,
  before_state jsonb NOT NULL, after_state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(shop_id, operation_id)
);
ALTER TABLE public.membership_operation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_operation_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.membership_operation_audit TO service_role;
CREATE OR REPLACE FUNCTION public.apply_membership_operation(
 p_operation_id text,p_actor_id text,p_operation jsonb,
 p_customer_id text,p_shop_id text,p_expected jsonb,p_patch jsonb,
 p_enrollment jsonb,p_transaction jsonb,p_benefits jsonb,p_package jsonb
) RETURNS SETOF public.customers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customers%ROWTYPE; result customers%ROWTYPE; prior membership_operation_audit%ROWTYPE; digest text;
BEGIN
 IF p_operation_id IS NULL OR length(p_operation_id)<16 OR length(p_operation_id)>100 THEN RAISE EXCEPTION 'INVALID_OPERATION_ID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM employees WHERE id=p_actor_id AND shop_id=p_shop_id AND is_active=true AND role IN ('ceo','shop_manager','customer_service')) THEN RAISE EXCEPTION 'MEMBERSHIP_FORBIDDEN'; END IF;
 digest:=md5(jsonb_build_object('customer',p_customer_id,'actor',p_actor_id,'operation',p_operation,'expected',p_expected)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_id||':'||p_operation_id, 511));
 SELECT * INTO prior FROM membership_operation_audit WHERE shop_id=p_shop_id AND operation_id=p_operation_id;
 IF FOUND THEN
   IF prior.request_digest<>digest THEN RAISE EXCEPTION 'OPERATION_ID_REUSED'; END IF;
   RETURN NEXT jsonb_populate_record(NULL::customers, prior.after_state); RETURN;
 END IF;
 SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM membership_payment_orders WHERE customer_id=c.id AND shop_id=p_shop_id AND status IN ('pending','review')) THEN RAISE EXCEPTION 'MEMBERSHIP_PAYMENT_PENDING'; END IF;
 SELECT * INTO result FROM apply_membership_atomic(p_customer_id,p_shop_id,p_expected,p_patch,p_enrollment,p_transaction,p_benefits,p_package);
 IF p_operation->>'membershipAction'='cancel' THEN
   UPDATE membership_enrollments SET status='revoked',revoked_at=now(),revoked_by=p_actor_id,
     note=concat_ws('；',note,'取消VIP；不自动退款、不扣储值'),updated_at=now()
     WHERE customer_id=c.id AND shop_id=p_shop_id AND status='active' AND level IN ('bronze','silver','gold','diamond');
 END IF;
 INSERT INTO membership_operation_audit(shop_id,operation_id,customer_id,actor_id,request_digest,operation,before_state,after_state)
 VALUES(p_shop_id,p_operation_id,c.id,p_actor_id,digest,p_operation,to_jsonb(c),to_jsonb(result));
 RETURN NEXT result;
END $$;
REVOKE ALL ON FUNCTION public.apply_membership_operation(text,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_membership_operation(text,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;

-- Keep the older enrollment-revocation endpoint inside the same payment/audit safeguards.
CREATE OR REPLACE FUNCTION public.revoke_membership_atomic(p_customer_id text,p_shop_id text,p_enrollment_id text,p_employee_id text,p_employee_name text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customers%ROWTYPE; e membership_enrollments%ROWTYPE; has_stored boolean; before_state jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM employees WHERE id=p_employee_id AND shop_id=p_shop_id AND is_active=true AND role IN ('ceo','shop_manager','customer_service')) THEN RAISE EXCEPTION 'MEMBERSHIP_FORBIDDEN'; END IF;
  SELECT * INTO c FROM customers WHERE id=p_customer_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM membership_payment_orders WHERE customer_id=c.id AND shop_id=p_shop_id AND status IN ('pending','review')) THEN RAISE EXCEPTION 'MEMBERSHIP_PAYMENT_PENDING'; END IF;
  before_state:=to_jsonb(c);
  SELECT * INTO e FROM membership_enrollments WHERE customer_id=c.id AND shop_id=p_shop_id AND status='active'
    AND (p_enrollment_id IS NULL OR id=p_enrollment_id) ORDER BY enrolled_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND'; END IF;
  IF e.level IS DISTINCT FROM c.purchase_vip_level THEN RAISE EXCEPTION 'MEMBERSHIP_CHANGED'; END IF;
  UPDATE membership_enrollments SET status='revoked',revoked_at=NOW(),revoked_by=p_employee_id,revoked_by_name=p_employee_name,
    note=COALESCE(NULLIF(p_note,''),note),updated_at=NOW() WHERE id=e.id RETURNING * INTO e;
  has_stored:=COALESCE(c.stored_value_level<>'none',false);
  UPDATE customers SET purchase_vip_level='regular',purchase_vip_expires_at=NULL,is_member=has_stored,
    membership_level=CASE WHEN is_stockholder THEN 'stockholder' WHEN has_stored THEN 'premium' ELSE 'regular' END,updated_at=NOW()
    WHERE id=c.id RETURNING * INTO c;
  INSERT INTO membership_operation_audit(shop_id,operation_id,customer_id,actor_id,request_digest,operation,before_state,after_state)
  VALUES(p_shop_id,'revoke_'||e.id,c.id,p_employee_id,md5(e.id),jsonb_build_object('membershipAction','cancel','enrollmentId',e.id,'note',p_note),before_state,to_jsonb(c));
  RETURN jsonb_build_object('customer',to_jsonb(c),'enrollment',to_jsonb(e));
END $$;
REVOKE ALL ON FUNCTION public.revoke_membership_atomic(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_membership_atomic(text,text,text,text,text,text) TO service_role;
