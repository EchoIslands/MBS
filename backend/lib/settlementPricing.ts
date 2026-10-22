import { supabase } from '../db/index.js';
import { calcSettlementDiscountDetail, getEffectivePurchaseVIPLevel, getEffectiveStoredValueLevel, getFinalDiscount, getPurchaseVIPDiscount } from '../../shared/lib/membership.js';
import { Customer, MemberBenefitRecord, ProductCategory, PurchaseVIPLevel, StoredValueLevel, SettlementItem } from '../../shared/types.js';

const round = (n: number) => Math.round(n * 100) / 100;

/** 请求中的金额仅作核对；目录、会员级别、权益、次卡、团购均从数据库读取。 */
export async function priceSettlement(shopId: string, body: Record<string, any>) {
  const employeeIds = Array.isArray(body.items) ? [...new Set(body.items.map((item: any) => item?.employeeId).filter(Boolean))] : [];
  const [customerResult, shopResult, productResult, benefitResult, packageResult, employeeResult] = await Promise.all([
    supabase.from('customers').select('*').eq('id', body.customerId).eq('shop_id', shopId).maybeSingle(),
    supabase.from('shops').select('services').eq('id', shopId).maybeSingle(),
    supabase.from('products').select('id, name, price, category, is_active').eq('shop_id', shopId),
    supabase.from('member_benefit_records').select('*').eq('customer_id', body.customerId).eq('shop_id', shopId).in('id', body.usedBenefitIds || []),
    body.customerPackageId ? supabase.from('customer_packages').select('*').eq('id', body.customerPackageId).eq('shop_id', shopId).eq('customer_id', body.customerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    employeeIds.length ? supabase.from('employees').select('id, name').eq('shop_id', shopId).eq('is_active', true).in('id', employeeIds) : Promise.resolve({data:[],error:null}),
  ]);
  if ([customerResult, shopResult, productResult, benefitResult, packageResult, employeeResult].some(r => r.error)) throw new Error('结算基础数据暂不可用');
  if ((employeeResult.data || []).length !== employeeIds.length) throw new Error('服务设计师不属于本店有效员工');
  const c = customerResult.data;
  if (!c || !shopResult.data) throw new Error('客户或店铺不存在');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw new Error('结算项目数量不正确');
  const ids = body.usedBenefitIds || [];
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error('权益不能重复使用');
  const benefits = benefitResult.data || [];
  if (benefits.length !== ids.length || benefits.some(b => b.status !== 'available' || (b.expires_at && new Date(b.expires_at) <= new Date()))) throw new Error('权益不可用');
  const pkg = packageResult.data;
  if (body.customerPackageId && (!pkg || pkg.status !== 'active' || pkg.used_times >= pkg.total_times || new Date(pkg.expires_at) <= new Date())) throw new Error('次卡不可用');
  const customer = { purchaseVIPLevel: c.purchase_vip_level, purchaseVIPExpiresAt: c.purchase_vip_expires_at ? new Date(c.purchase_vip_expires_at) : undefined,
    storedValueLevel: c.stored_value_level, storedValueExpiresAt: c.stored_value_expires_at ? new Date(c.stored_value_expires_at) : undefined } as Customer;
  const purchase = getEffectivePurchaseVIPLevel(customer) || PurchaseVIPLevel.REGULAR;
  const stored = getEffectiveStoredValueLevel(customer) || StoredValueLevel.NONE;
  const normal: Array<{ originalPrice: number; quantity: number; category?: ProductCategory | 'service' }> = [];
  const items: SettlementItem[] = [];
  let extraSubtotal = 0, extraTotal = 0, packageLines = 0;
  const vouchers = new Set<string>();
  for (const raw of body.items) {
    if (!raw || !['service','product'].includes(raw.type) || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 100) throw new Error('结算项目或数量不正确');
    const row = raw.type === 'service' ? (shopResult.data.services || []).find((s: any) => String(s.id) === String(raw.id)) : (productResult.data || []).find(p => p.id === raw.id && p.is_active !== false);
    if (!row) throw new Error('项目不在本店有效目录中');
    // 价格只取门店目录；旧客户端的 employeeLevel 不作为加价依据。
    let originalPrice = round(Number(row.price));
    if (!Number.isFinite(originalPrice) || originalPrice < 0) throw new Error('目录价格不正确');
    const category = raw.type === 'service' ? 'service' : row.category;
    let final: number | undefined;
    if (pkg && raw.type === 'service' && String(raw.id) === pkg.service_id) {
      if (++packageLines !== 1 || raw.quantity !== 1 || raw.priceOverride !== undefined || raw.groupBuyVoucherId) throw new Error('每次结算次卡仅抵扣一个服务一次，不能叠加特殊价格');
      originalPrice = 0;
    }
    if (raw.priceOverride !== undefined) {
      if (raw.type !== 'service' || !Number.isFinite(raw.priceOverride) || raw.priceOverride < round(originalPrice * 0.58 * 0.7) || raw.priceOverride > originalPrice || raw.groupBuyVoucherId) throw new Error('手工改价超出允许范围');
      final = round(raw.priceOverride);
    } else if (raw.groupBuyVoucherId) {
      if(raw.type!=='service' || raw.quantity!==1) throw new Error('一张团购券只可抵扣一个服务一次');
      if (raw.type !== 'service' || raw.quantity !== 1 || vouchers.has(raw.groupBuyVoucherId)) throw new Error('团购券不能重复抵扣');
      vouchers.add(raw.groupBuyVoucherId);
      const { data: voucher, error } = await supabase.from('group_buy_vouchers').select('*, group_buy_batches(*)').eq('id', raw.groupBuyVoucherId).eq('shop_id', shopId).maybeSingle();
      const batch = voucher?.group_buy_batches;
      if (error || !voucher || !batch || voucher.status !== 'used' || voucher.used_by_customer_id !== body.customerId || (voucher.used_order_id && voucher.used_order_id !== body.id) || !batch.service_ids?.includes(String(raw.id))) throw new Error('团购券归属或状态不正确');
      if(batch.shop_id!==shopId || batch.is_active===false || !Number.isFinite(Date.parse(batch.valid_from)) || !Number.isFinite(Date.parse(batch.valid_to)) || new Date(batch.valid_from)>new Date() || new Date(batch.valid_to)<=new Date()) throw new Error('团购活动已停用或不在有效期内');
      final = batch.price_type === 'fixed' ? Number(batch.fixed_price) : batch.price_type === 'per_service' ? Number(batch.service_prices?.[raw.id]) : round(originalPrice * getPurchaseVIPDiscount(batch.vip_level));
      if (!Number.isFinite(final) || final < 0 || final > originalPrice) throw new Error('团购价格不正确');
    }
    if (final === undefined) normal.push({ originalPrice, quantity: raw.quantity, category });
    else { extraSubtotal += originalPrice * raw.quantity; extraTotal += final * raw.quantity; }
    const discountedPrice = final ?? (category === 'wig' ? originalPrice : round(originalPrice * getFinalDiscount(purchase, stored)));
    items.push({ type: raw.type, id: String(row.id), name: row.name, originalPrice, quantity: raw.quantity,
      discountedPrice, total: round(discountedPrice * raw.quantity), category, employeeId: raw.employeeId, employeeName: employeeResult.data?.find(e => e.id === raw.employeeId)?.name,
      priceOverride: raw.priceOverride, groupBuyVoucherId: raw.groupBuyVoucherId });
  }
  if (pkg && packageLines !== 1) throw new Error('次卡与服务不匹配');
  const detail = calcSettlementDiscountDetail(normal, purchase, stored, benefits as unknown as MemberBenefitRecord[]);
  const subtotal = round(detail.subtotal + extraSubtotal), total = round(detail.total + extraTotal);
  if (!Number.isFinite(body.total) || round(body.total) !== total || Number(body.tax || 0) !== 0) throw new Error('结算金额已变化或不正确，请刷新后重新结算');
  return { customerName: c.name, items, subtotal, total, discount: round(subtotal-total), discountDetail: detail, tax: 0 };
}
