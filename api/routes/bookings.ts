import { Router, Request, Response } from 'express';
import { mockBookings, mockShops, mockCustomers } from '../../shared/mockData';

const router = Router();

// 使用 global 对象确保 bookingsDb 在模块多次加载时保持单例
declare global {
  var __bookingsDb: Map<string, any> | undefined;
}
const bookingsDb: Map<string, any> = globalThis.__bookingsDb || (globalThis.__bookingsDb = new Map<string, any>());

const generateId = () => Math.random().toString(36).substr(2, 9);

const bookingFromDb = (b: any): any => ({
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

// 创建预约
router.post('/', async (req: Request, res: Response) => {
  console.log('=== POST /api/bookings called ===');
  console.log('req.body:', req.body);
  // 兼容前端可能传入的字段名（barberId/stylistId 等）
  const { shopId, customerId, serviceId, scheduledTime, notes } = req.body;
  const barberId = req.body.barberId || req.body.stylistId;
  const barberName = req.body.barberName || req.body.stylistName;
  const customerName = req.body.customerName;

  const shop = mockShops.find((s: any) => s.id === shopId);
  const service = shop?.services?.find((s: any) => s.id === serviceId);

  // 从本地存储获取该店铺的预约数量
  let countFromDb = 0;
  bookingsDb.forEach((b) => {
    if (b.shop_id === shopId) countFromDb++;
  });

  // 处理 scheduledTime：验证时间是否有效且未来时间
  if (!scheduledTime) {
    console.error('❌ scheduledTime 为空');
    return res.status(400).json({ message: '预约时间不能为空' });
  }
  
  let scheduledTimeDate: Date;
  try {
    scheduledTimeDate = scheduledTime instanceof Date
      ? scheduledTime
      : new Date(scheduledTime);
    // 检查是否有效日期
    if (isNaN(scheduledTimeDate.getTime())) {
      console.error('❌ scheduledTime 无效:', scheduledTime);
      return res.status(400).json({ message: '预约时间格式无效' });
    }
  } catch (e) {
    console.error('❌ scheduledTime 解析失败:', scheduledTime, e);
    return res.status(400).json({ message: '预约时间解析失败' });
  }
  
  // 检查时间是否是未来时间（允许当前时间之后的预约）
  const now = new Date();
  if (scheduledTimeDate < now) {
    console.error('❌ scheduledTime 已是过去时间:', scheduledTimeDate.toISOString(), 'now:', now.toISOString());
    return res.status(400).json({ message: '预约时间不能是过去时间' });
  }
  
  console.log('✅ Parsed scheduledTime:', scheduledTimeDate.toISOString());

  const newBooking = {
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
    const dateStart = req.query.dateStart as string | undefined;
    const dateEnd = req.query.dateEnd as string | undefined;
    const page = String(req.query.page || '1');
    const pageSize = String(req.query.pageSize || '20');
    const sortBy = String(req.query.sortBy || 'scheduledTime');
    const sortOrder = String(req.query.sortOrder || 'desc');

    // 从本地 Map 获取该店铺的预约
    let dbBookings: any[] = [];
    bookingsDb.forEach((b) => {
      if (b.shop_id === shopId) {
        dbBookings.push(b);
      }
    });
    let bookings = dbBookings.map(bookingFromDb);

    if (bookings.length === 0) {
      bookings = mockBookings.filter((b: any) => !shopId || b.shopId === shopId);
    }

    if (status && status !== 'all') {
      bookings = bookings.filter((b: any) => b.status === status);
    }

    if (stylistId) {
      bookings = bookings.filter((b: any) => b.stylistId === stylistId);
    }

    if (customerId) {
      bookings = bookings.filter((b: any) => b.customerId === customerId);
    }

    if (dateStart) {
      const startDate = new Date(dateStart);
      bookings = bookings.filter((b: any) => {
        const bookingDate = new Date(b.scheduledTime || b.scheduled_time);
        return bookingDate >= startDate;
      });
    }

    if (dateEnd) {
      const endDate = new Date(dateEnd);
      endDate.setDate(endDate.getDate() + 1);
      bookings = bookings.filter((b: any) => {
        const bookingDate = new Date(b.scheduledTime || b.scheduled_time);
        return bookingDate < endDate;
      });
    }

    bookings.sort((a: any, b: any) => {
      const fieldA = a[sortBy] || a[sortBy.replace(/([A-Z])/g, '_$1').toLowerCase()];
      const fieldB = b[sortBy] || b[sortBy.replace(/([A-Z])/g, '_$1').toLowerCase()];
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
  } catch (error) {
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
  const booking = mockBookings.find((b: any) => b.id === req.params.id);
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
    res.json(bookingFromDb(updated));
    return;
  }

  const idx = mockBookings.findIndex((b: any) => b.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: '预约不存在' });
  }
  mockBookings[idx] = { ...mockBookings[idx], status };
  res.json(mockBookings[idx]);
});

// 获取顾客的预约
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  const dbBookings: any[] = [];
  bookingsDb.forEach((b) => {
    if (b.customer_id === req.params.customerId) {
      dbBookings.push(b);
    }
  });
  if (dbBookings.length > 0) {
    res.json(dbBookings.map(bookingFromDb));
    return;
  }
  const bookings = mockBookings.filter((b: any) => b.customerId === req.params.customerId);
  res.json(bookings);
});

export default router;
