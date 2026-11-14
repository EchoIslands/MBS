const prices: Record<string, number> = { regular: 0, bronze: 29, silver: 59, gold: 79, diamond: 99 };
const rights: Record<string, string[]> = {
  regular: [], bronze: ['shampoo'], silver: ['shampoo', 'conditioner', 'drink'],
  gold: ['shampoo', 'conditioner', 'drink', 'redo'],
  diamond: ['shampoo', 'conditioner', 'drink', 'redo', 'free_haircut'],
};

/** One shared quote for the staff confirmation and server. Expired tiers have no upgrade credit. */
export function membershipOperation(current: string, expiry: string | Date | null | undefined, target: string, now = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(prices, target)) throw new Error('无效的会员等级');
  const end = expiry ? new Date(expiry).getTime() : 0;
  const active = current !== 'regular' && (!expiry || end > now);
  const previous = active ? prices[current] || 0 : 0;
  const price = prices[target];
  const action = target === 'regular' ? 'cancel' : !active ? 'open'
    : target === current ? 'renew' : price > previous ? 'upgrade' : 'downgrade';
  const amount = action === 'open' || action === 'renew' ? price : action === 'upgrade' ? price - previous : 0;
  // A legacy member without an expiry remains without expiry on a tier change.
  const expiresAt = action === 'cancel' ? null : action === 'upgrade' || action === 'downgrade'
    ? expiry ? new Date(expiry).toISOString() : null
    : new Date(Math.max(action==='renew' && Number.isFinite(end) ? end : 0, now) + 365 * 86400000).toISOString();
  const grantedBenefits = action === 'cancel' || action === 'downgrade' ? []
    : (rights[target] || []).filter(right => action !== 'upgrade' || !(rights[current] || []).includes(right));
  const label = { open: '开通', renew: '同档续费', upgrade: '升档', downgrade: '降档', cancel: '取消资格' }[action];
  return { action, label, amount, expiresAt, grantedBenefits };
}
