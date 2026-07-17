import { getApiBase } from '../../shared/api-base';

/**
 * 小程序专用请求封装
 *
 * 说明：
 * - 使用 wx.request 而非 fetch，兼容所有小程序基础库；
 * - API 基础地址来自 shared/api-base.ts，保证与 H5 一致；
 * - 超时、错误处理逻辑与 H5 的 http 函数保持一致。
 */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
}

export function request<T>(url: string, options: RequestOptions = {}): Promise<T | null> {
  const base = getApiBase();
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`;

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let completed = false;

    const requestTask = wx.request({
      url: fullUrl,
      method: options.method || 'GET',
      header: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      data: options.body,
      timeout: 15000,
      success: (res) => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          if (res.statusCode !== 404) {
            console.warn(`[mini-api] ${fullUrl} 返回 ${res.statusCode}，将使用 mock 数据`);
          }
          resolve(null);
        }
      },
      fail: (err) => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);

        console.warn(`[mini-api] ${fullUrl} 请求失败（${err.errMsg}），将使用 mock 数据`);
        resolve(null);
      },
    });

    timeoutId = setTimeout(() => {
      if (completed) return;
      completed = true;
      requestTask.abort();
      console.warn(`[mini-api] ${fullUrl} 请求超时，将使用 mock 数据`);
      resolve(null);
    }, 15000);
  });
}

export function get<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  return request<T>(url, { method: 'GET', headers });
}

export function post<T>(
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<T | null> {
  return request<T>(url, { method: 'POST', body, headers });
}

export function put<T>(
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<T | null> {
  return request<T>(url, { method: 'PUT', body, headers });
}
