import { toSnakeCase } from './case.js';

/**
 * 客户表允许前端传入的字段白名单。
 * 不在此列表中的字段会被过滤，防止前端意外写入非法 key。
 */
export const CUSTOMER_FIELD_WHITELIST = new Set([
  'name',
  'phone',
  'wechat',
  'gender',
  'age',
  'avatar',
  'tags',
  'visit_count',
  'total_spent',
  'membership_level',
  'balance',
  'points',
  'birthday',
  'preferences',
  'is_stockholder',
  'stockholder_since',
  'referral_bonus_rate',
  'referral_earnings',
  'served_by_stylist_ids',
  'source',
  'last_visit_at',
  'purchase_vip_level',
  'purchase_vip_expires_at',
  'stored_value_level',
  'stored_value_balance',
  'stored_value_expires_at',
  'withdrawable_referral_amount',
  'total_saved',
  'id_card_number',
  'hobbies',
  'is_referred',
  'referrer_name',
  'referrer_phone',
  'referral_consumption',
  'shared_fund',
  'total_shared_fund',
  'withdrawable_amount',
  'has_booking',
  'last_service_items',
  'is_member',
  'has_recharged',
  'recharge_level',
]);

/**
 * 需要按日期处理的字段（只保留 YYYY-MM-DD 部分）
 */
const DATE_FIELDS = new Set([
  'birthday',
  'last_visit_at',
  'purchase_vip_expires_at',
  'stored_value_expires_at',
  'stockholder_since',
]);

/**
 * 必须是数组的字段
 */
const ARRAY_FIELDS = new Set([
  'tags',
  'preferences',
  'served_by_stylist_ids',
  'last_service_items',
]);

/**
 * 将前端客户对象转换为可写入 Supabase 的 snake_case 对象。
 *
 * @param body 前端请求体
 * @param options 额外选项
 * @returns 转换后的对象
 */
export function mapCustomerBodyToDB(
  body: Record<string, unknown>,
  options: { allowId?: boolean; allowShopId?: boolean } = {}
): Record<string, unknown> {
  const snakeBody = toSnakeCase(body);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(snakeBody)) {
    if (key === 'id' && !options.allowId) continue;
    if (key === 'shop_id' && !options.allowShopId) continue;
    if (!CUSTOMER_FIELD_WHITELIST.has(key)) continue;
    if (value === undefined) continue;

    result[key] = value;
  }

  // 日期字段截取为 YYYY-MM-DD
  for (const field of DATE_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = result[field].split('T')[0];
    }
  }

  // 数组字段校验
  for (const field of ARRAY_FIELDS) {
    if (result[field] !== undefined && !Array.isArray(result[field])) {
      delete result[field];
    }
  }

  return result;
}

/**
 * 验证客户请求体是否包含必填字段。
 *
 * @param data 已转换的数据库对象
 * @returns 验证结果
 */
export type CustomerValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateCustomerData(data: Record<string, unknown>): CustomerValidationResult {
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    return { valid: false, error: '客户姓名不能为空' };
  }
  if (!data.phone || typeof data.phone !== 'string' || data.phone.trim() === '') {
    return { valid: false, error: '客户电话不能为空' };
  }
  return { valid: true };
}
