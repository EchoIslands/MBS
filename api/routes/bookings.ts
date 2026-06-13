import { Router, Request, Response } from 'express';
import { mockBookings, mockShops, mockCustomers } from '../../shared/mockData';
import { bookingQueries } from '../db';

const router = Router();

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
  const { shopId, customerId, serviceId, stylistName, scheduledTime, notes, customerName } = req.body;

  const shop = mockShops.find((s: any) => s.id === shopId);
  const service = shop?.services?.find((s: any) => s.id === serviceId);

  const allBookings = await bookingQueries.listByShop(shopId);
  const countFromDb = allBookings.length;

  const newBooking = {
    id: generateId(),
    shop_id: shopId,
    customer_id: customerId,
    customer_name: customerName || '顾客',
    stylist_id: req.body.stylistId,
    stylist_name: stylistName,
    service_id: serviceId,
    service_name: service?.name,
    price: service?.price || 0,
    scheduled_time: new Date(scheduledTime).toISOString(),
    queue_number: countFromDb + 1,
    status: 'pending',
    notes: notes,
    created_at: new Date().toISOString(),
  };

  const created = await bookingQueries.create(newBooking);
  if (created && created.id) {
    res.status(201).json(bookingFromDb(created));
    return;
  }

  // 后备：写 mockData
  const fallback = {
    id: newBooking.id,
    shopId: newBooking.shop_id,
    customerId: newBooking.customer_id,
    customerName: newBooking.customer_name,
    stylistId: newBooking.stylist_id,
    stylistName: newBooking.stylist_name,
    serviceId: newBooking.service_id,
    serviceName: newBooking.service_name,
    price: newBooking.price,
    scheduledTime: new Date(scheduledTime),
    queueNumber: newBooking.queue_number,
    status: newBooking.status,
    notes: newBooking.notes,
    shopName: shop?.name,
    createdAt: new Date(),
  };
  mockBookings.push(fallback);
  res.status(201).json(fallback);
});

// 获取预约详情
router.get('/:id', async (req: Request, res: Response) => {
  const dbBooking = await bookingQueries.get(req.params.id);
  if (dbBooking) {
    res.json(bookingFromDb(dbBooking));
    return;
  }
  const booking = mockBookings.find((b: any) => b.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ message: '预约不存在' });
  }
  res.json(booking);
});

// 更新预约状态
router.put('/:id', async (req: Request, res: Response) => {
  const { status } = req.body;

  const updated = await bookingQueries.update(req.params.id, { status });
  if (updated) {
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
  const dbBookings = await bookingQueries.listByCustomer(req.params.customerId);
  if (dbBookings.length > 0) {
    res.json(dbBookings.map(bookingFromDb));
    return;
  }
  const bookings = mockBookings.filter((b: any) => b.customerId === req.params.customerId);
  res.json(bookings);
});

export default router;
