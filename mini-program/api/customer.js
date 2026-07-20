import { get } from '../utils/api';

/**
 * 获取顾客信息
 * 当前使用 customerId 明文传参，后续统一改造为 token 鉴权
 */
export function getCustomer(id) {
  return get(`/customers/${id}`);
}
