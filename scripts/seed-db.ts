// 数据导入脚本：把 mockData.ts 中的演示数据导入到 Supabase
// 用法：npm run seed-db  或  npx tsx scripts/seed-db.ts
// 前置条件：在 .env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

import {
  mockShops,
  mockBookings,
  mockCustomers,
  mockReviews,
} from '../shared/mockData';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 请先在 .env 文件中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const upsertMany = async (table: string, rows: any[], conflict = 'id') => {
  if (!rows.length) return;
  const { error } = await db.from(table).upsert(rows, { onConflict: conflict });
  if (error) {
    console.error(`❌ ${table} 导入失败:`, error.message);
  } else {
    console.log(`✅ ${table}: 导入 ${rows.length} 条数据`);
  }
};

const main = async () => {
  console.log('🚀 开始导入数据到 Supabase...');
  console.log(`   URL: ${SUPABASE_URL}\n`);

  // 1. 店铺
  const shops = mockShops.map((s: any) => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
    address: s.address || '',
    phone: s.phone || '',
    latitude: s.latitude || 0,
    longitude: s.longitude || 0,
    level: s.level || 'good',
    is_active: true,
    avatar: s.avatar || null,
    images: s.images || [],
    services: (s as any).services || [],
    created_at: new Date().toISOString(),
  }));
  await upsertMany('shops', shops);

  // 2. 客户
  const customers = mockCustomers.map((c: any) => ({
    id: c.id,
    shop_id: c.shopId || 'shop1',
    name: c.name,
    phone: c.phone || '',
    gender: c.gender || 'other',
    age: c.age || 0,
    avatar: c.avatar || null,
    tags: c.tags || [],
    visit_count: c.visitCount || 0,
    total_spent: c.totalSpent || 0,
    membership_level: c.membershipLevel || 'regular',
    balance: c.balance || 0,
    points: c.points || 0,
    birthday: c.birthday ? new Date(c.birthday).toISOString() : null,
    preferences: c.preferences || [],
    is_stockholder: !!c.isStockholder,
    stockholder_since: c.stockholderSince ? new Date(c.stockholderSince).toISOString() : null,
    referral_bonus_rate: c.referralBonusRate || 0,
    referral_earnings: c.referralEarnings || 0,
    served_by_stylist_ids: c.servedByStylistIds || [],
    source: c.source || '',
    created_at: new Date().toISOString(),
    last_visit_at: c.lastVisitAt ? new Date(c.lastVisitAt).toISOString() : null,
  }));
  await upsertMany('customers', customers);

  // 3. 预约
  const bookings = mockBookings.map((b: any) => ({
    id: b.id,
    shop_id: b.shopId,
    customer_id: b.customerId,
    customer_name: b.customerName || '顾客',
    stylist_id: b.stylistId || null,
    stylist_name: b.stylistName || b.barberName || '',
    service_id: b.serviceId || '',
    service_name: b.serviceName || '',
    price: b.price || 0,
    scheduled_time: b.scheduledTime
      ? new Date(b.scheduledTime).toISOString()
      : new Date().toISOString(),
    queue_number: b.queueNumber || 1,
    status: b.status || 'pending',
    notes: b.notes || '',
    created_at: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString(),
  }));
  await upsertMany('bookings', bookings);

  // 4. 评价
  const reviews = mockReviews.map((r: any) => ({
    id: r.id,
    shop_id: r.shopId,
    customer_id: r.customerId,
    customer_name: r.customerName || '顾客',
    booking_id: r.bookingId || null,
    type: r.type || 'shop',
    stylist_id: r.stylistId || null,
    stylist_name: r.stylistName || '',
    service_name: r.serviceName || '',
    rating: r.rating || r.overallScore || 5,
    service_score: r.serviceScore || 5,
    price_score: r.priceScore || 5,
    skill_score: r.skillScore || 5,
    overall_score: r.overallScore || 5,
    comment: r.comment || '',
    tags: r.tags || [],
    reply: r.reply || null,
    reply_by: r.replyBy || null,
    reply_at: r.replyAt ? new Date(r.replyAt).toISOString() : null,
    is_hidden: !!r.isHidden,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  }));
  await upsertMany('reviews', reviews);

  // 5. 队列（每个店一行）
  const queues = shops.map((s: any) => ({
    shop_id: s.id,
    current_number: 0,
    estimated_wait_time: 15,
    updated_at: new Date().toISOString(),
  }));
  await upsertMany('queues', queues, 'shop_id');

  console.log('\n🎉 全部数据导入完成！');
  console.log('👉 下一步建议：');
  console.log('   - 打开 Supabase Dashboard → Table Editor 查看数据');
  console.log('   - 在 .env 中配置 VITE_USE_REAL_API=true，并运行 npm run dev');
  console.log('   - 店铺登录后可以看到刚刚导入的所有客户、预约和评价数据');
};

main().catch((e) => {
  console.error('❌ 导入失败:', e);
  process.exit(1);
});
