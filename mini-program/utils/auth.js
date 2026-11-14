import { enforcePasswordChange } from './password-gate';
import { currentPaymentOrderNumber } from './payment-order-link';
/**
 * 小程序登录态守卫
 * 统一处理"未登录"场景：弹出登录对话框，确认后跳转登录页
 */
import { getCustomerId, getToken, clearCustomerId } from './storage';

const LOGIN_PAGE = '/pages/login/login';
let sessionRedirecting = false;

// 只结束发出该请求的会话，旧请求的401不能清除后来登录的新凭证。
export function handleExpiredCustomerSession(requestToken, requestCustomerId) {
  if (getToken() !== requestToken || getCustomerId() !== requestCustomerId) return;
  clearCustomerId();
  const pages = getCurrentPages();
  if (pages[pages.length - 1]?.route === LOGIN_PAGE.slice(1) || sessionRedirecting) return;
  sessionRedirecting = true;
  const orderNo = currentPaymentOrderNumber();
  let inviteRef = '';
  try {
    const page = pages[pages.length - 1];
    const options = page?.options || {};
    const value = options.inviteRef || (['pages/invite/claim','pages/invite/invite'].includes(page?.route) ? options.ref || options.scene : '');
    const decoded = decodeURIComponent(value || '');
    if (/^ref_[A-Za-z0-9_]{1,28}$/.test(decoded) && decoded.length <= 32) inviteRef = decoded;
  } catch (_) { /* Invalid external scene is not forwarded. */ }
  wx.reLaunch({
    url: LOGIN_PAGE + '?reason=session_expired' + (orderNo ? '&returnOrderNo=' + orderNo : '') + (inviteRef ? '&inviteRef=' + encodeURIComponent(inviteRef) : ''),
    complete() { sessionRedirecting = false; },
  });
}

/**
 * 校验登录态；未登录时弹出登录对话框
 * @param {{ title?: string, content?: string }} [options]
 * @returns {boolean} 是否已登录
 */
export function ensureLogin(options = {}) {
  if (enforcePasswordChange(getCurrentPages().slice(-1)[0]?.route)) return false;
  if (getCustomerId() && getToken()) return true;

  wx.showModal({
    title: options.title || '未登录',
    content: options.content || '登录后即可使用该功能',
    confirmText: '去登录',
    cancelText: '取消',
    confirmColor: '#99613f',
    success: (res) => {
      if (res.confirm) {
        wx.navigateTo({ url: LOGIN_PAGE });
      }
    },
  });
  return false;
}
