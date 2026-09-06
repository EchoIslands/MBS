import { Router, Request, Response } from 'express';
import { customerEventQueries } from '../db';

const router = Router();

interface CustomerEvent {
  event_type: string;
  platform?: string;
  page_path?: string;
  customer_id?: string;
  shop_id?: string;
  session_id?: string;
  app_version?: string;
  timestamp?: string;
  properties?: Record<string, unknown>;
}

// POST /api/analytics/events/batch
// 批量接收小程序/H5 埋点事件
router.post('/events/batch', async (req: Request, res: Response) => {
  const { events } = req.body || {};
  if (!Array.isArray(events) || events.length === 0) {
    res.status(400).json({ error: 'events 必须是数组且不能为空' });
    return;
  }

  try {
    const normalized: CustomerEvent[] = events.map((e) => ({
      event_type: String(e.event_type || 'unknown'),
      platform: e.platform ? String(e.platform) : undefined,
      page_path: e.page_path ? String(e.page_path) : undefined,
      customer_id: e.customer_id ? String(e.customer_id) : undefined,
      shop_id: e.shop_id ? String(e.shop_id) : undefined,
      session_id: e.session_id ? String(e.session_id) : undefined,
      app_version: e.app_version ? String(e.app_version) : undefined,
      timestamp: e.timestamp ? String(e.timestamp) : new Date().toISOString(),
      properties: e.properties && typeof e.properties === 'object' ? e.properties : {},
    }));

    const result = await customerEventQueries.batchCreate(normalized);
    res.json({ success: true, count: result.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analytics] 批量写入事件失败:', message);
    res.status(500).json({ error: '写入事件失败' });
  }
});

export default router;
