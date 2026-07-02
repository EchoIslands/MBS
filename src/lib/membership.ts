import {
  PurchaseVIPLevel,
  StoredValueLevel,
  BenefitType,
  ProductCategory,
  PurchaseVIPPlan,
  StoredValuePlan,
  Customer,
  MemberBenefitRecord,
  SettlementDiscountDetail,
} from '../../shared/types';
import { purchaseVIPPlans, storedValuePlans } from '../../shared/mockData';

// ==================== 权益有效期 ====================

/**
 * 获取各类权益的有效期天数
 */
export function getBenefitExpiryDays(type: BenefitType): number | null {
  switch (type) {
    case BenefitType.SHAMPOO:
    case BenefitType.CONDITIONER:
      return 90; // 洗护用品 90 天
    case BenefitType.FREE_HAIRCUT:
      return 365; // 免费剪发 1 年
    case BenefitType.REDO:
      return 7; // 不满意重做 7 天
    case BenefitType.DRINK:
    default:
      return null; // 饮品等无固定期限
  }
}

/**
 * 根据权益类型计算到期时间
 */
export function calcBenefitExpiryAt(type: BenefitType, grantedAt: Date = new Date()): Date | null {
  const days = getBenefitExpiryDays(type);
  if (days === null) return null;
  return new Date(grantedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

// ==================== 折扣计算 ====================

/**
 * 获取购买型 VIP 折扣率
 */
export function getPurchaseVIPDiscount(level: PurchaseVIPLevel): number {
  const plan = purchaseVIPPlans.find((p) => p.level === level);
  return plan?.discount ?? 1;
}

/**
 * 获取储值会员折扣率
 */
export function getStoredValueDiscount(level: StoredValueLevel): number {
  const plan = storedValuePlans.find((p) => p.level === level);
  return plan?.discount ?? 1;
}

/**
 * 获取最终折上折折扣率
 */
export function getFinalDiscount(
  purchaseLevel: PurchaseVIPLevel,
  storedValueLevel: StoredValueLevel
): number {
  return getPurchaseVIPDiscount(purchaseLevel) * getStoredValueDiscount(storedValueLevel);
}

/**
 * 判断商品/服务是否参与会员折扣
 */
export function isDiscountable(category?: ProductCategory | 'service'): boolean {
  if (category === 'service') return true;
  if (category === ProductCategory.WIG) return false;
  // 假发以外的商品均参与折扣
  return category !== undefined;
}

/**
 * 计算单项折后价格
 */
export function calcDiscountedItemPrice(
  originalPrice: number,
  purchaseLevel: PurchaseVIPLevel,
  storedValueLevel: StoredValueLevel,
  category?: ProductCategory | 'service'
): number {
  if (!isDiscountable(category)) return originalPrice;
  const final = getFinalDiscount(purchaseLevel, storedValueLevel);
  return Math.round(originalPrice * final * 100) / 100;
}

/**
 * 计算结算折扣明细
 */
export function calcSettlementDiscountDetail(
  items: Array<{
    originalPrice: number;
    quantity: number;
    category?: ProductCategory | 'service';
  }>,
  purchaseLevel: PurchaseVIPLevel,
  storedValueLevel: StoredValueLevel,
  usedBenefits?: MemberBenefitRecord[]
): SettlementDiscountDetail & { subtotal: number; total: number } {
  const purchaseDiscount = getPurchaseVIPDiscount(purchaseLevel);
  const storedDiscount = getStoredValueDiscount(storedValueLevel);

  let subtotal = 0;
  let afterPurchaseVIP = 0;

  items.forEach((item) => {
    const itemTotal = item.originalPrice * item.quantity;
    subtotal += itemTotal;
    if (isDiscountable(item.category)) {
      afterPurchaseVIP += itemTotal * purchaseDiscount;
    } else {
      afterPurchaseVIP += itemTotal;
    }
  });

  const purchaseVIPDiscountAmount = Math.round((subtotal - afterPurchaseVIP) * 100) / 100;
  const afterStoredValue = Math.round(afterPurchaseVIP * storedDiscount * 100) / 100;
  const storedValueDiscountAmount = Math.round((afterPurchaseVIP - afterStoredValue) * 100) / 100;

  // 权益抵扣金额（如免费剪发按原价抵扣）
  let benefitDiscountAmount = 0;
  if (usedBenefits && usedBenefits.length > 0) {
    usedBenefits.forEach((benefit) => {
      if (benefit.type === BenefitType.FREE_HAIRCUT) {
        // 免费剪发抵扣一次基础剪发价格，mock 中精剪原价 58
        benefitDiscountAmount += 58;
      }
    });
  }
  benefitDiscountAmount = Math.round(benefitDiscountAmount * 100) / 100;

  const total = Math.max(0, Math.round((afterStoredValue - benefitDiscountAmount) * 100) / 100);

  return {
    purchaseVIPDiscount: purchaseDiscount,
    storedValueDiscount: storedDiscount,
    finalDiscount: total > 0 && subtotal > 0 ? Math.round((total / subtotal) * 1000) / 1000 : 1,
    purchaseVIPDiscountAmount,
    storedValueDiscountAmount,
    benefitDiscountAmount,
    discount: Math.round((purchaseVIPDiscountAmount + storedValueDiscountAmount + benefitDiscountAmount) * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    total,
  };
}

// ==================== 计划查询 ====================

export function getPurchaseVIPPlan(level: PurchaseVIPLevel): PurchaseVIPPlan | undefined {
  return purchaseVIPPlans.find((p) => p.level === level);
}

export function getStoredValuePlan(level: StoredValueLevel): StoredValuePlan | undefined {
  return storedValuePlans.find((p) => p.level === level);
}

export function getPurchaseVIPLabel(level: PurchaseVIPLevel): string {
  return getPurchaseVIPPlan(level)?.name ?? '普通用户';
}

export function getStoredValueLabel(level: StoredValueLevel): string {
  return getStoredValuePlan(level)?.name ?? '未储值';
}

// ==================== 客户会员状态 ====================

/**
 * 判断购买型 VIP 是否在到期前 30 天内
 */
export function isVIPExpiringSoon(customer: Customer): boolean {
  if (!customer.purchaseVIPExpiresAt) return false;
  const daysUntilExpiry =
    (new Date(customer.purchaseVIPExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
}

/**
 * 判断购买型 VIP 是否已过期
 */
export function isVIPExpired(customer: Customer): boolean {
  if (!customer.purchaseVIPExpiresAt) return customer.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR;
  return new Date(customer.purchaseVIPExpiresAt).getTime() < Date.now();
}

/**
 * 获取客户实际有效的购买 VIP 等级（过期则降级为普通）
 */
export function getEffectivePurchaseVIPLevel(customer: Customer): PurchaseVIPLevel {
  if (isVIPExpired(customer)) return PurchaseVIPLevel.REGULAR;
  return customer.purchaseVIPLevel;
}

/**
 * 判断储值会员是否已过期
 */
export function isStoredValueExpired(customer: Customer): boolean {
  if (!customer.storedValueExpiresAt) return customer.storedValueLevel !== StoredValueLevel.NONE;
  return new Date(customer.storedValueExpiresAt).getTime() < Date.now();
}

/**
 * 判断储值会员是否在到期前 30 天内
 */
export function isStoredValueExpiringSoon(customer: Customer): boolean {
  if (!customer.storedValueExpiresAt) return false;
  const daysUntilExpiry =
    (new Date(customer.storedValueExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
}

/**
 * 获取客户实际有效的储值等级（过期则降级为未储值）
 */
export function getEffectiveStoredValueLevel(customer: Customer): StoredValueLevel {
  if (isStoredValueExpired(customer)) return StoredValueLevel.NONE;
  return customer.storedValueLevel;
}

/**
 * 计算客户可用于消费的有效折扣
 */
export function getCustomerEffectiveDiscount(customer: Customer): number {
  const purchaseLevel = getEffectivePurchaseVIPLevel(customer);
  const storedLevel = getEffectiveStoredValueLevel(customer);
  return getFinalDiscount(purchaseLevel, storedLevel);
}
