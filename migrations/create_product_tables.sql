-- ============================================================
-- MVP 商城模块数据库迁移
-- 说明：将商品从 shops.products JSONB 迁移到独立 products 表，
--       并新增商品订单相关表。支持到店自提 + 余额支付 MVP。
-- 执行方式：在 Supabase SQL Editor 中按顺序执行
-- ============================================================

-- ========== 1. 商品独立表 ==========
create table if not exists products (
  id text primary key,
  shop_id text references shops(id) on delete cascade not null,
  name text not null,
  category text not null default 'other',
  price numeric(12,2) not null default 0,
  original_price numeric(12,2),
  description text default '',
  images text[] default '{}',
  stock integer not null default 0,
  sales integer not null default 0,
  is_active boolean default true,
  rating numeric default 5.0,
  review_count integer default 0,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 从 shops.products JSONB 迁移数据（幂等：仅当 products 表为空时执行）
do $$
declare
  shop_record record;
  product_item record;
  new_id text;
begin
  if (select count(*) from products) = 0 then
    for shop_record in select id, products as product_list from shops where products is not null loop
      for product_item in select * from jsonb_to_recordset(shop_record.product_list) as x(id text, name text, category text, price numeric, original_price numeric, description text, images text[], stock integer, sales integer, is_active boolean, rating numeric, review_count integer, tags text[], created_at timestamptz, updated_at timestamptz) loop
        new_id := coalesce(product_item.id, 'prod_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6));
        insert into products (id, shop_id, name, category, price, original_price, description, images, stock, sales, is_active, rating, review_count, tags, created_at, updated_at)
        values (
          new_id,
          shop_record.id,
          coalesce(product_item.name, '未命名商品'),
          coalesce(product_item.category, 'other'),
          coalesce(product_item.price, 0),
          product_item.original_price,
          coalesce(product_item.description, ''),
          coalesce(product_item.images, '{}'),
          coalesce(product_item.stock, 0),
          coalesce(product_item.sales, 0),
          coalesce(product_item.is_active, true),
          coalesce(product_item.rating, 5.0),
          coalesce(product_item.review_count, 0),
          coalesce(product_item.tags, '{}'),
          coalesce(product_item.created_at, now()),
          coalesce(product_item.updated_at, now())
        )
        on conflict (id) do nothing;
      end loop;
    end loop;
  end if;
end $$;

-- ========== 2. 商品订单主表 ==========
create table if not exists product_orders (
  id text primary key,
  shop_id text references shops(id) on delete cascade not null,
  customer_id text references customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  order_no text unique not null,          -- 对外展示订单号，如 PO202607270001
  total_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) default 0,
  payable_amount numeric(12,2) not null default 0,
  status text not null default 'pending', -- pending / paid / preparing / ready / completed / cancelled / refunded
  payment_method text,                    -- balance / store_pickup / wechat / alipay
  payment_status text default 'pending',  -- pending / paid / failed / refunded
  paid_at timestamptz,
  pickup_code text,                       -- 到店自提核销码
  pickup_name text,                       -- 取货人姓名
  pickup_phone text,                      -- 取货人电话
  notes text,                             -- 用户备注
  cancelled_at timestamptz,
  cancel_reason text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========== 3. 商品订单明细表 ==========
create table if not exists product_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text references product_orders(id) on delete cascade not null,
  product_id text references products(id) on delete set null,
  name text not null,
  image text,
  price numeric(12,2) not null default 0,
  original_price numeric(12,2),
  quantity integer not null default 1,
  total_amount numeric(12,2) not null default 0,
  category text
);

-- ========== 4. 索引 ==========
create index if not exists idx_products_shop_id on products(shop_id);
create index if not exists idx_products_category on products(category);
create index if not exists idx_products_is_active on products(is_active);
create index if not exists idx_product_orders_shop_id on product_orders(shop_id);
create index if not exists idx_product_orders_customer_id on product_orders(customer_id);
create index if not exists idx_product_orders_status on product_orders(status);
create index if not exists idx_product_orders_order_no on product_orders(order_no);
create index if not exists idx_product_order_items_order_id on product_order_items(order_id);

-- ========== 5. 行级安全策略 ==========
alter table products enable row level security;
alter table product_orders enable row level security;
alter table product_order_items enable row level security;

-- 注意：实际生产环境请根据业务需求配置 RLS 策略。
-- 为简化 MVP 开发，此处使用允许所有访问的占位策略，后续可收紧。
create policy "Allow all" on products for all using (true) with check (true);
create policy "Allow all" on product_orders for all using (true) with check (true);
create policy "Allow all" on product_order_items for all using (true) with check (true);

-- ========== 6. 完成提示 ==========
-- 执行完成后：
-- 1. 商品数据已从 shops.products 迁移到 products 表
-- 2. 已创建 product_orders 和 product_order_items 表
-- 3. 后端需要更新为读取 products 表，而不是 shops.products JSONB
