-- 商品订单退款申请表
CREATE TABLE IF NOT EXISTS product_order_refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES product_orders(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT '',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  previous_status TEXT NOT NULL DEFAULT 'paid',
  reject_reason TEXT,
  handler_id TEXT,
  handler_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_product_order_refunds_shop_id ON product_order_refunds(shop_id);
CREATE INDEX IF NOT EXISTS idx_product_order_refunds_order_id ON product_order_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_product_order_refunds_status ON product_order_refunds(status);
