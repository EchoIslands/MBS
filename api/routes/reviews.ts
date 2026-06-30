import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { supabase } from '../db/index.js';

const router = Router();

const reviewFromDb = (r: any): any => ({
  id: r.id,
  shopId: r.shop_id,
  customerId: r.customer_id,
  bookingId: r.booking_id,
  stylistId: r.stylist_id,
  serviceScore: r.service_score,
  priceScore: r.price_score,
  skillScore: r.skill_score,
  overallScore: r.overall_score,
  comment: r.comment || '',
  customerName: r.customer_name || '顾客',
  createdAt: r.created_at,
  reply: r.reply,
  replyBy: r.reply_by,
  replyAt: r.reply_at,
  isHidden: r.is_hidden,
});

// 创建评价
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      shopId,
      customerId,
      bookingId,
      stylistId,
      serviceScore,
      priceScore,
      skillScore,
      comment,
    } = req.body;

    if (!shopId || !customerId || !bookingId) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：shopId、customerId、bookingId',
      });
    }

    // 防止同一预约重复评价
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: '该预约已经评价过，请勿重复提交',
      });
    }

    // 计算综合评分
    const overallScore =
      Math.round(((Number(serviceScore || 5) + Number(priceScore || 5) + Number(skillScore || 5)) / 3) * 10) / 10;

    // 查询顾客姓名
    let customerName = '顾客';
    const { data: customer } = await supabase
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .single();
    if (customer?.name) {
      customerName = customer.name;
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        id: randomUUID(),
        shop_id: shopId,
        customer_id: customerId,
        booking_id: bookingId,
        stylist_id: stylistId || null,
        service_score: Number(serviceScore || 5),
        price_score: Number(priceScore || 5),
        skill_score: Number(skillScore || 5),
        overall_score: overallScore,
        comment: comment || '',
        customer_name: customerName,
      })
      .select()
      .single();

    if (error) {
      console.error('[reviews] 创建评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: `创建评价失败: ${error.message}`,
      });
    }

    // 更新店铺平均评分
    const { data: reviewStats } = await supabase
      .from('reviews')
      .select('overall_score')
      .eq('shop_id', shopId);

    const scores = (reviewStats || []).map((r: any) => Number(r.overall_score)).filter((s: number) => !isNaN(s));
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 5;

    await supabase
      .from('shops')
      .update({
        rating: Math.round(avgScore * 10) / 10,
        review_count: scores.length,
      })
      .eq('id', shopId);

    res.status(201).json({
      success: true,
      data: reviewFromDb(data),
    });
  } catch (error) {
    console.error('[reviews] 创建评价异常:', error);
    res.status(500).json({
      success: false,
      error: '创建评价失败',
    });
  }
});

// 根据预约ID查询评价
router.get('/booking/:bookingId', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[reviews] 查询预约评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: `查询预约评价失败: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data: data ? reviewFromDb(data) : null,
    });
  } catch (error) {
    console.error('[reviews] 查询预约评价异常:', error);
    res.status(500).json({
      success: false,
      error: '查询预约评价失败',
    });
  }
});

// 获取顾客评价列表
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[reviews] 查询顾客评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '查询顾客评价失败',
      });
    }

    res.json({
      success: true,
      data: (data || []).map(reviewFromDb),
    });
  } catch (error) {
    console.error('[reviews] 获取顾客评价异常:', error);
    res.status(500).json({
      success: false,
      error: '获取顾客评价失败',
    });
  }
});

// 获取店铺评价列表
router.get('/shop/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;

    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[reviews] 查询评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '查询评价失败',
      });
    }

    res.json({
      success: true,
      data: (data || []).map(reviewFromDb),
    });
  } catch (error) {
    console.error('[reviews] 获取评价异常:', error);
    res.status(500).json({
      success: false,
      error: '获取评价失败',
    });
  }
});

// 回复评价
router.put('/:id/reply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reply, replyBy } = req.body;

    if (!reply || !replyBy) {
      return res.status(400).json({
        success: false,
        error: '缺少回复内容或回复人',
      });
    }

    const { data, error } = await supabase
      .from('reviews')
      .update({
        reply,
        reply_by: replyBy,
        reply_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[reviews] 回复评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: `回复评价失败: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data: reviewFromDb(data),
    });
  } catch (error) {
    console.error('[reviews] 回复评价异常:', error);
    res.status(500).json({
      success: false,
      error: '回复评价失败',
    });
  }
});

// 隐藏/显示评价
router.put('/:id/hide', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isHidden } = req.body;

    const { data, error } = await supabase
      .from('reviews')
      .update({ is_hidden: Boolean(isHidden) })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[reviews] 更新评价显示状态失败:', error.message);
      return res.status(500).json({
        success: false,
        error: `更新评价显示状态失败: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data: reviewFromDb(data),
    });
  } catch (error) {
    console.error('[reviews] 更新评价显示状态异常:', error);
    res.status(500).json({
      success: false,
      error: '更新评价显示状态失败',
    });
  }
});

export default router;
