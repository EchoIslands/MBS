import { Router, Request, Response } from 'express';
import { supabase } from '../db/index.js';

const router = Router();

// 时段长度（分钟）
const TIME_SLOT_MINUTES = 30;

// 辅助：计算某一天的 00:00 和次日 00:00
const getDateRange = (dateStr?: string) => {
  const base = dateStr ? new Date(dateStr) : new Date();
  base.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setDate(end.getDate() + 1);
  return { start: base.toISOString(), end: end.toISOString() };
};

// 获取预约时间所在时段的起始时间
const getTimeSlotStart = (date: Date, slotMinutes: number = TIME_SLOT_MINUTES) => {
  const d = new Date(date);
  const slotStart = Math.floor(d.getMinutes() / slotMinutes) * slotMinutes;
  d.setMinutes(slotStart, 0, 0);
  d.setMilliseconds(0);
  return d;
};

// 默认服务时长（分钟）
const DEFAULT_SERVICE_MINUTES = 30;

// 从店铺服务列表中查询服务时长
const getServiceDuration = async (shopId: string, serviceId: string): Promise<number> => {
  try {
    const { data } = await supabase
      .from('shops')
      .select('services')
      .eq('id', shopId)
      .maybeSingle();

    if (data?.services) {
      const services = data.services as any[];
      const svc = services.find((s: any) => s.id === serviceId);
      if (svc && typeof svc.duration === 'number' && svc.duration > 0) {
        return svc.duration;
      }
    }
  } catch (e) {
    console.error('[queues] 查询服务时长失败:', e);
  }
  return DEFAULT_SERVICE_MINUTES;
};

// 获取店铺当天排队状态（按同一时段分组）
// GET /api/queues/:shopId?date=YYYY-MM-DD
router.get('/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { start, end } = getDateRange(req.query.date as string | undefined);

    // 拉取当天店铺所有有效预约
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed', 'serving'])
      .gte('scheduled_time', start)
      .lt('scheduled_time', end)
      .order('scheduled_time', { ascending: true })
      .order('queue_number', { ascending: true });

    if (error) {
      console.error('[queues] 查询预约失败:', error.message);
      return res.status(500).json({ success: false, error: '查询排队信息失败' });
    }

    // 为每个 booking 补充服务时长
    const list = await Promise.all(
      (bookings || []).map(async (b: any) => {
        const duration = await getServiceDuration(shopId, b.service_id);
        return {
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
          duration,
        };
      }),
    );

    // 当前叫到第几号：按每个时段独立计算
    // 优先找本时段内 serving 的最小编号；否则找本时段内已完成的 max + 1；没有则 1
    const now = new Date();
    const currentSlotStart = getTimeSlotStart(now);

    const servingBookings = list.filter(
      (b) => getTimeSlotStart(new Date(b.scheduledTime)).getTime() === currentSlotStart.getTime() && b.status === 'serving',
    );

    let currentNumber = 1;
    if (servingBookings.length > 0) {
      currentNumber = Math.min(...servingBookings.map((b) => b.queueNumber));
    } else {
      const { data: completed, error: completedError } = await supabase
        .from('bookings')
        .select('queue_number, scheduled_time')
        .eq('shop_id', shopId)
        .eq('status', 'completed')
        .gte('scheduled_time', start)
        .lt('scheduled_time', end);

      if (completedError) {
        console.error('[queues] 查询已完成预约失败:', completedError.message);
      }

      const completedInCurrentSlot = (completed || []).filter(
        (b: any) => getTimeSlotStart(new Date(b.scheduled_time)).getTime() === currentSlotStart.getTime(),
      );
      const maxCompleted =
        completedInCurrentSlot.length > 0
          ? Math.max(...completedInCurrentSlot.map((b: any) => b.queue_number || 0))
          : 0;
      currentNumber = maxCompleted + 1;
    }

    // 预计等待时间：当前时段内，排在自己前面的未服务预约的服务时长之和
    // 如果请求没有指定目标 booking，则按当前时段整体估算（取前 3 位未服务预约）
    const currentSlotBookings = list.filter(
      (b) => getTimeSlotStart(new Date(b.scheduledTime)).getTime() === currentSlotStart.getTime(),
    );
    const aheadBookings = currentSlotBookings.filter(
      (b) => b.queueNumber >= currentNumber && b.status !== 'serving',
    );
    const estimatedWaitTime = aheadBookings
      .slice(0, 3)
      .reduce((sum, b) => sum + b.duration, 0);

    res.json({
      success: true,
      data: {
        id: `queue_${shopId}_${start.slice(0, 10)}`,
        shopId,
        currentNumber,
        estimatedWaitTime,
        bookings: list,
        timeSlotMinutes: TIME_SLOT_MINUTES,
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
    const { start, end } = getDateRange(req.query.date as string | undefined);

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed', 'serving'])
      .gte('scheduled_time', start)
      .lt('scheduled_time', end);

    if (error) {
      console.error('[queues] 查询预约失败:', error.message);
      return res.status(500).json({ success: false, error: '更新排队信息失败' });
    }

    const list = await Promise.all(
      (bookings || []).map(async (b: any) => {
        const duration = await getServiceDuration(shopId, b.service_id);
        return {
          id: b.id,
          queueNumber: b.queue_number || 1,
          status: b.status,
          duration,
        };
      }),
    );

    const finalCurrentNumber = typeof currentNumber === 'number' ? currentNumber : 1;
    const finalEstimatedWaitTime =
      typeof estimatedWaitTime === 'number'
        ? estimatedWaitTime
        : list
            .filter((b) => b.queueNumber >= finalCurrentNumber && b.status !== 'serving')
            .slice(0, 3)
            .reduce((sum, b) => sum + b.duration, 0);

    res.json({
      success: true,
      data: {
        id: `queue_${shopId}_${start.slice(0, 10)}`,
        shopId,
        currentNumber: finalCurrentNumber,
        estimatedWaitTime: finalEstimatedWaitTime,
        bookings: list,
        timeSlotMinutes: TIME_SLOT_MINUTES,
      },
    });
  } catch (error) {
    console.error('[queues] 更新排队信息失败:', error);
    res.status(500).json({ success: false, error: '更新排队信息失败' });
  }
});

export default router;
