import { get } from '../utils/api';

/**
 * 获取店铺详情
 */
export async function getShop(id) {
  const result = await get(`/shops/${id}`);
  return result?.data || null;
}

/**
 * 获取店铺评价列表
 */
export async function getShopReviews(id) {
  const result = await get(`/reviews/shop/${id}`);
  return result?.data || [];
}

/**
 * 获取附近店铺列表
 */
export async function getNearbyShops(lat, lon, level) {
  const query = [];
  if (lat !== undefined) query.push(`lat=${encodeURIComponent(String(lat))}`);
  if (lon !== undefined) query.push(`lon=${encodeURIComponent(String(lon))}`);
  if (level) query.push(`level=${encodeURIComponent(level)}`);
  const queryString = query.length > 0 ? `?${query.join('&')}` : '';
  const result = await get(`/shops${queryString}`);
  return result?.data || [];
}
