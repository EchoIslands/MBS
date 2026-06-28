import { Router, Request, Response } from 'express';
import { supabase } from '../db/index.js';

const router = Router();

// 辅助：计算某一天的 00:00 和次日 00:00
const getDateRange = (dateStr?: string) => {
  const base = dateStr ? new Date(dateStr) : new Date();
  base.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setDate(end.getDate() + 1);
  return { start: base.toISOString(), end: end.toISOString() };
};

// 平均服务时长（分钟），后续可从服务配置读取
const AVERAGE_SERVICE_MINUTES = 30;

// 获取店铺当天排队状态
// GET /api/queues/:shopId?date=YYYY-MM-DD
router.get('/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { start, end } = getDateRange(req.query.date as string | undefined);

    // 拉取当天店铺所有有效预约（pending / confirmed / serving）
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed', 'serving'])
      .gte('scheduled_time', start)
      .lt('scheduled_time', end)
      .order('queue_number', { ascending: true });

    if (error) {
      console.error('[queues] 查询预约失败:', error.message);
      return res.status(500).json({ success: false, error: '查询排队信息失败' });
    }

    const list = (bookings || []).map((b: any) => ({
      id: b.id,
      shopId: b.shop_id,
      customerId: b.customer_id,
      customerName: b.customer_name,
      stylistId: b.stylist_id,
      stylistName: b.stylist_name,
      serviceId: b.service_id,
      serviceName: b.service_name,
      scheduledTime: b.scheduled_time,
      queueNumber: b.queue_number || 1,
      status: b.status,
      notes: b.notes,
    }));

    // 当前叫到第几号：如果有 serving 的预约，取其中最小 queue_number；
    // 否则取已完成的最大 queue_number + 1；兜底为 1
    const servingBookings = list.filter((b) => b.status === 'serving');
    let currentNumber = 1;
    if (servingBookings.length > 0) {
      currentNumber = Math.min(...servingBookings.map((b) => b.queueNumber));
    } else {
      const { data: completed, error: completedError } = await supabase
        .from('bookings')
        .select('queue_number')
        .eq('shop_id', shopId)
        .eq('status', 'completed')
        .gte('scheduled_time', start)
        .lt('scheduled_time', end)
        .order('queue_number', { ascending: false })
        .limit(1);

      if (completedError) {
        console.error('[queues] 查询已完成预约失败:', completedError.message);
      }
      const maxCompleted = completed && completed.length > 0 ? completed[0].queue_number : 0;
      currentNumber = (maxCompleted || 0) + 1;
    }

    // 预计等待时间：前面尚未服务的预约数 × 平均服务时长
    const aheadBookings = list.filter(
      (b) => b.queueNumber >= currentNumber && b.status !== 'serving',
    );
    const estimatedWaitTime = aheadBookings.length * AVERAGE_SERVICE_MINUTES;

    res.json({
      success: true,
      data: {
        id: `queue_${shopId}_${start.slice(0, 10)}`,
        shopId,
        currentNumber,
        estimatedWaitTime,
        bookings: list,
      },
    });
  } catch (error) {
    console.error('[queues] 获取排队信息失败:', error);
    res.status(500).json({ success: false, error: '获取排队信息失败' });
  }
});

// 店铺后台手动更新排队信息（叫号或调整预计等待）
// PUT /api/queues/:shopId
router.put('/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { currentNumber, estimatedWaitTime } = req.body || {};

    // 当前仅允许调整 currentNumber / estimatedWaitTime
    // 真正的叫号应通过更新 bookings.status 实现，这里提供一个兼容接口
    const { start, end } = getDateRange(req.query.date as string | undefined);

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed', 'serving'])
      .gte('scheduled_time', start)
      .lt('scheduled_time', end)
      .order('queue_number', { ascending: true });

    if (error) {
      console.error('[queues] 查询预约失败:', error.message);
      return res.status(500).json({ success: false, error: '更新排队信息失败' });
    }

    const list = (bookings || []).map((b: any) => ({
      id: b.id,
      queueNumber: b.queue_number || 1,
      status: b.status,
    }));

    const finalCurrentNumber =
      typeof currentNumber === 'number' ? currentNumber : undefined;
    const finalEstimatedWaitTime =
      typeof estimatedWaitTime === 'number'
        ? estimatedWaitTime
        : list.filter((b) => (finalCurrentNumber ? b.queueNumber >= finalCurrentNumber : true) && b.status !== 'serving').length *
          AVERAGE_SERVICE_MINUTES;

    res.json({
      success: true,
      data: {
        id: `queue_${shopId}_${start.slice(0, 10)}`,
        shopId,
        currentNumber: finalCurrentNumber ?? 1,
        estimatedWaitTime: finalEstimatedWaitTime,
        bookings: list,
      },
    });
  } catch (error) {
    console.error('[queues] 更新排队信息失败:', error);
    res.status(500).json({ success: false, error: '更新排队信息失败' });
  }
});

export default router;
