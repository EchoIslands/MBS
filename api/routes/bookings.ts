import { Router, Request, Response } from 'express';

const router = Router();

// 内存存储（Vercel Serverless 冷启动会清空，后续应迁移到 Supabase）
declare global {
  var __apiBookingsDb: Map<string, any> | undefined;
}
const bookingsDb: Map<string, any> = globalThis.__apiBookingsDb || (globalThis.__apiBookingsDb = new Map<string, any>());

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

// 演示数据（与 server/_internal/mockData.ts 保持一致）
const mockBookings: any[] = [
  {
    id: 'book1',
    shopId: 'shop1',
    customerId: 'cust1',
    serviceId: 's1',
    barberId: 'e1',
    barberName: '李明',
    scheduledTime: new Date(Date.now() + 3600000).toISOString(),
    status: 'confirmed',
    queueNumber: 3,
    serviceName: '精剪',
    price: 68,
    customerName: '张三',
    shopName: '风格美发沙龙',
  },
];

// 获取预约列表
router.get('/', async (req: Request, res: Response) => {
  try {
    const shopId = String(req.query.shopId || 'shop1');
    const status = req.query.status as string | undefined;
    const page = String(req.query.page || '1');
    const pageSize = String(req.query.pageSize || '20');

    let dbBookings: any[] = [];
    bookingsDb.forEach((b) => {
      if (b.shop_id === shopId) {
        dbBookings.push(b);
      }
    });

    let bookings = dbBookings.map(bookingFromDb);

    // 没有真实数据时返回演示数据
    if (bookings.length === 0) {
      bookings = mockBookings.filter((b: any) => b.shopId === shopId);
    }

    if (status && status !== 'all') {
      bookings = bookings.filter((b: any) => b.status === status);
    }

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
    console.error('[bookings] 获取预约列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取预约列表失败',
    });
  }
});

// 创建预约
router.post('/', async (req: Request, res: Response) => {
  try {
    const { shopId, customerId, serviceId, scheduledTime, notes, customerName, stylistId, stylistName, serviceName, price } = req.body;

    if (!shopId || !customerId || !serviceId || !scheduledTime) {
      return res.status(400).json({
        success: false,
        error: '缺少必要字段',
      });
    }

    let scheduledTimeDate: Date;
    try {
      scheduledTimeDate = new Date(scheduledTime);
      if (isNaN(scheduledTimeDate.getTime())) {
        throw new Error('invalid date');
      }
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: '预约时间格式无效',
      });
    }

    let countFromDb = 0;
    bookingsDb.forEach((b) => {
      if (b.shop_id === shopId) countFromDb++;
    });

    const newBooking = {
      id: generateId(),
      shop_id: shopId,
      customer_id: customerId,
      customer_name: customerName || '顾客',
      stylist_id: stylistId,
      stylist_name: stylistName || '',
      service_id: serviceId,
      service_name: serviceName || '服务',
      price: price || 0,
      scheduled_time: scheduledTimeDate.toISOString(),
      queue_number: countFromDb + 1,
      status: 'confirmed',
      notes: notes || '',
      created_at: new Date().toISOString(),
    };

    bookingsDb.set(newBooking.id, newBooking);

    res.status(201).json({
      success: true,
      data: bookingFromDb(newBooking),
    });
  } catch (error) {
    console.error('[bookings] 创建预约失败:', error);
    res.status(500).json({
      success: false,
      error: '创建预约失败',
    });
  }
});

export default router;
