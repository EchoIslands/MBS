-- ============================================================
-- MBS 理发店管理系统 - 基础测试数据
-- 说明: 恢复 shop1 店铺、员工、服务、商品和客户基础数据
-- 执行方式: 在 Supabase SQL Editor 中执行
-- 注意: 如果相关表已有数据，请先清空或使用 ON CONFLICT 处理
-- ============================================================

-- ========== 1. 恢复店铺数据 ==========
insert into shops (
  id, name, description, address, phone, latitude, longitude,
  level, is_active, avatar, images, services, employees, opening_hours,
  booking_confirm_mode, rating, review_count, created_at, updated_at
) values (
  'shop1',
  '皓诗形象设计',
  '专业美发造型服务，提供剪发、烫染、护理等一站式美发体验',
  '青岛市城阳区流亭街道城中城购物广场2号门',
  '13800138001',
  36.2667,
  120.4167,
  'good',
  true,
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200',
  array[
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800',
    'https://images.unsplash.com/photo-1493256338651-d82f7acb2b38?w=800'
  ],
  '[]'::jsonb,
  '[]'::jsonb,
  '{"weekday":"09:00-21:00","weekend":"09:00-21:00"}'::jsonb,
  'auto',
  5.0,
  0,
  now(),
  now()
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address,
  phone = excluded.phone,
  is_active = excluded.is_active,
  booking_confirm_mode = excluded.booking_confirm_mode,
  rating = excluded.rating,
  review_count = excluded.review_count;

-- ========== 2. 恢复员工数据 ==========
insert into employees (
  id, shop_id, name, phone, password_hash, avatar, title, rating, specialty, role, is_active, created_at
) values
('e1', 'shop1', '李师傅', '13900000011', '123456', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200', '金牌设计师', 4.8, '精剪、短发造型', 'stylist', true, now()),
('e2', 'shop1', '王总监', '13900000012', '123456', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200', '技术总监', 4.9, '烫染、潮流造型', 'stylist', true, now()),
('e3', 'shop1', '张技师', '13900000013', '123456', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200', '高级技师', 4.6, '护发、头皮护理', 'stylist', true, now()),
('cs1', 'shop1', '刘客服', '13900000101', '123456', null, '客服专员', 4.8, '客户回访/维护', 'cs', true, now()),
('mgr1', 'shop1', '刘店长', '13900000102', '123456', null, '店长', 5.0, '店铺管理', 'manager', true, now()),
('ceo1', 'shop1', '夏总', '13900000100', '123456', null, 'CEO', 5.0, '运营管理', 'ceo', true, now())
on conflict (id) do update set
  name = excluded.name,
  phone = excluded.phone,
  password_hash = excluded.password_hash,
  title = excluded.title,
  rating = excluded.rating,
  specialty = excluded.specialty,
  role = excluded.role,
  is_active = excluded.is_active;

-- ========== 3. 恢复测试客户数据 ==========
insert into customers (
  id, shop_id, name, phone, gender, age, avatar, tags,
  visit_count, total_spent, membership_level, balance, points,
  is_stockholder, referral_bonus_rate, referral_earnings,
  purchase_vip_level, purchase_vip_expires_at, stored_value_level,
  stored_value_balance, stored_value_expires_at, withdrawable_referral_amount, total_saved,
  created_at, last_visit_at
) values
(
  'cust1', 'shop1', '张三', '13800138100', 'male', 28, null, array['老顾客', '短发控'],
  5, 680, 'regular', 0, 120,
  false, 0, 0,
  'regular', null, 'none',
  0, null, 0, 0,
  now(), now()
),
(
  'cust2', 'shop1', '李四', '13800138101', 'female', 32, null, array['烫染爱好者'],
  12, 3560, 'premium', 500, 850,
  false, 0, 0,
  'silver', (now() + interval '8 months'), 'store_1000',
  500, (now() + interval '20 days'), 0, 280,
  now(), now()
),
(
  'cust3', 'shop1', '王五', '13800138102', 'male', 45, null, array['股东会员'],
  35, 12800, 'stockholder', 2000, 3200,
  true, 0.1, 1500,
  'diamond', (now() + interval '10 months'), 'store_5000',
  5000, (now() + interval '2 years'), 800, 2500,
  now(), now()
)
on conflict (id) do update set
  name = excluded.name,
  phone = excluded.phone,
  purchase_vip_level = excluded.purchase_vip_level,
  stored_value_level = excluded.stored_value_level,
  stored_value_balance = excluded.stored_value_balance,
  stored_value_expires_at = excluded.stored_value_expires_at,
  withdrawable_referral_amount = excluded.withdrawable_referral_amount;

-- 验证数据是否插入成功
select 'shops' as table_name, count(*) as rows from shops
union all
select 'employees', count(*) from employees
union all
select 'customers', count(*) from customers;
