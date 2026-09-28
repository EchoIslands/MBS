-- 创建支付记录表（H5/小程序共用）
-- 用于微信支付、支付宝等第三方支付的真实支付流程

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  settlement_id TEXT REFERENCES settlements(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_id TEXT,
  prepay_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 常用索引
CREATE INDEX IF NOT EXISTS idx_payments_shop_id ON payments(shop_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_settlement_id ON payments(settlement_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
