import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Users,
  DollarSign,
  ShoppingBag,
  PieChart as PieChartIcon,
  Activity,
  Scissors,
  AlertTriangle,
  Bell,
  Gift,
  Crown,
  Phone,
  Loader2,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { customerAnalyticsApi, couponApi } from '../../api';
import { CustomerInsights, UserRole } from '../../../shared/types';
import ShopLayout from './ShopLayout';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

const SEGMENT_COLORS = {
  highValueActive: '#f97316', // 琥珀橙
  activeMaintain: '#3b82f6',  // 蓝
  sleepWarning: '#f59e0b',    // 黄
  churned: '#ef4444',         // 红
};

const SEGMENT_LABELS: Record<
  CustomerInsights['sleepingCustomers'][number]['segment'],
  string
> = {
  highValueActive: '高价值活跃',
  activeMaintain: '活跃维护',
  sleepWarning: '沉睡预警',
  churned: '流失客户',
};

const RISK_BADGES = {
  low: { text: '活跃', className: 'bg-green-100 text-green-700' },
  medium: { text: '需关注', className: 'bg-yellow-100 text-yellow-700' },
  high: { text: '高流失', className: 'bg-red-100 text-red-700' },
};

const CustomerInsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const { userRole, currentShop } = useAppStore();
  const [insights, setInsights] = useState<CustomerInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [lineReady, setLineReady] = useState(false);
  const [pieReady, setPieReady] = useState(false);
  const lineChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState('');
  const [sendingCustomerId, setSendingCustomerId] = useState<string | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await customerAnalyticsApi.getCustomerInsights(currentShop?.id);
      setInsights(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? (err as Error).message : String(err);
      console.error('[CustomerInsights] 获取客户洞察失败:', message);
      setError('获取客户洞察失败：' + message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (![UserRole.CEO, UserRole.SHOP_OWNER, UserRole.CUSTOMER_SERVICE].includes(userRole as UserRole)) {
      navigate('/shop');
      return;
    }
    fetchInsights();
  }, [userRole, navigate, currentShop]);

  // 等待布局稳定后再渲染图表，避免 ResponsiveContainer 读取到 0/-1 尺寸
  useLayoutEffect(() => {
    if (loading || !insights) {
      setLineReady(false);
      setPieReady(false);
      return;
    }
    const check = () => {
      const line = lineChartRef.current?.getBoundingClientRect();
      const pie = pieChartRef.current?.getBoundingClientRect();
      if (line && line.width > 0 && line.height > 0) setLineReady(true);
      if (pie && pie.width > 0 && pie.height > 0) setPieReady(true);
    };
    check();
    const raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [loading, insights]);

  const handleSendRecallCoupon = async (
    customer: CustomerInsights['sleepingCustomers'][number]
  ) => {
    if (!currentShop) {
      setToast('请先选择店铺');
      setTimeout(() => setToast(''), 2500);
      return;
    }
    setSendingCustomerId(customer.id);
    try {
      const coupon = await couponApi.create(currentShop.id, {
        name: '老客户回归礼券',
        type: 'fixed_amount',
        value: 50,
        minOrderAmount: 100,
        applicableScope: 'all',
        totalQuantity: 1,
        remainingQuantity: 1,
        perCustomerLimit: 1,
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 86400000),
        isActive: true,
      });
      if (coupon) {
        await couponApi.claim(coupon.id, customer.id, customer.name, customer.phone);
        setToast(`已向 ${customer.name} 发送 ¥50 回归礼券`);
      } else {
        setToast(`已模拟向 ${customer.name} 发送召回券（演示模式）`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? (err as Error).message : String(err);
      setToast('发送失败：' + message);
    } finally {
      setSendingCustomerId(null);
      setTimeout(() => setToast(''), 2500);
    }
  };

  const formatMoney = (n: number) => `¥${Math.round(n).toLocaleString()}`;

  if (loading) {
    return (
      <ShopLayout title="客户洞察">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center text-gray-500">
            <Loader2 size={40} className="animate-spin mx-auto mb-3 text-orange-500" />
            <p>加载客户洞察数据...</p>
          </div>
        </div>
      </ShopLayout>
    );
  }

  if (error || !insights) {
    return (
      <ShopLayout title="客户洞察">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-red-500 mb-4">{error || '暂无数据'}</p>
            <button
              onClick={fetchInsights}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      </ShopLayout>
    );
  }

  const periodLabels = { today: '今日', week: '本周', month: '本月' };

  const overview = insights.overview[selectedPeriod];

  const rfmChartData = Object.entries(insights.rfmSegments).map(([key, value]) => ({
    name: SEGMENT_LABELS[key as keyof typeof SEGMENT_LABELS],
    key,
    value,
  }));

  return (
    <ShopLayout title="客户洞察">
      <div className="space-y-5">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Activity className="text-orange-500" size={26} />
              客户洞察看板
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              基于现有交易数据，自动分层客户、识别沉睡客户并支持一键召回
            </p>
          </div>
          <div className="flex gap-2">
            {(['today', 'week', 'month'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedPeriod === period
                    ? 'bg-orange-500 text-white shadow'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {periodLabels[period]}
              </button>
            ))}
          </div>
        </div>

        {/* 核心指标卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 sm:p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <DollarSign size={20} />
              </div>
              <span className="text-xs opacity-80">{periodLabels[selectedPeriod]}营收</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold">{formatMoney(overview.revenue)}</div>
            <div className="text-xs opacity-80 mt-1 flex items-center gap-1">
              <TrendingUp size={12} />
              实付合计
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 sm:p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Users size={20} />
              </div>
              <span className="text-xs opacity-80">消费客户</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold">{overview.customers}</div>
            <div className="text-xs opacity-80 mt-1">独立客户数</div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 sm:p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <ShoppingBag size={20} />
              </div>
              <span className="text-xs opacity-80">订单数</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold">{overview.orders}</div>
            <div className="text-xs opacity-80 mt-1">服务+商品</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 sm:p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Crown size={20} />
              </div>
              <span className="text-xs opacity-80">客单价</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold">{formatMoney(overview.avgOrderValue)}</div>
            <div className="text-xs opacity-80 mt-1">人均消费</div>
          </div>
        </div>

        {/* 图表区 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* RFM 客户分层 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
            <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <PieChartIcon size={20} className="text-orange-500" />
              RFM 客户分层
            </h2>
            <div ref={pieChartRef} style={{ height: 280, position: 'relative' }}>
              {pieReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={rfmChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {rfmChartData.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={SEGMENT_COLORS[entry.key as keyof typeof SEGMENT_COLORS]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  图表加载中...
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {rfmChartData.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: SEGMENT_COLORS[item.key as keyof typeof SEGMENT_COLORS] }}
                  />
                  <span className="truncate">{item.name}</span>
                  <span className="font-semibold ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 营收趋势 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
            <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-500" />
              近 30 天营收趋势
            </h2>
            <div ref={lineChartRef} style={{ height: 280, position: 'relative' }}>
              {lineReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={insights.revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string) =>
                        name === 'revenue'
                          ? [`¥${Number(value).toLocaleString()}`, '营收']
                          : [value, '订单数']
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  图表加载中...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 热门服务排行 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
          <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Scissors size={20} className="text-purple-500" />
            热门服务排行
          </h2>
          {insights.topServices.length === 0 ? (
            <div className="text-center text-gray-400 py-8">暂无服务数据</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insights.topServices} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                      width={80}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === 'revenue'
                          ? [`¥${Number(value).toLocaleString()}`, '营收']
                          : [value, '次数']
                      }
                    />
                    <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {insights.topServices.map((service, index) => (
                  <div
                    key={service.name}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
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
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{service.name}</div>
                      <div className="text-xs text-gray-500">{service.count} 次</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-purple-600">{formatMoney(service.revenue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 沉睡/流失客户列表 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
              <Bell size={20} className="text-red-500" />
              沉睡 / 流失客户
            </h2>
            <span className="text-xs text-gray-500">
              共 {insights.sleepingCustomers.length} 位，建议优先召回
            </span>
          </div>

          {insights.sleepingCustomers.length === 0 ? (
            <div className="text-center text-gray-400 py-8">暂无沉睡客户</div>
          ) : (
            <div className="space-y-3">
              {insights.sleepingCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="border border-gray-100 rounded-xl p-3 sm:p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <Users size={20} className="text-orange-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{customer.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${RISK_BADGES[customer.churnRisk].className}`}>
                            {RISK_BADGES[customer.churnRisk].text}
                          </span>
                          <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded-full">
                            {SEGMENT_LABELS[customer.segment]}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Phone size={12} /> {customer.phone}
                          </span>
                          <span>累计消费 {formatMoney(customer.totalSpent)}</span>
                          <span>到店 {customer.visitCount} 次</span>
                          {customer.lastVisitAt && (
                            <span>
                              上次到店：{customer.daysSinceLastVisit} 天前
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSendRecallCoupon(customer)}
                      disabled={sendingCustomerId === customer.id}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm rounded-lg transition-colors flex-shrink-0"
                    >
                      {sendingCustomerId === customer.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Gift size={14} />
                      )}
                      {sendingCustomerId === customer.id ? '发送中...' : '发送召回券'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 高价值客户 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
          <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Crown size={20} className="text-yellow-500" />
            高价值活跃客户 TOP10
          </h2>
          {insights.highValueCustomers.length === 0 ? (
            <div className="text-center text-gray-400 py-8">暂无高价值客户</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {insights.highValueCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="border border-gray-100 rounded-xl p-4 hover:border-orange-200 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <Crown size={18} className="text-yellow-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{customer.name}</div>
                      <div className="text-xs text-gray-500">{customer.phone}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-xs text-gray-500">累计消费</div>
                      <div className="font-bold text-orange-600 text-sm">
                        {formatMoney(customer.totalSpent)}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-xs text-gray-500">到店</div>
                      <div className="font-bold text-blue-600 text-sm">
                        {customer.visitCount} 次
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-xs text-gray-500">客单价</div>
                      <div className="font-bold text-purple-600 text-sm">
                        {formatMoney(customer.avgOrderValue)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 运营建议 */}
        <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-2xl p-4 sm:p-5 border border-orange-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-orange-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <div className="font-semibold text-orange-700 mb-1">运营建议</div>
              <div className="text-sm text-gray-600 leading-relaxed space-y-1.5">
                <p>
                  1. 高价值活跃客户（{insights.rfmSegments.highValueActive} 位）是店铺核心资产，建议由店长或专属发型师重点维护。
                </p>
                <p>
                  2. 沉睡预警客户（{insights.rfmSegments.sleepWarning} 位）可通过"发送召回券"一键触达，提升回流率。
                </p>
                <p>
                  3. 流失客户（{insights.rfmSegments.churned} 位）建议结合电话回访+大额优惠券组合召回。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 bg-green-500 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm flex items-center gap-2 z-50 animate-pulse">
          <CheckCircle size={16} />
          {toast}
        </div>
      )}
    </ShopLayout>
  );
};

export default CustomerInsightsPage;
