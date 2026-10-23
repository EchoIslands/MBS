import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Star,
  BarChart3,
  Store,
  Trophy
} from 'lucide-react';
import { useAppStore } from '../../store';
import { OwnerDashboard, UserRole } from '../../../shared/types';
import { getAvatarUrl } from '../../lib/avatar';
import { ownerApi } from '../../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ShopLayout from './ShopLayout';
import { FINANCIAL_BASIS_NOTE } from '../../../shared/lib/financialReport';
import { settlementDateLabel } from '../../../shared/lib/settlementDisplay';

const OwnerDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { userRole, currentShop } = useAppStore();
  const requestVersion = useRef(0);
  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('month');
  const [barReady, setBarReady] = useState(false);
  const [pieReady, setPieReady] = useState(false);
  const barChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);

  // 加载老板视图数据
  const fetchDashboard = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const data = await ownerApi.getDashboard();
      if (version !== requestVersion.current) return;
      if (data) {
        setDashboard(data);
      } else {
        setError('获取经营概览失败，请稍后重试');
      }
    } catch (err: unknown) {
      if (version !== requestVersion.current) return;
      const message = err instanceof Error ? (err as Error).message : String(err);
      console.error('[OwnerDashboard] 获取经营概览失败:', message);
      setError('获取经营概览失败：' + message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    // 老板数据看板只有 CEO 和老板角色可以访问
    if (![UserRole.CEO, UserRole.SHOP_OWNER].includes(userRole as UserRole)) {
      navigate('/shop');
      return;
    }

    fetchDashboard();
    return () => { requestVersion.current++; };
  }, [userRole, navigate, currentShop?.id]);

  // 等待布局稳定后再渲染图表，避免 ResponsiveContainer 读取到 0/-1 尺寸
  // ref 必须绑定到固定高度的图表容器上，而不是外层 grid
  useLayoutEffect(() => {
    if (loading || !dashboard) {
      setBarReady(false);
      setPieReady(false);
      return;
    }

    const check = () => {
      const bar = barChartRef.current?.getBoundingClientRect();
      const pie = pieChartRef.current?.getBoundingClientRect();
      if (bar && bar.width > 0 && bar.height > 0) setBarReady(true);
      if (pie && pie.width > 0 && pie.height > 0) setPieReady(true);
    };

    check();
    const raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [loading, dashboard]);

  if (loading) {
    return (
      <ShopLayout title="老板视图">
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4" />
            <p>加载经营数据中...</p>
          </div>
        </div>
      </ShopLayout>
    );
  }

  if (error || !dashboard) {
    return (
      <ShopLayout title="老板视图">
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-red-500 mb-4">{error || '暂无数据'}</p>
            <button
              onClick={fetchDashboard}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      </ShopLayout>
    );
  }

  const periodLabels = {
    today: '今日',
    week: '本周',
    month: '本月'
  };

  const detail = dashboard.periodDetails?.[selectedPeriod];
  const shopStats = detail?.shopStats || dashboard.shopStats;
  const topStylists = detail?.topStylists || dashboard.topStylists;
  const chartData = shopStats.map(shop => ({
    name: shop.shopName.length > 6 ? shop.shopName.substring(0, 6) + '...' : shop.shopName,
    revenue: shop.revenue,
    services: shop.services,
    fullName: shop.shopName
  }));

  const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

  return (
    <ShopLayout title="老板视图">
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
          <p>{FINANCIAL_BASIS_NOTE}</p>
          <p>仅当前店铺；设计师排名按归属项目金额，整单优惠尚未分摊，可能与结算金额不同。预约客户数按预约日期去重，排除取消预约，包含周期内未来预约，不代表已消费人数。评分为历史评价均分，0表示暂无有效评价。</p>
          <p>数据截止：{settlementDateLabel(dashboard.generatedAt)}{dashboard.excluded?.count ? '；有 '+dashboard.excluded.count+' 笔已完成结算（¥'+dashboard.excluded.amount.toFixed(2)+'）待核对，未计入金额、次数及排名。' : ''}</p>
        </div>
        {/* 时间范围选择 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-2">
            {(['today', 'week', 'month'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  selectedPeriod === period
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {periodLabels[period]}
              </button>
            ))}
            <button onClick={fetchDashboard} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700">刷新数据</button>
          </div>
        </div>

        {/* 核心数据卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <DollarSign size={24} />
              </div>
              <div className="text-sm opacity-80">已完成结算金额</div>
            </div>
            <div className="text-3xl font-bold mb-1">
              ¥{dashboard.totalRevenue[selectedPeriod].toLocaleString()}
            </div>
            <div className="text-sm opacity-80 flex items-center gap-1">
              {periodLabels[selectedPeriod]}，按上方时间口径统计
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Users size={24} />
              </div>
              <div className="text-sm opacity-80">服务次数</div>
            </div>
            <div className="text-3xl font-bold mb-1">
              {dashboard.totalServices[selectedPeriod]}
            </div>
            <div className="text-sm opacity-80">已核实日期的服务项目次数</div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <BarChart3 size={24} />
              </div>
              <div className="text-sm opacity-80">预约客户数</div>
            </div>
            <div className="text-3xl font-bold mb-1">
              {dashboard.totalCustomers[selectedPeriod]}
            </div>
            <div className="text-sm opacity-80">按所选周期去重，排除已取消预约</div>
          </div>
        </div>

        {/* 店铺对比图表 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-purple-600" />
              店铺结算金额
            </h2>
            <div ref={barChartRef} style={{ height: 320, position: 'relative' }}>
              {barReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`¥${value.toLocaleString()}`, '结算金额']}
                    />
                    <Bar isAnimationActive={false} dataKey="revenue" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  图表加载中...
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Store size={20} className="text-blue-600" />
              店铺服务占比
            </h2>
            <p className="text-sm text-gray-500 break-words">{shopStats.map(s=>s.shopName).join('、')}</p>
            <div ref={pieChartRef} style={{ height: 320, position: 'relative' }}>
              {pieReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={false}
                      data={shopStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ percent }: { percent?: number }) => `${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="services"
                      nameKey="shopName"
                    >
                      {shopStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
          </div>
        </div>

        {/* 店铺列表 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Store size={20} className="text-orange-500" />
            店铺详情
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shopStats.map((shop) => (
              <div
                key={shop.shopId}
                className="border border-gray-200 rounded-xl p-5 hover:shadow-lg transition-all hover:border-purple-300"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-800">{shop.shopName}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-purple-600">
                      ¥{shop.revenue.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">{periodLabels[selectedPeriod]}结算金额</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{shop.services}</div>
                    <div className="text-xs text-gray-500">服务数</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{shop.customers}</div>
                    <div className="text-xs text-gray-500">预约客户</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-orange-600">{shop.employees}</div>
                    <div className="text-xs text-gray-500">员工</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 本店设计师项目排名 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Trophy size={20} className="text-yellow-500" />
            本店设计师项目排名
          </h2>
          <div className="space-y-3">
            {!topStylists.length && <p className="text-gray-500 text-sm">所选周期暂无可计入的归属项目</p>}
            {topStylists.map((stylist, index) => (
              <div
                key={stylist.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-purple-300 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                    index === 0 ? 'bg-yellow-500' : 
                    index === 1 ? 'bg-gray-400' : 
                    index === 2 ? 'bg-orange-700' : 
                    'bg-gray-300'
                  }`}>
                    {index + 1}
                  </div>
                  <img
                    src={stylist.avatar || getAvatarUrl(stylist.name)}
                    alt={stylist.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-medium text-gray-800">{stylist.name}</div>
                    <div className="text-sm text-gray-500">{stylist.shopName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm text-gray-500">服务数</div>
                    <div className="text-lg font-bold text-blue-600">{stylist.services}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">评分</div>
                    <div className="text-lg font-bold text-orange-600 flex items-center gap-1">
                      <Star size={14} className="text-yellow-500 fill-yellow-500" />
                      {stylist.rating}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">{periodLabels[selectedPeriod]}项目金额</div>
                    <div className="text-xl font-bold text-purple-600">
                      ¥{stylist.revenue.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </ShopLayout>
  );
};

export default OwnerDashboardPage;
