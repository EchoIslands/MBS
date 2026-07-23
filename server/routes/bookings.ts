import { Router, Request, Response } from 'express';
import { mockBookings, mockShops, mockCustomers } from '../_internal/mockData.js';

const router = Router();

// ==================== 股东权益内存存储（实际项目应使用数据库）====================
declare global {
  var __stockholderBenefitRecordsDb: Map<string, Record<string, unknown>> | undefined;
  var __stockholderFreeServiceUsageDb: Map<string, Record<string, unknown>> | undefined;
}
const stockholderBenefitRecordsDb: Map<string, Record<string, unknown>> =
  globalThis.__stockholderBenefitRecordsDb || (globalThis.__stockholderBenefitRecordsDb = new Map());
const stockholderFreeServiceUsageDb: Map<string, Record<string, unknown>> =
  globalThis.__stockholderFreeServiceUsageDb || (globalThis.__stockholderFreeServiceUsageDb = new Map());

// ==================== 股东权益计算（与 shared/lib/membership.ts 保持一致）====================

function isActiveStockholder(customer: any): boolean {
  return !!customer?.isStockholder;
}

function getEffectiveStockholderConfig(shop: any): any {
  if (shop?.stockholderConfig) {
    return shop.stockholderConfig;
  }
  return {
    enabled: true,
    serviceDiscountRate: 0.8,
    productDiscountRate: 0.85,
    cashbackRate: 0.05,
    freeServicesPerMonth: 1,
    priorityBooking: true,
    birthdayGift: '生日当月免费护理一次',
  };
}

function calcStockholderCashback(totalAmount: number, customer: any, shop: any): number {
  if (!isActiveStockholder(customer)) return 0;
  const config = getEffectiveStockholderConfig(shop);
  if (!config.enabled || config.cashbackRate <= 0) return 0;
  return Math.round(totalAmount * config.cashbackRate * 100) / 100;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 检查是否已针对该预约发放过股东返现（幂等性保护）
 */
function hasCashbackGrantedForBooking(bookingId: string): boolean {
  for (const record of stockholderBenefitRecordsDb.values()) {
    if (record.type === 'cashback' && record.source_booking_id === bookingId) {
      return true;
    }
  }
  return false;
}

/**
 * 预约完成时自动发放股东权益
 * 三方协同：计算逻辑与 H5/小程序 shared/lib/membership.ts 完全一致
 */
function processStockholderBenefitsOnComplete(booking: BookingRecord) {
  const customer = mockCustomers.find((c: any) => c.id === booking.customer_id);
  const shop = mockShops.find((s: any) => s.id === booking.shop_id);
  if (!customer || !shop) return;

  if (!isActiveStockholder(customer)) return;

  const config = getEffectiveStockholderConfig(shop);
  if (!config.enabled) return;

  // 幂等性保护：若该预约已发放过返现，则跳过
  if (hasCashbackGrantedForBooking(booking.id)) {
    console.log(`[股东权益] 预约 ${booking.id} 已发放过返现，跳过`);
    return;
  }

  // 1. 消费返现 -> 可提现余额（D专家建议：返现到可提现余额）
  const cashbackAmount = calcStockholderCashback(booking.price, customer, shop);
  if (cashbackAmount > 0) {
    // 写入权益记录表（内存模拟）
    const recordId = generateId();
    stockholderBenefitRecordsDb.set(recordId, {
      id: recordId,
      shop_id: booking.shop_id,
      customer_id: booking.customer_id,
      type: 'cashback',
      amount: cashbackAmount,
      source_booking_id: booking.id,
      status: 'granted',
      granted_at: new Date().toISOString(),
      expires_at: null,
      notified_at: null,
    });

    // 更新客户可提现余额（优先 withdrawableReferralAmount，兼容旧字段）
    const oldWithdrawable =
      (customer as any).withdrawableReferralAmount ??
      (customer as any).withdrawableAmount ??
      customer.referralEarnings ??
      0;
    const newWithdrawable = Math.round((oldWithdrawable + cashbackAmount) * 100) / 100;
    (customer as any).withdrawableReferralAmount = newWithdrawable;
    (customer as any).withdrawableAmount = newWithdrawable;
    customer.referralEarnings = newWithdrawable;

    // 站内通知占位（后续可替换为微信模板消息或短信）
    console.log(
      `[股东权益通知占位] 客户 ${customer.name} 获得消费返现 ${cashbackAmount} 元，已计入可提现余额`
    );
  }

  // 2. 免费服务使用记录（自然月重置，D专家建议）
  // 注意：当前预约数据结构未标记"是否使用免费服务"，此处预留框架。
  // 实际使用时，应在预约创建/结算时传入 useFreeService 标记。
  // 若本次服务使用了免费额度，则扣除当月配额：
  // const yearMonth = getCurrentYearMonth();
  // const usageKey = `${booking.shop_id}_${booking.customer_id}_${yearMonth}`;
  // ...
}

interface BookingRecord {
  id: string;
  shop_id: string;
  customer_id: string;
  customer_name: string;
  stylist_id: string;
  stylist_name: string;
  service_id: string;
  service_name: string;
  price: number;
  scheduled_time: string;
  queue_number: number;
  status: string;
  notes: string;
  created_at: string;
  updated_at?: string;
}

// 使用 global 对象确保 bookingsDb 在模块多次加载时保持单例
declare global {
  var __bookingsDb: Map<string, BookingRecord> | undefined;
}
const bookingsDb: Map<string, BookingRecord> = globalThis.__bookingsDb || (globalThis.__bookingsDb = new Map<string, BookingRecord>());

const generateId = () => Math.random().toString(36).substr(2, 9);

const bookingFromDb = (b: BookingRecord) => ({
  id: b.id,
  shopId: b.shop_id,
  customerId: b.customer_id,
  customerName: b.customer_name,
  stylistId: b.stylist_id,
  stylistName: b.stylist_name,
  serviceId: b.service_id,
  serviceName: b.service_name,
  price: b.price,
  scheduledTime: b.scheduled_time,
  queueNumber: b.queue_number,
  status: b.status,
  notes: b.notes,
  createdAt: b.created_at,
});

interface ServiceLike {
  id: string;
  name: string;
  price: number;
}

interface ShopLike {
  id: string;
  services?: ServiceLike[];
}

// 创建预约
router.post('/', async (req: Request, res: Response) => {
  console.log('=== POST /api/bookings called ===');
  console.log('req.body:', req.body);
  // 兼容前端可能传入的字段名（barberId/stylistId 等）
  const { shopId, customerId, serviceId, scheduledTime, notes } = req.body;
  const barberId = req.body.barberId || req.body.stylistId;
  const barberName = req.body.barberName || req.body.stylistName;
  const customerName = req.body.customerName;

  const shop = mockShops.find((s: unknown) => (s as ShopLike).id === shopId) as ShopLike | undefined;
  const service = shop?.services?.find((s) => s.id === serviceId);

  // 从本地存储获取该店铺的预约数据
  let countFromDb = 0;
  bookingsDb.forEach((b) => {
    if (b.shop_id === shopId) countFromDb++;
  });

  // 处理 scheduledTime：验证时间是否有效且未来时间
  if (!scheduledTime) {
    console.error('错误：scheduledTime 为空');
    return res.status(400).json({ message: '预约时间不能为空' });
  }

  let scheduledTimeDate: Date;
  try {
    scheduledTimeDate = scheduledTime instanceof Date
      ? scheduledTime
      : new Date(scheduledTime);
    // 检查是否有效日期
    if (isNaN(scheduledTimeDate.getTime())) {
      console.error('错误：scheduledTime 无效:', scheduledTime);
      return res.status(400).json({ message: '预约时间格式无效' });
    }
  } catch (e) {
    console.error('错误：scheduledTime 解析失败:', scheduledTime, e);
    return res.status(400).json({ message: '预约时间解析失败' });
  }

  // 检查时间是否是未来时间（允许当前时间之后的预约）
  const now = new Date();
  if (scheduledTimeDate < now) {
    console.error('错误：scheduledTime 已是过去时间:', scheduledTimeDate.toISOString(), 'now:', now.toISOString());
    return res.status(400).json({ message: '预约时间不能是过去时间' });
  }

  console.log('已解析 Parsed scheduledTime:', scheduledTimeDate.toISOString());

  const newBooking: BookingRecord = {
    id: generateId(),
    shop_id: shopId,
    customer_id: customerId,
    customer_name: customerName || '顾客',
    stylist_id: barberId,
    stylist_name: barberName || service?.name || '发型师',
    service_id: serviceId,
    service_name: service?.name || '服务',
    price: service?.price || 0,
    scheduled_time: scheduledTimeDate.toISOString(),
    queue_number: countFromDb + 1,
    status: 'confirmed',
    notes: notes || '',
    created_at: new Date().toISOString(),
  };

  // 直接存储到本地 Map
  bookingsDb.set(newBooking.id, newBooking);
  console.log('bookingsDb.set:', newBooking.id, 'total:', bookingsDb.size);
  console.log('返回预约 scheduledTime:', newBooking.scheduled_time);

  res.status(201).json(bookingFromDb(newBooking));
});

// 预约列表筛选 API
router.get('/', async (req: Request, res: Response) => {
  try {
    const shopId = String(req.query.shopId || 'shop1');
    const status = req.query.status as string | undefined;
    const stylistId = req.query.stylistId as string | undefined;
    const customerId = req.query.customerId as string | undefined;
    let dateStart = req.query.dateStart as string | undefined;
    let dateEnd = req.query.dateEnd as string | undefined;
    // 兼容小程序/H5 按日期筛选（如 getBookingsByShop 传入 date=YYYY-MM-DD）
    const date = req.query.date as string | undefined;
    if (date && !dateStart && !dateEnd) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        dateStart = date;
        // 让下方统一逻辑处理 +1 天作为排他边界
        dateEnd = date;
      }
    }
    // H5 getBookingsByShop 只传 dateStart（选定日期），语义为查询当天，补齐 dateEnd
    if (dateStart && !dateEnd && /^\d{4}-\d{2}-\d{2}$/.test(dateStart)) {
      const d = new Date(dateStart);
      if (!isNaN(d.getTime())) {
        dateEnd = dateStart;
      }
    }
    const page = String(req.query.page || '1');
    const pageSize = String(req.query.pageSize || '20');
    const sortBy = String(req.query.sortBy || 'scheduledTime');
    const sortOrder = String(req.query.sortOrder || 'desc');

    // 从本地 Map 获取该店铺的预约
    const dbBookings: BookingRecord[] = [];
    bookingsDb.forEach((b) => {
      if (b.shop_id === shopId) {
        dbBookings.push(b);
      }
    });
    let bookings = dbBookings.map(bookingFromDb);

    if (bookings.length === 0) {
      bookings = mockBookings.filter((b: unknown) => !shopId || (b as Record<string, unknown>).shopId === shopId);
    }

    if (status && status !== 'all') {
      bookings = bookings.filter((b) => (b as Record<string, unknown>).status === status);
    }

    if (stylistId) {
      bookings = bookings.filter((b) => (b as Record<string, unknown>).stylistId === stylistId);
    }

    if (customerId) {
      bookings = bookings.filter((b) => (b as Record<string, unknown>).customerId === customerId);
    }

    if (dateStart) {
      const startDate = new Date(dateStart);
      bookings = bookings.filter((b) => {
        const bookingDate = new Date((b as Record<string, unknown>).scheduledTime || (b as Record<string, unknown>).scheduled_time as string);
        return bookingDate >= startDate;
      });
    }

    if (dateEnd) {
      const endDate = new Date(dateEnd);
      endDate.setDate(endDate.getDate() + 1);
      bookings = bookings.filter((b) => {
        const bookingDate = new Date((b as Record<string, unknown>).scheduledTime || (b as Record<string, unknown>).scheduled_time as string);
        return bookingDate < endDate;
      });
    }

    bookings.sort((a, b) => {
      const recordA = a as Record<string, unknown>;
      const recordB = b as Record<string, unknown>;
      const fieldA = recordA[sortBy] || recordA[sortBy.replace(/([A-Z])/g, '_$1').toLowerCase()];
      const fieldB = recordB[sortBy] || recordB[sortBy.replace(/([A-Z])/g, '_$1').toLowerCase()];
      if (sortOrder === 'asc') {
        return fieldA > fieldB ? 1 : -1;
      }
      return fieldA < fieldB ? 1 : -1;
    });

    const pageNum = parseInt(page, 10);
    const size = parseInt(pageSize, 10);
    const total = bookings.length;
    const totalPages = Math.ceil(total / size);
    const offset = (pageNum - 1) * size;
    const paginatedBookings = bookings.slice(offset, offset + size);

    res.json({
      success: true,
      data: paginatedBookings,
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        totalPages,
      },
    });
  } catch (_error) {
    res.status(500).json({
      success: false,
      error: '获取预约列表失败',
    });
  }
});

// 获取预约详情
router.get('/:id', async (req: Request, res: Response) => {
  console.log('=== GET /api/bookings/:id called ===');
  console.log('req.params.id:', req.params.id, 'type:', typeof req.params.id);
  console.log('bookingsDb.size:', bookingsDb.size);
  console.log('bookingsDb keys:', Array.from(bookingsDb.keys()));

  // 直接从本地 Map 获取
  const dbBooking = bookingsDb.get(req.params.id) || null;
  console.log('dbBooking from Map:', dbBooking);
  if (dbBooking) {
    res.json(bookingFromDb(dbBooking));
    return;
  }
  const booking = mockBookings.find((b: unknown) => (b as Record<string, unknown>).id === req.params.id);
  console.log('mock booking:', booking);
  if (!booking) {
    return res.status(404).json({ message: '预约不存在' });
  }
  res.json(booking);
});

// 更新预约状态
router.put('/:id', async (req: Request, res: Response) => {
  const { status } = req.body;

  const existing = bookingsDb.get(req.params.id);
  if (existing) {
    const updated = { ...existing, status, updated_at: new Date().toISOString() };
    bookingsDb.set(req.params.id, updated);

    // 预约完成时自动发放股东权益
    if (status === 'completed' && existing.status !== 'completed') {
      processStockholderBenefitsOnComplete(updated);
    }

    res.json(bookingFromDb(updated));
    return;
  }

  const idx = mockBookings.findIndex((b: unknown) => (b as Record<string, unknown>).id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: '预约不存在' });
  }
  const oldStatus = mockBookings[idx].status;
  mockBookings[idx] = { ...mockBookings[idx], status } as typeof mockBookings[0];

  // 预约完成时自动发放股东权益
  if (status === 'completed' && oldStatus !== 'completed') {
    processStockholderBenefitsOnComplete(mockBookings[idx] as unknown as BookingRecord);
  }

  res.json(mockBookings[idx]);
});

// 顾客取消预约（与 H5 顾客端保持一致，不经过 authMiddleware）
router.put('/:id/cancel', async (req: Request, res: Response) => {
  const { customerId } = req.body;
  if (!customerId) {
    return res.status(400).json({ message: '缺少 customerId' });
  }

  const existing = bookingsDb.get(req.params.id);
  if (existing) {
    if (existing.customer_id !== customerId) {
      return res.status(403).json({ message: '无权取消该预约' });
    }
    if (existing.status === 'cancelled') {
      return res.status(400).json({ message: '预约已取消' });
    }
    const updated = { ...existing, status: 'cancelled', updated_at: new Date().toISOString() };
    bookingsDb.set(req.params.id, updated);
    return res.json(bookingFromDb(updated));
  }

  const idx = mockBookings.findIndex((b: unknown) => (b as Record<string, unknown>).id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: '预约不存在' });
  }
  const booking = mockBookings[idx] as unknown as Record<string, unknown>;
  if (booking.customerId !== customerId) {
    return res.status(403).json({ message: '无权取消该预约' });
  }
  if (booking.status === 'cancelled') {
    return res.status(400).json({ message: '预约已取消' });
  }
  mockBookings[idx] = { ...mockBookings[idx], status: 'cancelled' } as typeof mockBookings[0];
  return res.json(mockBookings[idx]);
});

// 获取顾客的预约
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  const dbBookings: BookingRecord[] = [];
  bookingsDb.forEach((b) => {
    if (b.customer_id === req.params.customerId) {
      dbBookings.push(b);
    }
  });
  if (dbBookings.length > 0) {
    res.json(dbBookings.map(bookingFromDb));
    return;
  }
  const bookings = mockBookings.filter((b: unknown) => (b as Record<string, unknown>).customerId === req.params.customerId);
  res.json(bookings);
});

export default router;
