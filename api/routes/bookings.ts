import { Router, Request, Response } from 'express';
import { mockBookings, mockShops, mockCustomers } from '../../shared/mockData';
import { Booking } from '../../shared/types';

const router = Router();

// 生成ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 创建预约
router.post('/', (req: Request, res: Response) => {
  const { shopId, customerId, serviceId, barberName, scheduledTime, notes } = req.body;
  
  const shop = mockShops.find(s => s.id === shopId);
  const customer = mockCustomers.find(c => c.id === customerId);
  const service = shop?.services.find(s => s.id === serviceId);
  
  if (!shop || !customer || !service) {
    return res.status(400).json({ message: '参数错误' });
  }

  const newBooking: Booking = {
    id: generateId(),
    shopId,
    customerId,
    serviceId,
    barberName,
    scheduledTime: new Date(scheduledTime),
    status: 'pending',
    notes,
    queueNumber: mockBookings.filter(b => b.shopId === shopId).length + 1,
    serviceName: service.name,
    price: service.price,
    customerName: customer.name,
    shopName: shop.name,
  };

  mockBookings.push(newBooking);
  res.status(201).json(newBooking);
});

// 获取预约详情
router.get('/:id', (req: Request, res: Response) => {
  const booking = mockBookings.find(b => b.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ message: '预约不存在' });
  }
  res.json(booking);
});

// 更新预约状态
router.put('/:id', (req: Request, res: Response) => {
  const { status } = req.body;
  const bookingIndex = mockBookings.findIndex(b => b.id === req.params.id);
  
  if (bookingIndex === -1) {
    return res.status(404).json({ message: '预约不存在' });
  }

  mockBookings[bookingIndex] = {
    ...mockBookings[bookingIndex],
    status,
  };

  res.json(mockBookings[bookingIndex]);
});

// 获取顾客的预约
router.get('/customer/:customerId', (req: Request, res: Response) => {
  const bookings = mockBookings.filter(b => b.customerId === req.params.customerId);
  res.json(bookings);
});

export default router;
