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

-- 推荐记录表
CREATE TABLE IF NOT EXISTS referral_records (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  referrer_id TEXT NOT NULL,
  referrer_name TEXT,
  referred_id TEXT,
  referred_name TEXT,
  referred_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  coupon_id TEXT,
  bonus_amount NUMERIC(12,2) DEFAULT 0,
  first_spent_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  couponed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  source_booking_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_referral_records_shop_id ON referral_records(shop_id);
CREATE INDEX IF NOT EXISTS idx_referral_records_referrer_id ON referral_records(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_records_referred_id ON referral_records(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_records_status ON referral_records(status);

-- 优惠券模板表
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixed_amount',
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_order_amount NUMERIC(12,2) DEFAULT 0,
  valid_days INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_shop_id ON coupons(shop_id);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active);

-- 用户优惠券表
CREATE TABLE IF NOT EXISTS customer_coupons (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  coupon_id TEXT,
  coupon_name TEXT,
  type TEXT NOT NULL DEFAULT 'fixed_amount',
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_order_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unused',
  source TEXT,
  source_referral_id TEXT,
  valid_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_end TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_coupons_customer_id ON customer_coupons(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_coupons_status ON customer_coupons(status);
CREATE INDEX IF NOT EXISTS idx_customer_coupons_valid_end ON customer_coupons(valid_end);

-- 购买型 VIP 权益自定义配置表（仅 CEO 可维护）
CREATE TABLE IF NOT EXISTS purchase_vip_configs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  level TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT '年',
  discount NUMERIC(3,2) NOT NULL DEFAULT 1,
  points_rate NUMERIC(4,2) NOT NULL DEFAULT 1,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  color TEXT NOT NULL DEFAULT 'gray',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, level)
);

CREATE INDEX IF NOT EXISTS idx_purchase_vip_configs_shop_id ON purchase_vip_configs(shop_id);
CREATE INDEX IF NOT EXISTS idx_purchase_vip_configs_level ON purchase_vip_configs(level);

-- 储值型会员权益自定义配置表（仅 CEO 可维护）
CREATE TABLE IF NOT EXISTS stored_value_configs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  level TEXT NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(3,2) NOT NULL DEFAULT 1,
  points_rate NUMERIC(4,2) NOT NULL DEFAULT 1,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  color TEXT NOT NULL DEFAULT 'gray',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, level)
);

CREATE INDEX IF NOT EXISTS idx_stored_value_configs_shop_id ON stored_value_configs(shop_id);
CREATE INDEX IF NOT EXISTS idx_stored_value_configs_level ON stored_value_configs(level);

-- CEO 专用特殊 VIP 配置表（不展示在普通顾客端）
CREATE TABLE IF NOT EXISTS special_vip_configs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  discount NUMERIC(3,2) NOT NULL DEFAULT 1,
  points_rate NUMERIC(4,2) NOT NULL DEFAULT 1,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  color TEXT NOT NULL DEFAULT 'gray',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, key)
);

CREATE INDEX IF NOT EXISTS idx_special_vip_configs_shop_id ON special_vip_configs(shop_id);
CREATE INDEX IF NOT EXISTS idx_special_vip_configs_key ON special_vip_configs(key);
