/**
 * 小程序专用请求封装
 *
 * 说明：
 * - 使用 wx.request 而非 fetch，兼容所有小程序基础库；
 * - API 基础地址逻辑与 H5 的 shared/api-base.ts 保持一致（默认 /api）；
 * - 测试本地后端时，可在开发者工具控制台执行：
 *   wx.setStorageSync('mbs_api_base', 'http://你的局域网IP:3000/api');
 * - 超时、错误处理逻辑与 H5 的 http 函数保持一致。
 */

function getApiBase() {
  // 允许通过本地缓存覆盖，便于测试环境切换后端地址
  const customBase = wx.getStorageSync('mbs_api_base');
  if (customBase) return customBase;
  // 默认使用 Vercel Preview 部署地址
  return 'https://mbs-f5tlu0mha-mybarbershop.vercel.app/api';
}

export function request(url, options = {}) {
  const base = getApiBase();
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`;

  return new Promise((resolve) => {
    let timeoutId = null;
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
          resolve(res.data);
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

export function get(url, headers) {
  return request(url, { method: 'GET', headers });
}

export function post(url, body, headers) {
  return request(url, { method: 'POST', body, headers });
}

export function put(url, body, headers) {
  return request(url, { method: 'PUT', body, headers });
}
