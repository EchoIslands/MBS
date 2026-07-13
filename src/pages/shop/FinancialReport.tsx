import React, { useState, useMemo, useEffect } from 'react';
import { Download, BarChart3, TrendingUp, Users, Calendar, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import ShopLayout from './ShopLayout';
import { useAppStore } from '../../store';
import { FinancialReport, Booking, Settlement } from '../../../shared/types';
import { financialApi, bookingApi, settlementApi } from '../../api';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const DEFAULT_SHOP_ID = 'shop1';

const FinancialReportPage: React.FC = () => {
  const { currentShop } = useAppStore();
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const shopId = currentShop?.id || DEFAULT_SHOP_ID;

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const [reportData, bookingsData, settlementsData] = await Promise.all([
          financialApi.getReport(shopId),
          bookingApi.getBookingsByShop(shopId),
          settlementApi.getByShop(shopId),
        ]);
        if (reportData) {
          setReport(reportData);
        } else {
          setError('暂无财务数据');
        }
        if (Array.isArray(bookingsData)) {
          setBookings(bookingsData);
        }
        if (Array.isArray(settlementsData)) {
          setSettlements(settlementsData);
        }
      } catch (err: unknown) {
        console.error('[FinancialReport] 获取财务报表失败:', err);
        setError(err instanceof Error ? (err as Error).message : '获取财务数据失败');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [shopId]);

  // 基于真实结算记录计算趋势图数据
  const chartData = useMemo(() => {
    const completed = settlements.filter(
      (s) => s.paymentStatus === 'completed' && s.createdAt
    );
    const now = new Date();

    if (dateRange === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const revenueByDay = new Array(7).fill(0);
      completed
        .filter((s) => new Date(s.createdAt) >= startOfWeek)
        .forEach((s) => {
          const d = new Date(s.createdAt);
          revenueByDay[d.getDay()] += s.total || 0;
        });
      return days.map((name, i) => ({ name, revenue: Math.round(revenueByDay[i] * 100) / 100 }));
    }

    if (dateRange === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const revenueByWeek: Record<string, number> = {
        第1周: 0,
        第2周: 0,
        第3周: 0,
        第4周: 0,
        第5周: 0,
      };
      completed
        .filter((s) => new Date(s.createdAt) >= startOfMonth)
        .forEach((s) => {
          const d = new Date(s.createdAt);
          const weekIndex = Math.floor((d.getDate() - 1) / 7) + 1;
          const key = `第${weekIndex}周`;
          revenueByWeek[key] = (revenueByWeek[key] || 0) + (s.total || 0);
        });
      return Object.entries(revenueByWeek)
        .filter(([key]) => key !== '第5周' || revenueByWeek[key] > 0)
        .map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 }));
    }

    if (dateRange === 'quarter') {
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const months: string[] = [];
      for (let i = 0; i < 3; i++) {
        const m = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + i, 1);
        months.push(`${m.getMonth() + 1}月`);
      }
      const revenueByMonth = new Map<string, number>();
      months.forEach((m) => revenueByMonth.set(m, 0));
      completed
        .filter((s) => new Date(s.createdAt) >= quarterStart)
        .forEach((s) => {
          const d = new Date(s.createdAt);
          const key = `${d.getMonth() + 1}月`;
          if (revenueByMonth.has(key)) {
            revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + (s.total || 0));
          }
        });
      return months.map((name) => ({ name, revenue: Math.round((revenueByMonth.get(name) || 0) * 100) / 100 }));
    }

    // year
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
    const revenueByMonth = new Map<string, number>();
    months.forEach((m) => revenueByMonth.set(m, 0));
    completed
      .filter((s) => new Date(s.createdAt) >= startOfYear)
      .forEach((s) => {
        const d = new Date(s.createdAt);
        const key = `${d.getMonth() + 1}月`;
        revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + (s.total || 0));
      });
    return months.map((name) => ({ name, revenue: Math.round((revenueByMonth.get(name) || 0) * 100) / 100 }));
  }, [dateRange, settlements]);

  const chartTitle =
    dateRange === 'week'
      ? '本周营收趋势'
      : dateRange === 'month'
      ? '本月营收趋势（按周）'
      : dateRange === 'quarter'
      ? '本季度营收趋势（按月）'
      : '本年营收趋势（按月）';

  // 基于真实结算记录计算同比/环比（用于替换卡片中的随机数据）
  const growthStats = useMemo(() => {
    const completed = settlements.filter((s) => s.paymentStatus === 'completed' && s.createdAt);
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const sum = (list: Settlement[]) => list.reduce((acc, s) => acc + (s.total || 0), 0);
    const countServices = (list: Settlement[]) =>
      list.reduce((acc, s) => acc + s.items.reduce((iacc, i) => iacc + (i.quantity || 0), 0), 0);
    const avgTicket = (list: Settlement[]) => {
      const services = countServices(list);
      return services > 0 ? sum(list) / services : 0;
    };

    const todayList = completed.filter((s) => new Date(s.createdAt) >= todayStart);
    const yesterdayList = completed.filter(
      (s) => new Date(s.createdAt) >= yesterdayStart && new Date(s.createdAt) < todayStart
    );
    const thisMonthList = completed.filter((s) => new Date(s.createdAt) >= thisMonthStart);
    const lastMonthList = completed.filter(
      (s) => new Date(s.createdAt) >= lastMonthStart && new Date(s.createdAt) < thisMonthStart
    );

    const growth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    return {
      revenueToday: sum(todayList),
      revenueYesterday: sum(yesterdayList),
      revenueGrowth: growth(sum(todayList), sum(yesterdayList)),
      revenueMonthGrowth: growth(sum(thisMonthList), sum(lastMonthList)),
      serviceMonthGrowth: growth(countServices(thisMonthList), countServices(lastMonthList)),
      ticketMonthGrowth: growth(avgTicket(thisMonthList), avgTicket(lastMonthList)),
    };
  }, [settlements]);

  if (loading) {
    return (
      <ShopLayout title="财务报表">
        <div className="flex items-center justify-center h-64 text-gray-500">
          <Loader2 size={32} className="animate-spin mr-2" />
          加载中...
        </div>
      </ShopLayout>
    );
  }

  if (error || !report) {
    return (
      <ShopLayout title="财务报表">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-gray-500">
          {error || '暂无财务数据'}
        </div>
      </ShopLayout>
    );
  }

  const exportToExcel = () => {
    if (!report) return;
    const shopName = currentShop?.name || '店铺';
    const data = [
      ['财务报表', shopName],
      ['生成时间', new Date().toLocaleString('zh-CN')],
      [],
      ['业绩汇总'],
      ['日期', '今日', '本周', '本月', '本年'],
      [
        '营收(元)',
        report.revenue.today,
        report.revenue.week,
        report.revenue.month,
        report.revenue.year,
      ],
      [
        '服务数',
        report.services.today,
        report.services.week,
        report.services.month,
        report.services.year,
      ],
      [
        '客单价(元)',
        report.averageTicket.today,
        report.averageTicket.week,
        report.averageTicket.month,
        report.averageTicket.year,
      ],
      [],
      ['发型师业绩'],
      ['发型师', '今日业绩(元)', '服务数', '平均评分'],
      ...report.topStylists.map((stylist) => [
        stylist.name,
        stylist.revenue,
        stylist.services,
        stylist.rating,
      ]),
    ];

    const bookingsData = [
      ['预约记录'],
      ['时间', '顾客', '服务', '发型师', '金额', '状态'],
      ...bookings
        .filter((b) => b.shopId === shopId)
        .map((booking) => [
          new Date(booking.scheduledTime).toLocaleString('zh-CN'),
          booking.customerName || '顾客',
          booking.serviceName || '服务',
          booking.barberName || booking.stylistName || '随机',
          booking.price || 0,
          booking.status === 'confirmed'
            ? '已确认'
            : booking.status === 'completed'
            ? '已完成'
            : booking.status === 'cancelled'
            ? '已取消'
            : '待确认',
        ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(data);
    const ws2 = XLSX.utils.aoa_to_sheet(bookingsData);

    ws1['!cols'] = [
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
    ];
    ws2['!cols'] = [
      { wch: 20 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
    ];

    XLSX.utils.book_append_sheet(wb, ws1, '财务汇总');
    XLSX.utils.book_append_sheet(wb, ws2, '预约记录');
    XLSX.writeFile(wb, `${shopName}_财务报表_${new Date().toLocaleDateString('zh-CN')}.xlsx`);
  };

  return (
    <ShopLayout title="财务报表">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 时间范围选择和导出按钮 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Calendar size={20} className="text-gray-500" />
            <div className="flex gap-2 flex-wrap">
              {(['week', 'month', 'quarter', 'year'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dateRange === range
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {range === 'week'
                    ? '本周'
                    : range === 'month'
                    ? '本月'
                    : range === 'quarter'
                    ? '本季度'
                    : '本年'}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl font-medium transition-colors"
          >
            <Download size={18} />
            <span>导出Excel</span>
          </button>
        </div>

        {/* 核心数据卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <BarChart3 size={24} />
              </div>
              <div className="text-sm opacity-80">今日</div>
            </div>
            <div className="text-3xl font-bold mb-1">
              ¥{report.revenue.today.toLocaleString()}
            </div>
            <div className="text-sm opacity-80">
              较昨日 {growthStats.revenueGrowth >= 0 ? '+' : ''}{growthStats.revenueGrowth}%
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <TrendingUp size={24} />
              </div>
              <div className="text-sm opacity-80">本月</div>
            </div>
            <div className="text-3xl font-bold mb-1">
              ¥{report.revenue.month.toLocaleString()}
            </div>
            <div className="text-sm opacity-80">
              较上月 {growthStats.revenueMonthGrowth >= 0 ? '+' : ''}{growthStats.revenueMonthGrowth}%
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Users size={24} />
              </div>
              <div className="text-sm opacity-80">服务数</div>
            </div>
            <div className="text-3xl font-bold mb-1">{report.services.month}</div>
            <div className="text-sm opacity-80">
              较上月 {growthStats.serviceMonthGrowth >= 0 ? '+' : ''}{growthStats.serviceMonthGrowth}%
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <FileSpreadsheet size={24} />
              </div>
              <div className="text-sm opacity-80">客单价</div>
            </div>
            <div className="text-3xl font-bold mb-1">¥{report.averageTicket.month}</div>
            <div className="text-sm opacity-80">
              较上月 {growthStats.ticketMonthGrowth >= 0 ? '+' : ''}{growthStats.ticketMonthGrowth}%
            </div>
          </div>
        </div>

        {/* 业绩图表 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">{chartTitle}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f97316"
                  strokeWidth={3}
                  fill="#fed7aa"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 发型师业绩排名 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">发型师业绩排名</h2>
          <div className="space-y-4">
            {report.topStylists.map((stylist, index) => (
              <div
                key={stylist.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-orange-300 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                      index === 0
                        ? 'bg-yellow-500'
                        : index === 1
                        ? 'bg-gray-400'
                        : index === 2
                        ? 'bg-orange-700'
                        : 'bg-gray-300'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                    {stylist.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-800">{stylist.name}</div>
                    <div className="text-sm text-gray-500">
                      服务 {stylist.services} 单 · 评分 {stylist.rating}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-orange-500">
                    ¥{stylist.revenue.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 收支明细 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">收支明细</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">日期</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">顾客</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">项目</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">支付方式</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">金额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                      暂无收支明细
                    </td>
                  </tr>
                ) : (
                  settlements
                    .filter((s) => s.shopId === shopId && s.paymentStatus === 'completed')
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 20)
                    .map((s) => {
                      const itemNames = s.items.map((i) => i.name).join('、') || '服务/商品';
                      const paymentLabel: Record<string, string> = {
                        cash: '现金',
                        wechat: '微信',
                        alipay: '支付宝',
                        card: '银行卡',
                        balance: '储值余额',
                      };
                      return (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {new Date(s.createdAt).toLocaleString('zh-CN')}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-800">{s.customerName || '顾客'}</td>
                          <td className="py-3 px-4 text-sm text-gray-800">{itemNames}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              {paymentLabel[s.paymentMethod] || s.paymentMethod}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-medium text-green-600">
                            +¥{s.total.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ShopLayout>
  );
};

export default FinancialReportPage;
