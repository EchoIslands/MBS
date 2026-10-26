import { getToken, getPasswordChangeRequired } from './storage';
import { paymentOrderNumber, currentPaymentOrderNumber } from './payment-order-link';
export const CHANGE_PASSWORD_PAGE = '/pages/change-password/change-password';
let redirecting = false;
export function enforcePasswordChange(route, options = {}) {
  if (!getToken() || !getPasswordChangeRequired() || route === CHANGE_PASSWORD_PAGE.slice(1)) return false;
  if (!redirecting) {
    redirecting = true;
    const orderNo = paymentOrderNumber(options) || currentPaymentOrderNumber();
    wx.reLaunch({ url: CHANGE_PASSWORD_PAGE + (orderNo ? '?returnOrderNo=' + orderNo : ''), complete() { redirecting = false; } });
  }
  return true;
}
