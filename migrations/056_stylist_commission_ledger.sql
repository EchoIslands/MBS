-- 员工提成流水：按服务实际收款金额计提，比例由门店为员工配置；未配置比例时只记录待配置流水。
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6,5);
ALTER TABLE employees ADD CONSTRAINT employees_commission_rate_valid CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1));

CREATE TABLE IF NOT EXISTS stylist_commission_ledger (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  base_amount NUMERIC(12,2) NOT NULL CHECK (base_amount >= 0),
  commission_rate NUMERIC(6,5),
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accrued','adjusted','reversed')),
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
DECLARE b bookings%ROWTYPE; e employees%ROWTYPE; base numeric; rate numeric;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'completed' OR NEW.total <= 0 THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.payment_status='completed' THEN RETURN NEW; END IF;
  IF NEW.booking_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO b FROM bookings WHERE id=NEW.booking_id AND shop_id=NEW.shop_id;
  IF NOT FOUND OR b.stylist_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO e FROM employees WHERE id=b.stylist_id AND shop_id=NEW.shop_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  base:=ROUND(NEW.total,2); rate:=e.commission_rate;
  INSERT INTO stylist_commission_ledger(id,shop_id,employee_id,settlement_id,booking_id,base_amount,commission_rate,commission_amount,status)
    VALUES('commission_'||NEW.id||'_'||e.id,NEW.shop_id,e.id,NEW.id,NEW.booking_id,base,rate,CASE WHEN rate IS NULL THEN 0 ELSE ROUND(base*rate,2) END,
      CASE WHEN rate IS NULL THEN 'pending' ELSE 'accrued' END)
    ON CONFLICT (settlement_id,employee_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_settlement_commission() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_settlement_commission() TO service_role;
DROP TRIGGER IF EXISTS settlement_commission_ledger ON public.settlements;
CREATE TRIGGER settlement_commission_ledger AFTER INSERT OR UPDATE OF payment_status ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.record_settlement_commission();
