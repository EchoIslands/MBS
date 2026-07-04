-- 结算记录表
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  booking_id TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'completed',
  used_benefit_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  processed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 会员权益记录表（可核销）
CREATE TABLE IF NOT EXISTS member_benefits (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by TEXT,
  used_at TIMESTAMPTZ,
  used_by TEXT,
  used_order_id TEXT,
  expires_at TIMESTAMPTZ
);

-- 常用查询索引
CREATE INDEX IF NOT EXISTS idx_settlements_shop_id ON settlements(shop_id);
CREATE INDEX IF NOT EXISTS idx_settlements_customer_id ON settlements(customer_id);
CREATE INDEX IF NOT EXISTS idx_settlements_created_at ON settlements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_benefits_customer_id ON member_benefits(customer_id);
CREATE INDEX IF NOT EXISTS idx_member_benefits_status ON member_benefits(status);
