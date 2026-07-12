// 数据导入脚本：把 mockData.ts 中的演示数据导入到 Supabase
// 用法：npm run seed-db  或  npx tsx scripts/seed-db.ts
// 前置条件：在 .env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import 'dotenv/config';

import {
  mockShops,
  mockBookings,
  mockCustomers,
  mockReviews,
} from '../shared/mockData';

const require = createRequire(import.meta.url);

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 请先在 .env 文件中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 加载 ws 传输（Node.js 20 需要）
let wsTransport: unknown = undefined;
try {
  wsTransport = require('ws');
} catch (_e) {
  console.warn('⚠️ 未安装 ws 包，请执行: npm install ws');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: wsTransport },
});

const upsertMany = async (table: string, rows: unknown[], conflict = 'id') => {
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
  const shops = mockShops.map((s: unknown) => ({
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
    services: (s as unknown).services || [],
    created_at: new Date().toISOString(),
  }));
  await upsertMany('shops', shops);

  // 2. 员工（按 id 去重，避免多店铺共用 ID 导致 upsert 冲突）
  const employeeMap = new Map<string, unknown>();
  for (const s of mockShops) {
    for (const e of (s as unknown).employees || []) {
      if (!employeeMap.has(e.id)) {
        employeeMap.set(e.id, {
          id: e.id,
          shop_id: s.id,
          name: e.name,
          phone: e.phone || '',
          avatar: e.avatar || null,
          title: e.title || '',
          rating: e.rating || 5.0,
          specialty: e.specialty || '',
          role: e.role || 'stylist',
          password_hash: '123456',
          is_active: true,
          created_at: new Date().toISOString(),
        });
      }
    }
  }
  await upsertMany('employees', Array.from(employeeMap.values()));

  // 3. 客户
  const customers = mockCustomers.map((c: unknown) => ({
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
    purchase_vip_level: c.purchaseVIPLevel || 'regular',
    purchase_vip_expires_at: c.purchaseVIPExpiresAt ? new Date(c.purchaseVIPExpiresAt).toISOString() : null,
    stored_value_level: c.storedValueLevel || 'none',
    stored_value_balance: c.storedValueBalance || 0,
    stored_value_expires_at: c.storedValueExpiresAt ? new Date(c.storedValueExpiresAt).toISOString() : null,
    withdrawable_referral_amount: c.withdrawableReferralAmount || 0,
    total_saved: c.totalSaved || 0,
    wechat: c.wechat || null,
    id_card_number: c.idCardNumber || null,
    hobbies: c.hobbies || null,
    is_referred: !!c.isReferred,
    referrer_name: c.referrerName || null,
    referrer_phone: c.referrerPhone || null,
    referral_consumption: c.referralConsumption || 0,
    shared_fund: c.sharedFund || 0,
    total_shared_fund: c.totalSharedFund || 0,
    withdrawable_amount: c.withdrawableAmount || 0,
    has_booking: !!c.hasBooking,
    last_service_items: c.lastServiceItems || [],
    is_member: c.purchaseVIPLevel !== 'regular' || c.storedValueLevel !== 'none',
    has_recharged: c.storedValueLevel !== 'none',
    recharge_level: c.rechargeLevel || '',
  }));
  await upsertMany('customers', customers);

  // 3.1 客户画像
  const profiles = mockCustomers
    .filter((c: unknown) => c.profile)
    .map((c: unknown) => {
      const p = c.profile;
      return {
        id: p.id || `profile_${c.id}`,
        customer_id: c.id,
        updated_by: p.updatedBy || null,
        updated_by_name: p.updatedByName || null,
        haircut_styles: p.haircutStyles || [],
        hair_colors: p.hairColors || [],
        perm_colors: p.permColors || [],
        treatments: p.treatments || [],
        hair_type: p.hairType || null,
        hair_length: p.hairLength || null,
        visit_frequency: p.visitFrequency || null,
        budget_range: p.budgetRange || null,
        communication_style: p.communicationStyle || null,
        extra_services: p.extraServices || [],
        visit_times: p.visitTimes || [],
        notes: p.notes || null,
        allergies: p.allergies || null,
        products_used: p.productsUsed || [],
        created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
        updated_at: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
      };
    });
  await upsertMany('customer_profiles', profiles);

  // 3.2 客户到店记录
  // 先收集 mockBookings 中存在的 booking id，避免外键约束失败
  const validBookingIds = new Set((mockBookings || []).map((b: unknown) => b.id));
  const visitRecords = mockCustomers
    .flatMap((c: unknown) => (c.visitRecords || []).map((v: unknown) => ({ ...v, customerId: c.id, shopId: c.shopId || 'shop1' })))
    .map((v: unknown) => ({
      id: v.id || `vr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      customer_id: v.customerId,
      shop_id: v.shopId,
      booking_id: v.bookingId && validBookingIds.has(v.bookingId) ? v.bookingId : null,
      stylist_id: v.stylistId || null,
      stylist_name: v.stylistName || null,
      service_ids: v.serviceIds || [],
      service_names: v.serviceNames || [],
      products: v.products || [],
      total_amount: v.totalAmount || 0,
      payment_method: v.paymentMethod || null,
      check_in_time: v.checkInTime ? new Date(v.checkInTime).toISOString() : null,
      check_out_time: v.checkOutTime ? new Date(v.checkOutTime).toISOString() : null,
      notes: v.notes || null,
      created_at: v.createdAt ? new Date(v.createdAt).toISOString() : new Date().toISOString(),
    }));
  await upsertMany('customer_visit_records', visitRecords);

  // 4. 预约
  const bookings = mockBookings.map((b: unknown) => ({
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

  // 5. 评价
  const reviews = mockReviews.map((r: unknown) => ({
    id: r.id,
    shop_id: r.shopId,
    customer_id: r.customerId,
    customer_name: r.customerName || '顾客',
    booking_id: r.bookingId || null,
    type: r.type || 'shop',
    stylist_id: r.stylistId || null,
    stylist_name: r.stylistName || '',
    service_name: r.serviceName || '',
    rating: Math.round(r.rating || r.overallScore || 5),
    service_score: Math.round(r.serviceScore || 5),
    price_score: Math.round(r.priceScore || 5),
    skill_score: Math.round(r.skillScore || 5),
    overall_score: Math.round(r.overallScore || 5),
    comment: r.comment || '',
    tags: r.tags || [],
    reply: r.reply || null,
    reply_by: r.replyBy || null,
    reply_at: r.replyAt ? new Date(r.replyAt).toISOString() : null,
    is_hidden: !!r.isHidden,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  }));
  await upsertMany('reviews', reviews);

  // 6. 队列（每个店一行）
  const queues = shops.map((s: unknown) => ({
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
