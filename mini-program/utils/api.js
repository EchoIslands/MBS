// In-memory coarse metrics only: no phone, customer ID, URL parameters, token or response contents.
const requestTimings=[];
function recordTiming(url,start,status,bytes=0){
 const group=/^\/([a-z-]+)/.exec(url)?.[1]||'other';
 requestTimings.push({group,ms:Date.now()-start,status,bytes});if(requestTimings.length>200)requestTimings.shift();
}
export function getRequestPerformance(){return requestTimings.map(item=>({...item}));}
import { enforcePasswordChange } from './password-gate';
import { handleExpiredCustomerSession } from './auth';
import { getToken, getCustomerId, setPasswordChangeRequired } from './storage';
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
  return 'https://www.hsxx8888.cn/api';
}

const DEFAULT_TIMEOUT = 30000; // 小程序网络环境复杂，给予更充裕的超时时间

// 小程序image不识别站点相对地址；只转换后端自己的图片接口。
function resolveMedia(value, base) {
  if (Array.isArray(value)) return value.map(item => resolveMedia(item, base));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,resolveMedia(item, base)]));
  return typeof value === 'string' && /^\/api\/shops\/[^/]+\/(?:media\/|products\/[^/]+\/images\/|employees\/[^/]+\/avatar)/.test(value)
    ? base.replace(/\/api\/?$/, '') + value : value;
}

export function request(url, options = {}) {
  const started=Date.now();
  const base = getApiBase();
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`;
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const requestToken = getToken();
  const requestCustomerId = getCustomerId();
  const headers = {
    'Content-Type': 'application/json',
    ...(requestToken && !url.startsWith('http') ? { Authorization: 'Bearer ' + requestToken } : {}),
    ...(options.headers || {}),
  };
  const usesCustomerSession = !url.startsWith('http') && !['/customers/login', '/customers/sms/send', '/customers/sms/login'].includes(url)
    && (requestToken || requestCustomerId) && (!requestToken || headers.Authorization === 'Bearer ' + requestToken);

  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let completed = false;

    const requestTask = wx.request({
      url: fullUrl,
      method: options.method || 'GET',
      header: headers,
      data: options.body,
      timeout,
      success: (res) => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);
        recordTiming(url,started,res.statusCode,JSON.stringify(res.data||null).length);

        // 微信返回 200 但后端可能返回错误信息
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const bodyStr = res.data ? JSON.stringify(res.data) : '';
          if (bodyStr.length > 512 * 1024) {
            console.warn(`[mini-api] ${fullUrl} 响应体过大: ${Math.round(bodyStr.length / 1024)}KB`);
          }
          if(res.data?.success===false) {reject(new Error(res.data.error || '操作未完成'));return;}
          resolve(resolveMedia(res.data,base));
          return;
        }

        const isCurrentSession = getToken() === requestToken && getCustomerId() === requestCustomerId;
        // 员工专用接口的 401 可能是路由尚未部署，不能据此注销有效的顾客会话。
        const employeeAuthFailure = res.statusCode === 401 && [
          '未登录，请先登录', '登录已过期，请重新登录', '账号或会话已失效，请重新登录',
        ].includes(res.data?.error);
        if (res.statusCode === 401 && usesCustomerSession && !employeeAuthFailure) {
          handleExpiredCustomerSession(requestToken, requestCustomerId);
        }
        if (res.data?.code === 'PASSWORD_CHANGE_REQUIRED' && isCurrentSession) {
          setPasswordChangeRequired(true);
          const pages = getCurrentPages();
          enforcePasswordChange(pages[pages.length - 1]?.route);
        }
        const errMsg = employeeAuthFailure && /^(?:\/customers\/[^/]+\/self|\/upload\/customer-avatar)$/.test(url)
          ? '资料服务尚未更新，请稍后重试'
          : res.data?.error || res.data?.message || `请求失败（${res.statusCode}）`;
        if (res.data?.code === 'CUSTOMER_IDENTITY_UNVERIFIED') {
          wx.showModal({ title: '首次使用需由门店核实身份', content: '请在到店消费时联系店员，确认顾客本人后即可使用线上支付。', showCancel: false });
        }
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
        recordTiming(url,started,'network_error');
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
      recordTiming(url,started,'timeout');
      console.warn(`[mini-api] ${fullUrl} 请求超时`);
      const err = new Error('请求超时，请稍后重试');
      err.isTimeout = true;
      reject(err);
    }, timeout);
  });
}

// 仅合并同一会话中同时进行的相同读取，不缓存结果，避免影响排队实时性。
const pendingGets = new Map();
export function get(url, headers) {
  const key = JSON.stringify([getApiBase(), getCustomerId(), getToken(), url, headers || {}]);
  if (pendingGets.has(key)) return pendingGets.get(key);
  const pending = request(url, { method: 'GET', headers }).finally(() => {
    if (pendingGets.get(key) === pending) pendingGets.delete(key);
  });
  pendingGets.set(key, pending);
  return pending;
}

export function post(url, body, headers) {
  return request(url, { method: 'POST', body, headers });
}

export function put(url, body, headers) {
  return request(url, { method: 'PUT', body, headers });
}
