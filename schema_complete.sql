-- ============================================================
-- MBS 理发店管理系统 - 完整数据库结构
-- 版本: 2026-07-01
-- 说明: 包含双轨会员体系、开单结算、权益核销等全部功能
-- 执行方式: 在 Supabase SQL Editor 中完整执行一次
-- 注意: 如果已有表存在，ALTER TABLE 语句会新增字段，不会覆盖数据
-- ============================================================

-- ========== 1. 店铺表 ==========
create table if not exists shops (
  id text primary key,
  name text not null,
  description text,
  address text,
  phone text,
  latitude double precision default 0,
  longitude double precision default 0,
  level text default 'good',
  is_active boolean default true,
  avatar text,
  images text[],
  services jsonb default '[]'::jsonb,
  employees jsonb default '[]'::jsonb,
  opening_hours jsonb default '{}'::jsonb,
  booking_confirm_mode text default 'auto',
  rating numeric default 5.0,
  review_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 如果 shops 表已存在，补充后端需要的字段
alter table shops add column if not exists employees jsonb default '[]'::jsonb;
alter table shops add column if not exists opening_hours jsonb default '{}'::jsonb;
alter table shops add column if not exists booking_confirm_mode text default 'auto';
alter table shops add column if not exists rating numeric default 5.0;
alter table shops add column if not exists review_count integer default 0;
alter table shops add column if not exists updated_at timestamptz default now();

-- ========== 2. 员工表（发型师 / 店长 / CEO / 客服） ==========
create table if not exists employees (
  id text primary key,
  shop_id text references shops(id) on delete set null,
  name text not null,
  phone text,
  avatar text,
  title text,
  rating numeric default 5.0,
  specialty text,
  role text not null default 'stylist', -- stylist / manager / ceo / customer_service
  password_hash text default '123456',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ========== 3. 客户表（核心） ==========
create table if not exists customers (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  name text not null,
  phone text not null,
  gender text,
  age integer,
  avatar text,
  tags text[] default '{}',
  visit_count integer default 0,
  total_spent numeric default 0,
  membership_level text default 'regular', -- regular / premium / stockholder（旧版兼容）
  balance numeric default 0,               -- 旧版余额字段（兼容）
  points integer default 0,
  birthday date,
  preferences text[] default '{}',
  is_stockholder boolean default false,
  stockholder_since timestamptz,
  referral_bonus_rate numeric default 0,
  referral_earnings numeric default 0,
  served_by_stylist_ids text[] default '{}',
  source text,
  created_at timestamptz default now(),
  last_visit_at timestamptz,
  -- ===== 新增：双轨会员体系字段 =====
  purchase_vip_level text default 'regular',     -- 购买型 VIP 等级: regular / bronze / silver / gold / diamond
  purchase_vip_expires_at timestamptz,           -- VIP 到期时间（1 年有效期）
  stored_value_level text default 'none',        -- 储值会员等级: none / store_500 / store_1000 / store_2000 / store_5000
  stored_value_balance numeric default 0,        -- 储值总余额（本金 + 返现）
  stored_value_expires_at timestamptz,           -- 储值到期时间（2 年有效期）
  withdrawable_referral_amount numeric default 0,-- 可提现返现余额
  total_saved numeric default 0                  -- 累计节省金额
);

-- 如果 customers 表已存在，补充新增字段
alter table customers add column if not exists purchase_vip_level text default 'regular';
alter table customers add column if not exists purchase_vip_expires_at timestamptz;
alter table customers add column if not exists stored_value_level text default 'none';
alter table customers add column if not exists stored_value_balance numeric default 0;
alter table customers add column if not exists stored_value_expires_at timestamptz;
alter table customers add column if not exists withdrawable_referral_amount numeric default 0;
alter table customers add column if not exists total_saved numeric default 0;

-- ========== 4. 客户画像 ==========
create table if not exists customer_profiles (
  id text primary key,
  customer_id text references customers(id) on delete cascade,
  updated_by text,
  updated_by_name text,
  haircut_styles text[] default '{}',
  hair_colors text[] default '{}',
  perm_colors text[] default '{}',
  treatments text[] default '{}',
  hair_type text,
  hair_length text,
  visit_frequency text,
  budget_range text,
  communication_style text,
  extra_services text[] default '{}',
  visit_times text[] default '{}',
  notes text,
  allergies text,
  products_used text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========== 5. 预约表 ==========
create table if not exists bookings (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  stylist_id text references employees(id) on delete set null,
  stylist_name text,
  service_id text,
  service_name text,
  price numeric default 0,
  scheduled_time timestamptz not null,
  queue_number integer,
  status text default 'pending', -- pending / confirmed / completed / cancelled
  notes text,
  created_at timestamptz default now()
);

-- ========== 6. 到店记录 ==========
create table if not exists customer_visit_records (
  id text primary key,
  customer_id text references customers(id) on delete cascade,
  shop_id text references shops(id) on delete cascade,
  booking_id text references bookings(id) on delete set null,
  stylist_id text,
  stylist_name text,
  service_ids text[] default '{}',
  service_names text[] default '{}',
  products jsonb default '[]'::jsonb,
  total_amount numeric default 0,
  payment_method text,
  check_in_time timestamptz,
  check_out_time timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- ========== 7. 评价表（店铺评价 + 技师评价） ==========
create table if not exists reviews (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  customer_name text,
  booking_id text references bookings(id) on delete set null,
  type text not null, -- shop / stylist
  stylist_id text references employees(id) on delete set null,
  stylist_name text,
  service_name text,
  rating integer check (rating between 1 and 5),
  service_score integer,
  price_score integer,
  skill_score integer,
  overall_score numeric,
  comment text,
  tags text[] default '{}',
  reply text,
  reply_by text,
  reply_at timestamptz,
  is_hidden boolean default false,
  created_at timestamptz default now()
);

-- ========== 8. 排队队列 ==========
create table if not exists queues (
  shop_id text primary key references shops(id) on delete cascade,
  current_number integer default 0,
  estimated_wait_time integer default 15,
  updated_at timestamptz default now()
);

-- ========== 9. 会员权益记录表（可核销）【新增】 ==========
create table if not exists member_benefit_records (
  id text primary key,
  customer_id text references customers(id) on delete cascade,
  type text not null, -- shampoo / conditioner / free_haircut / drink / redo
  name text not null,
  description text,
  status text default 'available', -- available / used / expired
  granted_at timestamptz default now(),
  granted_by text,               -- 发放员工 ID
  granted_by_name text,          -- 发放员工姓名
  used_at timestamptz,
  used_by text,                  -- 核销员工 ID
  used_by_name text,             -- 核销员工姓名
  used_order_id text,            -- 关联结算订单 ID
  expires_at timestamptz,        -- 过期时间
  created_at timestamptz default now()
);

-- ========== 10. 储值余额流水表【新增】 ==========
create table if not exists stored_value_transactions (
  id text primary key,
  customer_id text references customers(id) on delete cascade,
  type text not null, -- recharge / upgrade / consume / refund / referral_bonus / withdraw
  amount numeric not null,        -- 正数为增加，负数为扣减
  balance_after numeric not null, -- 变动后总余额
  principal_portion numeric default 0, -- 本次变动中来自本金的部分
  referral_portion numeric default 0,  -- 本次变动中来自返现的部分
  order_id text,                 -- 关联结算订单 ID
  related_benefit_id text,       -- 关联权益/返现记录 ID
  note text,
  created_at timestamptz default now(),
  created_by text,               -- 操作员工 ID
  created_by_name text           -- 操作员工姓名
);

-- ========== 11. 结算记录表【新增】 ==========
create table if not exists settlements (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  customer_name text,
  booking_id text references bookings(id) on delete set null,
  subtotal numeric default 0,    -- 原价小计
  discount numeric default 0,    -- 总折扣金额
  tax numeric default 0,
  total numeric default 0,       -- 实付总计
  payment_method text,           -- cash / wechat / alipay / card / balance
  payment_status text default 'completed', -- pending / completed / failed
  used_benefit_ids text[] default '{}',    -- 本次核销的权益 ID
  discount_detail jsonb default '{}'::jsonb, -- 折扣明细：{purchaseVIPDiscount, storedValueDiscount, ...}
  created_at timestamptz default now(),
  processed_by text,             -- 操作员 ID
  processed_by_name text         -- 操作员姓名
);

-- ========== 12. 结算明细项表【新增】 ==========
create table if not exists settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id text references settlements(id) on delete cascade,
  type text not null,            -- service / product
  item_id text,                  -- 服务或商品 ID
  name text,
  original_price numeric default 0,
  quantity integer default 1,
  discounted_price numeric default 0, -- 折后单价
  total numeric default 0,       -- 折后小计
  category text                  -- 商品分类（用于假发等排除折扣）
);

-- ========== 13. 推荐记录表【新增】 ==========
create table if not exists referral_records (
  id text primary key,
  referrer_id text references customers(id) on delete set null,
  referrer_name text,
  referred_id text references customers(id) on delete set null,
  referred_name text,
  referred_phone text,
  bonus_amount numeric default 0,
  status text default 'pending', -- pending / confirmed / paid
  created_at timestamptz default now(),
  confirmed_at timestamptz       -- 确认日期（首次消费后）
);

-- ========== 索引（提高查询速度） ==========
create index if not exists idx_bookings_shop_id on bookings(shop_id);
create index if not exists idx_bookings_customer_id on bookings(customer_id);
create index if not exists idx_bookings_scheduled_time on bookings(scheduled_time);
create index if not exists idx_customers_shop_id on customers(shop_id);
create index if not exists idx_employees_shop_id on employees(shop_id);
create index if not exists idx_reviews_shop_id on reviews(shop_id);
create index if not exists idx_reviews_type on reviews(type);
create index if not exists idx_visit_records_customer_id on customer_visit_records(customer_id);
create index if not exists idx_customer_profiles_customer_id on customer_profiles(customer_id);

-- 新增索引
create index if not exists idx_member_benefit_customer_id on member_benefit_records(customer_id);
create index if not exists idx_member_benefit_status on member_benefit_records(status);
create index if not exists idx_stored_value_tx_customer_id on stored_value_transactions(customer_id);
create index if not exists idx_settlements_shop_id on settlements(shop_id);
create index if not exists idx_settlements_customer_id on settlements(customer_id);
create index if not exists idx_settlement_items_settlement_id on settlement_items(settlement_id);
create index if not exists idx_referral_referrer_id on referral_records(referrer_id);

-- ========== 行级安全（RLS）策略 ==========
alter table shops enable row level security;
alter table employees enable row level security;
alter table customers enable row level security;
alter table customer_profiles enable row level security;
alter table bookings enable row level security;
alter table customer_visit_records enable row level security;
alter table reviews enable row level security;
alter table queues enable row level security;
alter table member_benefit_records enable row level security;
alter table stored_value_transactions enable row level security;
alter table settlements enable row level security;
alter table settlement_items enable row level security;
alter table referral_records enable row level security;

-- ========== 完成提示 ==========
-- 执行完成后，你的数据库结构将包含：
-- 1. 店铺、员工、客户、预约、评价、排队等基础表
-- 2. 双轨会员体系所需的所有字段和表
-- 3. 开单结算、权益核销、储值流水等功能表
-- 4. 推荐返现记录表
-- 5. 所有必要的索引和 RLS 安全策略