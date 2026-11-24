import { enforcePasswordChange } from '../utils/password-gate';
import { setToken, getCustomerId, getToken, setPasswordChangeRequired } from '../utils/storage';
import { get, post, put } from '../utils/api';

/**
 * 获取顾客公开信息（顾客端使用）
 */
export async function getCustomerPublic(id) {
  const result = await get(`/customers/${id}/public`);
  setPasswordChangeRequired(result?.data?.mustChangePassword === true);
  if (result?.data?.mustChangePassword) enforcePasswordChange(getCurrentPages().slice(-1)[0]?.route);
  return result?.data || null;
}

export async function updateMyProfile(id, fields) {
  const result = await put('/customers/' + encodeURIComponent(id) + '/self', fields);
  return result?.data;
}

export async function uploadMyAvatar(image) {
  const result = await post('/upload/customer-avatar', { image });
  return result?.data;
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

export async function sendCustomerSmsCode(phone) {
  return post('/customers/sms/send', { phone, client: 'mini' });
}

export async function loginCustomerWithSms(phone, code) {
  const result = await post('/customers/sms/login', { phone, code, client: 'mini' });
  if (!result?.token || !result?.data?.id) throw new Error('未获取有效登录凭证');
  setToken(result.token);
  setPasswordChangeRequired(result.data.mustChangePassword === true);
  return result.data;
}
export async function restoreCustomerSession() {
  const id = getCustomerId();
  if (!id || !getToken()) return null;
  return getCustomerPublic(id);
}

/**
 * 获取顾客的预约列表
 */
export async function getCustomerBookings(customerId, { active = false } = {}) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const result = await get(`/bookings/customer/${encodeURIComponent(customerId)}?page=${page}&pageSize=200${active ? '&active=true' : ''}`);
    if (!Array.isArray(result?.data)) throw new Error('预约列表读取失败');
    rows.push(...result.data);
    if (!result.pagination || page >= result.pagination.totalPages) break;
  }
  return Array.from(new Map(rows.map(row => [row.id, row])).values());
}

export async function getCustomerBenefits(customerId) {
  const result = await get(`/customers/${encodeURIComponent(customerId)}/benefits`);
  if (!Array.isArray(result?.data)) throw new Error('权益读取失败');
  return result.data;
}

/**
 * 获取顾客的服务退款记录。
 * 退款数据由服务端按当前顾客会话校验，和网页端使用同一数据源。
 */
export async function getCustomerRefunds(customerId) {
  const result = await get(`/refunds/customer/${encodeURIComponent(customerId)}`);
  if (!result || result.success === false) {
    throw new Error(result?.error || '退款记录加载失败');
  }
  return result?.data || [];
}

/**
 * 获取顾客已付款且尚未申请退款的服务结算。
 */
export async function getCustomerRefundCandidates(customerId) {
  const result = await get(`/refunds/customer/${encodeURIComponent(customerId)}/candidates`);
  if (!result || result.success === false) {
    throw new Error(result?.error || '可退款服务加载失败');
  }
  return result?.data || [];
}

/**
 * 按原服务结算单提交退款申请。
 */
export async function requestCustomerSettlementRefund(customerId, settlementId, reason) {
  const result = await post(`/refunds/customer/${encodeURIComponent(customerId)}`, { settlementId, reason });
  if (!result || result.success === false) {
    throw new Error(result?.error || '退款申请提交失败');
  }
  return result?.data || null;
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

export async function changeCustomerPassword(phone, code, newPassword, confirmPassword) {
  const result = await post('/customers/sms/password', { phone, code, newPassword, confirmPassword, client: 'mini' });
  if (!result?.token || !result?.data?.id) throw new Error('未获取有效登录凭证');
  setToken(result.token);
  setPasswordChangeRequired(false);
  return result.data;
}
