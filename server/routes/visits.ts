import { Router, Request, Response } from 'express';
import { mockCustomers, mockShops, mockBookings } from '../_internal/mockData.js';
import { CustomerVisitRecord } from '../_internal/types.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 存储到店记录（内存存储，实际项目中应该用数据库）
const visitRecords: CustomerVisitRecord[] = [];

// ==================== 股东权益内存存储（与 bookings.ts 共享单例）====================
declare global {
  var __stockholderBenefitRecordsDb: Map<string, Record<string, unknown>> | undefined;
}
const stockholderBenefitRecordsDb: Map<string, Record<string, unknown>> =
  globalThis.__stockholderBenefitRecordsDb || (globalThis.__stockholderBenefitRecordsDb = new Map());

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
 * 离店结算时自动发放股东权益
 * 三方协同：计算逻辑与 H5/小程序 shared/lib/membership.ts 完全一致
 */
function processStockholderBenefitsOnCheckout(record: CustomerVisitRecord) {
  const customer = mockCustomers.find((c: any) => c.id === record.customerId);
  const shop = mockShops.find((s: any) => s.id === record.shopId);
  if (!customer || !shop) return;

  if (!isActiveStockholder(customer)) return;

  const config = getEffectiveStockholderConfig(shop);
  if (!config.enabled) return;

  // 幂等性保护：若该预约/到店记录已发放过返现，则跳过
  const idempotencyKey = record.bookingId || record.id;
  if (hasCashbackGrantedForBooking(idempotencyKey)) {
    console.log(`[股东权益] 记录 ${idempotencyKey} 已发放过返现，跳过`);
    return;
  }

  // 消费返现 -> 可提现余额（D专家建议：返现到可提现余额）
  const cashbackAmount = calcStockholderCashback(record.totalAmount, customer, shop);
  if (cashbackAmount > 0) {
    const benefitId = generateId();
    stockholderBenefitRecordsDb.set(benefitId, {
      id: benefitId,
      shop_id: record.shopId,
      customer_id: record.customerId,
      type: 'cashback',
      amount: cashbackAmount,
      source_booking_id: idempotencyKey,
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
      `[股东权益通知占位] 客户 ${customer.name} 离店结算获得返现 ${cashbackAmount} 元，已计入可提现余额`
    );
  }
}

// ==================== 到店记录 API ====================

// 客户到店打卡（check-in）
router.post('/checkin', (req: Request, res: Response) => {
  const { customerId, shopId, bookingId, stylistId, stylistName } = req.body;

  // 验证必填字段
  if (!customerId || !shopId) {
    return res.status(400).json({ success: false, error: '客户ID和店铺ID为必填项' });
  }

  // 验证客户存在
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  // 验证店铺存在
  const shop = mockShops.find((s) => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ success: false, error: '店铺不存在' });
  }

  // 如果有预约ID，验证预约存在
  if (bookingId) {
    const booking = mockBookings.find((b) => b.id === bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: '预约不存在' });
    }
    // 检查预约是否属于该客户
    if (booking.customerId !== customerId) {
      return res.status(400).json({ success: false, error: '预约不属于该客户' });
    }
  }

  const visitRecord: CustomerVisitRecord = {
    id: generateId(),
    customerId,
    shopId,
    bookingId,
    stylistId,
    stylistName,
    serviceIds: [],
    serviceNames: [],
    totalAmount: 0,
    checkInTime: new Date(),
    createdAt: new Date(),
  };

  visitRecords.push(visitRecord);

  res.status(201).json({ success: true, data: visitRecord });
});

// 客户离店结算（check-out）
router.post('/checkout', (req: Request, res: Response) => {
  const { visitId, serviceIds, serviceNames, products, totalAmount, paymentMethod, notes } = req.body;

  // 验证必填字段
  if (!visitId) {
    return res.status(400).json({ success: false, error: '到店记录ID为必填项' });
  }

  // 查找到店记录
  const index = visitRecords.findIndex((v) => v.id === visitId);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '到店记录不存在' });
  }

  const record = visitRecords[index];

  // 检查是否已经离店
  if (record.checkOutTime) {
    return res.status(400).json({ success: false, error: '该记录已完成离店结算' });
  }

  // 更新记录
  const updated: CustomerVisitRecord = {
    ...record,
    serviceIds: serviceIds || record.serviceIds,
    serviceNames: serviceNames || record.serviceNames,
    products: products || record.products,
    totalAmount: totalAmount || record.totalAmount,
    paymentMethod: paymentMethod || record.paymentMethod,
    notes: notes || record.notes,
    checkOutTime: new Date(),
  };

  visitRecords[index] = updated;

  // 更新客户统计信息
  const customer = mockCustomers.find((c) => c.id === record.customerId);
  if (customer) {
    customer.visitCount = (customer.visitCount || 0) + 1;
    customer.totalSpent = (customer.totalSpent || 0) + updated.totalAmount;
    customer.lastVisitAt = new Date();
  }

  // 离店结算时自动发放股东权益
  processStockholderBenefitsOnCheckout(updated);

  res.json({ success: true, data: updated });
});

// 获取客户的到店记录
router.get('/customer/:customerId', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { page = '1', pageSize = '20' } = req.query;

  // 验证客户存在
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  let records = visitRecords.filter((v) => v.customerId === customerId);

  // 按到店时间倒序排列
  records = records.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());

  // 分页
  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = records.length;
  const start = (pageNum - 1) * pageSizeNum;
  const end = start + pageSizeNum;
  const paginatedResult = records.slice(start, end);

  res.json({
    success: true,
    data: paginatedResult,
    pagination: {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      totalPages: Math.ceil(total / pageSizeNum),
    },
  });
});

// 获取店铺的到店记录
router.get('/shop/:shopId', (req: Request, res: Response) => {
  const { shopId } = req.params;
  const { page = '1', pageSize = '20', dateStart, dateEnd } = req.query;

  // 验证店铺存在
  const shop = mockShops.find((s) => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ success: false, error: '店铺不存在' });
  }

  let records = visitRecords.filter((v) => v.shopId === shopId);

  // 日期筛选
  if (dateStart) {
    records = records.filter((v) => new Date(v.checkInTime) >= new Date(dateStart as string));
  }
  if (dateEnd) {
    records = records.filter((v) => new Date(v.checkInTime) <= new Date(dateEnd as string));
  }

  // 按到店时间倒序排列
  records = records.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());

  // 分页
  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = records.length;
  const start = (pageNum - 1) * pageSizeNum;
  const end = start + pageSizeNum;
  const paginatedResult = records.slice(start, end);

  res.json({
    success: true,
    data: paginatedResult,
    pagination: {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      totalPages: Math.ceil(total / pageSizeNum),
    },
  });
});

// 获取单条到店记录详情
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const record = visitRecords.find((v) => v.id === id);

  if (!record) {
    return res.status(404).json({ success: false, error: '到店记录不存在' });
  }

  res.json({ success: true, data: record });
});

// 获取店铺今日到店统计
router.get('/shop/:shopId/today', (req: Request, res: Response) => {
  const { shopId } = req.params;

  // 验证店铺存在
  const shop = mockShops.find((s) => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ success: false, error: '店铺不存在' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayRecords = visitRecords.filter((v) => {
    const checkIn = new Date(v.checkInTime);
    return v.shopId === shopId && checkIn >= today && checkIn < tomorrow;
  });

  const checkedIn = todayRecords.filter((v) => !v.checkOutTime).length;
  const checkedOut = todayRecords.filter((v) => v.checkOutTime).length;
  const totalAmount = todayRecords
    .filter((v) => v.checkOutTime)
    .reduce((sum, v) => sum + v.totalAmount, 0);

  res.json({
    success: true,
    data: {
      todayVisits: todayRecords.length,
      checkedIn,
      checkedOut,
      totalAmount,
      averageAmount: todayRecords.length > 0 ? Math.round(totalAmount / todayRecords.length) : 0,
    },
  });
});

export default router;
