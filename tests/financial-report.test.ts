import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Settlement } from '../shared/types.js';
import { buildFinancialReport, financialTime, financialTrend, financialGrowth, financialDetailRows } from '../shared/lib/financialReport.js';

const now = new Date('2026-10-23T12:00:00+08:00');
const row = (overrides: Partial<Settlement> = {}): Settlement => ({
  id: 'old-paid', shopId: 's1', customerId: 'c1', customerName: '合成顾客',
  createdAt: new Date('2024-01-01T00:00:00Z'), total: 33.64, paymentMethod: 'wechat', paymentStatus: 'completed',
  paymentId: 'pay', transactionId: 'wx-transaction', paymentAmount: 33.64, paymentRecordStatus: 'paid',
  paidAt: '2026-10-23T10:00:00+08:00', paidAtSource: 'wechat_success_time',
  items: [{ type: 'service', id: 'svc', name: '服务', quantity: 2, originalPrice: 58, discountedPrice: 16.82, total: 33.64, employeeId: 'emp' }],
  subtotal: 58, discountDetail: {} as Settlement['discountDetail'], discount: 24.36, couponDiscount: 0, tax: 0,
  ...overrides,
});

test('财务：跨年旧单新付按微信成功时间计入卡片、趋势、排名与导出，客单价按订单数', () => {
  const records = [row()];
  const report = buildFinancialReport(records, now);
  assert.equal(report.revenue.today, 33.64);
  assert.equal(report.revenue.year, 33.64);
  assert.equal(report.services.month, 2);
  assert.equal(report.averageTicket.month, 33.64);
  assert.equal(report.topStylists[0].revenue, 33.64);
  for (const range of ['week', 'month', 'quarter', 'year'] as const) {
    assert.equal(financialTrend(records, range, now).reduce((n, p) => n + p.revenue, 0), 33.64);
  }
  assert.equal(financialTrend(records, 'year', now)[0].revenue, 0);
  assert.equal(financialTrend(records, 'year', now)[9].revenue, 33.64);
  const exported = financialDetailRows(records, now)[0];
  assert.match(String(exported[4]), /2024/);
  assert.match(String(exported[6]), /2026\/10\/23/);
  assert.equal(exported[9], '未记录');
  assert.equal(exported[10], '微信成功时间');
  assert.equal(financialGrowth(records, now).ticketMonthGrowth, null);
});

test('财务：历史不可信时间、缺证据、金额不符、多笔异常、未来时间不冒充实际付款', () => {
  const bad = [row({ paidAtSource: undefined }), row({ transactionId: undefined }), row({ paymentRecordStatus: 'pending' }),
    row({ paymentAmount: 33.65 }), row({ paymentReviewRequired: true }), row({ paidAt: 'invalid' }), row({ paidAt: '2026-10-24T10:00:00+08:00' })];
  for (const s of bad) assert.equal(financialTime(s, now).time, 0);
  const report = buildFinancialReport([...bad, row({ paymentStatus: 'pending' })], now);
  assert.equal(report.revenue.year, 0);
  assert.equal(report.excluded?.count, 7);
  assert.equal(report.excluded?.amount, 235.48);
  assert.equal(report.topStylists.length, 0);
  assert.ok(financialDetailRows(bad, now).every(r => r[6] === '未核实/未记录' && r[7] === '未计入日期统计'));
});

test('财务：北京时间跨日跨年、现金登记时间与零元订单，按分累加且不依赖系统时区', () => {
  const boundaryNow = new Date('2027-01-01T00:05:00+08:00');
  const records = [
    row({ total: 0.1, paymentAmount: 0.1, paidAt: '2026-12-31T16:00:00Z' }),
    row({ total: 0.2, paymentAmount: 0.2, paidAt: '2026-12-31T16:01:00Z' }),
    row({ total: 8, paymentAmount: 8, paidAt: '2026-12-31T15:59:59Z' }),
    row({ total: 0, paymentAmount: 0, paymentMethod: 'cash', createdAt: new Date('2026-12-31T16:02:00Z'), items: [] }),
  ];
  const report = buildFinancialReport(records, boundaryNow);
  assert.equal(report.revenue.today, 0.3);
  assert.equal(report.revenue.month, 0.3);
  assert.equal(report.revenue.year, 0.3);
  assert.equal(report.averageTicket.today, 0.1);
  assert.match(financialTime(records[3], boundaryNow).label, /未登记/);
  assert.equal(financialTrend(records, 'year', boundaryNow)[0].revenue, 0.3);
});

test('财务：客单价环比统一按结算单计数，商品不算服务次数', () => {
  const records = [row({ total: 40, paymentAmount: 40 }), row({ total: 20, paymentAmount: 20, paidAt: '2026-09-23T10:00:00+08:00' }),
    row({ total: 0, paymentAmount: 0, items: [{ type: 'product', id: 'p', name: '商品', quantity: 10, total: 0, originalPrice: 0, discountedPrice: 0 }] })];
  const report = buildFinancialReport(records, now);
  assert.equal(report.averageTicket.month, 20);
  assert.equal(report.services.month, 2);
  assert.equal(financialGrowth(records, now).ticketMonthGrowth, 0);
  assert.equal(financialGrowth(records, now).serviceMonthGrowth, 0);
});
