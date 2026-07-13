/**
 * 将浏览器 localStorage 导出的 JSON 数据迁移到 Supabase
 *
 * 用法：
 *  1. 先执行 scripts/export-localstorage.js，下载 mbs-localstorage-export-YYYY-MM-DD.json
 *  2. 把 JSON 文件放到项目根目录（或任意位置）
 *  3. 确保 .env 中已配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
 *  4. 执行：
 *       npx tsx scripts/migrate-to-supabase.ts ./mbs-localstorage-export-YYYY-MM-DD.json --confirm
 *
 * 注意：
 *  - 默认会清空目标表后重新写入（避免多次运行产生重复数据）
 *  - 员工默认密码为 123456（与 mock 模式一致）
 *  - 顾客画像、到店记录会从 customers 内嵌字段提取
 *  - 结算明细会从 settlements.items 提取
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';

// Node.js 20 没有原生 WebSocket，需要注入 ws 包
(globalThis as any).WebSocket = WebSocket;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 请在 .env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const exportPath = process.argv[2];
const confirmed = process.argv.includes('--confirm');

if (!exportPath) {
  console.error('❌ 请指定导出文件路径，例如：');
  console.error('   npx tsx scripts/migrate-to-supabase.ts ./mbs-localstorage-export-2026-07-12.json --confirm');
  process.exit(1);
}

if (!confirmed) {
  console.error('⚠️  本脚本会清空 Supabase 中的目标表并重新写入 localStorage 数据。');
  console.error('   如果确认执行，请在命令末尾加上 --confirm');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(exportPath), 'utf-8');
const data = JSON.parse(raw);

const ensureArray = (val: unknown) => (Array.isArray(val) ? val : []);
const toISO = (val: unknown) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  return null;
};

async function truncateTables() {
  console.log('🧹 清空目标表...');
  // 按外键依赖倒序清空
  const tables = [
    'settlement_items',
    'settlements',
    'stored_value_transactions',
    'member_benefit_records',
    'reviews',
    'customer_visit_records',
    'customer_profiles',
    'queues',
    'bookings',
    'customers',
    'employees',
    'shops',
  ];
  for (const table of tables) {
    const pk = table === 'queues' ? 'shop_id' : 'id';
    // 先查出所有主键，再批量删除，避免不同主键类型（text / uuid）导致 neq 比较失败
    const { data: rows, error: selectError } = await supabase.from(table).select(pk);
    if (selectError) {
      console.warn(`   清空 ${table} 失败（无法读取）: ${selectError.message}`);
      continue;
    }
    if (!rows || rows.length === 0) {
      console.log(`   ✓ ${table}（已为空）`);
      continue;
    }
    const ids = rows.map((r: any) => r[pk]);
    // 每次最多删 1000 条
    for (let i = 0; i < ids.length; i += 1000) {
      const batch = ids.slice(i, i + 1000);
      const { error: deleteError } = await supabase.from(table).delete().in(pk, batch);
      if (deleteError) {
        console.warn(`   清空 ${table} 失败: ${deleteError.message}`);
        break;
      }
    }
    console.log(`   ✓ ${table}（清理 ${ids.length} 条）`);
  }
}

async function migrateShops() {
  const shops = ensureArray(data['mbs_shops_cache']);

  // 如果没有店铺数据，创建默认 shop1 并补充默认员工/服务/商品，否则店铺端无法登录
  if (shops.length === 0) {
    console.log('🏪 未找到店铺数据，创建默认店铺 shop1（含员工、服务、商品）');

    const defaultEmployees = [
      { id: 'ceo1', name: '夏总', phone: '13900000100', avatar: '', title: 'CEO/老板', rating: 5.0, specialty: '店铺管理', role: 'ceo', is_active: true },
    ];

    const defaultServices = [
      { id: 's1', name: '精剪', price: 68, duration: 30, description: '专业发型设计' },
      { id: 's2', name: '烫染套餐', price: 388, duration: 120, description: '染发+烫发' },
      { id: 's3', name: '护理', price: 168, duration: 60, description: '深层护理' },
    ];

    const defaultProducts = [
      { id: 'p1', name: '专业防脱洗发水', price: 128, category: 'hair_care', stock: 20 },
      { id: 'p2', name: '深层滋养发膜', price: 168, category: 'hair_care', stock: 15 },
      { id: 'p3', name: '定型喷雾', price: 88, category: 'styling', stock: 30 },
    ];

    const { error } = await supabase.from('shops').upsert(
      {
        id: 'shop1',
        name: '皓诗形象设计',
        description: '专业剪发、烫染护理，让您拥有时尚发型',
        address: '青岛市城阳区流亭街道城中城购物广场2号门',
        phone: '13800138001',
        latitude: 36.2667,
        longitude: 120.4167,
        level: 'excellent',
        is_active: true,
        images: [
          'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&h=300&fit=crop',
        ],
        services: defaultServices,
        employees: defaultEmployees,
        opening_hours: {
          monday: { open: '09:00', close: '21:00', isOpen: true },
          tuesday: { open: '09:00', close: '21:00', isOpen: true },
          wednesday: { open: '09:00', close: '21:00', isOpen: true },
          thursday: { open: '09:00', close: '21:00', isOpen: true },
          friday: { open: '09:00', close: '22:00', isOpen: true },
          saturday: { open: '10:00', close: '22:00', isOpen: true },
          sunday: { open: '10:00', close: '20:00', isOpen: true },
        },
        products: defaultProducts,
        booking_confirm_mode: 'auto',
        rating: 5.0,
        review_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(`默认店铺创建失败：${error.message}`);

    // 同时写入 employees 表，否则登录时查不到
    const { error: empError } = await supabase.from('employees').upsert(
      defaultEmployees.map((emp) => ({
        id: emp.id,
        shop_id: 'shop1',
        name: emp.name,
        phone: emp.phone,
        avatar: emp.avatar,
        title: emp.title,
        rating: emp.rating,
        specialty: emp.specialty,
        role: emp.role,
        password_hash: '123456',
        is_active: emp.is_active,
        created_at: new Date().toISOString(),
      })),
      { onConflict: 'id' }
    );
    if (empError) throw new Error(`默认员工创建失败：${empError.message}`);

    return;
  }

  console.log(`🏪 迁移店铺：${shops.length} 条`);
  const rows = shops.map((shop: any) => ({
    id: shop.id,
    name: shop.name,
    description: shop.description,
    address: shop.address,
    phone: shop.phone,
    latitude: shop.latitude ?? 0,
    longitude: shop.longitude ?? 0,
    level: shop.level ?? 'good',
    is_active: shop.isActive ?? true,
    avatar: shop.avatar,
    images: shop.images ?? [],
    services: shop.services ?? [],
    employees: shop.employees ?? [],
    opening_hours: shop.openingHours ?? {},
    booking_confirm_mode: shop.bookingConfirmMode ?? 'auto',
    rating: shop.rating ?? 5,
    review_count: shop.reviewCount ?? 0,
    products: shop.products ?? [],
    created_at: toISO(shop.createdAt) ?? new Date().toISOString(),
    updated_at: toISO(shop.updatedAt) ?? new Date().toISOString(),
  }));

  const { error } = await supabase.from('shops').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`店铺迁移失败：${error.message}`);

  // 同时把 employees 抽出来写入 employees 表，否则登录找不到人
  const employees: any[] = [];
  shops.forEach((shop: any) => {
    const shopEmployees = ensureArray(shop.employees);
    shopEmployees.forEach((emp: any) => {
      employees.push({
        id: emp.id,
        shop_id: shop.id,
        name: emp.name,
        phone: emp.phone,
        avatar: emp.avatar,
        title: emp.title,
        rating: emp.rating ?? 5,
        specialty: emp.specialty,
        role: emp.role || 'stylist',
        password_hash: '123456',
        is_active: emp.isActive !== false,
        created_at: toISO(emp.createdAt) ?? new Date().toISOString(),
      });
    });
  });

  if (employees.length) {
    console.log(`👔 迁移员工：${employees.length} 条`);
    const { error: empError } = await supabase.from('employees').upsert(employees, { onConflict: 'id' });
    if (empError) throw new Error(`员工迁移失败：${empError.message}`);
  }
}

async function migrateCustomers() {
  const customers = ensureArray(data['mbs_customers_cache']);
  if (!customers.length) return;

  console.log(`👥 迁移客户：${customers.length} 条`);
  const rows = customers.map((c: any) => ({
    id: c.id,
    shop_id: c.shopId || 'shop1',
    name: c.name,
    phone: c.phone,
    gender: c.gender,
    age: c.age,
    avatar: c.avatar,
    tags: c.tags ?? [],
    visit_count: c.visitCount ?? 0,
    total_spent: c.totalSpent ?? 0,
    membership_level: c.membershipLevel ?? 'regular',
    balance: c.balance ?? 0,
    points: c.points ?? 0,
    birthday: c.birthday,
    preferences: c.preferences ?? [],
    is_stockholder: c.isStockholder ?? false,
    stockholder_since: toISO(c.stockholderSince),
    referral_bonus_rate: c.referralBonusRate ?? 0,
    referral_earnings: c.referralEarnings ?? 0,
    served_by_stylist_ids: c.servedByStylistIds ?? [],
    source: c.source,
    created_at: toISO(c.joinedAt || c.createdAt) ?? new Date().toISOString(),
    last_visit_at: toISO(c.lastVisitAt),
    purchase_vip_level: c.purchaseVIPLevel ?? 'regular',
    purchase_vip_expires_at: toISO(c.purchaseVIPExpiresAt),
    stored_value_level: c.storedValueLevel ?? 'none',
    stored_value_balance: c.storedValueBalance ?? 0,
    stored_value_expires_at: toISO(c.storedValueExpiresAt),
    withdrawable_referral_amount: c.withdrawableReferralAmount ?? 0,
    total_saved: c.totalSaved ?? 0,
    wechat: c.wechat,
    id_card_number: c.idCardNumber,
    hobbies: c.hobbies,
    is_referred: c.isReferred ?? false,
    referrer_name: c.referrerName,
    referrer_phone: c.referrerPhone,
    referral_consumption: c.referralConsumption ?? 0,
    shared_fund: c.sharedFund ?? 0,
    total_shared_fund: c.totalSharedFund ?? 0,
    withdrawable_amount: c.withdrawableAmount ?? 0,
    has_booking: c.hasBooking ?? false,
    last_service_items: c.lastServiceItems ?? [],
    is_member: c.isMember ?? false,
    has_recharged: c.hasRecharged ?? false,
    recharge_level: c.rechargeLevel,
  }));

  const { error } = await supabase.from('customers').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`客户迁移失败：${error.message}`);

  // 迁移客户画像
  const profiles: any[] = [];
  customers.forEach((c: any) => {
    if (!c.profile) return;
    profiles.push({
      id: c.profile.id,
      customer_id: c.id,
      updated_by: c.profile.updatedBy,
      updated_by_name: c.profile.updatedByName,
      haircut_styles: c.profile.haircutStyles ?? [],
      hair_colors: c.profile.hairColors ?? [],
      perm_colors: c.profile.permColors ?? [],
      treatments: c.profile.treatments ?? [],
      hair_type: c.profile.hairType,
      hair_length: c.profile.hairLength,
      visit_frequency: c.profile.visitFrequency,
      budget_range: c.profile.budgetRange,
      communication_style: c.profile.communicationStyle,
      extra_services: c.profile.extraServices ?? [],
      visit_times: c.profile.visitTimes ?? [],
      notes: c.profile.notes,
      allergies: c.profile.allergies,
      products_used: c.profile.productsUsed ?? [],
      created_at: toISO(c.profile.createdAt) ?? new Date().toISOString(),
      updated_at: toISO(c.profile.updatedAt) ?? new Date().toISOString(),
    });
  });
  if (profiles.length) {
    console.log(`📝 迁移客户画像：${profiles.length} 条`);
    const { error: pError } = await supabase.from('customer_profiles').upsert(profiles, { onConflict: 'id' });
    if (pError) throw new Error(`客户画像迁移失败：${pError.message}`);
  }

  // 迁移到店记录
  const visitRecords: any[] = [];
  customers.forEach((c: any) => {
    ensureArray(c.visitRecords).forEach((vr: any) => {
      visitRecords.push({
        id: vr.id,
        customer_id: c.id,
        shop_id: vr.shopId || c.shopId || 'shop1',
        booking_id: vr.bookingId,
        stylist_id: vr.stylistId,
        stylist_name: vr.stylistName,
        service_ids: vr.serviceIds ?? [],
        service_names: vr.serviceNames ?? [],
        products: vr.products ?? [],
        total_amount: vr.totalAmount ?? 0,
        payment_method: vr.paymentMethod,
        check_in_time: toISO(vr.checkInTime),
        check_out_time: toISO(vr.checkOutTime),
        notes: vr.notes,
        created_at: toISO(vr.createdAt) ?? new Date().toISOString(),
      });
    });
  });
  if (visitRecords.length) {
    console.log(`📋 迁移到店记录：${visitRecords.length} 条`);
    const { error: vrError } = await supabase.from('customer_visit_records').upsert(visitRecords, { onConflict: 'id' });
    if (vrError) throw new Error(`到店记录迁移失败：${vrError.message}`);
  }
}

async function migrateBookings() {
  const bookings = ensureArray(data['mbs_bookings_cache']);
  if (!bookings.length) return;

  console.log(`📅 迁移预约：${bookings.length} 条`);
  const rows = bookings.map((b: any) => ({
    id: b.id,
    shop_id: b.shopId || 'shop1',
    customer_id: b.customerId,
    customer_name: b.customerName,
    customer_phone: b.customerPhone,
    stylist_id: b.stylistId || b.barberId,
    stylist_name: b.stylistName || b.barberName,
    service_id: b.serviceId,
    service_name: b.serviceName,
    price: b.price ?? 0,
    scheduled_time: toISO(b.scheduledTime || b.date) ?? new Date().toISOString(),
    queue_number: b.queueNumber,
    status: b.status ?? 'pending',
    notes: b.notes,
    created_at: toISO(b.createdAt) ?? new Date().toISOString(),
  }));

  const { error } = await supabase.from('bookings').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`预约迁移失败：${error.message}`);
}

async function migrateSettlements() {
  const settlements = ensureArray(data['mbs_settlements_cache']);
  if (!settlements.length) return;

  console.log(`💰 迁移结算：${settlements.length} 条`);
  const rows = settlements.map((s: any) => ({
    id: s.id,
    shop_id: s.shopId || 'shop1',
    customer_id: s.customerId,
    customer_name: s.customerName,
    booking_id: s.bookingId,
    subtotal: s.subtotal ?? 0,
    discount: s.discount ?? 0,
    tax: s.tax ?? 0,
    total: s.total ?? 0,
    payment_method: s.paymentMethod,
    payment_status: s.paymentStatus ?? 'completed',
    used_benefit_ids: s.usedBenefitIds ?? [],
    discount_detail: s.discountDetail ?? {},
    created_at: toISO(s.createdAt) ?? new Date().toISOString(),
    processed_by: s.processedBy,
    processed_by_name: s.processedByName,
  }));

  const { error } = await supabase.from('settlements').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`结算迁移失败：${error.message}`);

  // 迁移结算明细
  const items: any[] = [];
  settlements.forEach((s: any) => {
    ensureArray(s.items).forEach((item: any, idx: number) => {
      items.push({
        id: item.uuid || `${s.id}_item_${idx}`,
        settlement_id: s.id,
        type: item.type,
        item_id: item.id || item.itemId,
        name: item.name,
        original_price: item.originalPrice ?? 0,
        quantity: item.quantity ?? 1,
        discounted_price: item.discountedPrice ?? item.originalPrice ?? 0,
        total: item.total ?? 0,
        category: item.category,
      });
    });
  });
  if (items.length) {
    console.log(`🧾 迁移结算明细：${items.length} 条`);
    const { error: iError } = await supabase.from('settlement_items').upsert(items, { onConflict: 'id' });
    if (iError) throw new Error(`结算明细迁移失败：${iError.message}`);
  }
}

async function migrateBenefits() {
  const benefits = ensureArray(data['mbs_benefits_cache']);
  if (!benefits.length) return;

  console.log(`🎁 迁移会员权益：${benefits.length} 条`);
  const rows = benefits.map((b: any) => ({
    id: b.id,
    shop_id: b.shopId || 'shop1',
    customer_id: b.customerId,
    type: b.type,
    name: b.name,
    description: b.description,
    status: b.status ?? 'available',
    granted_at: toISO(b.grantedAt),
    granted_by: b.grantedBy,
    granted_by_name: b.grantedByName,
    used_at: toISO(b.usedAt),
    used_by: b.usedBy,
    used_by_name: b.usedByName,
    used_order_id: b.usedOrderId,
    expires_at: toISO(b.expiresAt),
    created_at: toISO(b.createdAt) ?? new Date().toISOString(),
  }));

  const { error } = await supabase.from('member_benefit_records').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`会员权益迁移失败：${error.message}`);
}

async function migrateQueues() {
  const queues = ensureArray(data['mbs_queues_cache']);
  if (!queues.length) return;

  console.log(`⏳ 迁移排队队列：${queues.length} 条`);
  const rows = queues.map((q: any) => ({
    shop_id: q.shopId || q.id,
    current_number: q.currentNumber ?? 0,
    estimated_wait_time: q.estimatedWaitTime ?? 15,
    updated_at: toISO(q.updatedAt) ?? new Date().toISOString(),
  }));

  const { error } = await supabase.from('queues').upsert(rows, { onConflict: 'shop_id' });
  if (error) throw new Error(`队列迁移失败：${error.message}`);
}

async function migrateReviews() {
  const reviews = ensureArray(data['mbs_reviews_cache']);
  if (!reviews.length) return;

  console.log(`⭐ 迁移评价：${reviews.length} 条`);
  const rows = reviews.map((r: any) => ({
    id: r.id,
    shop_id: r.shopId || 'shop1',
    customer_id: r.customerId,
    customer_name: r.customerName,
    booking_id: r.bookingId,
    type: r.type,
    stylist_id: r.stylistId,
    stylist_name: r.stylistName,
    service_name: r.serviceName,
    rating: r.rating,
    service_score: r.serviceScore,
    price_score: r.priceScore,
    skill_score: r.skillScore,
    overall_score: r.overallScore,
    comment: r.comment,
    tags: r.tags ?? [],
    reply: r.reply,
    reply_by: r.replyBy,
    reply_at: toISO(r.replyAt),
    is_hidden: r.isHidden ?? false,
    created_at: toISO(r.createdAt) ?? new Date().toISOString(),
  }));

  const { error } = await supabase.from('reviews').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`评价迁移失败：${error.message}`);
}

async function main() {
  console.log('🚀 开始迁移 localStorage 数据到 Supabase');
  console.log(`   导出文件：${path.resolve(exportPath)}`);
  console.log(`   Supabase：${supabaseUrl}`);

  await truncateTables();
  await migrateShops();
  await migrateCustomers();
  await migrateBookings();
  await migrateSettlements();
  await migrateBenefits();
  await migrateQueues();
  await migrateReviews();

  console.log('✅ 迁移完成');
}

main().catch((err) => {
  console.error('❌ 迁移失败：', err.message);
  process.exit(1);
});
