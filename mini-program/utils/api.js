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

const DEFAULT_TIMEOUT = 30000; // 小程序网络环境复杂，给予更充裕的超时时间

export function request(url, options = {}) {
  const base = getApiBase();
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`;
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  console.log(`[mini-api] 发起请求: ${options.method || 'GET'} ${fullUrl} (超时:${timeout}ms)`);

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
      timeout,
      success: (res) => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);

        console.log(`[mini-api] 响应: ${fullUrl} -> ${res.statusCode}`);

        // 微信返回 200 但后端可能返回错误信息
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const bodyStr = res.data ? JSON.stringify(res.data) : '';
          if (bodyStr.length > 512 * 1024) {
            console.warn(`[mini-api] ${fullUrl} 响应体过大: ${Math.round(bodyStr.length / 1024)}KB`);
          }
          resolve(res.data);
          return;
        }

        const errMsg = res.data?.error || res.data?.message || `请求失败（${res.statusCode}）`;
        if (res.statusCode !== 404) {
          console.warn(`[mini-api] ${fullUrl} 返回 ${res.statusCode}: ${errMsg}`);
        }
        const err = new Error(errMsg);
        err.statusCode = res.statusCode;
        err.response = res.data;
        reject(err);
      },
      fail: (err) => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);

        console.warn(`[mini-api] ${fullUrl} 请求失败（${err.errMsg}）`);
        const friendly = err.errMsg || '网络请求失败';
        const error = new Error(friendly.includes('timeout') ? '请求超时，请稍后重试' : friendly);
        error.original = err;
        reject(error);
      },
    });

    timeoutId = setTimeout(() => {
      if (completed) return;
      completed = true;
      requestTask.abort();
      console.warn(`[mini-api] ${fullUrl} 请求超时`);
      const err = new Error('请求超时，请稍后重试');
      err.isTimeout = true;
      reject(err);
    }, timeout);
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
