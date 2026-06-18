import { Router, Request, Response } from 'express';
import { mockBookings, mockShops, mockCustomers } from '../_internal/mockData.js';

const router = Router();

// 浣跨敤 global 瀵硅薄纭繚 bookingsDb 鍦ㄦā鍧楀娆″姞杞芥椂淇濇寔鍗曚緥
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

// 鍒涘缓棰勭害
router.post('/', async (req: Request, res: Response) => {
  console.log('=== POST /api/bookings called ===');
  console.log('req.body:', req.body);
  // 鍏煎鍓嶇鍙兘浼犲叆鐨勫瓧娈靛悕锛坆arberId/stylistId 绛夛級
  const { shopId, customerId, serviceId, scheduledTime, notes } = req.body;
  const barberId = req.body.barberId || req.body.stylistId;
  const barberName = req.body.barberName || req.body.stylistName;
  const customerName = req.body.customerName;

  const shop = mockShops.find((s: any) => s.id === shopId);
  const service = shop?.services?.find((s: any) => s.id === serviceId);

  // 浠庢湰鍦板瓨鍌ㄨ幏鍙栬搴楅摵鐨勯绾︽暟閲?  let countFromDb = 0;
  bookingsDb.forEach((b) => {
    if (b.shop_id === shopId) countFromDb++;
  });

  // 澶勭悊 scheduledTime锛氶獙璇佹椂闂存槸鍚︽湁鏁堜笖鏈潵鏃堕棿
  if (!scheduledTime) {
    console.error('鉂?scheduledTime 涓虹┖');
    return res.status(400).json({ message: '棰勭害鏃堕棿涓嶈兘涓虹┖' });
  }
  
  let scheduledTimeDate: Date;
  try {
    scheduledTimeDate = scheduledTime instanceof Date
      ? scheduledTime
      : new Date(scheduledTime);
    // 妫€鏌ユ槸鍚︽湁鏁堟棩鏈?    if (isNaN(scheduledTimeDate.getTime())) {
      console.error('鉂?scheduledTime 鏃犳晥:', scheduledTime);
      return res.status(400).json({ message: '棰勭害鏃堕棿鏍煎紡鏃犳晥' });
    }
  } catch (e) {
    console.error('鉂?scheduledTime 瑙ｆ瀽澶辫触:', scheduledTime, e);
    return res.status(400).json({ message: '棰勭害鏃堕棿瑙ｆ瀽澶辫触' });
  }
  
  // 妫€鏌ユ椂闂存槸鍚︽槸鏈潵鏃堕棿锛堝厑璁稿綋鍓嶆椂闂翠箣鍚庣殑棰勭害锛?  const now = new Date();
  if (scheduledTimeDate < now) {
    console.error('鉂?scheduledTime 宸叉槸杩囧幓鏃堕棿:', scheduledTimeDate.toISOString(), 'now:', now.toISOString());
    return res.status(400).json({ message: '棰勭害鏃堕棿涓嶈兘鏄繃鍘绘椂闂? });
  }
  
  console.log('鉁?Parsed scheduledTime:', scheduledTimeDate.toISOString());

  const newBooking = {
    id: generateId(),
    shop_id: shopId,
    customer_id: customerId,
    customer_name: customerName || '椤惧',
    stylist_id: barberId,
    stylist_name: barberName || service?.name || '鍙戝瀷甯?,
    service_id: serviceId,
    service_name: service?.name || '鏈嶅姟',
    price: service?.price || 0,
    scheduled_time: scheduledTimeDate.toISOString(),
    queue_number: countFromDb + 1,
    status: 'confirmed',
    notes: notes || '',
    created_at: new Date().toISOString(),
  };

  // 鐩存帴瀛樺偍鍒版湰鍦?Map
  bookingsDb.set(newBooking.id, newBooking);
  console.log('bookingsDb.set:', newBooking.id, 'total:', bookingsDb.size);
  console.log('杩斿洖棰勭害 scheduledTime:', newBooking.scheduled_time);

  res.status(201).json(bookingFromDb(newBooking));
});

// 棰勭害鍒楄〃绛涢€?API
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

    // 浠庢湰鍦?Map 鑾峰彇璇ュ簵閾虹殑棰勭害
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
      error: '鑾峰彇棰勭害鍒楄〃澶辫触',
    });
  }
});

// 鑾峰彇棰勭害璇︽儏
router.get('/:id', async (req: Request, res: Response) => {
  console.log('=== GET /api/bookings/:id called ===');
  console.log('req.params.id:', req.params.id, 'type:', typeof req.params.id);
  console.log('bookingsDb.size:', bookingsDb.size);
  console.log('bookingsDb keys:', Array.from(bookingsDb.keys()));

  // 鐩存帴浠庢湰鍦?Map 鑾峰彇
  const dbBooking = bookingsDb.get(req.params.id) || null;
  console.log('dbBooking from Map:', dbBooking);
  if (dbBooking) {
    res.json(bookingFromDb(dbBooking));
    return;
  }
  const booking = mockBookings.find((b: any) => b.id === req.params.id);
  console.log('mock booking:', booking);
  if (!booking) {
    return res.status(404).json({ message: '棰勭害涓嶅瓨鍦? });
  }
  res.json(booking);
});

// 鏇存柊棰勭害鐘舵€?router.put('/:id', async (req: Request, res: Response) => {
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
    return res.status(404).json({ message: '棰勭害涓嶅瓨鍦? });
  }
  mockBookings[idx] = { ...mockBookings[idx], status };
  res.json(mockBookings[idx]);
});

// 鑾峰彇椤惧鐨勯绾?router.get('/customer/:customerId', async (req: Request, res: Response) => {
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

