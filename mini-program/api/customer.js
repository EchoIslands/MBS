import { enforcePasswordChange } from '../utils/password-gate';
import { setToken, getCustomerId, getToken, setPasswordChangeRequired } from '../utils/storage';
import { get, post } from '../utils/api';

/**
 * 获取顾客公开信息（顾客端使用）
 */
export async function getCustomerPublic(id) {
  const result = await get(`/customers/${id}/public`);
  setPasswordChangeRequired(result?.data?.mustChangePassword === true);
  if (result?.data?.mustChangePassword) enforcePasswordChange(getCurrentPages().slice(-1)[0]?.route);
  return result?.data || null;
}

/**
 * 获取顾客登录信息（手机号登录/自动注册）
 */
export async function loginCustomer(phone, password, setupPassword = false) {
  const result = await post('/customers/login', { phone, password, setupPassword, client: 'mini' });
  if (result?.setupRequired) return { setupRequired: true };
  if (!result?.token) throw new Error('未获取有效登录凭证');
  setToken(result.token);
  setPasswordChangeRequired(result?.data?.mustChangePassword === true);
  return { setupRequired: false, customer: result?.data || null };
}

export async function restoreCustomerSession() {
  const id = getCustomerId();
  if (!id || !getToken()) return null;
  return getCustomerPublic(id);
}

/**
 * 获取顾客的预约列表
 */
export async function getCustomerBookings(customerId) {
  const result = await get(`/bookings/customer/${customerId}`);
  return result?.data || [];
}

/**
 * 顾客自助储值充值
 */
export async function rechargeCustomer(customerId, shopId, storedValueLevel) {
  const result = await post(`/customers/${customerId}/recharge`, { shopId, storedValueLevel });
  if (!result || result.success === false) {
    throw new Error(result?.error || '充值失败');
  }
  return result?.data || null;
}

export async function changeCustomerPassword(currentPassword, newPassword, confirmPassword) {
  const result = await post('/customers/' + encodeURIComponent(getCustomerId()) + '/password/change', { currentPassword, newPassword, confirmPassword, client: 'mini' });
  if (!result?.token) throw new Error('未获取有效登录凭证，请重新登录');
  setToken(result.token);
  setPasswordChangeRequired(false);
  return result.data;
}
