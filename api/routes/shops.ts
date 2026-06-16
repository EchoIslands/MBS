import { Router, Request, Response } from 'express';
import { mockShops } from '../../shared/mockData';
import { shopQueries, bookingQueries, reviewQueries, queueQueries } from '../db';

const router = Router();

// 计算两点之间的距离（公里）
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 将 snake_case 数据转为 camelCase 供前端使用
const shopFromDb = (row: any): any => ({
  id: row.id,
  name: row.name,
  description: row.description,
  address: row.address,
  phone: row.phone,
  latitude: row.latitude,
  longitude: row.longitude,
  level: row.level,
  isActive: row.is_active,
  avatar: row.avatar,
  images: row.images,
  services: row.services || [],
  createdAt: row.created_at,
});

// 获取附近的店铺
router.get('/', async (req: Request, res: Response) => {
  const { lat = 39.9042, lon = 116.4074, level } = req.query;

  const dbShops = await shopQueries.list();
  const hasDb = dbShops.length > 0;
  let shops: any[] = hasDb ? dbShops.map(shopFromDb) : [...mockShops];

  shops = shops.map((shop: any) => ({
    ...shop,
    distance: calculateDistance(
      parseFloat(lat as string),
      parseFloat(lon as string),
      shop.latitude,
      shop.longitude,
    ),
  }));

  if (level) {
    shops = shops.filter((shop: any) => shop.level === level);
  }

  const levelWeight: Record<string, number> = { excellent: 0, good: 1, average: 2, poor: 3 };
  shops.sort((a: any, b: any) => {
    const weightA = levelWeight[a.level] ?? 1;
    const weightB = levelWeight[b.level] ?? 1;
    if (weightA !== weightB) return weightA - weightB;
    return (a.distance || 0) - (b.distance || 0);
  });

  res.json(shops);
});

// 获取单个店铺详情
router.get('/:id', async (req: Request, res: Response) => {
  const dbShop = await shopQueries.get(req.params.id);
  if (dbShop) {
    res.json(shopFromDb(dbShop));
    return;
  }
  const shop = mockShops.find((s: any) => s.id === req.params.id);
  if (!shop) {
    return res.status(404).json({ message: '店铺不存在' });
  }
  res.json(shop);
});

// 更新店铺信息
router.put('/:id', async (req: Request, res: Response) => {
  const { name, description, phone, address, services, employees, openingHours } = req.body;

  // 先尝试从数据库更新
  const shop = await shopQueries.get(req.params.id);
  if (shop) {
    const updateData: any = {
      name: name || shop.name,
      description: description || shop.description,
      phone: phone || shop.phone,
      address: address || shop.address,
    };
    if (services !== undefined) updateData.services = JSON.stringify(services);
    if (employees !== undefined) updateData.employees = JSON.stringify(employees);
    if (openingHours !== undefined) updateData.opening_hours = JSON.stringify(openingHours);
    updateData.updated_at = new Date().toISOString();

    const updated = await shopQueries.update(req.params.id, updateData);
    if (updated) {
      res.json({ success: true, message: '店铺信息已更新' });
      return;
    }
  }

  // fallback 到 mockShops
  const shopIndex = mockShops.findIndex((s: any) => s.id === req.params.id);
  if (shopIndex === -1) {
    return res.status(404).json({ message: '店铺不存在' });
  }
  const existing = mockShops[shopIndex];
  mockShops[shopIndex] = {
    ...existing,
    name: name || existing.name,
    description: description || existing.description,
    phone: phone || existing.phone,
    address: address || existing.address,
    services: services !== undefined ? services : existing.services,
    employees: employees !== undefined ? employees : existing.employees,
    openingHours: openingHours !== undefined ? openingHours : existing.openingHours,
    updatedAt: new Date(),
  };
  res.json({ success: true, message: '店铺信息已更新' });
});

// 创建店铺
router.post('/', async (req: Request, res: Response) => {
  const { name, description, phone, address, services = [], employees = [], openingHours } = req.body;

  if (!name) {
    return res.status(400).json({ message: '店铺名称不能为空' });
  }

  const newId = 'shop_' + Math.random().toString(36).substr(2, 9);
  const newShop: any = {
    id: newId,
    name,
    description: description || '',
    address: address || '',
    latitude: 39.9042,
    longitude: 116.4074,
    phone: phone || '',
    images: [],
    services: services.map((s: any, i: number) => ({
      id: s.id || 'svc_' + i,
      name: s.name,
      price: s.price,
      duration: s.duration,
      description: s.description,
    })),
    employees: employees.map((e: any, i: number) => ({
      id: e.id || 'emp_' + i,
      name: e.name,
      title: e.title,
      specialty: e.specialty,
      avatar: e.avatar,
      rating: e.rating || 5.0,
      skillValue: e.skillValue || 5.0,
      reviewCount: e.reviewCount || 0,
      totalServices: e.totalServices || 0,
      isActive: e.isActive !== false,
      role: e.role || 'stylist',
      weeklyRevenue: e.weeklyRevenue || 0,
      tags: e.tags || [],
    })),
    products: [],
    openingHours: openingHours || {
      monday: { open: '09:00', close: '21:00', isOpen: true },
      tuesday: { open: '09:00', close: '21:00', isOpen: true },
      wednesday: { open: '09:00', close: '21:00', isOpen: true },
      thursday: { open: '09:00', close: '21:00', isOpen: true },
      friday: { open: '09:00', close: '22:00', isOpen: true },
      saturday: { open: '10:00', close: '22:00', isOpen: true },
      sunday: { open: '10:00', close: '20:00', isOpen: true },
    },
    level: 'excellent',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 同时更新 mockShops
  mockShops.push(newShop);
  res.status(201).json({ success: true, data: newShop, message: '店铺创建成功' });
});

// 获取店铺的预约
router.get('/:id/bookings', async (req: Request, res: Response) => {
  const dbBookings = await bookingQueries.listByShop(req.params.id);
  if (dbBookings.length > 0) {
    const camel = dbBookings.map((b: any) => ({
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
    }));
    res.json(camel);
    return;
  }

  const { mockBookings } = require('../../shared/mockData');
  const bookings = mockBookings.filter((b: any) => b.shopId === req.params.id);
  res.json(bookings);
});

// 获取店铺的评价
router.get('/:id/reviews', async (req: Request, res: Response) => {
  const dbReviews = await reviewQueries.listByShop(req.params.id);
  if (dbReviews.length > 0) {
    const camel = dbReviews.map((r: any) => ({
      id: r.id,
      shopId: r.shop_id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      bookingId: r.booking_id,
      type: r.type,
      stylistId: r.stylist_id,
      stylistName: r.stylist_name,
      serviceName: r.service_name,
      rating: r.rating,
      serviceScore: r.service_score,
      priceScore: r.price_score,
      skillScore: r.skill_score,
      overallScore: r.overall_score,
      comment: r.comment,
      tags: r.tags,
      reply: r.reply,
      replyBy: r.reply_by,
      replyAt: r.reply_at,
      isHidden: r.is_hidden,
      createdAt: r.created_at,
    }));
    res.json(camel);
    return;
  }

  const { mockReviews } = require('../../shared/mockData');
  const reviews = mockReviews.filter((r: any) => r.shopId === req.params.id);
  res.json(reviews);
});

// 获取店铺的排队队列
router.get('/:id/queue', async (req: Request, res: Response) => {
  const dbQueue = await queueQueries.getByShop(req.params.id);
  if (dbQueue) {
    const bookings = await bookingQueries.listByShop(req.params.id);
    const pendingBookings = bookings
      .filter((b: any) => b.status === 'pending' || b.status === 'confirmed')
      .map((b: any) => ({
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
      }));

    res.json({
      shopId: req.params.id,
      currentNumber: dbQueue.current_number,
      estimatedWaitTime: dbQueue.estimated_wait_time,
      bookings: pendingBookings,
      updatedAt: dbQueue.updated_at,
    });
    return;
  }

  const { mockQueues, mockBookings } = require('../../shared/mockData');
  const queue = mockQueues.find((q: any) => q.shopId === req.params.id);
  if (!queue) {
    return res.status(404).json({ message: '队列不存在' });
  }
  queue.bookings = mockBookings.filter(
    (b: any) => b.shopId === req.params.id && (b.status === 'pending' || b.status === 'confirmed'),
  );
  res.json(queue);
});

export default router;
