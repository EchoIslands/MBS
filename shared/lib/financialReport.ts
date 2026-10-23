import type { FinancialReport, Settlement } from '../types.js';
import { settlementPaidTime, settlementDateLabel } from './settlementDisplay.js';

const OFFSET = 8 * 3600_000;
const DAY = 24 * 3600_000;
export const FINANCIAL_TIME_BASIS = 'verified-wechat-manual-entry-v2';
export const FINANCIAL_BASIS_NOTE = '北京时间：微信按已核实的支付成功时间统计；现金/银行卡显示店员登记的付款发生时间，并另存录入时间及员工编号；历史未登记的非微信结算不纳入日期汇总。余额按数据库扣款时间统计。含余额消费，不代表新增资金、提现净额或扣除退款后的净收入。';
export type FinancialRange = 'week' | 'month' | 'quarter' | 'year';

/** 缺少证据时不回退到创建日期。金额以分比较，避免浮点误差。 */
export function financialTime(s: Settlement, now = new Date()): { time: number; label: string } {
  if (s.paymentStatus !== 'completed') return { time: 0, label: '未完成支付' };
  if (!Number.isFinite(s.total) || s.total < 0) return { time: 0, label: '金额异常，待核对' };
  if (s.paymentReviewRequired) return { time: 0, label: '支付记录异常，待核对' };
  let time = 0;
  let label = '';
  if (s.paymentMethod === 'wechat') {
    if (s.paymentRecordStatus !== 'paid' || !s.transactionId || !s.paymentId ||
        !Number.isFinite(s.paymentAmount) || Math.round(s.paymentAmount! * 100) !== Math.round(s.total * 100)) {
      return { time: 0, label: '微信收款证据不完整，待核对' };
    }
    time = settlementPaidTime(s);
    label = '微信成功时间';
  } else if (['cash', 'card', 'alipay', 'balance'].includes(s.paymentMethod)) {
    if (s.paymentMethod === 'balance') {
      time = s.manualPaidAt ? new Date(s.manualPaidAt).getTime() : 0;
      label = '余额扣款数据库时间';
    } else if (s.manualPaidAt && s.manualPaidRecordedAt && s.manualPaidRecordedBy) {
      time = new Date(s.manualPaidAt).getTime();
      label = '店员登记的付款发生时间';
    } else {
      return { time: 0, label: '历史未登记付款时间；未计入日期统计' };
    }
  }
  return time > 0 && time <= now.getTime() ? { time, label } : { time: 0, label: '缺少可信时间或时间异常，待核对' };
}

export function financialPeriods(now: Date) {
  const local = new Date(now.getTime() + OFFSET);
  const year = local.getUTCFullYear(), month = local.getUTCMonth(), day = local.getUTCDate();
  const start = (m: number, d: number) => Date.UTC(year, m, d) - OFFSET;
  return { today: start(month, day), week: start(month, day - local.getUTCDay()), month: start(month, 1),
    quarter: start(Math.floor(month / 3) * 3, 1), year: start(0, 1), previousMonth: start(month - 1, 1), local };
}
const cents = (amount: number) => Math.round(amount * 100);
const serviceCount = (s: Settlement) => s.items.reduce((n, i) => n +
  ((i.type === 'service' || i.type === undefined) && Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 0), 0);

export function buildFinancialReport(records: Settlement[], now = new Date()): FinancialReport {
  const start = financialPeriods(now);
  const revenue = { today: 0, week: 0, month: 0, year: 0 };
  const services = { ...revenue }, orders = { ...revenue }, averageTicket = { ...revenue };
  const excluded = { count: 0, amount: 0 };
  const stylistMap = new Map<string, FinancialReport['topStylists'][number]>();
  for (const s of records) {
    if (s.paymentStatus !== 'completed') continue;
    const { time } = financialTime(s, now);
    if (!time) { excluded.count++; if (Number.isFinite(s.total)) excluded.amount += cents(s.total); continue; }
    for (const key of Object.keys(revenue) as Array<keyof typeof revenue>) {
      if (time >= start[key]) { revenue[key] += cents(s.total); services[key] += serviceCount(s); orders[key]++; }
    }
    if (time < start.month) continue;
    for (const item of s.items) {
      if (!item.employeeId) continue;
      const stylist = stylistMap.get(item.employeeId) || { id: item.employeeId, name: item.employeeName || '发型师', revenue: 0, services: 0, rating: 5 };
      if (Number.isFinite(item.total)) stylist.revenue += cents(item.total);
      if ((item.type === 'service' || item.type === undefined) && item.quantity > 0) stylist.services += item.quantity;
      stylistMap.set(stylist.id, stylist);
    }
  }
  for (const key of Object.keys(revenue) as Array<keyof typeof revenue>) {
    averageTicket[key] = orders[key] ? Math.round(revenue[key] / orders[key]) / 100 : 0;
    revenue[key] /= 100;
  }
  return { revenue, services, averageTicket,
    topStylists: [...stylistMap.values()].map(s => ({ ...s, revenue: s.revenue / 100 })).sort((a, b) => b.revenue - a.revenue),
    records, generatedAt: now.toISOString(), timeBasis: FINANCIAL_TIME_BASIS,
    excluded: { count: excluded.count, amount: excluded.amount / 100 } };
}

export function financialTrend(records: Settlement[], range: FinancialRange, now = new Date()) {
  const p = financialPeriods(now);
  const labels = range === 'week' ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] :
    range === 'month' ? ['1–7日', '8–14日', '15–21日', '22–28日', '29日–月末'] :
    Array.from({ length: range === 'quarter' ? 3 : 12 }, (_, i) => `${i + 1 + (range === 'quarter' ? Math.floor(p.local.getUTCMonth() / 3) * 3 : 0)}月`);
  const totals = labels.map(() => 0);
  for (const s of records) {
    const { time } = financialTime(s, now);
    if (!time || time < p[range]) continue;
    const local = new Date(time + OFFSET);
    const index = range === 'week' ? local.getUTCDay() : range === 'month' ? Math.floor((local.getUTCDate() - 1) / 7) :
      local.getUTCMonth() - (range === 'quarter' ? Math.floor(p.local.getUTCMonth() / 3) * 3 : 0);
    totals[index] += cents(s.total);
  }
  return labels.map((name, i) => ({ name, revenue: totals[i] / 100 }));
}

export function financialGrowth(records: Settlement[], now = new Date()) {
  const p = financialPeriods(now);
  const lists = { today: [] as Settlement[], yesterday: [] as Settlement[], month: [] as Settlement[], previousMonth: [] as Settlement[] };
  for (const s of records) {
    const { time } = financialTime(s, now);
    if (!time) continue;
    if (time >= p.today) lists.today.push(s);
    else if (time >= p.today - DAY) lists.yesterday.push(s);
    if (time >= p.month) lists.month.push(s);
    else if (time >= p.previousMonth) lists.previousMonth.push(s);
  }
  const sum = (list: Settlement[]) => list.reduce((n, s) => n + cents(s.total), 0);
  const count = (list: Settlement[]) => list.reduce((n, s) => n + serviceCount(s), 0);
  const ticket = (list: Settlement[]) => list.length ? sum(list) / list.length : 0;
  // 无基数时不伪称增长100%。
  const growth = (current: number, previous: number): number | null => previous ? Math.round((current - previous) / previous * 1000) / 10 : current ? null : 0;
  return { revenueGrowth: growth(sum(lists.today), sum(lists.yesterday)), revenueMonthGrowth: growth(sum(lists.month), sum(lists.previousMonth)),
    serviceMonthGrowth: growth(count(lists.month), count(lists.previousMonth)), ticketMonthGrowth: growth(ticket(lists.month), ticket(lists.previousMonth)) };
}

export function financialDetailRows(records: Settlement[], now = new Date()) {
  return records.map(s => { const basis = financialTime(s, now); return [s.id, s.customerName || '顾客', s.total, s.paymentMethod,
    settlementDateLabel(s.createdAt), settlementDateLabel(s.paymentCreatedAt),
    s.paymentMethod === 'wechat' && basis.time ? settlementDateLabel(s.paidAt) : '未核实/未记录',
    s.manualPaidAt ? settlementDateLabel(s.manualPaidAt) : '未登记',
    s.manualPaidRecordedAt ? settlementDateLabel(s.manualPaidRecordedAt) : '未记录',
    s.manualPaidRecordedBy || '未记录',
    basis.time ? settlementDateLabel(new Date(basis.time)) : '未计入日期统计', basis.label,
    s.paymentId || '', s.gatewayOrderNo || '', s.transactionId || '', s.items.map(i => `${i.name} ×${i.quantity}`).join('、')]; });
}
