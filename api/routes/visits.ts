import { Router, Request, Response } from 'express';
import { mockCustomers, mockShops, mockBookings } from '../../shared/mockData.js';
import { CustomerVisitRecord } from '../../shared/types.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 存储到店记录（内存存储，实际项目中应该用数据库）
const visitRecords: CustomerVisitRecord[] = [];

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
