import { get, post } from '../utils/api';

/**
 * 创建预约
 */
export function createBooking(data) {
  return post('/bookings', data);
}

/**
 * 获取预约详情
 */
export function getBooking(id) {
  return get(`/bookings/${id}`);
}

/**
 * 获取店铺的预约列表（用于判断发型师档期）
 */
export function getBookingsByShop(shopId, date) {
  const params = new URLSearchParams();
  params.set('shopId', shopId);
  if (date) params.set('date', date);
  return get(`/bookings?${params.toString()}`);
}
