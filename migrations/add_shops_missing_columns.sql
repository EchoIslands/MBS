-- ============================================================
-- 为 shops 表补充代码中已使用但 schema 中缺失的字段
-- 说明：修复店铺设置保存时因 stockholder_config 等字段不存在导致的 500 错误
-- 执行方式：在 Supabase SQL Editor 中执行
-- ============================================================

alter table shops
  add column if not exists products jsonb default '[]'::jsonb,
  add column if not exists opening_hours jsonb default '{}'::jsonb,
  add column if not exists employees jsonb default '[]'::jsonb,
  add column if not exists booking_confirm_mode text default 'auto',
  add column if not exists stockholder_config jsonb default '{}'::jsonb,
  add column if not exists rating numeric default 5,
  add column if not exists review_count integer default 0;

-- 为现有数据写入默认值，避免前端拿到 null
update shops
set
  products = coalesce(products, '[]'::jsonb),
  opening_hours = coalesce(opening_hours, '{}'::jsonb),
  employees = coalesce(employees, '[]'::jsonb),
  booking_confirm_mode = coalesce(booking_confirm_mode, 'auto'),
  stockholder_config = coalesce(stockholder_config, '{}'::jsonb),
  rating = coalesce(rating, 5),
  review_count = coalesce(review_count, 0)
where products is null
   or opening_hours is null
   or employees is null
   or booking_confirm_mode is null
   or stockholder_config is null
   or rating is null
   or review_count is null;
