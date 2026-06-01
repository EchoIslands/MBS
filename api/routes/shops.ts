import { Router, Request, Response } from 'express';
import { mockShops, mockBookings, mockReviews, mockQueues } from '../../shared/mockData';
import { Shop, Booking, Review, Queue } from '../../shared/types';

const router = Router();

// 计算两点之间的距离（公里）
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
};

// 获取附近的店铺
router.get('/', (req: Request, res: Response) => {
  const { lat = 39.9042, lon = 116.4074, level } = req.query;
  let shops = [...mockShops];

  // 计算距离
  shops = shops.map(shop => ({
    ...shop,
    distance: calculateDistance(
      parseFloat(lat as string),
      parseFloat(lon as string),
      shop.latitude,
      shop.longitude
    ),
  }));

  // 按等级过滤
  if (level) {
    shops = shops.filter(shop => shop.level === level);
  }

  // 排序：先按等级权重，再按距离
  const levelWeight = { excellent: 0, good: 1, average: 2, poor: 3 };
  shops.sort((a, b) => {
    const weightA = levelWeight[a.level];
    const weightB = levelWeight[b.level];
    if (weightA !== weightB) return weightA - weightB;
    return (a.distance || 0) - (b.distance || 0);
  });

  res.json(shops);
});

// 获取单个店铺详情
router.get('/:id', (req: Request, res: Response) => {
  const shop = mockShops.find(s => s.id === req.params.id);
  if (!shop) {
    return res.status(404).json({ message: '店铺不存在' });
  }
  res.json(shop);
});

// 获取店铺的预约
router.get('/:id/bookings', (req: Request, res: Response) => {
  const bookings = mockBookings.filter(b => b.shopId === req.params.id);
  res.json(bookings);
});

// 获取店铺的评价
router.get('/:id/reviews', (req: Request, res: Response) => {
  const reviews = mockReviews.filter(r => r.shopId === req.params.id);
  res.json(reviews);
});

// 获取店铺的排队队列
router.get('/:id/queue', (req: Request, res: Response) => {
  const queue = mockQueues.find(q => q.shopId === req.params.id);
  if (!queue) {
    return res.status(404).json({ message: '队列不存在' });
  }
  res.json(queue);
});

export default router;
