/**
 * 小程序本地存储封装
 * - token、customerId 等按平台用 wx.setStorageSync 存储
 * - 与 H5 的 localStorage 逻辑对应，保证两端登录态存储方式符合各自平台
 */

const TOKEN_KEY = 'mbs_token';
const CUSTOMER_ID_KEY = 'mbs_customer_id';

export function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}

export function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

export function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

export function setCustomerId(customerId) {
  wx.setStorageSync(CUSTOMER_ID_KEY, customerId);
}

export function getCustomerId() {
  return wx.getStorageSync(CUSTOMER_ID_KEY) || '';
}

export function clearCustomerId() {
  wx.removeStorageSync(CUSTOMER_ID_KEY);
}

// ========== tabBar 页面间参数传递 ==========
const ROUTE_PARAMS_KEY = 'mbs_route_params';

/**
 * 设置要传递给 tabBar 页面的参数
 * 小程序 switchTab 不支持 URL 传参，因此用本地缓存中转
 */
export function setRouteParams(params) {
  wx.setStorageSync(ROUTE_PARAMS_KEY, JSON.stringify(params || {}));
}

/**
 * 获取并清空已保存的路由参数
 */
export function takeRouteParams() {
  try {
    const raw = wx.getStorageSync(ROUTE_PARAMS_KEY);
    if (!raw) return null;
    wx.removeStorageSync(ROUTE_PARAMS_KEY);
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
