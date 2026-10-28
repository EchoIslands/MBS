/**
 * 通用 API 请求基础层
 *
 * 说明：
 * - 本文件不依赖浏览器 DOM 或 localStorage，可被 H5 和小程序共同 import；
 * - 平台相关的 token 获取、缓存持久化应在各自入口（如 src/api.ts、小程序 app.js）中实现；
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
  if ((import.meta as { env?: Record<string, unknown> }).env?.PROD) return true;
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_USE_REAL_API === 'true') {
    return true;
  }
  return false;
}

/**
 * 通用 HTTP 请求封装
 * - 15 秒超时
 * - 默认 Content-Type: application/json
 * - 非 2xx、业务失败或网络错误抛出异常，真实模式不得悄悄切换演示数据。
 *
 * 注意：本函数不处理认证 token，调用方需自行在 opts.headers 中传入 Authorization。
 */
export async function http<T>(url: string, opts: RequestInit = {}, timeoutMs = 15000): Promise<T | null> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  else opts.signal?.addEventListener('abort', abort, { once: true });
  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success === false) {
      throw Object.assign(new Error(body?.error || `请求失败 (${res.status})`), { status: res.status, code: body?.code });
    }
    if (body === null) throw new Error('服务返回格式异常，请稍后重试');
    return body as T;
  } catch (error) {
    if (timedOut) throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒），请稍后重试`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener('abort', abort);
  }
}
