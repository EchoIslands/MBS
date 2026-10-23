import React, { useState, useMemo, useEffect } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import ShopLayout from './ShopLayout';
import { useAppStore } from '../../store';
import type { FinancialReport } from '../../../shared/types';
import { financialApi, bookingApi } from '../../api';
import { financialTime, financialTrend, financialGrowth, financialDetailRows, FINANCIAL_BASIS_NOTE, type FinancialRange } from '../../../shared/lib/financialReport';
import { matchesSettlement, settlementDateLabel } from '../../../shared/lib/settlementDisplay';

const money = (value: number) => value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const growthLabel = (value: number | null) => value === null ? '上期无基数' : (value >= 0 ? '+' : '') + value + '%';
const paymentLabels: Record<string, string> = { cash: '现金', wechat: '微信', alipay: '支付宝', card: '银行卡', balance: '储值余额' };

const FinancialReportPage: React.FC = () => {
  const { currentShop } = useAppStore();
  const shopId = currentShop?.id || 'shop1';
  const [dateRange, setDateRange] = useState<FinancialRange>('month');
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setReport(null); setPage(1);
    financialApi.getReport(shopId).then(data => {
      if (!active) return;
      if (!data) setError('暂无财务数据');
      else setReport(data);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : '获取财务数据失败');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [shopId, revision]);

  // 所有区域使用服务端同一份数据和截止时间，避免各自请求/本机时区造成不一致。
  const now = useMemo(() => new Date(report?.generatedAt || 0), [report?.generatedAt]);
  const records = useMemo(() => report?.records || [], [report]);
  const chartData = useMemo(() => financialTrend(records, dateRange, now), [records, dateRange, now]);
  const growth = useMemo(() => financialGrowth(records, now), [records, now]);
  const details = useMemo(() => records.filter(s => matchesSettlement(s, search) && (!onlyUnknown || !financialTime(s, now).time))
    .sort((a, b) => financialTime(b, now).time - financialTime(a, now).time || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.id.localeCompare(b.id)),
  [records, now, search, onlyUnknown]);
  const pageCount = Math.max(1, Math.ceil(details.length / 20));
  const currentPage = Math.min(page, pageCount);

  const exportToExcel = async () => {
    if (!report) return;
    setExporting(true); setExportError(null);
    try {
    // 预约附表沿用既有导出功能，明确与真实收款分开；只在导出时读取。
    const bookings = await bookingApi.getBookingsByShop(shopId);
    const data = [
      ['财务报表', currentShop?.name || '店铺'], ['数据截止时间', settlementDateLabel(report.generatedAt)],
      ['统计口径', FINANCIAL_BASIS_NOTE], ['明细导出范围', '全部已完成结算，不受图表范围、搜索与页码影响'],
      ['未计入日期统计', report.excluded?.count || 0, '笔', report.excluded?.amount || 0, '元'], [],
      ['业绩汇总', '今日', '本周', '本月', '本年'],
      ['结算金额(元)', report.revenue.today, report.revenue.week, report.revenue.month, report.revenue.year],
      ['服务次数', report.services.today, report.services.week, report.services.month, report.services.year],
      ['客单价(元/单)', report.averageTicket.today, report.averageTicket.week, report.averageTicket.month, report.averageTicket.year], [],
      ['本月发型师业绩'], ['发型师', '本月业绩(元)', '服务次数', '平均评分'],
      ...report.topStylists.map(s => [s.name, s.revenue, s.services, s.rating]),
    ];
    const detailData = [
      ['未保存付款发生时间的历史记录不计入日期汇总；结算创建时间不是收款时间'],
      ['结算单号', '顾客', '结算金额(元)', '支付方式', '结算创建时间', '支付发起时间', '实际微信支付时间', '店员登记付款发生时间', '系统记录时间', '录入员工编号', '统计时间', '统计依据/核对提示', '支付记录号', '商户订单号', '微信交易号', '项目'],
      ...financialDetailRows(records, now).map(row => row.map((cell, i) => i === 3 ? paymentLabels[String(cell)] || cell : cell)),
    ];
    const wb = XLSX.utils.book_new();
    const summary = XLSX.utils.aoa_to_sheet(data), detail = XLSX.utils.aoa_to_sheet(detailData);
    summary['!cols'] = [{ wch: 30 }, ...Array.from({ length: 4 }, () => ({ wch: 25 }))];
    detail['!cols'] = Array.from({ length: 16 }, (_, i) => ({ wch: i === 11 ? 42 : 28 }));
    XLSX.utils.book_append_sheet(wb, summary, '财务汇总');
    XLSX.utils.book_append_sheet(wb, detail, '结算收款明细');
    const appointments = XLSX.utils.aoa_to_sheet([
      ['预约参考：金额为预约报价，不代表支付成功，不参与财务汇总'],
      ['预约单号', '预约时间', '顾客', '服务', '发型师', '预约报价(元)', '预约状态'],
      ...bookings.filter(b => b.shopId === shopId).map(b => [b.id, settlementDateLabel(b.scheduledTime), b.customerName || '顾客',
        b.serviceName || '服务', b.barberName || b.stylistName || '随机', b.price || 0,
        ({ pending: '待确认', confirmed: '已确认', completed: '已完成', cancelled: '已取消' })[b.status]]),
    ]);
    appointments['!cols'] = Array.from({ length: 7 }, () => ({ wch: 25 }));
    XLSX.utils.book_append_sheet(wb, appointments, '预约参考（非收款）');
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(now);
    XLSX.writeFile(wb, (currentShop?.name || '店铺') + '_财务报表_' + day + '.xlsx');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : '导出失败，请重试');
    } finally { setExporting(false); }
  };

  return <ShopLayout title="财务报表">
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="bg-white rounded-2xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2" aria-label="趋势图范围">
          {(['week', 'month', 'quarter', 'year'] as const).map(range => <button key={range} onClick={() => setDateRange(range)}
            className={'px-4 py-2 rounded-lg ' + (dateRange === range ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700')}>
            {{ week: '本周', month: '本月', quarter: '本季度', year: '本年' }[range]}</button>)}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRevision(v => v + 1)} disabled={loading} className="flex gap-2 items-center px-4 py-2 bg-gray-100 rounded-lg disabled:opacity-50"><RefreshCw size={18} />刷新</button>
          <button onClick={exportToExcel} disabled={loading || exporting || !report || !!error} className="flex gap-2 items-center px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"><Download size={18} />{exporting ? '导出中…' : '导出Excel'}</button>
        </div>
      </div>
      {exportError && <div role="alert" className="p-4 bg-red-50 text-red-700 rounded-lg">导出失败：{exportError}</div>}
      {loading ? <div className="flex gap-2 justify-center py-16 text-gray-500"><Loader2 className="animate-spin" />加载完整报表中…</div> : error || !report ?
        <div role="alert" className="p-6 bg-red-50 text-red-700 rounded-xl">{error || '暂无财务数据'}，可点击刷新重试。</div> : <>
        <div className="bg-blue-50 text-blue-900 rounded-xl p-4 text-sm space-y-2">
          <p>{FINANCIAL_BASIS_NOTE}</p>
          <p>客单价＝结算金额÷已计入订单数。范围按钮只切换趋势图；卡片与榜单按各自标注的周期显示。</p>
          <p>数据截止：{settlementDateLabel(report.generatedAt)}。支付后点击“刷新”更新。</p>
        </div>
        {!!report.excluded?.count && <div role="status" className="bg-amber-50 text-amber-900 rounded-xl p-4">
          有 {report.excluded.count} 笔已完成结算（¥{money(report.excluded.amount)}）缺少可信时间或需核对，未计入卡片、趋势、增长与排名。
          <button onClick={() => { setOnlyUnknown(true); setSearch(''); setPage(1); document.getElementById('financial-details')?.scrollIntoView({ behavior: 'smooth' }); }} className="underline ml-2">查看待核对明细</button>
        </div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: '今日结算金额', value: '¥' + money(report.revenue.today), note: '较昨日 ' + growthLabel(growth.revenueGrowth), color: 'bg-orange-500' },
            { title: '本月结算金额', value: '¥' + money(report.revenue.month), note: '较上月 ' + growthLabel(growth.revenueMonthGrowth), color: 'bg-green-600' },
            { title: '本月服务次数', value: report.services.month, note: '较上月 ' + growthLabel(growth.serviceMonthGrowth), color: 'bg-blue-600' },
            { title: '本月客单价', value: '¥' + money(report.averageTicket.month), note: '较上月 ' + growthLabel(growth.ticketMonthGrowth), color: 'bg-purple-600' },
          ].map(card => <div key={card.title} className={card.color + ' rounded-2xl p-6 text-white'}><h2>{card.title}</h2><p className="text-3xl font-bold my-3">{card.value}</p><p className="text-sm">{card.note}</p></div>)}
        </div>
        <section className="bg-white rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">{{ week: '本周', month: '本月', quarter: '本季度', year: '本年' }[dateRange]}结算金额趋势</h2>
          <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={value => ['¥' + money(Number(value)), '结算金额']} />
            <Line type="linear" dataKey="revenue" stroke="#f97316" strokeWidth={3} isAnimationActive={false} />
          </LineChart></ResponsiveContainer></div>
        </section>
        <section className="bg-white rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">本月发型师业绩排名</h2>
          <div className="space-y-3">{report.topStylists.length ? report.topStylists.map((s, i) => <div key={s.id} className="border rounded-xl p-4 flex justify-between gap-4"><div>{i + 1}. {s.name}<p className="text-sm text-gray-500">服务 {s.services} 次 · 评分 {s.rating}</p></div><strong className="text-orange-600">¥{money(s.revenue)}</strong></div>) : <p className="text-gray-500">暂无已计入的本月设计师业绩</p>}</div>
        </section>
        <section id="financial-details" className="bg-white rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold">结算收款明细</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <input aria-label="搜索结算收款明细" placeholder="顾客、结算/支付单号、微信交易号、金额" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="border rounded-lg p-3 w-full md:w-96" />
            <label className="text-sm flex gap-2"><input type="checkbox" checked={onlyUnknown} onChange={e => { setOnlyUnknown(e.target.checked); setPage(1); }} />只看待核对记录</label>
            <span className="text-sm text-gray-500">全部历史已完成结算，共 {details.length} 笔；按统计时间倒序，待核对记录列后。</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[960px]">
            <thead><tr className="border-b text-left">{['结算单 / 顾客', '结算金额', '支付方式', '创建时间', '实际微信支付时间', '店员登记付款发生时间', '系统记录时间', '录入员工编号', '统计依据'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
            <tbody>{details.slice((currentPage - 1) * 20, currentPage * 20).map(s => { const basis = financialTime(s, now); return <tr key={s.id} className="border-b align-top">
              <td className="p-3 break-all">{s.id}<p className="text-gray-500">{s.customerName || '顾客'}</p>{s.transactionId && <p className="text-xs text-gray-500">微信交易号：{s.transactionId}</p>}</td>
              <td className="p-3 font-bold text-orange-600">¥{money(s.total)}</td><td className="p-3">{paymentLabels[s.paymentMethod] || '待核对'}</td>
              <td className="p-3">{settlementDateLabel(s.createdAt)}</td>
              <td className="p-3">{s.paymentMethod === 'wechat' && basis.time ? settlementDateLabel(s.paidAt) : '未核实 / 未记录'}</td>
              <td className="p-3">{s.manualPaidAt ? settlementDateLabel(s.manualPaidAt) : '未登记'}</td>
              <td className="p-3">{s.manualPaidRecordedAt ? settlementDateLabel(s.manualPaidRecordedAt) : '未记录'}</td>
              <td className="p-3">{s.manualPaidRecordedBy || '未记录'}</td>
              <td className={'p-3 ' + (basis.time ? 'text-gray-600' : 'text-amber-700')}>{basis.label}{!basis.time && <p>未计入日期统计</p>}</td>
            </tr>; })}</tbody>
          </table>{!details.length && <p className="py-8 text-center text-gray-500">没有符合条件的结算记录</p>}</div>
          <div className="flex items-center justify-end gap-4"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="disabled:opacity-40">上一页</button><span>{currentPage} / {pageCount}</span><button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="disabled:opacity-40">下一页</button></div>
        </section>
      </>}
    </div>
  </ShopLayout>;
};
export default FinancialReportPage;
