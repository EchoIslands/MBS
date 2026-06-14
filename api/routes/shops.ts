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
