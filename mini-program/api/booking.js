import { get, post, put } from '../utils/api';

/**
 * 创建预约
 */
export async function createBooking(data) {
  const result = await post('/bookings', data);
  return result?.data || null;
}

/**
 * 获取预约详情
 */
export async function getBooking(id) {
  const result = await get(`/bookings/${id}`);
  return result?.data || null;
}

/**
 * 顾客取消预约
 * @param {string} id 预约ID
 * @param {string} customerId 顾客ID
 */
export async function cancelBooking(id, customerId) {
  const result = await put(`/bookings/${id}/cancel`, { customerId });
  return result?.data || null;
}

/**
 * 获取店铺的预约列表（用于判断发型师档期）
 */
export async function getBookingsByShop(shopId, date) {
  const query = [`shopId=${encodeURIComponent(shopId)}`];
  if (date) query.push(`date=${encodeURIComponent(date)}`);
  const queryString = `?${query.join('&')}`;
  const result = await get(`/bookings${queryString}`);
  return result?.data || [];
}
