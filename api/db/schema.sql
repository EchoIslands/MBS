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

-- 股东权益变动记录表
CREATE TABLE IF NOT EXISTS stockholder_benefit_records (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  source_booking_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ
);

-- 股东每月免费服务使用记录表
CREATE TABLE IF NOT EXISTS stockholder_free_service_usage (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  year_month TEXT NOT NULL,
  total_quota INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, customer_id, year_month)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_stockholder_records_customer_id ON stockholder_benefit_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_stockholder_records_shop_id ON stockholder_benefit_records(shop_id);
CREATE INDEX IF NOT EXISTS idx_stockholder_records_status ON stockholder_benefit_records(status);
CREATE INDEX IF NOT EXISTS idx_stockholder_usage_customer ON stockholder_free_service_usage(customer_id);
CREATE INDEX IF NOT EXISTS idx_stockholder_usage_month ON stockholder_free_service_usage(year_month);
