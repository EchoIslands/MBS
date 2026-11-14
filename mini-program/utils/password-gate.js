import { getToken, getPasswordChangeRequired } from './storage';
import { paymentOrderNumber, currentPaymentOrderNumber } from './payment-order-link';
export const CHANGE_PASSWORD_PAGE = '/pages/change-password/change-password';
let redirecting = false;
export function enforcePasswordChange(route, options = {}) {
  if (!getToken() || !getPasswordChangeRequired() || route === CHANGE_PASSWORD_PAGE.slice(1)) return false;
  if (!redirecting) {
    redirecting = true;
    const orderNo = paymentOrderNumber(options) || currentPaymentOrderNumber();
    let inviteRef = '';
    try {
      const value = options.inviteRef || (['pages/invite/claim','pages/invite/invite'].includes(route) ? options.ref || options.scene : '');
      const decoded = decodeURIComponent(value || '');
      if (/^ref_[A-Za-z0-9_]{1,28}$/.test(decoded) && decoded.length <= 32) inviteRef = decoded;
    } catch (_) { /* Ignore malformed external scene. */ }
    const query = [orderNo ? 'returnOrderNo=' + orderNo : '', inviteRef ? 'inviteRef=' + encodeURIComponent(inviteRef) : ''].filter(Boolean).join('&');
    wx.reLaunch({ url: CHANGE_PASSWORD_PAGE + (query ? '?' + query : ''), complete() { redirecting = false; } });
  }
  return true;
}
