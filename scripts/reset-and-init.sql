-- ========================================================
--  重置 + 初始化：先删所有旧表，再按正确类型重建
--  用途：解决已有表导致的类型不一致 / 外键不兼容问题
--  在 Supabase Dashboard → SQL Editor 中完整执行一次
-- ========================================================

-- 先清理所有可能存在的旧表（CASCADE 会连带删掉依赖的外键）
drop table if exists queues cascade;
drop table if exists reviews cascade;
drop table if exists customer_visit_records cascade;
drop table if exists bookings cascade;
drop table if exists customer_profiles cascade;
drop table if exists customers cascade;
drop table if exists employees cascade;
drop table if exists shops cascade;

-- ========================================================
--  以下重建所有表，主键统一用 text，字段名统一 snake_case
-- ========================================================

-- ---------- 店铺表 ----------
create table shops (
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

-- ---------- 员工表（发型师 / 店长 / CEO / 客服） ----------
create table employees (
  id text primary key,
  shop_id text references shops(id) on delete set null,
  name text not null,
  phone text,
  avatar text,
  title text,
  rating numeric default 5.0,
  specialty text,
  role text not null default 'stylist',
  password_hash text default '123456',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- 客户表（核心） ----------
create table customers (
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
  membership_level text default 'regular',
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
  last_visit_at timestamptz
);

-- ---------- 客户画像 ----------
create table customer_profiles (
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

-- ---------- 预约表 ----------
create table bookings (
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
  status text default 'pending',
  notes text,
  created_at timestamptz default now()
);

-- ---------- 到店记录 ----------
create table customer_visit_records (
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

-- ---------- 评价表（店铺评价 + 技师评价合并，用 type 区分） ----------
create table reviews (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  customer_name text,
  booking_id text references bookings(id) on delete set null,
  type text not null,
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

-- ---------- 排队队列 ----------
create table queues (
  shop_id text primary key references shops(id) on delete cascade,
  current_number integer default 0,
  estimated_wait_time integer default 15,
  updated_at timestamptz default now()
);

-- ---------- 索引（提高查询速度） ----------
create index idx_bookings_shop_id on bookings(shop_id);
create index idx_bookings_customer_id on bookings(customer_id);
create index idx_bookings_scheduled_time on bookings(scheduled_time);
create index idx_customers_shop_id on customers(shop_id);
create index idx_employees_shop_id on employees(shop_id);
create index idx_reviews_shop_id on reviews(shop_id);
create index idx_reviews_type on reviews(type);
create index idx_visit_records_customer_id on customer_visit_records(customer_id);
create index idx_customer_profiles_customer_id on customer_profiles(customer_id);

-- ========================================================
--  建表完成。下一步：
--    1) 运行: npm run seed-db     导入演示数据
--    2) 把 .env 中的 VITE_USE_REAL_API 改成 true
--    3) 重启 npm run dev
-- ========================================================
