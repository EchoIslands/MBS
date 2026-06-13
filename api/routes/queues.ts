import { Router, Request, Response } from 'express';
import { queueQueries, bookingQueries } from '../db';

const router = Router();

// 获取队列
router.get('/:shopId', async (req: Request, res: Response) => {
  const shopId = req.params.shopId;
  const dbQueue = await queueQueries.getByShop(shopId);
  if (dbQueue) {
    const bookings = await bookingQueries.listByShop(shopId);
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
      shopId,
      currentNumber: dbQueue.current_number,
      estimatedWaitTime: dbQueue.estimated_wait_time,
      bookings: pendingBookings,
      updatedAt: dbQueue.updated_at,
    });
    return;
  }
  return res.status(404).json({ message: '队列不存在' });
});

// 更新队列
router.put('/:shopId', async (req: Request, res: Response) => {
  const { currentNumber, estimatedWaitTime } = req.body;
  const shopId = req.params.shopId;
  const existing = await queueQueries.getByShop(shopId);
  const data = {
    shop_id: shopId,
    current_number: currentNumber ?? existing?.current_number ?? 0,
    estimated_wait_time: estimatedWaitTime ?? existing?.estimated_wait_time ?? 15,
    updated_at: new Date().toISOString(),
  };
  const result = await queueQueries.upsert(data);
  res.json({
    shopId: result.shop_id,
    currentNumber: result.current_number,
    estimatedWaitTime: result.estimated_wait_time,
    updatedAt: result.updated_at,
  });
});

export default router;
