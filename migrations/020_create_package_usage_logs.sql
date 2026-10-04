-- 次卡核销记录表
CREATE TABLE IF NOT EXISTS package_usage_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  package_id TEXT NOT NULL,
  booking_id TEXT,
  customer_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  used_by TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_package_usage_logs_package ON package_usage_logs(package_id);
CREATE INDEX IF NOT EXISTS idx_package_usage_logs_booking ON package_usage_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_package_usage_logs_customer ON package_usage_logs(customer_id);
