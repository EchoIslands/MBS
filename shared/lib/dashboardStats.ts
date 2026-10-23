import type { Booking, Employee, OwnerDashboard, Settlement, StylistPerformance } from '../types.js';
import { buildFinancialReport, financialPeriods, financialTime, FINANCIAL_TIME_BASIS } from './financialReport.js';

export function businessDateKey(value: Date | string | number): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10) : '';
}
type Rating = { stylistId: string; score: number };
export function averageStylistRating(reviews: Rating[], id: string, empty = 0) {
  const own = reviews.filter(r => r.stylistId === id && Number.isFinite(r.score));
  return own.length ? Math.round(own.reduce((sum, r) => sum + r.score, 0) / own.length * 10) / 10 : empty;
}

export function buildStylistPerformances(records: Settlement[], employees: Pick<Employee, 'id' | 'name' | 'title'>[], reviews: Rating[], now = new Date()): StylistPerformance[] {
  const start = financialPeriods(now);
  return employees.map(emp => {
    const revenue = { today: 0, week: 0, month: 0, year: 0 };
    const services = { total: 0, byType: {} as Record<string, number> };
    const excluded = { count: 0, amount: 0 };
    for (const s of records) {
      if (s.paymentStatus !== 'completed') continue;
      const items = s.items.filter(i => i.employeeId === emp.id);
      if (!items.length) continue;
      const { time } = financialTime(s, now);
      if (!time) {
        excluded.count++;
        excluded.amount += items.reduce((n, i) => n + (Number.isFinite(i.total) ? Math.round(i.total * 100) : 0), 0);
        continue;
      }
      for (const item of items) {
        if (Number.isFinite(item.total)) for (const period of Object.keys(revenue) as Array<keyof typeof revenue>) {
          if (time >= start[period]) revenue[period] += Math.round(item.total * 100);
        }
        if (time >= start.month && (item.type === 'service' || item.type === undefined) && Number.isFinite(item.quantity) && item.quantity > 0) {
          services.total += item.quantity;
          const name = item.name || '其他';
          services.byType[name] = (services.byType[name] || 0) + item.quantity;
        }
      }
    }
    for (const period of Object.keys(revenue) as Array<keyof typeof revenue>) revenue[period] /= 100;
    return { stylistId: emp.id, stylistName: emp.name, title: emp.title || '发型师', revenue, services,
      averageRating: averageStylistRating(reviews, emp.id),
      // 保留既有算法，不把未获门店确认的比例作为工资结算规则。
      estimatedCommission: Math.round(revenue.month * 0.15 * 100) / 100,
      commissionNote: '历史算法参考：本月归属项目金额×15%；比例和计提基数尚需门店确认，不作为工资结算依据',
      timeBasis: FINANCIAL_TIME_BASIS, generatedAt: now.toISOString(), excluded: { count: excluded.count, amount: excluded.amount / 100 } };
  });
}

/** 老板仍仅查看本人店铺。预约人数与消费金额是不同口径，不用预约报价推算营收。 */
export function buildOwnerDashboard(records: Settlement[], bookings: Pick<Booking, 'shopId' | 'customerId' | 'scheduledTime' | 'status'>[], shop: { id: string; name: string }, employeeCount: number, reviews: Rating[], now = new Date()): OwnerDashboard {
  const report = buildFinancialReport(records, now), start = financialPeriods(now);
  const year = start.local.getUTCFullYear(), month = start.local.getUTCMonth();
  const end = { today: start.today + 86400_000, week: start.week + 7 * 86400_000,
    month: Date.UTC(year, month + 1, 1) - 8 * 3600_000, year: Date.UTC(year + 1, 0, 1) - 8 * 3600_000 };
  const totalCustomers = { today: 0, week: 0, month: 0, year: 0 };
  for (const period of Object.keys(totalCustomers) as Array<keyof typeof totalCustomers>) {
    totalCustomers[period] = new Set(bookings.filter(b => b.shopId === shop.id && b.status !== 'cancelled' && b.customerId &&
      new Date(b.scheduledTime).getTime() >= start[period] && new Date(b.scheduledTime).getTime() < end[period]).map(b => b.customerId)).size;
  }
  const periodDetails = {} as NonNullable<OwnerDashboard['periodDetails']>;
  for (const period of ['today', 'week', 'month'] as const) {
    const periodRecords = records.filter(s => { const time = financialTime(s, now).time; return time > 0 && time >= start[period]; });
    // buildFinancialReport的榜单限定本月。这里按选择的窗口直接聚合，覆盖跨月周。
    const rank = new Map<string, OwnerDashboard['topStylists'][number]>();
    for (const s of periodRecords) for (const i of s.items) {
      if (!i.employeeId) continue;
      const entry = rank.get(i.employeeId) || { id: i.employeeId, name: i.employeeName || '发型师', shopId: shop.id, shopName: shop.name,
        revenue: 0, services: 0, rating: averageStylistRating(reviews, i.employeeId) };
      if (Number.isFinite(i.total)) entry.revenue += Math.round(i.total * 100);
      if ((i.type === 'service' || i.type === undefined) && Number.isFinite(i.quantity) && i.quantity > 0) entry.services += i.quantity;
      rank.set(entry.id, entry);
    }
    periodDetails[period] = {
      shopStats: [{ shopId: shop.id, shopName: shop.name, revenue: report.revenue[period], services: report.services[period], customers: totalCustomers[period], employees: employeeCount }],
      topStylists: [...rank.values()].map(s => ({ ...s, revenue: s.revenue / 100 })).sort((a, b) => b.revenue - a.revenue || a.id.localeCompare(b.id)).slice(0, 10),
    };
  }
  return { totalRevenue: report.revenue, totalServices: report.services, totalCustomers, shopStats: periodDetails.month.shopStats,
    topStylists: periodDetails.month.topStylists, periodDetails, excluded: report.excluded, timeBasis: FINANCIAL_TIME_BASIS, generatedAt: report.generatedAt };
}
