// 会员体系计算工具 —— 与 H5 shared/lib/membership.ts 保持一致
// 所有折扣、等级、有效期计算统一在此维护，避免 profile/checkout 等业务页各自硬编码

export const PurchaseVIPLevel = {
  REGULAR: 'regular',
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  DIAMOND: 'diamond',
};

export const StoredValueLevel = {
  NONE: 'none',
  STORE_500: 'store_500',
  STORE_1000: 'store_1000',
  STORE_2000: 'store_2000',
  STORE_5000: 'store_5000',
};

export const BenefitType = {
  SHAMPOO: 'shampoo',
  CONDITIONER: 'conditioner',
  FREE_HAIRCUT: 'free_haircut',
  DRINK: 'drink',
  REDO: 'redo',
};

export const purchaseVIPPlans = [
  { level: PurchaseVIPLevel.REGULAR, name: '普通用户', discount: 1, benefits: ['按店内正常价格消费'] },
  { level: PurchaseVIPLevel.BRONZE, name: '普卡 VIP', discount: 0.88, benefits: ['全场 8.8 折（假发除外）', '消费满 59 元送洗发水', '积分 1.2 倍'] },
  { level: PurchaseVIPLevel.SILVER, name: '银卡 VIP', discount: 0.78, benefits: ['全场 7.8 折（假发除外）', '消费满 59 元送洗发水+护发素', '积分 1.5 倍', '每次消费送饮品'] },
  { level: PurchaseVIPLevel.GOLD, name: '金卡 VIP', discount: 0.68, benefits: ['全场 6.8 折（假发除外）', '消费满 59 元送洗发水+护发素', '积分 2 倍', '每次消费送饮品', '不满意重做'] },
  { level: PurchaseVIPLevel.DIAMOND, name: '钻石 VIP', discount: 0.58, benefits: ['全场 5.8 折（假发除外）', '消费满 59 元送洗发水+护发素', '积分 3 倍', '每次消费送饮品', '不满意重做', '单次免费剪发一次'] },
];

export const storedValuePlans = [
  { level: StoredValueLevel.NONE, name: '未储值', amount: 0, discount: 1 },
  { level: StoredValueLevel.STORE_500, name: '储值卡', amount: 500, discount: 0.9 },
  { level: StoredValueLevel.STORE_1000, name: '安心卡', amount: 1000, discount: 0.85 },
  { level: StoredValueLevel.STORE_2000, name: '顺心卡', amount: 2000, discount: 0.8 },
  { level: StoredValueLevel.STORE_5000, name: '随心卡', amount: 5000, discount: 0.7 },
];

export const vipBenefits = [
  { feature: '服务折扣', bronze: '8.8折', silver: '7.8折', gold: '6.8折', diamond: '5.8折' },
  { feature: '购买价格', bronze: '¥29/年', silver: '¥59/年', gold: '¥79/年', diamond: '¥99/年' },
  { feature: '满59元赠洗护', bronze: '洗发水', silver: '洗发水+护发素', gold: '洗发水+护发素', diamond: '洗发水+护发素' },
  { feature: '饮品权益', bronze: '每次消费送', silver: '每次消费送', gold: '每次消费送', diamond: '每次消费送' },
  { feature: '不满意重做', bronze: '-', silver: '-', gold: '支持', diamond: '支持' },
  { feature: '免费剪发', bronze: '-', silver: '-', gold: '-', diamond: '1次' },
];

export const storedBenefits = [
  { feature: '储值金额', store500: '¥500', store1000: '¥1000', store2000: '¥2000', store5000: '¥5000' },
  { feature: '折上折折扣', store500: '9折', store1000: '8.5折', store2000: '8折', store5000: '7折' },
];

export function getPurchaseVIPLabel(level) {
  return purchaseVIPPlans.find((p) => p.level === level)?.name ?? '普通用户';
}

export function getStoredValueLabel(level) {
  return storedValuePlans.find((p) => p.level === level)?.name ?? '未储值';
}

export function getPurchaseVIPDiscount(level) {
  return purchaseVIPPlans.find((p) => p.level === level)?.discount ?? 1;
}

export function getStoredValueDiscount(level) {
  return storedValuePlans.find((p) => p.level === level)?.discount ?? 1;
}

export function getEffectivePurchaseVIPLevel(customer) {
  if (!customer || customer.purchaseVIPLevel === PurchaseVIPLevel.REGULAR) return PurchaseVIPLevel.REGULAR;
  if (!customer.purchaseVIPExpiresAt) return customer.purchaseVIPLevel;
  return new Date(customer.purchaseVIPExpiresAt).getTime() < Date.now()
    ? PurchaseVIPLevel.REGULAR
    : customer.purchaseVIPLevel;
}

export function getEffectiveStoredValueLevel(customer) {
  if (!customer || customer.storedValueLevel === StoredValueLevel.NONE) return StoredValueLevel.NONE;
  if (!customer.storedValueExpiresAt) return customer.storedValueLevel;
  return new Date(customer.storedValueExpiresAt).getTime() < Date.now()
    ? StoredValueLevel.NONE
    : customer.storedValueLevel;
}

export function getCustomerEffectiveDiscount(customer) {
  return getPurchaseVIPDiscount(getEffectivePurchaseVIPLevel(customer)) *
    getStoredValueDiscount(getEffectiveStoredValueLevel(customer));
}

export function isVIPExpiringSoon(customer) {
  if (!customer || !customer.purchaseVIPExpiresAt) return false;
  const days = (new Date(customer.purchaseVIPExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days > 0 && days <= 30;
}

export function isStoredValueExpiringSoon(customer) {
  if (!customer || !customer.storedValueExpiresAt) return false;
  const days = (new Date(customer.storedValueExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days > 0 && days <= 30;
}

export function generateBenefits(customer) {
  if (!customer) return [];
  const level = getEffectivePurchaseVIPLevel(customer);
  const benefits = [];
  if (level === PurchaseVIPLevel.BRONZE) {
    benefits.push({ type: BenefitType.SHAMPOO, name: '洗发水', description: '普卡 VIP 权益' });
  } else if (level === PurchaseVIPLevel.SILVER) {
    benefits.push(
      { type: BenefitType.SHAMPOO, name: '洗发水', description: '银卡 VIP 权益' },
      { type: BenefitType.CONDITIONER, name: '护发素', description: '银卡 VIP 权益' },
      { type: BenefitType.DRINK, name: '饮品', description: '银卡 VIP 权益' }
    );
  } else if (level === PurchaseVIPLevel.GOLD) {
    benefits.push(
      { type: BenefitType.SHAMPOO, name: '洗发水', description: '金卡 VIP 权益' },
      { type: BenefitType.CONDITIONER, name: '护发素', description: '金卡 VIP 权益' },
      { type: BenefitType.DRINK, name: '饮品', description: '金卡 VIP 权益' },
      { type: BenefitType.REDO, name: '不满意重做', description: '金卡 VIP 权益' }
    );
  } else if (level === PurchaseVIPLevel.DIAMOND) {
    benefits.push(
      { type: BenefitType.SHAMPOO, name: '洗发水', description: '钻石 VIP 权益' },
      { type: BenefitType.CONDITIONER, name: '护发素', description: '钻石 VIP 权益' },
      { type: BenefitType.DRINK, name: '饮品', description: '钻石 VIP 权益' },
      { type: BenefitType.REDO, name: '不满意重做', description: '钻石 VIP 权益' },
      { type: BenefitType.FREE_HAIRCUT, name: '免费剪发一次', description: '钻石 VIP 权益' }
    );
  }
  return benefits;
}

/**
 * 计算单个项目的折后价（假发不参与折扣）
 * @param {number} price 原价
 * @param {Customer} customer 顾客
 * @param {string} category 商品分类或 'service'
 */
export function calcDiscountedItemPrice(price, customer, category = 'service') {
  const effectivePrice = Number(price) || 0;
  if (category === 'wig') return effectivePrice;
  const discount = customer ? getCustomerEffectiveDiscount(customer) : 1;
  return Math.round(effectivePrice * discount * 100) / 100;
}
