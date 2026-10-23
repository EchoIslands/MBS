/** datetime-local is explicitly interpreted as Beijing time, independent of the browser OS zone. */
export function manualPaymentTimeIso(value: string, now = Date.now()): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('请选择有效的付款发生时间');
  const parsed = new Date(value + ':00+08:00');
  if (!Number.isFinite(parsed.getTime()) || new Date(parsed.getTime() + 8 * 3600_000).toISOString().slice(0,16) !== value) throw new Error('请选择有效的付款发生时间');
  if (parsed.getTime() > now + 5 * 60_000) throw new Error('付款发生时间不能晚于当前时间');
  return parsed.toISOString();
}
