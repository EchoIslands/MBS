import { Router, Request, Response } from 'express';
import { groupBuyBatchQueries, groupBuyVoucherQueries } from '../db.js';
import { purchaseVIPPlans, storedValuePlans } from '../../shared/membershipPlans.js';

const router = Router();

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
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

// GET /group-buy/batches?shopId=xxx
router.get('/batches', async (req: Request, res: Response) => {
  const shopId = req.query.shopId as string;
  if (!shopId) {
    res.status(400).json(fail('缺少 shopId'));
    return;
  }
  const batches = await groupBuyBatchQueries.listByShop(shopId);
  res.json(success(batches));
});

// POST /group-buy/batches
router.post('/batches', async (req: Request, res: Response) => {
  const { shopId, name, serviceIds, servicePrices, priceType, fixedPrice, vipLevel, validFrom, validTo, totalQuantity, isActive } = req.body || {};
  if (!shopId || !name || !validFrom || !validTo) {
    res.status(400).json(fail('缺少必要字段'));
    return;
  }
  const batch = await groupBuyBatchQueries.create({
    shop_id: shopId,
    name,
    service_ids: Array.isArray(serviceIds) ? serviceIds : [],
    service_prices: servicePrices && typeof servicePrices === 'object' ? servicePrices : {},
    price_type: priceType || 'fixed',
    fixed_price: fixedPrice,
    vip_level: vipLevel,
    valid_from: validFrom,
    valid_to: validTo,
    total_quantity: totalQuantity || 0,
    used_quantity: 0,
    is_active: isActive !== false,
  });
  res.status(201).json(success(batch));
});

// PUT /group-buy/batches/:id
router.put('/batches/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, serviceIds, servicePrices, priceType, fixedPrice, vipLevel, validFrom, validTo, totalQuantity, isActive } = req.body || {};
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (serviceIds !== undefined) updateData.service_ids = Array.isArray(serviceIds) ? serviceIds : [];
  if (servicePrices !== undefined) updateData.service_prices = servicePrices;
  if (priceType !== undefined) updateData.price_type = priceType;
  if (fixedPrice !== undefined) updateData.fixed_price = fixedPrice;
  if (vipLevel !== undefined) updateData.vip_level = vipLevel;
  if (validFrom !== undefined) updateData.valid_from = validFrom;
  if (validTo !== undefined) updateData.valid_to = validTo;
  if (totalQuantity !== undefined) updateData.total_quantity = totalQuantity;
  if (isActive !== undefined) updateData.is_active = isActive;

  const batch = await groupBuyBatchQueries.update(id, updateData);
  if (!batch) {
    res.status(404).json(fail('批次不存在'));
    return;
  }
  res.json(success(batch));
});

// DELETE /group-buy/batches/:id
router.delete('/batches/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const ok = await groupBuyBatchQueries.delete(id);
  if (!ok) {
    res.status(404).json(fail('批次不存在或删除失败'));
    return;
  }
  res.json(success({ deleted: true }));
});

// POST /group-buy/batches/:id/import-vouchers
router.post('/batches/:id/import-vouchers', async (req: Request, res: Response) => {
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
  const batch = await groupBuyBatchQueries.get(id);
  if (!batch) {
    res.status(404).json(fail('批次不存在'));
    return;
  }
  const rows = codes.map((code) => ({
    batch_id: id,
    shop_id: shopId,
    code: String(code).trim(),
    status: 'unused',
  }));
  const vouchers = await groupBuyVoucherQueries.batchCreate(rows);
  // 更新批次总数量
  await groupBuyBatchQueries.update(id, { total_quantity: (batch.total_quantity || 0) + rows.length });
  res.status(201).json(success({ count: vouchers.length }));
});

// POST /group-buy/batches/:id/generate-vouchers
router.post('/batches/:id/generate-vouchers', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { count = 10, format = 'numeric-8' } = req.body || {};
  const batch = await groupBuyBatchQueries.get(id);
  if (!batch) {
    res.status(404).json(fail('批次不存在'));
    return;
  }
  if (!['numeric-8', 'alphanumeric-8', 'numeric-12'].includes(format)) {
    res.status(400).json(fail('format 必须是 numeric-8、alphanumeric-8 或 numeric-12'));
    return;
  }
  const generateCount = Math.min(Math.max(Number(count) || 0, 1), 500);
  const shopId = batch.shop_id as string;

  // 获取该店铺已有券码，避免重复
  const existingVouchers = await groupBuyVoucherQueries.listByShop(shopId);
  const existingCodes = new Set(existingVouchers.map((v) => v.code));

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

  const rows = codes.map((code) => ({
    batch_id: id,
    shop_id: shopId,
    code,
    status: 'unused',
  }));
  const vouchers = await groupBuyVoucherQueries.batchCreate(rows);
  await groupBuyBatchQueries.update(id, { total_quantity: (batch.total_quantity || 0) + vouchers.length });
  res.status(201).json(success({ count: vouchers.length, codes }));
});

// GET /group-buy/batches/:id/export-vouchers
router.get('/batches/:id/export-vouchers', async (req: Request, res: Response) => {
  const { id } = req.params;
  const batch = await groupBuyBatchQueries.get(id);
  if (!batch) {
    res.status(404).json(fail('批次不存在'));
    return;
  }
  const vouchers = await groupBuyVoucherQueries.listByBatch(id);
  const servicePrices = (batch.service_prices as Record<string, number>) || {};
  const serviceIds = Array.isArray(batch.service_ids) ? batch.service_ids : [];

  const headers = ['券码', '适用服务项目ID', '服务项目团购价', '有效期开始', '有效期结束', '状态', '生成时间'];
  const rows = vouchers.map((v) => {
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
    const str = String(value ?? '');
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
});

// POST /group-buy/vouchers/verify
router.post('/vouchers/verify', async (req: Request, res: Response) => {
  const { code, serviceId, servicePrice, shopId } = req.body || {};
  if (!code || !shopId) {
    res.status(400).json(fail('缺少 code 或 shopId'));
    return;
  }
  const voucher = await groupBuyVoucherQueries.getByCode(shopId, String(code).trim());
  if (!voucher) {
    res.status(404).json(fail('券码不存在'));
    return;
  }
  const batch = (voucher as Record<string, unknown>).group_buy_batches as Record<string, unknown>;
  if (!batch) {
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

  // 计算团购价
  const { price, description } = calcGroupBuyPrice(batch, serviceId, servicePrice);

  res.json(success({
    voucher,
    batch,
    priceInfo: { price, description },
    needBind: false,
  }));
});

// POST /group-buy/vouchers/redeem
router.post('/vouchers/redeem', async (req: Request, res: Response) => {
  const { code, batchId, customerId, servicePrice, serviceId, shopId } = req.body || {};
  if (!code || !shopId) {
    res.status(400).json(fail('缺少 code 或 shopId'));
    return;
  }
  const voucher = await groupBuyVoucherQueries.getByCode(shopId, String(code).trim());
  if (!voucher) {
    res.status(404).json(fail('券码不存在'));
    return;
  }
  if (voucher.status !== 'unused') {
    res.status(400).json(fail('券码已使用或已失效'));
    return;
  }
  const batch = (voucher as Record<string, unknown>).group_buy_batches as Record<string, unknown>;
  if (!batch) {
    res.status(404).json(fail('券码未绑定批次'));
    return;
  }

  const serviceIds = Array.isArray(batch.service_ids) ? batch.service_ids : [];
  if (serviceId && !serviceIds.includes(serviceId)) {
    res.status(400).json(fail('该券码不适用所选服务项目'));
    return;
  }

  const { price, description } = calcGroupBuyPrice(batch, serviceId, servicePrice);

  const result = await groupBuyVoucherQueries.redeem(voucher.id, {
    used_by_customer_id: customerId,
    used_order_id: undefined,
  });
  if (!result) {
    res.status(400).json(fail('核销失败，券码可能已被使用'));
    return;
  }
  res.json(success({
    voucher: result,
    batch,
    priceInfo: { price, description },
  }));
});

// POST /group-buy/vouchers/:id/revoke
router.post('/vouchers/:id/revoke', async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await groupBuyVoucherQueries.revoke(id);
  if (!result) {
    res.status(404).json(fail('券码不存在或状态不是已使用'));
    return;
  }
  res.json(success(result));
});

// GET /group-buy/vouchers?shopId=xxx&batchId=xxx&status=xxx
router.get('/vouchers', async (req: Request, res: Response) => {
  const shopId = req.query.shopId as string;
  if (!shopId) {
    res.status(400).json(fail('缺少 shopId'));
    return;
  }
  const vouchers = await groupBuyVoucherQueries.listByShop(shopId, {
    batchId: req.query.batchId as string,
    status: req.query.status as string,
  });
  res.json(success(vouchers));
});

export default router;
