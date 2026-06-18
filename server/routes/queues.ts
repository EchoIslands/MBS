import { Router, Request, Response } from 'express';
import { queueQueries, bookingQueries } from '../db/index.js';

const router = Router();

// 鑾峰彇闃熷垪
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
  return res.status(404).json({ success: false, error: '闃熷垪涓嶅瓨鍦? });
});

// 鏇存柊闃熷垪
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

// 鍙彿锛堜笅涓€浣嶏級
router.post('/:shopId/next', async (req: Request, res: Response) => {
  const shopId = req.params.shopId;
  const dbQueue = await queueQueries.getByShop(shopId);
  
  if (!dbQueue) {
    return res.status(404).json({ success: false, error: '闃熷垪涓嶅瓨鍦? });
  }

  // 鑾峰彇鎵€鏈夊緟澶勭悊鐨勯绾?  const bookings = await bookingQueries.listByShop(shopId);
  const pendingBookings = bookings.filter(
    (b: any) => b.status === 'pending' || b.status === 'confirmed'
  );

  // 鎵惧埌褰撳墠鍙风爜瀵瑰簲鐨勯绾?  const currentBooking = pendingBookings.find(
    (b: any) => b.queue_number === dbQueue.current_number
  );

  // 鏇存柊褰撳墠鍙风爜
  const newCurrentNumber = dbQueue.current_number + 1;
  const result = await queueQueries.upsert({
    shop_id: shopId,
    current_number: newCurrentNumber,
    estimated_wait_time: dbQueue.estimated_wait_time,
    updated_at: new Date().toISOString(),
  });

  // 濡傛灉鏈夊綋鍓嶉绾︼紝鏇存柊鍏剁姸鎬佷负鏈嶅姟涓?  if (currentBooking) {
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

// 璺宠繃褰撳墠鍙风爜
router.post('/:shopId/skip', async (req: Request, res: Response) => {
  const shopId = req.params.shopId;
  const dbQueue = await queueQueries.getByShop(shopId);
  
  if (!dbQueue) {
    return res.status(404).json({ success: false, error: '闃熷垪涓嶅瓨鍦? });
  }

  // 鑾峰彇鎵€鏈夊緟澶勭悊鐨勯绾?  const bookings = await bookingQueries.listByShop(shopId);
  const pendingBookings = bookings.filter(
    (b: any) => b.status === 'pending' || b.status === 'confirmed'
  );

  // 鎵惧埌琚烦杩囩殑棰勭害
  const skippedBooking = pendingBookings.find(
    (b: any) => b.queue_number === dbQueue.current_number
  );

  // 鏇存柊褰撳墠鍙风爜
  const newCurrentNumber = dbQueue.current_number + 1;
  const result = await queueQueries.upsert({
    shop_id: shopId,
    current_number: newCurrentNumber,
    estimated_wait_time: dbQueue.estimated_wait_time,
    updated_at: new Date().toISOString(),
  });

  // 濡傛灉鏈夎璺宠繃鐨勯绾︼紝鏇存柊鍏剁姸鎬佷负璺宠繃
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

// 閲嶇疆闃熷垪
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
    message: '闃熷垪宸查噸缃?,
  });
});

// 鑾峰彇闃熷垪缁熻
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

