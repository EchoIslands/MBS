import { getToken, getPasswordChangeRequired } from './storage';
export const CHANGE_PASSWORD_PAGE = '/pages/change-password/change-password';
let redirecting = false;
export function enforcePasswordChange(route) {
  if (!getToken() || !getPasswordChangeRequired() || route === CHANGE_PASSWORD_PAGE.slice(1)) return false;
  if (!redirecting) {
    redirecting = true;
    wx.reLaunch({ url: CHANGE_PASSWORD_PAGE, complete() { redirecting = false; } });
  }
  return true;
}
