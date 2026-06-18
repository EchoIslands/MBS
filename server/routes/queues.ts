import { Router, Request, Response } from 'express';
import { queueQueries, bookingQueries } from '../db/index.js';

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
      success: true,
      data: {
        shopId,
        currentNumber: dbQueue.current_number,
        estimatedWaitTime: dbQueue.estimated_wait_time,
        bookings: pendingBookings,
        updatedAt: dbQueue.updated_at,
      },
    });
    return;
  }
  return res.status(404).json({ success: false, error: '队列不存�? });
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
    success: true,
    data: {
      shopId: result.shop_id,
      currentNumber: result.current_number,
      estimatedWaitTime: result.estimated_wait_time,
      updatedAt: result.updated_at,
    },
  });
});

// 叫号（下一位）
router.post('/:shopId/next', async (req: Request, res: Response) => {
  const shopId = req.params.shopId;
  const dbQueue = await queueQueries.getByShop(shopId);
  
  if (!dbQueue) {
    return res.status(404).json({ success: false, error: '队列不存�? });
  }

  // 获取所有待处理的预�?  const bookings = await bookingQueries.listByShop(shopId);
  const pendingBookings = bookings.filter(
    (b: any) => b.status === 'pending' || b.status === 'confirmed'
  );

  // 找到当前号码对应的预�?  const currentBooking = pendingBookings.find(
    (b: any) => b.queue_number === dbQueue.current_number
  );

  // 更新当前号码
  const newCurrentNumber = dbQueue.current_number + 1;
  const result = await queueQueries.upsert({
    shop_id: shopId,
    current_number: newCurrentNumber,
    estimated_wait_time: dbQueue.estimated_wait_time,
    updated_at: new Date().toISOString(),
  });

  // 如果有当前预约，更新其状态为服务�?  if (currentBooking) {
    await bookingQueries.update(currentBooking.id, { status: 'serving' });
  }

  res.json({
    success: true,
    data: {
      shopId: result.shop_id,
      currentNumber: result.current_number,
      estimatedWaitTime: result.estimated_wait_time,
      updatedAt: result.updated_at,
      calledBooking: currentBooking ? {
        id: currentBooking.id,
        customerName: currentBooking.customer_name,
        serviceName: currentBooking.service_name,
        queueNumber: currentBooking.queue_number,
      } : null,
    },
  });
});

// 跳过当前号码
router.post('/:shopId/skip', async (req: Request, res: Response) => {
  const shopId = req.params.shopId;
  const dbQueue = await queueQueries.getByShop(shopId);
  
  if (!dbQueue) {
    return res.status(404).json({ success: false, error: '队列不存�? });
  }

  // 获取所有待处理的预�?  const bookings = await bookingQueries.listByShop(shopId);
  const pendingBookings = bookings.filter(
    (b: any) => b.status === 'pending' || b.status === 'confirmed'
  );

  // 找到被跳过的预约
  const skippedBooking = pendingBookings.find(
    (b: any) => b.queue_number === dbQueue.current_number
  );

  // 更新当前号码
  const newCurrentNumber = dbQueue.current_number + 1;
  const result = await queueQueries.upsert({
    shop_id: shopId,
    current_number: newCurrentNumber,
    estimated_wait_time: dbQueue.estimated_wait_time,
    updated_at: new Date().toISOString(),
  });

  // 如果有被跳过的预约，更新其状态为跳过
  if (skippedBooking) {
    await bookingQueries.update(skippedBooking.id, { status: 'skipped' });
  }

  res.json({
    success: true,
    data: {
      shopId: result.shop_id,
      currentNumber: result.current_number,
      estimatedWaitTime: result.estimated_wait_time,
      updatedAt: result.updated_at,
      skippedBooking: skippedBooking ? {
        id: skippedBooking.id,
        customerName: skippedBooking.customer_name,
        serviceName: skippedBooking.service_name,
        queueNumber: skippedBooking.queue_number,
      } : null,
    },
  });
});

// 重置队列
router.post('/:shopId/reset', async (req: Request, res: Response) => {
  const shopId = req.params.shopId;
  
  const result = await queueQueries.upsert({
    shop_id: shopId,
    current_number: 1,
    estimated_wait_time: 15,
    updated_at: new Date().toISOString(),
  });

  res.json({
    success: true,
    data: {
      shopId: result.shop_id,
      currentNumber: result.current_number,
      estimatedWaitTime: result.estimated_wait_time,
      updatedAt: result.updated_at,
    },
    message: '队列已重�?,
  });
});

// 获取队列统计
router.get('/:shopId/stats', async (req: Request, res: Response) => {
  const shopId = req.params.shopId;
  
  const bookings = await bookingQueries.listByShop(shopId);
  
  const stats = {
    total: bookings.length,
    pending: bookings.filter((b: any) => b.status === 'pending').length,
    confirmed: bookings.filter((b: any) => b.status === 'confirmed').length,
    serving: bookings.filter((b: any) => b.status === 'serving').length,
    completed: bookings.filter((b: any) => b.status === 'completed').length,
    cancelled: bookings.filter((b: any) => b.status === 'cancelled').length,
    skipped: bookings.filter((b: any) => b.status === 'skipped').length,
  };

  res.json({
    success: true,
    data: stats,
  });
});

export default router;
