import { request } from '../utils/api';

export function generateInviteCode(customerId, shopId = 'shop1') {
  return request('/referrals/invite', {
    method: 'POST',
    body: { customerId, shopId },
  });
}

export function claimReferralCoupon(ref, phone, name = '') {
  return request('/referrals/claim', {
    method: 'POST',
    body: { ref, phone, name },
  });
}

export function checkInviteCode(ref) {
  return request(`/referrals/check-code?ref=${encodeURIComponent(ref)}`, {
    method: 'GET',
  });
}
