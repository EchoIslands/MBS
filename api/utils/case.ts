/**
 * 数据库字段名 snake_case ↔ 前端字段名 camelCase 转换工具
 */

/** snake_case → camelCase：用于将 Supabase 查询结果转为前端格式 */
export function toCamelCase<T = Record<string, any>>(obj: Record<string, any>): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key
      .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
      // 把 vip 统一转成 VIP，例如 purchase_vip_level -> purchaseVIPLevel
      .replace(/Vip/g, 'VIP');
    result[camelKey] = value;
  }
  return result as T;
}

/** camelCase → snake_case：用于将前端请求数据转为 Supabase 写入格式 */
export function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key
      // 先把 VIP 整体转成 Vip，避免 purchaseVIPLevel -> purchase_v_i_p_level
      .replace(/VIP/g, 'Vip')
      .replace(/[A-Z]/g, (c: string) => '_' + c.toLowerCase())
      // 去除首字符下划线（例如 lastServiceItems -> _last_service_items）
      .replace(/^_/, '');
    result[snakeKey] = value;
  }
  return result;
}

/** 批量转换数组 */
export function toCamelCaseList<T = Record<string, any>>(list: Record<string, any>[]): T[] {
  return list.map(toCamelCase) as T[];
}