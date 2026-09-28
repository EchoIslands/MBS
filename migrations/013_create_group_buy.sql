-- 外部团购券表结构
-- 用于核销美团等外部平台售卖的团购券

-- 团购活动批次
CREATE TABLE IF NOT EXISTS group_buy_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_ids TEXT[] NOT NULL DEFAULT '{}',
  price_type TEXT NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'vip_level')),
  fixed_price NUMERIC(10, 2),
  vip_level TEXT CHECK (vip_level IN ('bronze', 'silver', 'gold', 'diamond')),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ NOT NULL,
  total_quantity INTEGER NOT NULL DEFAULT -1,
  used_quantity INTEGER NOT NULL DEFAULT 0,
  platform TEXT NOT NULL DEFAULT 'other' CHECK (platform IN ('meituan', 'douyin', 'dianping', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 团购券实例（外部券码）
CREATE TABLE IF NOT EXISTS group_buy_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES group_buy_batches(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used')),
  platform TEXT NOT NULL DEFAULT 'other' CHECK (platform IN ('meituan', 'douyin', 'dianping', 'other')),
  used_at TIMESTAMPTZ,
  used_by_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  used_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, code)
);

-- 核销记录索引
CREATE INDEX IF NOT EXISTS idx_group_buy_vouchers_code ON group_buy_vouchers(shop_id, code);
CREATE INDEX IF NOT EXISTS idx_group_buy_vouchers_batch ON group_buy_vouchers(batch_id);
CREATE INDEX IF NOT EXISTS idx_group_buy_batches_shop ON group_buy_batches(shop_id);

COMMENT ON TABLE group_buy_batches IS '外部团购活动批次（美团等平台）';
COMMENT ON TABLE group_buy_vouchers IS '外部团购券实例，每个券码一条记录';
