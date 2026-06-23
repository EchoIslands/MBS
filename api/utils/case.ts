/**
 * 数据库字段名 snake_case ↔ 前端字段名 camelCase 转换工具
 */

/** snake_case → camelCase：用于将 Supabase 查询结果转为前端格式 */
export function toCamelCase<T = Record<string, any>>(obj: Record<string, any>): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result as T;
}

/** camelCase → snake_case：用于将前端请求数据转为 Supabase 写入格式 */
export function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (c: string) => '_' + c.toLowerCase());
    result[snakeKey] = value;
  }
  return result;
}

/** 批量转换数组 */
export function toCamelCaseList<T = Record<string, any>>(list: Record<string, any>[]): T[] {
  return list.map(toCamelCase) as T[];
}