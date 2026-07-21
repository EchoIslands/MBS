import { get } from '../utils/api';

/**
 * 获取店铺当天排队状态
 * @param {string} shopId 店铺ID
 * @param {string} [date] 日期，格式 YYYY-MM-DD，默认今天
 */
export async function getQueue(shopId, date) {
  const query = [`date=${encodeURIComponent(date || '')}`];
  const queryString = query.length > 0 ? `?${query.join('&')}` : '';
  const result = await get(`/queues/${shopId}${queryString}`);
  return result?.data || null;
}
