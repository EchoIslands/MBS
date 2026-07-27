// 会员/折扣计算逻辑已迁移到 shared/lib/membership.ts，供 H5 与小程序复用。
// 本文件保留为兼容入口，H5 现有 import 路径无需修改。
export * from '../../shared/lib/membership';

import { Customer, ProductCategory, PurchaseVIPLevel, StoredValueLevel } from '../../shared/types';
import {
  calcDiscountedItemPrice as calcDiscountedItemPriceBase,
  getEffectivePurchaseVIPLevel,
  getEffectiveStoredValueLevel,
} from '../../shared/lib/membership';

/**
 * 根据顾客对象计算商品折后价（自动处理 VIP/储值过期降级）
 * 供 H5 商品列表/详情/购物车等页面使用，确保与后端下单价格一致
 */
export function calcDiscountedItemPriceForCustomer(
  originalPrice: number,
  customer: Customer | null | undefined,
  category?: ProductCategory | 'service'
): number {
  const purchaseLevel = customer
    ? getEffectivePurchaseVIPLevel(customer)
    : PurchaseVIPLevel.REGULAR;
  const storedLevel = customer
    ? getEffectiveStoredValueLevel(customer)
    : StoredValueLevel.NONE;
  return calcDiscountedItemPriceBase(originalPrice, purchaseLevel, storedLevel, category);
}
