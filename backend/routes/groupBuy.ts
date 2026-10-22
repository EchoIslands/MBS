import {operationError} from '../lib/rpcErrors.js';
import {randomInt,randomUUID} from 'node:crypto';
import { Router, Request, Response } from 'express';
import { supabase } from '../db/index.js';
import { purchaseVIPPlans, storedValuePlans } from '../../shared/membershipPlans.js';
import { authMiddleware } from '../middleware/index.js';
import { requirePermission } from '../middleware/permissions.js';
import { ownRecord } from '../middleware/resourceAccess.js';

const router = Router();
router.use(authMiddleware);
router.use((req, res, next) => {
  const shopId = req.employee!.shopId;
  if ((req.query.shopId && req.query.shopId !== shopId) || (req.body?.shopId && req.body.shopId !== shopId)) {
    res.status(403).json({ success: false, error: '无权操作其他店铺团购券' }); return;
  }
  req.query.shopId = shopId;
  req.body = { ...req.body, shopId };
  next();
});
// 沿用前端已有的团购管理岗位；核销入口仍供开单结算岗位使用。
router.use('/batches', requirePermission('shop:edit'));
router.use('/batches/:id', ownRecord('group_buy_batches'));
router.use('/vouchers/:id/revoke', requirePermission('shop:edit'), ownRecord('group_buy_vouchers'));

// 将 Supabase 返回的 snake_case 批次数据转换为前端 camelCase
function toBatchCamelCase(batch: Record<string, unknown>): Record<string, unknown> {
  return {
    id: batch.id,
    shopId: batch.shop_id,
    name: batch.name,
    serviceIds: batch.service_ids || [],
    servicePrices: batch.service_prices || {},
    priceType: batch.price_type,
    fixedPrice: batch.fixed_price,
    vipLevel: batch.vip_level,
    validFrom: batch.valid_from,
    validTo: batch.valid_to,
    totalQuantity: batch.total_quantity,
    usedQuantity: batch.used_quantity,
    platform: (batch.platform as string) || 'other',
    isActive: batch.is_active,
    createdAt: batch.created_at,
    updatedAt: batch.updated_at,
  };
}

// 将 Supabase 返回的 snake_case 券码数据转换为前端 camelCase
function toVoucherCamelCase(voucher: Record<string, unknown>): Record<string, unknown> {
  return {
    id: voucher.id,
    batchId: voucher.batch_id,
    shopId: voucher.shop_id,
    code: voucher.code,
    status: voucher.status,
    platform: (voucher.platform as string) || 'other',
    usedAt: voucher.used_at,
    usedByCustomerId: voucher.used_by_customer_id,
    usedOrderId: voucher.used_order_id,
    createdAt: voucher.created_at,
  };
}

// 根据批次价格配置计算服务项目团购价
function calcGroupBuyPrice(
  batch: Record<string, unknown>,
  serviceId?: string,
  originalPrice?: number
): { price: number; description: string } {
  const priceType = batch.price_type as string;
  const servicePrices = (batch.service_prices as Record<string, number>) || {};

  if (priceType === 'per_service' && serviceId && servicePrices[serviceId] !== undefined) {
    return { price: servicePrices[serviceId], description: '服务项目自定义价' };
  }

  if (priceType === 'fixed' && batch.fixed_price !== undefined && batch.fixed_price !== null) {
    return { price: Number(batch.fixed_price), description: '固定团购价' };
  }

  if (priceType === 'vip_level') {
    const vipLevel = batch.vip_level as string;
    const purchasePlan = purchaseVIPPlans.find((p) => p.level === vipLevel);
    const storedPlan = storedValuePlans.find((p) => p.level === vipLevel);
    const plan = purchasePlan || storedPlan;
    const discount = plan?.discount ?? 1;
    const label = plan?.name ?? '普通价';
    const price = originalPrice !== undefined ? Math.round(originalPrice * discount * 100) / 100 : 0;
    return { price, description: `${label}折扣价` };
  }

  return { price: originalPrice ?? 0, description: '原价' };
}

// 工具：统一返回成功响应
const success = <T>(data: T) => ({ success: true, data });

// 工具：统一返回错误响应
const fail = (message: string, code = 400) => ({ success: false, error: message, code });

// 工具：生成随机券码
const generateVoucherCode = (format: string): string => {
  const numericChars = '0123456789';
  // 去掉 0、O、1、I、L、B、8 等易混淆字符
  const alphanumericChars = '2345679ACDEFGHJKMNPQRSTUVWXYZ';
  let chars = numericChars;
  let length = 8;
  if (format === 'alphanumeric-8') {
    chars = alphanumericChars;
  } else if (format === 'numeric-12') {
    length = 12;
  }
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
};

const generateId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

// 从扫码内容中提取真实券码
// 支持：纯文本、URL（query/path）、JSON
function extractVoucherCode(rawCode: string): string {
  if (!rawCode) return '';
  const trimmed = rawCode.trim();

  // 尝试解析 JSON
  try {
    const parsed = JSON.parse(trimmed);
    const candidate =
      parsed.code ??
      parsed.voucherCode ??
      parsed.couponCode ??
      parsed.voucher?.code ??
      parsed.coupon?.code ??
      parsed.data?.code ??
      parsed.data?.voucherCode ??
      parsed.sn ??
      parsed.no;
    if (candidate) return String(candidate).trim();
  } catch {
    // 不是 JSON，继续处理
  }

  // URL 场景：尝试从 query 或 path 提取
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const possibleKeys = ['code', 'voucher', 'voucherCode', 'coupon', 'couponCode', 'sn', 'no'];
      for (const key of possibleKeys) {
        const value = url.searchParams.get(key);
        if (value) return value.trim();
      }
      const pathParts = url.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart.length >= 6) return lastPart.trim();
    } catch {
      // URL 解析失败，继续 fallback
    }
  }

  // 兜底：从文本中匹配一串看起来像券码的字符
  const match = trimmed.match(/[A-Z0-9]{6,}/i);
  if (match) return match[0];

  return trimmed;
}

// GET /group-buy/batches?shopId=xxx
router.get('/batches', async (req: Request, res: Response) => {
  try {
    const shopId = req.query.shopId as string;
    if (!shopId) {
      res.status(400).json(fail('缺少 shopId'));
      return;
    }
    const { data, error } = await supabase
      .from('group_buy_batches')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[group-buy] 查询批次失败:', error.message);
      res.status(500).json(fail('查询批次失败'));
      return;
    }
    res.json(success((data || []).map(toBatchCamelCase)));
  } catch (err: unknown) {
    console.error('[group-buy] 查询批次异常:', err);
    res.status(500).json(fail('查询批次异常'));
  }
});

// POST /group-buy/batches
router.post('/batches', async (req: Request, res: Response) => {
  try {
    const { shopId, name, serviceIds, servicePrices, priceType, fixedPrice, vipLevel, platform, validFrom, validTo, totalQuantity, isActive } = req.body || {};
    if (!shopId || !name || !validFrom || !validTo) {
      res.status(400).json(fail('缺少必要字段'));
      return;
    }
    const validPlatforms = ['meituan', 'douyin', 'dianping', 'other'];
    const batchPlatform = validPlatforms.includes(platform) ? platform : 'other';
    const now = new Date().toISOString();
    const insertData = {
      id: generateId(),
      shop_id: shopId,
      name,
      service_ids: Array.isArray(serviceIds) ? serviceIds : [],
      service_prices: servicePrices && typeof servicePrices === 'object' ? servicePrices : {},
      price_type: priceType || 'fixed',
      fixed_price: fixedPrice,
      vip_level: vipLevel,
      platform: batchPlatform,
      valid_from: validFrom,
      valid_to: validTo,
      total_quantity: totalQuantity || 0,
      used_quantity: 0,
      is_active: isActive !== false,
      created_at: now,
      updated_at: now,
    };
    const { data: result, error } = await supabase.from('group_buy_batches').insert(insertData).select().single();
    if (error) {
      console.error('[group-buy] 创建批次失败:', error.message);
      res.status(500).json(fail('创建批次失败'));
      return;
    }
    res.status(201).json(success(toBatchCamelCase(result)));
  } catch (err: unknown) {
    console.error('[group-buy] 创建批次异常:', err);
    res.status(500).json(fail('创建批次异常'));
  }
});

// PUT /group-buy/batches/:id
router.put('/batches/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, serviceIds, servicePrices, priceType, fixedPrice, vipLevel, platform, validFrom, validTo, totalQuantity, isActive } = req.body || {};
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const validPlatforms = ['meituan', 'douyin', 'dianping', 'other'];
    if (name !== undefined) updateData.name = name;
    if (serviceIds !== undefined) updateData.service_ids = Array.isArray(serviceIds) ? serviceIds : [];
    if (servicePrices !== undefined) updateData.service_prices = servicePrices;
    if (priceType !== undefined) updateData.price_type = priceType;
    if (fixedPrice !== undefined) updateData.fixed_price = fixedPrice;
    if (vipLevel !== undefined) updateData.vip_level = vipLevel;
    if (platform !== undefined && validPlatforms.includes(platform)) updateData.platform = platform;
    if (validFrom !== undefined) updateData.valid_from = validFrom;
    if (validTo !== undefined) updateData.valid_to = validTo;
    if (totalQuantity !== undefined) updateData.total_quantity = totalQuantity;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data: result, error } = await supabase.from('group_buy_batches').update(updateData).eq('id', id).select().single();
    if (error) {
      console.error('[group-buy] 更新批次失败:', error.message);
      res.status(500).json(fail('更新批次失败'));
      return;
    }
    if (!result) {
      res.status(404).json(fail('批次不存在'));
      return;
    }
    res.json(success(toBatchCamelCase(result)));
  } catch (err: unknown) {
    console.error('[group-buy] 更新批次异常:', err);
    res.status(500).json(fail('更新批次异常'));
  }
});

// DELETE /group-buy/batches/:id
router.delete('/batches/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // 已用或被结算绑定的券不得随批次级联删除，保留核销/财务凭证。
    const {data:used,error:usedError}=await supabase.from('group_buy_vouchers').select('id').eq('batch_id',id).or('status.eq.used,used_order_id.not.is.null').limit(1);
    if(usedError) return res.status(503).json(fail('核销状态查询失败，请稍后重试'));
    if(used?.length) return res.status(409).json(fail('此批次已有核销或结算记录，请停用批次，保留历史凭证'));
    const { error } = await supabase.from('group_buy_batches').delete().eq('id', id).eq('shop_id',req.employee!.shopId);
    if (error) {
      console.error('[group-buy] 删除批次失败:', error.message);
      res.status(500).json(fail('删除批次失败'));
      return;
    }
    res.json(success({ deleted: true }));
  } catch (err: unknown) {
    console.error('[group-buy] 删除批次异常:', err);
    res.status(500).json(fail('删除批次异常'));
  }
});

// POST /group-buy/batches/:id/import-vouchers
router.post('/batches/:id/import-vouchers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { codes, shopId } = req.body || {};
    if (!shopId) {
      res.status(400).json(fail('缺少 shopId'));
      return;
    }
    if (!Array.isArray(codes) || codes.length === 0) {
      res.status(400).json(fail('codes 必须是数组且不能为空'));
      return;
    }
    const { data: batch, error: batchError } = await supabase.from('group_buy_batches').select('*').eq('id', id).single();
    if (batchError || !batch) {
      res.status(404).json(fail('批次不存在'));
      return;
    }
    const now = new Date().toISOString();
    const batchPlatform = (batch.platform as string) || 'other';
    const rows = codes.map((code) => ({
      id: generateId(),
      batch_id: id,
      shop_id: shopId,
      code: extractVoucherCode(String(code)),
      status: 'unused',
      platform: batchPlatform,
      created_at: now,
    }));
    const { data: vouchers, error: insertError } = await supabase.rpc('import_group_buy_vouchers_atomic',{p_batch_id:id,p_shop_id:shopId,p_vouchers:rows});
    if (insertError) {
      console.error('[group-buy] 导入券码失败:', insertError.message);
      operationError(res,insertError,'导入券码失败，请检查是否重复');
      return;
    }
    res.status(201).json(success({ count: vouchers?.length || 0 }));
  } catch (err: unknown) {
    console.error('[group-buy] 导入券码异常:', err);
    res.status(500).json(fail('导入券码异常'));
  }
});

// POST /group-buy/batches/:id/generate-vouchers
router.post('/batches/:id/generate-vouchers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { count = 10, format = 'numeric-8' } = req.body || {};
    const { data: batch, error: batchError } = await supabase.from('group_buy_batches').select('*').eq('id', id).single();
    if (batchError || !batch) {
      res.status(404).json(fail('批次不存在'));
      return;
    }
    if (!['numeric-8', 'alphanumeric-8', 'numeric-12'].includes(format)) {
      res.status(400).json(fail('format 必须是 numeric-8、alphanumeric-8 或 numeric-12'));
      return;
    }
    const generateCount = Number(count);
    if(!Number.isInteger(generateCount) || generateCount<1 || generateCount>500) return res.status(400).json(fail('生成数量必须是1到500的整数'));
    const shopId = batch.shop_id as string;

    // 获取该店铺已有券码，避免重复
    const { data: existingVouchers } = await supabase.from('group_buy_vouchers').select('code').eq('shop_id', shopId);
    const existingCodes = new Set((existingVouchers || []).map((v) => v.code));

    const codes: string[] = [];
    let attempts = 0;
    const maxAttempts = generateCount * 100;
    while (codes.length < generateCount && attempts < maxAttempts) {
      attempts++;
      const code = generateVoucherCode(format);
      if (!existingCodes.has(code)) {
        existingCodes.add(code);
        codes.push(code);
      }
    }

    if (codes.length === 0) {
      res.status(500).json(fail('生成券码失败，请重试'));
      return;
    }

    const now = new Date().toISOString();
    const batchPlatform = (batch.platform as string) || 'other';
    const rows = codes.map((code) => ({
      id: generateId(),
      batch_id: id,
      shop_id: shopId,
      code,
      status: 'unused',
      platform: batchPlatform,
      created_at: now,
    }));
    const { data: vouchers, error: insertError } = await supabase.rpc('import_group_buy_vouchers_atomic',{p_batch_id:id,p_shop_id:shopId,p_vouchers:rows});
    if (insertError) {
      console.error('[group-buy] 生成券码失败:', insertError.message);
      operationError(res,insertError,'生成券码失败，请重试');
      return;
    }
    res.status(201).json(success({ count: vouchers?.length || 0, codes }));
  } catch (err: unknown) {
    console.error('[group-buy] 生成券码异常:', err);
    res.status(500).json(fail('生成券码异常'));
  }
});

// GET /group-buy/batches/:id/export-vouchers
router.get('/batches/:id/export-vouchers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data: batch, error: batchError } = await supabase.from('group_buy_batches').select('*').eq('id', id).single();
    if (batchError || !batch) {
      res.status(404).json(fail('批次不存在'));
      return;
    }
    const { data: vouchers } = await supabase.from('group_buy_vouchers').select('*').eq('batch_id', id).order('created_at', { ascending: false });
    const servicePrices = (batch.service_prices as Record<string, number>) || {};
    const serviceIds = Array.isArray(batch.service_ids) ? batch.service_ids : [];

    const headers = ['券码', '适用服务项目ID', '服务项目团购价', '有效期开始', '有效期结束', '状态', '生成时间'];
    const rows = (vouchers || []).map((v) => {
      const prices = serviceIds.map((sid) => `${sid}:${servicePrices[sid] ?? batch.fixed_price ?? ''}`).join(';');
      return [
        v.code,
        serviceIds.join(';'),
        prices,
        batch.valid_from,
        batch.valid_to,
        v.status,
        v.created_at,
      ];
    });

    const escapeCsv = (value: unknown) => {
      const raw = String(value ?? '');
      const str = /^[\s]*[=+\-@]/.test(raw) ? "'" + raw : raw;
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');

    const batchName = String(batch.name || 'batch').replace(/[^\w\u4e00-\u9fa5]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${batchName}-vouchers.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err: unknown) {
    console.error('[group-buy] 导出券码异常:', err);
    res.status(500).json(fail('导出券码异常'));
  }
});

// POST /group-buy/vouchers/verify
router.post('/vouchers/verify', async (req: Request, res: Response) => {
  try {
    const { code, serviceId, servicePrice, shopId } = req.body || {};
    if (!code || !shopId) {
      res.status(400).json(fail('缺少 code 或 shopId'));
      return;
    }
    const extractedCode = extractVoucherCode(String(code));
    if (!extractedCode) {
      res.status(400).json(fail('无法从扫码内容中提取券码'));
      return;
    }
    const { data: voucher, error } = await supabase
      .from('group_buy_vouchers')
      .select('*')
      .eq('shop_id', shopId)
      .eq('code', extractedCode)
      .single();
    if (error || !voucher) {
      res.status(404).json(fail('券码不存在'));
      return;
    }
    const { data: batch, error: batchError } = await supabase
      .from('group_buy_batches')
      .select('*')
      .eq('id', voucher.batch_id)
      .single();
    if (batchError || !batch) {
      res.status(404).json(fail('券码未绑定批次'));
      return;
    }
    if (voucher.status !== 'unused') {
      res.status(400).json(fail('券码已使用或已失效'));
      return;
    }
    const now = new Date();
    const validFrom = batch.valid_from ? new Date(batch.valid_from as string) : null;
    const validTo = batch.valid_to ? new Date(batch.valid_to as string) : null;
    if (validFrom && now < validFrom) {
      res.status(400).json(fail('券码未开始'));
      return;
    }
    if (validTo && now > validTo) {
      res.status(400).json(fail('券码已过期'));
      return;
    }
    if (batch.is_active === false) {
      res.status(400).json(fail('批次已停用'));
      return;
    }

    const serviceIds = Array.isArray(batch.service_ids) ? batch.service_ids : [];
    if (serviceId && !serviceIds.includes(serviceId)) {
      res.status(400).json(fail('该券码不适用所选服务项目'));
      return;
    }

    const { price, description } = calcGroupBuyPrice(batch, serviceId, servicePrice);

    res.json(success({
      voucher: toVoucherCamelCase(voucher as Record<string, unknown>),
      batch: toBatchCamelCase(batch),
      priceInfo: { price, description },
      needBind: false,
    }));
  } catch (err: unknown) {
    console.error('[group-buy] 核销验证异常:', err);
    res.status(500).json(fail('核销验证异常'));
  }
});

// POST /group-buy/vouchers/redeem
router.post('/vouchers/redeem', async (req: Request, res: Response) => {
  try {
    const { code, customerId, servicePrice, serviceId, shopId } = req.body || {};
    if (!code || !shopId) {
      res.status(400).json(fail('缺少 code 或 shopId'));
      return;
    }
    const extractedCode = extractVoucherCode(String(code));
    if (!extractedCode) {
      res.status(400).json(fail('无法从扫码内容中提取券码'));
      return;
    }
    const { data: voucher, error } = await supabase
      .from('group_buy_vouchers')
      .select('*')
      .eq('shop_id', shopId)
      .eq('code', extractedCode)
      .single();
    if (error || !voucher) {
      res.status(404).json(fail('券码不存在'));
      return;
    }
    if (voucher.status !== 'unused') {
      res.status(400).json(fail('券码已使用或已失效'));
      return;
    }
    const { data: batch, error: batchError } = await supabase
      .from('group_buy_batches')
      .select('*')
      .eq('id', voucher.batch_id)
      .single();
    if (batchError || !batch) {
      res.status(404).json(fail('券码未绑定批次'));
      return;
    }

    if (batch.shop_id !== shopId || batch.is_active === false ||
        (batch.valid_from && Date.now() < new Date(batch.valid_from).getTime()) ||
        (batch.valid_to && Date.now() > new Date(batch.valid_to).getTime())) {
      res.status(400).json(fail('批次已停用、未生效或已过期')); return;
    }
    if (customerId) {
      const { data: customer, error: customerError } = await supabase.from('customers').select('id')
        .eq('id', customerId).eq('shop_id', shopId).maybeSingle();
      if (customerError) { res.status(503).json(fail('顾客归属校验暂不可用')); return; }
      if (!customer) { res.status(404).json(fail('顾客不存在或不属于本店')); return; }
    }

    const serviceIds = Array.isArray(batch.service_ids) ? batch.service_ids : [];
    if (serviceId && !serviceIds.includes(serviceId)) {
      res.status(400).json(fail('该券码不适用所选服务项目'));
      return;
    }

    const { price, description } = calcGroupBuyPrice(batch, serviceId, servicePrice);

    const { data: result, error: updateError } = await supabase
      .from('group_buy_vouchers')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        used_by_customer_id: customerId,
        used_order_id: null,
      })
      .eq('id', voucher.id)
      .eq('shop_id', shopId)
      .eq('status', 'unused')
      .select()
      .single();
    if (updateError || !result) {
      res.status(400).json(fail('核销失败，券码可能已被使用'));
      return;
    }
    res.json(success({
      voucher: toVoucherCamelCase(result as Record<string, unknown>),
      batch: toBatchCamelCase(batch),
      priceInfo: { price, description },
    }));
  } catch (err: unknown) {
    console.error('[group-buy] 核销异常:', err);
    res.status(500).json(fail('核销异常'));
  }
});

// POST /group-buy/vouchers/:id/revoke
router.post('/vouchers/:id/revoke', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data: result, error } = await supabase
      .from('group_buy_vouchers')
      .update({ status: 'unused', used_at: null, used_by_customer_id: null, used_order_id: null })
      .eq('id', id)
      .eq('shop_id', req.employee!.shopId)
      .eq('status', 'used')
      .is('used_order_id', null)
      .select()
      .single();
    if (error || !result) {
      res.status(404).json(fail('券码不存在或状态不是已使用'));
      return;
    }
    res.json(success(toVoucherCamelCase(result)));
  } catch (err: unknown) {
    console.error('[group-buy] 撤销核销异常:', err);
    res.status(500).json(fail('撤销核销异常'));
  }
});

// GET /group-buy/vouchers?shopId=xxx&batchId=xxx&status=xxx
router.get('/vouchers', async (req: Request, res: Response) => {
  try {
    const shopId = req.query.shopId as string;
    if (!shopId) {
      res.status(400).json(fail('缺少 shopId'));
      return;
    }
    let query = supabase.from('group_buy_vouchers').select('*').eq('shop_id', shopId);
    if (req.query.batchId) query = query.eq('batch_id', req.query.batchId as string);
    if (req.query.status) query = query.eq('status', req.query.status as string);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('[group-buy] 查询券码失败:', error.message);
      res.status(500).json(fail('查询券码失败'));
      return;
    }
    res.json(success((data || []).map(toVoucherCamelCase)));
  } catch (err: unknown) {
    console.error('[group-buy] 查询券码异常:', err);
    res.status(500).json(fail('查询券码异常'));
  }
});

export default router;
