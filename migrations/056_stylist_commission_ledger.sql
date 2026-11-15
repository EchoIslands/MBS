-- 员工提成流水：按服务实际收款金额计提，比例由门店为员工配置；未配置比例时只记录待配置流水。
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6,5);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_rule_version TEXT;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_commission_rate_valid;
ALTER TABLE employees ADD CONSTRAINT employees_commission_rate_valid CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1));

CREATE TABLE IF NOT EXISTS stylist_commission_ledger (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  base_amount NUMERIC(12,2) NOT NULL CHECK (base_amount >= 0),
  commission_rate NUMERIC(6,5),
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','review','accrued','adjusted','reversed')),
  rule_version TEXT NOT NULL DEFAULT 'employee_rate_v1',
  adjustment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  adjustment_reason TEXT,
  adjusted_by TEXT,
  adjusted_at TIMESTAMPTZ,
  reversed_from_id TEXT REFERENCES stylist_commission_ledger(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (settlement_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_commission_shop_status ON stylist_commission_ledger(shop_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_employee ON stylist_commission_ledger(employee_id,created_at DESC);
ALTER TABLE stylist_commission_ledger ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_settlement_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; employee text; amount numeric; line_sum numeric; rate numeric; needs_review boolean; version TEXT;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.payment_status='completed' THEN RETURN NEW; END IF; END IF;
  SELECT COALESCE(sum((x->>'total')::numeric),0) INTO line_sum FROM jsonb_array_elements(NEW.items) x;
  -- Do not invent a discount allocation policy: ambiguous net service receipts require review.
  needs_review := line_sum IS DISTINCT FROM NEW.total;
  FOR item IN SELECT jsonb_build_object('employeeId',e.id,'total',sum((x->>'total')::numeric))
    FROM jsonb_array_elements(NEW.items) x
    LEFT JOIN employees e ON e.shop_id=NEW.shop_id AND e.id=COALESCE(NULLIF(x->>'employeeId',''),(SELECT stylist_id FROM bookings WHERE id=NEW.booking_id AND shop_id=NEW.shop_id))
    WHERE x->>'type'='service' GROUP BY e.id
  LOOP
    employee:=NULLIF(item->>'employeeId','');
    SELECT commission_rate,commission_rule_version INTO rate,version FROM employees WHERE id=employee AND shop_id=NEW.shop_id;
    IF NOT FOUND THEN employee:=NULL; rate:=NULL; END IF;
    amount:=GREATEST(0,ROUND((item->>'total')::numeric,2));
    INSERT INTO stylist_commission_ledger(id,shop_id,employee_id,settlement_id,booking_id,base_amount,commission_rate,commission_amount,status,rule_version)
    VALUES('commission_'||NEW.id||'_'||COALESCE(employee,'unassigned'),NEW.shop_id,employee,NEW.id,NEW.booking_id,amount,rate,
      CASE WHEN needs_review OR rate IS NULL THEN 0 ELSE ROUND(amount*rate,2) END,
      CASE WHEN needs_review THEN 'review' WHEN rate IS NULL THEN 'pending' ELSE 'accrued' END,COALESCE(version,'employee_rate_v1'))
    ON CONFLICT (id) DO UPDATE SET
      base_amount=stylist_commission_ledger.base_amount+EXCLUDED.base_amount,
      commission_amount=CASE WHEN needs_review OR rate IS NULL THEN 0 ELSE ROUND((stylist_commission_ledger.base_amount+EXCLUDED.base_amount)*rate,2) END;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_settlement_commission() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_settlement_commission() TO service_role;
DROP TRIGGER IF EXISTS settlement_commission_ledger ON public.settlements;
CREATE TRIGGER settlement_commission_ledger AFTER INSERT OR UPDATE OF payment_status ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.record_settlement_commission();

-- Independent append-only audit: configuration and manual decisions are never overwritten.
CREATE TABLE IF NOT EXISTS commission_audit (
 id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('rate','review','adjust','refund')),
 target_id TEXT NOT NULL, reason TEXT NOT NULL,
 before_value JSONB NOT NULL, after_value JSONB NOT NULL,
 request JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE commission_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stylist_commission_ledger,commission_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON stylist_commission_ledger,commission_audit TO service_role;

CREATE OR REPLACE FUNCTION commission_operation(p_shop TEXT,p_actor TEXT,p_request JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor employees%ROWTYPE; emp employees%ROWTYPE; line stylist_commission_ledger%ROWTYPE;
 s settlements%ROWTYPE; old JSONB; result JSONB; previous commission_audit%ROWTYPE;
 action TEXT:=p_request->>'action'; target TEXT:=p_request->>'target'; reason TEXT:=trim(p_request->>'reason');
 request_id TEXT:=p_request->>'requestId'; rate NUMERIC; amount NUMERIC; basis NUMERIC;
BEGIN
 SELECT * INTO actor FROM employees WHERE id=p_actor AND shop_id=p_shop AND is_active=true AND role IN ('ceo','shop_manager');
 IF NOT FOUND THEN RAISE EXCEPTION 'COMMISSION_FORBIDDEN'; END IF;
 IF request_id IS NULL OR request_id !~ '^[A-Za-z0-9_-]{16,100}$' OR reason IS NULL OR length(reason)<4 OR length(reason)>300 THEN RAISE EXCEPTION 'COMMISSION_INVALID'; END IF;
 -- Same shop lock for config changes, manual corrections and refund trigger.
 PERFORM 1 FROM shops WHERE id=p_shop FOR UPDATE;
 SELECT * INTO previous FROM commission_audit WHERE id=request_id;
 IF FOUND THEN
   IF previous.shop_id<>p_shop OR previous.actor_id<>p_actor OR previous.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'COMMISSION_REQUEST_CONFLICT'; END IF;
   RETURN previous.after_value;
 END IF;
 IF action='rate' THEN
   SELECT * INTO emp FROM employees WHERE id=target AND shop_id=p_shop FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'COMMISSION_EMPLOYEE_NOT_FOUND'; END IF;
   rate:=(p_request->>'rate')::numeric;
   IF rate IS NULL OR rate::text IN ('NaN','Infinity','-Infinity') OR rate<0 OR rate>1 OR rate<>round(rate,5) THEN RAISE EXCEPTION 'COMMISSION_INVALID_RATE'; END IF;
   IF to_jsonb(emp.commission_rate) IS DISTINCT FROM p_request->'expectedRate' AND NOT(emp.commission_rate IS NULL AND p_request->'expectedRate'='null'::jsonb) THEN RAISE EXCEPTION 'COMMISSION_STALE'; END IF;
   old:=jsonb_build_object('id',emp.id,'commission_rate',emp.commission_rate,'rule_version',emp.commission_rule_version);
   UPDATE employees SET commission_rate=rate,commission_rule_version=request_id WHERE id=target;
   result:=jsonb_build_object('id',emp.id,'commission_rate',rate,'rule_version',request_id);
 ELSE
   SELECT settlement_id INTO target FROM stylist_commission_ledger WHERE id=p_request->>'target' AND shop_id=p_shop;
   SELECT * INTO s FROM settlements WHERE id=target AND shop_id=p_shop FOR UPDATE;
   SELECT * INTO line FROM stylist_commission_ledger WHERE id=p_request->>'target' AND shop_id=p_shop FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'COMMISSION_NOT_FOUND'; END IF;
   IF line.updated_at IS DISTINCT FROM (p_request->>'expectedUpdatedAt')::timestamptz THEN RAISE EXCEPTION 'COMMISSION_STALE'; END IF;
   IF EXISTS(SELECT 1 FROM refund_requests WHERE settlement_id=s.id AND shop_id=p_shop AND status='completed') OR line.status='reversed' THEN RAISE EXCEPTION 'COMMISSION_REFUNDED'; END IF;
   old:=to_jsonb(line);
   IF action='review' THEN
     IF line.status NOT IN ('pending','review') THEN RAISE EXCEPTION 'COMMISSION_ALREADY_REVIEWED'; END IF;
     basis:=(p_request->>'base')::numeric;rate:=(p_request->>'rate')::numeric;
     IF basis IS NULL OR basis::text IN ('NaN','Infinity','-Infinity') OR basis<0 OR basis<>round(basis,2) OR basis>line.base_amount OR rate IS NULL OR rate::text IN ('NaN','Infinity','-Infinity') OR rate<0 OR rate>1 OR rate<>round(rate,5) THEN RAISE EXCEPTION 'COMMISSION_INVALID'; END IF;
     SELECT * INTO emp FROM employees WHERE id=p_request->>'employeeId' AND shop_id=p_shop;
     IF NOT FOUND THEN RAISE EXCEPTION 'COMMISSION_EMPLOYEE_NOT_FOUND'; END IF;
     IF basis+COALESCE((SELECT sum(base_amount) FROM stylist_commission_ledger WHERE settlement_id=s.id AND id<>line.id AND status IN ('accrued','adjusted')),0)>s.total THEN RAISE EXCEPTION 'COMMISSION_BASE_EXCEEDS_RECEIPTS'; END IF;
     UPDATE stylist_commission_ledger SET employee_id=emp.id,base_amount=basis,commission_rate=rate,commission_amount=round(basis*rate,2),rule_version=request_id,status='accrued',updated_at=clock_timestamp() WHERE id=line.id RETURNING to_jsonb(stylist_commission_ledger.*) INTO result;
   ELSIF action='adjust' THEN
     IF line.status NOT IN ('accrued','adjusted') THEN RAISE EXCEPTION 'COMMISSION_REVIEW_REQUIRED'; END IF;
     amount:=(p_request->>'amount')::numeric;
     IF amount IS NULL OR amount::text IN ('NaN','Infinity','-Infinity') OR amount<0 OR amount<>round(amount,2) OR amount>line.base_amount THEN RAISE EXCEPTION 'COMMISSION_INVALID'; END IF;
     UPDATE stylist_commission_ledger SET adjustment_amount=amount-commission_amount,adjustment_reason=reason,adjusted_by=p_actor,adjusted_at=clock_timestamp(),status='adjusted',updated_at=clock_timestamp() WHERE id=line.id RETURNING to_jsonb(stylist_commission_ledger.*) INTO result;
   ELSE RAISE EXCEPTION 'COMMISSION_INVALID_ACTION'; END IF;
 END IF;
 INSERT INTO commission_audit VALUES(request_id,p_shop,p_actor,action,p_request->>'target',reason,old,result,p_request,clock_timestamp());
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION commission_operation(TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION commission_operation(TEXT,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION reverse_refunded_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line stylist_commission_ledger%ROWTYPE; original settlements%ROWTYPE; old JSONB;
BEGIN
 IF NEW.status IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF OLD.status='completed' THEN RETURN NEW; END IF; END IF;
 IF NEW.settlement_id IS NULL THEN RETURN NEW; END IF;
 -- Refund approval is insufficient: only a recorded full-refund receipt can reverse wages.
 SELECT * INTO original FROM settlements WHERE id=NEW.settlement_id AND shop_id=NEW.shop_id;
 IF NOT FOUND OR NEW.refund_receipt_ref IS NULL OR trim(NEW.refund_receipt_ref)='' OR NEW.refund_receipt_at IS NULL OR NEW.refund_receipt_recorded_by IS NULL OR NEW.amount IS DISTINCT FROM original.total OR NEW.refund_receipt_amount IS DISTINCT FROM original.total THEN RETURN NEW; END IF;
 PERFORM 1 FROM shops WHERE id=NEW.shop_id FOR UPDATE;
 FOR line IN SELECT * FROM stylist_commission_ledger WHERE settlement_id=original.id AND shop_id=NEW.shop_id AND status<>'reversed' ORDER BY id FOR UPDATE LOOP
   old:=to_jsonb(line);
   UPDATE stylist_commission_ledger SET status='reversed',updated_at=clock_timestamp() WHERE id=line.id;
   INSERT INTO commission_audit VALUES('commission_refund_'||NEW.id||'_'||line.id,NEW.shop_id,NEW.refund_receipt_recorded_by,'refund',line.id,'原结算全额退款冲正',old,
     jsonb_build_object('status','reversed','reversalAmount',-(line.commission_amount+line.adjustment_amount),'refundId',NEW.id,'receiptRef',NEW.refund_receipt_ref),jsonb_build_object('refundId',NEW.id),clock_timestamp()) ON CONFLICT(id) DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION reverse_refunded_commission() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION reverse_refunded_commission() TO service_role;
DROP TRIGGER IF EXISTS refund_commission_ledger ON refund_requests;
CREATE TRIGGER refund_commission_ledger AFTER INSERT OR UPDATE OF status ON refund_requests FOR EACH ROW EXECUTE FUNCTION reverse_refunded_commission();
NOTIFY pgrst,'reload schema';
