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
  // 默认使用生产域名（已备案，国内访问稳定）
  return 'https://www.hfmbs.cn/api';
}

export function request(url, options = {}) {
  const base = getApiBase();
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`;

  return new Promise((resolve, reject) => {
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
      timeout: 30000,
      success: (res) => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        // 非 2xx 统一按失败处理，便于页面 catch 后给用户提示
        const errMsg = res.data?.error || res.data?.message || `请求失败（${res.statusCode}）`;
        if (res.statusCode !== 404) {
          console.warn(`[mini-api] ${fullUrl} 返回 ${res.statusCode}: ${errMsg}`);
        }
        const err = new Error(errMsg);
        err.statusCode = res.statusCode;
        reject(err);
      },
      fail: (err) => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);

        console.warn(`[mini-api] ${fullUrl} 请求失败（${err.errMsg}）`);
        reject(new Error(err.errMsg || '网络请求失败'));
      },
    });

    timeoutId = setTimeout(() => {
      if (completed) return;
      completed = true;
      requestTask.abort();
      console.warn(`[mini-api] ${fullUrl} 请求超时`);
      reject(new Error('请求超时'));
    }, 30000);
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
