/**
 * 通用 API 请求基础层
 *
 * 说明：
 * - 本文件不依赖浏览器 DOM 或 localStorage，可被 H5 和小程序共同 import；
 * - 平台相关的 token 获取、缓存持久化应在各自入口（如 src/api.ts、小程序 app.ts）中实现；
 * - 所有实体类型仍定义在 shared/types.ts，避免两端类型不一致。
 */

/**
 * 获取 API 基础地址
 */
export function getApiBase(): string {
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE) {
    return (import.meta as { env?: Record<string, string> }).env!.VITE_API_BASE;
  }
  return '/api';
}

/**
 * 判断是否使用真实后端 API
 */
export function isRealApi(): boolean {
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_USE_REAL_API === 'true') {
    return true;
  }
  return false;
}

/**
 * 通用 HTTP 请求封装
 * - 15 秒超时
 * - 默认 Content-Type: application/json
 * - 非 2xx 状态码返回 null（404 视为预期行为，不警告）
 * - 网络错误返回 null 并打印警告
 *
 * 注意：本函数不处理认证 token，调用方需自行在 opts.headers 中传入 Authorization。
 */
export async function http<T>(url: string, opts: RequestInit = {}): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      // 404 是预期行为（该路由尚未实现），不打印警告
      if (res.status !== 404) {
        console.warn(`[api] ${url} 返回 ${res.status}，将使用 mock 数据`);
      }
      return null;
    }
    return res.json() as T;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[api] ${url} 请求失败（${message}），将使用 mock 数据`);
    return null;
  }
}
