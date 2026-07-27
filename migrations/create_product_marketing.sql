-- ========== 商品营销字段 ==========
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_is_recommended ON products(shop_id, is_recommended, sort_order DESC);

-- ========== 优惠券表（雏形） ==========
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',              -- 优惠券名称
  type TEXT NOT NULL DEFAULT 'fixed_amount' CHECK (type IN ('fixed_amount', 'percentage', 'buy_x_get_y')),
  value NUMERIC(10,2) NOT NULL DEFAULT 0,    -- 优惠值：固定金额减免或折扣率
  min_order_amount NUMERIC(10,2) DEFAULT 0,  -- 最低使用门槛
  max_discount_amount NUMERIC(10,2),         -- 最大优惠金额（百分比券用）
  applicable_scope TEXT NOT NULL DEFAULT 'all' CHECK (applicable_scope IN ('all', 'product', 'service')),
  applicable_product_ids TEXT[] DEFAULT '{}',-- 限定商品 ID 列表
  total_quantity INTEGER DEFAULT -1,         -- 总发行量，-1 表示不限
  remaining_quantity INTEGER DEFAULT -1,     -- 剩余数量
  per_customer_limit INTEGER DEFAULT 1,      -- 每人限领
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_shop_id ON coupons(shop_id);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(shop_id, is_active, end_at);

-- 顾客优惠券领取记录
CREATE TABLE IF NOT EXISTS customer_coupons (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired', 'cancelled')),
  used_at TIMESTAMPTZ,
  order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_coupons_customer ON customer_coupons(customer_id, shop_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_coupons_coupon ON customer_coupons(coupon_id);
