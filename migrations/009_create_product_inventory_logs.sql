-- 商品库存预警阈值
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 10;

-- 商品库存变动记录表
CREATE TABLE IF NOT EXISTS product_inventory_logs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  change_amount INTEGER NOT NULL,        -- 变动数量（正数为增加，负数为减少）
  stock_after INTEGER NOT NULL,          -- 变动后库存
  type TEXT NOT NULL CHECK (type IN ('sale', 'refund', 'manual_adjust', 'init', 'cancel')),
  order_id TEXT,                         -- 关联订单 ID
  reason TEXT NOT NULL DEFAULT '',       -- 变动原因/备注
  operator_id TEXT,                      -- 操作员工 ID
  operator_name TEXT,                    -- 操作员工姓名
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_inventory_logs_shop_id ON product_inventory_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_logs_product_id ON product_inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_logs_type ON product_inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_product_inventory_logs_created_at ON product_inventory_logs(created_at);
