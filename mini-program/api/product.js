import { get, post } from '../utils/api';

/**
 * 获取店铺优惠券列表（顾客端）
 */
export async function getShopCoupons(shopId) {
  const result = await get(`/coupons/shop/${shopId}?active=true`);
  return result?.data || [];
}

/**
 * 获取顾客优惠券列表
 */
export async function getCustomerCoupons(customerId, shopId, status) {
  const params = new URLSearchParams();
  if (shopId) params.set('shopId', shopId);
  if (status) params.set('status', status);
  const query = params.toString() ? `?${params.toString()}` : '';
  const result = await get(`/coupons/customer/${customerId}${query}`);
  return result?.data || [];
}

/**
 * 领取优惠券
 */
export async function claimCoupon(couponId, customerId, customerName, customerPhone) {
  const result = await post(`/coupons/${couponId}/claim`, { customerId, customerName, customerPhone });
  if (!result || result.success === false) {
    throw new Error(result?.error || '领取优惠券失败');
  }
  return result.data || null;
}

/**
 * 获取店铺商品列表
 */
export async function getShopProducts(shopId) {
  const result = await get(`/shops/${shopId}/products`);
  return result?.data || [];
}

/**
 * 创建商品订单（余额支付 / 到店自提付款）
 * - 后端返回非 2xx 或 success: false 时抛出错误，便于页面透传精确提示
 */
export async function createProductOrder(data) {
  const result = await post('/product-orders', data);
  if (!result || result.success === false) {
    throw new Error(result?.error || '创建订单失败');
  }
  return result.data || null;
}

/**
 * 获取顾客的商品订单列表
 */
export async function getCustomerProductOrders(customerId, shopId) {
  const query = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
  const result = await get(`/product-orders/customer/${customerId}${query}`);
  if (!result || result.success === false) {
    throw new Error(result?.error || '获取订单失败');
  }
  return result?.data || [];
}

/**
 * 申请商品订单退款
 */
export async function requestProductOrderRefund(orderId, reason) {
  const result = await post(`/product-orders/${orderId}/refund`, { reason });
  if (!result || result.success === false) {
    throw new Error(result?.error || '申请退款失败');
  }
  return result?.data || null;
}
