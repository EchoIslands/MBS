-- 顾客次卡表：用于存储“99元三次精剪”等多次核销套餐
CREATE TABLE IF NOT EXISTS customer_packages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  shop_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  service_id TEXT NOT NULL,
  total_times INTEGER NOT NULL DEFAULT 0,
  used_times INTEGER NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  allow_holiday_use BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active',
  order_id TEXT,
  source TEXT DEFAULT 'shop',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_packages_customer ON customer_packages(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_packages_status ON customer_packages(status);
CREATE INDEX IF NOT EXISTS idx_customer_packages_service ON customer_packages(service_id);
CREATE INDEX IF NOT EXISTS idx_customer_packages_expires ON customer_packages(expires_at);
