-- ============================================================
-- 001_baseline_schema.sql
-- 说明：本项目数据库的初始 baseline，包含所有核心基础表。
--       后续增量迁移（002-015）都依赖本文件创建的基础表。
--       本文件根据仓库现有 schema.sql / api/db/schema.sql 及代码推断生成，
--       待线上真实字段结构确认后可能需要微调。
-- ============================================================

-- ========== 1. 店铺表 ==========
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  phone TEXT,
  latitude DOUBLE PRECISION DEFAULT 0,
  longitude DOUBLE PRECISION DEFAULT 0,
  level TEXT DEFAULT 'good',
  is_active BOOLEAN DEFAULT TRUE,
  avatar TEXT,
  images TEXT[],
  services JSONB DEFAULT '[]'::JSONB,
  products JSONB DEFAULT '[]'::JSONB,
  opening_hours JSONB DEFAULT '{}'::JSONB,
  employees JSONB DEFAULT '[]'::JSONB,
  booking_confirm_mode TEXT DEFAULT 'auto',
  stockholder_config JSONB DEFAULT '{}'::JSONB,
  rating NUMERIC DEFAULT 5,
  review_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 2. 员工表（发型师 / 店长 / CEO / 客服） ==========
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  avatar TEXT,
  title TEXT,
  rating NUMERIC DEFAULT 5.0,
  specialty TEXT,
  role TEXT NOT NULL DEFAULT 'stylist',
  password_hash TEXT DEFAULT '123456',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 3. 客户表（核心） ==========
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT,
  age INTEGER,
  avatar TEXT,
  tags TEXT[] DEFAULT '{}',
  visit_count INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  membership_level TEXT DEFAULT 'regular',
  balance NUMERIC DEFAULT 0,
  points INTEGER DEFAULT 0,
  birthday DATE,
  preferences TEXT[] DEFAULT '{}',
  is_stockholder BOOLEAN DEFAULT FALSE,
  stockholder_since TIMESTAMPTZ,
  referral_bonus_rate NUMERIC DEFAULT 0,
  referral_earnings NUMERIC DEFAULT 0,
  served_by_stylist_ids TEXT[] DEFAULT '{}',
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_visit_at TIMESTAMPTZ,
  purchase_vip_level TEXT DEFAULT 'regular',
  purchase_vip_expires_at TIMESTAMPTZ,
  stored_value_level TEXT DEFAULT 'none',
  stored_value_balance NUMERIC DEFAULT 0,
  stored_value_expires_at TIMESTAMPTZ,
  withdrawable_referral_amount NUMERIC DEFAULT 0,
  total_saved NUMERIC DEFAULT 0,
  wechat TEXT,
  id_card_number TEXT,
  hobbies TEXT,
  is_referred BOOLEAN DEFAULT FALSE,
  referrer_name TEXT,
  referrer_phone TEXT,
  referral_consumption NUMERIC DEFAULT 0,
  shared_fund NUMERIC DEFAULT 0,
  total_shared_fund NUMERIC DEFAULT 0,
  withdrawable_amount NUMERIC DEFAULT 0,
  has_booking BOOLEAN DEFAULT FALSE,
  last_service_items TEXT[] DEFAULT '{}',
  is_member BOOLEAN DEFAULT FALSE,
  has_recharged BOOLEAN DEFAULT FALSE,
  recharge_level TEXT,
  openid_oa TEXT,
  openid_mini TEXT,
  unionid TEXT,
  wechat_avatar TEXT,
  wechat_nickname TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 4. 客户画像 ==========
CREATE TABLE IF NOT EXISTS customer_profiles (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  updated_by TEXT,
  updated_by_name TEXT,
  haircut_styles TEXT[] DEFAULT '{}',
  hair_colors TEXT[] DEFAULT '{}',
  perm_colors TEXT[] DEFAULT '{}',
  treatments TEXT[] DEFAULT '{}',
  hair_type TEXT,
  hair_length TEXT,
  visit_frequency TEXT,
  budget_range TEXT,
  communication_style TEXT,
  extra_services TEXT[] DEFAULT '{}',
  visit_times TEXT[] DEFAULT '{}',
  notes TEXT,
  allergies TEXT,
  products_used TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 5. 预约表 ==========
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  stylist_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  stylist_name TEXT,
  service_id TEXT,
  service_name TEXT,
  price NUMERIC DEFAULT 0,
  scheduled_time TIMESTAMPTZ NOT NULL,
  queue_number INTEGER,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 6. 结算记录 ==========
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  items JSONB DEFAULT '[]'::JSONB,
  subtotal NUMERIC DEFAULT 0,
  discount_detail JSONB DEFAULT '{}'::JSONB,
  discount NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'completed',
  used_benefit_ids TEXT[] DEFAULT '{}',
  processed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 7. 支付记录（H5/小程序共用） ==========
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  settlement_id TEXT REFERENCES settlements(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  transaction_id TEXT,
  prepay_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 8. 到店记录 ==========
CREATE TABLE IF NOT EXISTS customer_visit_records (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  stylist_id TEXT,
  stylist_name TEXT,
  service_ids TEXT[] DEFAULT '{}',
  service_names TEXT[] DEFAULT '{}',
  products JSONB DEFAULT '[]'::JSONB,
  total_amount NUMERIC DEFAULT 0,
  payment_method TEXT,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 9. 评价表 ==========
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'shop',
  stylist_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  stylist_name TEXT,
  service_name TEXT,
  rating NUMERIC(2,1) CHECK (rating BETWEEN 0.5 AND 5),
  service_score NUMERIC(2,1),
  price_score NUMERIC(2,1),
  skill_score NUMERIC(2,1),
  stylist_score NUMERIC(2,1),
  overall_score NUMERIC(2,1),
  comment TEXT,
  service_comment TEXT,
  stylist_comment TEXT,
  is_aware_of_membership_benefits BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT '{}',
  reply TEXT,
  reply_by TEXT,
  reply_at TIMESTAMPTZ,
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 10. 排队队列 ==========
CREATE TABLE IF NOT EXISTS queues (
  shop_id TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  current_number INTEGER DEFAULT 0,
  estimated_wait_time INTEGER DEFAULT 15,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 11. 埋点事件表 ==========
CREATE TABLE IF NOT EXISTS customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  platform TEXT,
  page_path TEXT,
  customer_id TEXT,
  shop_id TEXT,
  session_id TEXT,
  app_version TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  properties JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 12. 会员权益记录表（可核销） ==========
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

-- ========== 13. 股东权益变动记录表 ==========
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

-- ========== 14. 股东每月免费服务使用记录表 ==========
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

-- ========== 15. 推荐记录表 ==========
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

-- ========== 16. 购买型 VIP 权益自定义配置表 ==========
CREATE TABLE IF NOT EXISTS purchase_vip_configs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  level TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT '年',
  discount NUMERIC(3,2) NOT NULL DEFAULT 1,
  points_rate NUMERIC(4,2) NOT NULL DEFAULT 1,
  benefits JSONB NOT NULL DEFAULT '[]'::JSONB,
  color TEXT NOT NULL DEFAULT 'gray',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, level)
);

-- ========== 17. 储值型会员权益自定义配置表 ==========
CREATE TABLE IF NOT EXISTS stored_value_configs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  level TEXT NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(3,2) NOT NULL DEFAULT 1,
  points_rate NUMERIC(4,2) NOT NULL DEFAULT 1,
  benefits JSONB NOT NULL DEFAULT '[]'::JSONB,
  color TEXT NOT NULL DEFAULT 'gray',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, level)
);

-- ========== 18. CEO 专用特殊 VIP 配置表 ==========
CREATE TABLE IF NOT EXISTS special_vip_configs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  discount NUMERIC(3,2) NOT NULL DEFAULT 1,
  points_rate NUMERIC(4,2) NOT NULL DEFAULT 1,
  benefits JSONB NOT NULL DEFAULT '[]'::JSONB,
  color TEXT NOT NULL DEFAULT 'gray',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, key)
);

-- ========== 基础索引 ==========
CREATE INDEX IF NOT EXISTS idx_bookings_shop_id ON bookings(shop_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_time ON bookings(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_employees_shop_id ON employees(shop_id);
CREATE INDEX IF NOT EXISTS idx_reviews_shop_id ON reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_reviews_type ON reviews(type);
CREATE INDEX IF NOT EXISTS idx_visit_records_customer_id ON customer_visit_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_customer_id ON customer_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_customer_id ON customer_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_shop_id ON customer_events(shop_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_event_type ON customer_events(event_type);
CREATE INDEX IF NOT EXISTS idx_customer_events_created_at ON customer_events(created_at);
CREATE INDEX IF NOT EXISTS idx_member_benefits_customer_id ON member_benefits(customer_id);
CREATE INDEX IF NOT EXISTS idx_member_benefits_status ON member_benefits(status);
CREATE INDEX IF NOT EXISTS idx_stockholder_records_customer_id ON stockholder_benefit_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_stockholder_records_shop_id ON stockholder_benefit_records(shop_id);
CREATE INDEX IF NOT EXISTS idx_stockholder_records_status ON stockholder_benefit_records(status);
CREATE INDEX IF NOT EXISTS idx_stockholder_usage_customer ON stockholder_free_service_usage(customer_id);
CREATE INDEX IF NOT EXISTS idx_stockholder_usage_month ON stockholder_free_service_usage(year_month);
CREATE INDEX IF NOT EXISTS idx_referral_records_shop_id ON referral_records(shop_id);
CREATE INDEX IF NOT EXISTS idx_referral_records_referrer_id ON referral_records(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_records_referred_id ON referral_records(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_records_status ON referral_records(status);
CREATE INDEX IF NOT EXISTS idx_purchase_vip_configs_shop_id ON purchase_vip_configs(shop_id);
CREATE INDEX IF NOT EXISTS idx_purchase_vip_configs_level ON purchase_vip_configs(level);
CREATE INDEX IF NOT EXISTS idx_stored_value_configs_shop_id ON stored_value_configs(shop_id);
CREATE INDEX IF NOT EXISTS idx_stored_value_configs_level ON stored_value_configs(level);
CREATE INDEX IF NOT EXISTS idx_special_vip_configs_shop_id ON special_vip_configs(shop_id);

-- ========== 行级安全（RLS）策略 ==========
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_visit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockholder_benefit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockholder_free_service_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_vip_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stored_value_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_vip_configs ENABLE ROW LEVEL SECURITY;
