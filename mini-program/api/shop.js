import { get } from '../utils/api';

/**
 * 获取店铺详情
 */
export function getShop(id) {
  return get(`/shops/${id}`);
}

/**
 * 获取附近店铺列表
 */
export function getNearbyShops(lat, lon, level) {
  const params = new URLSearchParams();
  if (lat !== undefined) params.set('lat', String(lat));
  if (lon !== undefined) params.set('lon', String(lon));
  if (level) params.set('level', level);
  return get(`/shops?${params.toString()}`);
}
