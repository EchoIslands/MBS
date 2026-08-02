import { get, post } from '../utils/api';

/**
 * 根据预约ID查询评价（判断是否已评价）
 * @param {string} bookingId 预约ID
 * @returns {Promise<Object|null>} 评价对象或null
 */
export async function getReviewByBookingId(bookingId) {
  try {
    const result = await get(`/reviews/booking/${bookingId}`);
    return result?.data || null;
  } catch (err) {
    console.warn('[review] getReviewByBookingId failed:', err);
    return null;
  }
}

/**
 * 获取顾客的所有评价（个人中心展示用）
 * @param {string} customerId 顾客ID
 * @returns {Promise<Array>} 评价列表
 */
export async function getCustomerReviews(customerId) {
  try {
    const result = await get(`/reviews/customer/${customerId}`);
    return result?.data || [];
  } catch (err) {
    console.warn('[review] getCustomerReviews failed:', err);
    return [];
  }
}

/**
 * 创建评价（服务完成后提交）
 * @param {Object} data 评价参数
 * @param {string} data.shopId 店铺ID
 * @param {string} data.customerId 顾客ID
 * @param {string} data.bookingId 预约ID
 * @param {string} [data.stylistId] 发型师ID
 * @param {number} data.serviceScore 店铺服务评分（1-5，支持半星）
 * @param {number} data.stylistScore 发型师评分（1-5，支持半星）
 * @param {string} [data.serviceComment] 店铺服务补充描述
 * @param {string} [data.stylistComment] 发型师补充描述
 * @param {string} [data.comment] 整体评价文字
 * @param {boolean} data.isAwareOfMembershipBenefits 是否知晓会员福利
 * @returns {Promise<Object>} 已创建的评价对象
 */
export async function createReview(data) {
  const result = await post('/reviews', data);
  if (!result?.data || !result.data.id) {
    const errMsg = result?.error || '提交评价失败';
    throw new Error(errMsg);
  }
  return result.data;
}
