import type { Settlement } from '../types.js';

export function settlementPaidTime(s: Pick<Settlement, 'paidAt' | 'paidAtSource'>): number {
  if (s.paidAtSource !== 'wechat_success_time' || !s.paidAt) return 0;
  const time = new Date(s.paidAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function compareSettlements(a: Settlement, b: Settlement): number {
  return settlementPaidTime(b) - settlementPaidTime(a) ||
    (Date.parse(String(b.createdAt)) || 0) - (Date.parse(String(a.createdAt)) || 0) || a.id.localeCompare(b.id);
}

export function matchesSettlement(s: Settlement, query: string): boolean {
  const term = query.trim().replace(/^[¥￥]\s*/, '').toLowerCase();
  if (!term) return true;
  return [s.customerName, s.id, s.paymentId, s.transactionId, Number(s.total).toFixed(2),
    s.paymentAmount === undefined ? '' : Number(s.paymentAmount).toFixed(2)]
    .some(value => String(value || '').toLowerCase().includes(term));
}

export function settlementDateLabel(value?: Date | string): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', { timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(new Date(value));
}

export function isPaidOnBusinessDay(s: Settlement, now=new Date()): boolean {
  const time=settlementPaidTime(s);
  const day=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  return time>0 && s.paymentStatus==='completed' && day(new Date(time))===day(now);
}
