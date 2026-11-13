/** 缺失或损坏的倍率按原价/基础积分读取，不把 NaN 传给客户端。 */
export function membershipConfigRate(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 1;
  if (typeof value === 'string' && !value.trim()) return 1;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : 1;
}
