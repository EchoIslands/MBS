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

    const { id, ...rest } = req.body;

    // 生成客户 ID
    const customerId = id || `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 转换字段名并过滤掉 undefined 值（Supabase 不接受 undefined）
    const rawData = toSnakeCase({
      id: customerId,
      shop_id: shopId,
      ...rest,
    });
    const customerData: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawData)) {
      if (value !== undefined) {
        customerData[key] = value;
      }
    }

    console.log('[customers] 准备插入:', JSON.stringify(customerData));

    const { data, error } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (error) {
      console.error('[customers] 创建客户失败:', error.message, error.details, error.hint);
      res.status(500).json({ success: false, error: '创建客户失败: ' + error.message });
      return;
    }

    const customer = toCamelCase(data);
    console.log(`[customers] 客户 ${customer.name} 创建成功`);
    res.json({ success: true, data: customer });
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

    const updateData = toSnakeCase(req.body);
    // 不允许修改 shop_id
    delete updateData.shop_id;
    delete updateData.id;

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      console.error('[customers] 更新客户失败:', error.message);
      res.status(500).json({ success: false, error: '更新客户失败' });
      return;
    }

    if (!data) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    const customer = toCamelCase(data);
    console.log(`[customers] 客户 ${customer.name} 更新成功`);
    res.json({ success: true, data: customer });
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