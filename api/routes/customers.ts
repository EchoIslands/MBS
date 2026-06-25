import { Router, Request, Response } from 'express';
import { supabase } from '../db/index.js';
import { authMiddleware } from '../middleware/index.js';
import { toCamelCase, toCamelCaseList, toSnakeCase } from '../utils/case.js';

const router = Router();

// 所有客户接口都需要登录
router.use(authMiddleware);

/**
 * GET /api/customers
 * 获取当前店铺的客户列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;

    if (!shopId) {
      res.status(400).json({ success: false, error: '当前员工未关联店铺' });
      return;
    }

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[customers] 查询客户列表失败:', error.message);
      res.status(500).json({ success: false, error: '查询客户列表失败' });
      return;
    }

    const customers = toCamelCaseList(data || []);
    res.json({ success: true, data: customers });
  } catch (err: any) {
    console.error('[customers] 获取客户列表异常:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * POST /api/customers
 * 创建新客户
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;

    if (!shopId) {
      res.status(400).json({ success: false, error: '当前员工未关联店铺' });
      return;
    }

    const body = req.body || {};
    const customerId = body.id || `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const insertData: Record<string, any> = {
      id: customerId,
      shop_id: shopId,
      name: body.name || '未命名客户',
      phone: body.phone || '',
    };

    if (body.gender) insertData.gender = body.gender;
    if (body.age !== undefined && body.age !== null) insertData.age = body.age;
    if (body.birthday) {
      const d = typeof body.birthday === 'string' ? body.birthday.split('T')[0] : body.birthday;
      insertData.birthday = d;
    }
    if (body.tags && Array.isArray(body.tags)) insertData.tags = body.tags;
    if (body.membershipLevel) insertData.membership_level = body.membershipLevel;
    if (body.source) insertData.source = body.source;

    console.log('[customers] 准备插入:', JSON.stringify(insertData));

    const { data, error } = await supabase
      .from('customers')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[customers] 创建客户失败:', error.message);
      res.status(500).json({ success: false, error: '创建客户失败: ' + error.message });
      return;
    }

    console.log(`[customers] 客户创建成功 id=${data.id}`);
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[customers] 创建客户异常:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * PUT /api/customers/:id
 * 更新客户信息
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    const body = req.body || {};

    const updateData: Record<string, any> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.age !== undefined) updateData.age = body.age;
    if (body.birthday !== undefined) {
      updateData.birthday = typeof body.birthday === 'string' ? body.birthday.split('T')[0] : body.birthday;
    }
    if (body.membershipLevel !== undefined) updateData.membership_level = body.membershipLevel;
    if (body.source !== undefined) updateData.source = body.source;
    if (body.tags !== undefined && Array.isArray(body.tags)) updateData.tags = body.tags;
    if (body.visitCount !== undefined) updateData.visit_count = body.visitCount;
    if (body.totalSpent !== undefined) updateData.total_spent = body.totalSpent;
    if (body.balance !== undefined) updateData.balance = body.balance;
    if (body.points !== undefined) updateData.points = body.points;
    if (body.isStockholder !== undefined) updateData.is_stockholder = body.isStockholder;
    if (body.preferences !== undefined && Array.isArray(body.preferences)) updateData.preferences = body.preferences;
    if (body.servedByStylistIds !== undefined && Array.isArray(body.servedByStylistIds)) updateData.served_by_stylist_ids = body.servedByStylistIds;

    console.log('[customers] 准备更新:', id, JSON.stringify(updateData));

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      console.error('[customers] 更新客户失败:', error.message);
      res.status(500).json({ success: false, error: '更新客户失败: ' + error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    console.log(`[customers] 客户 ${data.name} 更新成功`);
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[customers] 更新客户异常:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * DELETE /api/customers/:id
 * 删除客户
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('shop_id', shopId);

    if (error) {
      console.error('[customers] 删除客户失败:', error.message);
      res.status(500).json({ success: false, error: '删除客户失败' });
      return;
    }

    console.log(`[customers] 客户 ${id} 删除成功`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[customers] 删除客户异常:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;