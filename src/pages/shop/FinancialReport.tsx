import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, BarChart3, TrendingUp, Users, Calendar, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAppStore } from '../../store';
import { getMockFinancialReport, mockBookings } from '../../../shared/mockData';
import { FinancialReport, UserRole } from '../../../shared/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const FinancialReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentShop, userRole } = useAppStore();
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  useEffect(() => {
    if (!currentShop || !userRole) {
      navigate('/shop/login');
      return;
    }

    const hasPermission = [UserRole.SHOP_OWNER, UserRole.SHOP_MANAGER, UserRole.PLATFORM_ADMIN].includes(userRole);
    if (!hasPermission) {
      navigate('/shop');
      return;
    }

    setReport(getMockFinancialReport(currentShop.id));
  }, [currentShop, userRole, navigate]);

  if (!report || !currentShop) {
    return null;
  }

  const exportToExcel = () => {
    const data = [
      ['财务报表', currentShop.name],
      ['生成时间', new Date().toLocaleString('zh-CN')],
      [],
      ['业绩汇总'],
      ['日期', '今日', '本周', '本月', '本年'],
      ['营收(元)', report.revenue.today, report.revenue.week, report.revenue.month, report.revenue.year],
      ['服务数', report.services.today, report.services.week, report.services.month, report.services.year],
      ['客单价(元)', report.averageTicket.today, report.averageTicket.week, report.averageTicket.month, report.averageTicket.year],
      [],
      ['发型师业绩'],
      ['发型师', '今日业绩(元)', '服务数', '平均评分'],
      ...report.topStylists.map(stylist => [
        stylist.name,
        stylist.revenue,
        stylist.services,
        stylist.rating
      ])
    ];

    const bookingsData = [
      ['预约记录'],
      ['时间', '顾客', '服务', '发型师', '金额', '状态'],
      ...mockBookings
        .filter(b => b.shopId === currentShop.id)
        .map(booking => [
          new Date(booking.scheduledTime).toLocaleString('zh-CN'),
          booking.customerName,
          booking.serviceName,
          booking.barberName || '随机',
          booking.price,
          booking.status === 'confirmed' ? '已确认' : booking.status === 'completed' ? '已完成' : '待确认'
        ])
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(data);
    const ws2 = XLSX.utils.aoa_to_sheet(bookingsData);
    
    ws1['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    ws2['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
    
    XLSX.utils.book_append_sheet(wb, ws1, '财务汇总');
    XLSX.utils.book_append_sheet(wb, ws2, '预约记录');
    XLSX.writeFile(wb, `${currentShop.name}_财务报表_${new Date().toLocaleDateString('zh-CN')}.xlsx`);
  };

  const chartData = [
    { name: '周一', revenue: Math.floor(Math.random() * 2000) + 500 },
    { name: '周二', revenue: Math.floor(Math.random() * 2000) + 500 },
    { name: '周三', revenue: Math.floor(Math.random() * 2000) + 500 },
    { name: '周四', revenue: Math.floor(Math.random() * 2000) + 500 },
    { name: '周五', revenue: Math.floor(Math.random() * 3000) + 1000 },
    { name: '周六', revenue: Math.floor(Math.random() * 4000) + 1500 },
    { name: '周日', revenue: Math.floor(Math.random() * 3500) + 1200 },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/shop')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
          <h1 className="font-semibold text-gray-800">财务报表</h1>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl font-medium transition-colors"
          >
            <Download size={18} />
            <span>导出Excel</span>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 时间范围选择 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-4">
            <Calendar size={20} className="text-gray-500" />
            <div className="flex gap-2">
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
                  {range === 'week' ? '本周' : range === 'month' ? '本月' : range === 'quarter' ? '本季度' : '本年'}
                </button>
              ))}
            </div>
          </div>
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
            <div className="text-3xl font-bold mb-1">¥{report.revenue.today.toLocaleString()}</div>
            <div className="text-sm opacity-80">较昨日 +{Math.floor(Math.random() * 30)}%</div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <TrendingUp size={24} />
              </div>
              <div className="text-sm opacity-80">本月</div>
            </div>
            <div className="text-3xl font-bold mb-1">¥{report.revenue.month.toLocaleString()}</div>
            <div className="text-sm opacity-80">目标完成 {Math.floor(Math.random() * 20 + 80)}%</div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Users size={24} />
              </div>
              <div className="text-sm opacity-80">服务数</div>
            </div>
            <div className="text-3xl font-bold mb-1">{report.services.month}</div>
            <div className="text-sm opacity-80">本月累计</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <FileSpreadsheet size={24} />
              </div>
              <div className="text-sm opacity-80">客单价</div>
            </div>
            <div className="text-3xl font-bold mb-1">¥{report.averageTicket.month}</div>
            <div className="text-sm opacity-80">较上月 +{Math.floor(Math.random() * 15)}%</div>
          </div>
        </div>

        {/* 业绩图表 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">本周营收趋势</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={3} fill="#fed7aa" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 发型师业绩排名 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">发型师业绩排名</h2>
          <div className="space-y-4">
            {report.topStylists.map((stylist, index) => (
              <div key={stylist.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-orange-300 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                    index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-700' : 'bg-gray-300'
                  }`}>
                    {index + 1}
                  </div>
                  <img
                    src={stylist.avatar}
                    alt={stylist.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-medium text-gray-800">{stylist.name}</div>
                    <div className="text-sm text-gray-500">服务 {stylist.services} 单 · 评分 {stylist.rating}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-orange-500">¥{stylist.revenue.toLocaleString()}</div>
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
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">项目</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">类型</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">金额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...Array(5)].map((_, i) => {
                  const isIncome = Math.random() > 0.2;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {new Date(Date.now() - i * 86400000).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-800">
                        {isIncome ? '精剪服务' : '店铺租金'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          isIncome 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {isIncome ? '收入' : '支出'}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-sm text-right font-medium ${
                        isIncome ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {isIncome ? '+' : '-'}¥{isIncome ? Math.floor(Math.random() * 300 + 50) : Math.floor(Math.random() * 5000 + 1000)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialReportPage;
