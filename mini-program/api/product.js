import { get, post } from '../utils/api';

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
