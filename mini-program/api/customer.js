import { get, post } from '../utils/api';

/**
 * 获取顾客公开信息（顾客端使用）
 */
export async function getCustomerPublic(id) {
  const result = await get(`/customers/${id}/public`);
  return result?.data || null;
}

/**
 * 获取顾客登录信息（手机号登录/自动注册）
 */
export async function loginCustomer(phone, name) {
  const result = await post('/customers/login', { phone, name });
  return result?.data || null;
}

/**
 * 获取顾客的预约列表
 */
export async function getCustomerBookings(customerId) {
  const result = await get(`/bookings/customer/${customerId}`);
  return result?.data || [];
}
