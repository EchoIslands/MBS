# 数据库建表脚本
# 在 Supabase 控制台的 SQL Editor 中完整执行一次即可

-- ========== 店铺表 ==========
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
  created_at timestamptz default now()
);

-- ========== 员工表（发型师 / 店长 / CEO / 客服） ==========
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

-- ========== 客户表（核心） ==========
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
  membership_level text default 'regular', -- regular / premium / stockholder
  balance numeric default 0,
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
  purchase_vip_level text default 'regular',      -- 购买型 VIP 等级: regular / bronze / silver / gold / diamond
  purchase_vip_expires_at timestamptz,            -- VIP 到期时间（1 年有效期）
  stored_value_level text default 'none',         -- 储值会员等级: none / store_500 / store_1000 / store_2000 / store_5000
  stored_value_balance numeric default 0,         -- 储值总余额（本金 + 返现）
  stored_value_expires_at timestamptz,            -- 储值到期时间（2 年有效期）
  withdrawable_referral_amount numeric default 0, -- 可提现返现余额
  total_saved numeric default 0,                  -- 累计节省金额
  -- ===== 客户管理扩展字段 =====
  wechat text,                                    -- 微信号
  id_card_number text,                            -- 身份证号
  hobbies text,                                   -- 爱好及其他
  is_referred boolean default false,              -- 是否转介绍
  referrer_name text,                             -- 转介绍人姓名
  referrer_phone text,                            -- 转介绍人电话
  referral_consumption numeric default 0,         -- 转介绍带来的消费
  shared_fund numeric default 0,                  -- 共享基金
  total_shared_fund numeric default 0,            -- 合计共享基金
  withdrawable_amount numeric default 0,          -- 可取现金额
  has_booking boolean default false,              -- 是否有预约
  last_service_items text[] default '{}',         -- 上次消费项目
  is_member boolean default false,                -- 是否会员（兼容旧字段）
  has_recharged boolean default false,            -- 是否已充值（兼容旧字段）
  recharge_level text                             -- 充值级别文本（兼容旧字段）
);

-- ========== 客户画像 ==========
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

-- ========== 预约表 ==========
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

-- ========== 到店记录 ==========
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

-- ========== 评价表（店铺评价 + 技师评价合并，用 type 区分） ==========
create table if not exists reviews (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  customer_name text,
  booking_id text references bookings(id) on delete set null,
  type text default 'shop', -- shop / stylist，默认店铺评价
  stylist_id text references employees(id) on delete set null,
  stylist_name text,
  service_name text,
  rating integer check (rating between 1 and 5),
  service_score integer,
  price_score integer,
  skill_score integer,
  stylist_score integer,
  overall_score numeric,
  comment text,
  service_comment text,
  stylist_comment text,
  is_aware_of_membership_benefits boolean default false,
  tags text[] default '{}',
  reply text,
  reply_by text,
  reply_at timestamptz,
  is_hidden boolean default false,
  created_at timestamptz default now()
);

-- ========== 排队队列 ==========
create table if not exists queues (
  shop_id text primary key references shops(id) on delete cascade,
  current_number integer default 0,
  estimated_wait_time integer default 15,
  updated_at timestamptz default now()
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

-- ========== 行级安全（RLS）策略 ==========
-- 先为所有表启用 RLS
alter table shops enable row level security;
alter table employees enable row level security;
alter table customers enable row level security;
alter table customer_profiles enable row level security;
alter table bookings enable row level security;
alter table customer_visit_records enable row level security;
alter table reviews enable row level security;
alter table queues enable row level security;

-- 为 service_role 创建策略（后端用 service_role key，默认绕过 RLS，可忽略）
-- 普通用户查询由 service_role 处理，这里开放 service_role key 的访问权限
