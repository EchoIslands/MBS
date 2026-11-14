import { get, post } from '../utils/api';

export async function getMembershipPlans() {
  const result = await get('/customer-membership/plans');
  return result.data;
}

export async function createMembershipOrder(kind, level, code, confirmedAmount) {
  const result = await post('/customer-membership/orders', { kind, level, code, confirmedAmount, channel: 'wechat_mini' });
  return result.data;
}

export async function checkMembershipOrder(id) {
  const result = await get('/customer-membership/orders/' + encodeURIComponent(id));
  return result.data;
}
