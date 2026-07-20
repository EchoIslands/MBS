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
