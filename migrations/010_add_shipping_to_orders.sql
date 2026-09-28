-- ============================================================
-- 为商品订单表添加发货相关字段
-- 说明：支持商品类订单的发货、物流跟踪和确认收货
-- 执行方式：在 Supabase SQL Editor 中执行
-- ============================================================

-- ========== 1. 为 product_orders 表添加发货字段 ==========
alter table product_orders add column if not exists shipping_company text;
alter table product_orders add column if not exists shipping_no text;
alter table product_orders add column if not exists shipped_at timestamptz;
alter table product_orders add column if not exists confirmed_at timestamptz;
alter table product_orders add column if not exists tracking_info jsonb default '[]'::jsonb;

-- 添加状态：shipped (已发货，等待用户确认收货)
-- 当前状态值：pending / paid / preparing / ready / completed / cancelled / refunded
-- 新增状态：shipped

-- ========== 2. 创建物流轨迹表（可选，用于存储详细轨迹） ==========
create table if not exists shipment_tracking (
  id uuid primary key default gen_random_uuid(),
  order_id text references product_orders(id) on delete cascade not null,
  shipping_company text,
  shipping_no text,
  event_time timestamptz not null,
  event_description text,
  location text,
  created_at timestamptz default now()
);

create index if not exists idx_shipment_tracking_order_id on shipment_tracking(order_id);
create index if not exists idx_shipment_tracking_event_time on shipment_tracking(event_time desc);

-- ========== 3. 更新索引 ==========
create index if not exists idx_product_orders_shipping_no on product_orders(shipping_no);
