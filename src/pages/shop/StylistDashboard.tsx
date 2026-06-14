import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Star,
  DollarSign,
  Clock,
  CheckCircle,
  UserCircle,
  Scissors,
  Award,
  BarChart3,
  Users,
} from 'lucide-react';
import { useAppStore } from '../../store';
import {
  getMockStylistPerformance,
  mockBookings,
  mockShops,
} from '../../../shared/mockData';
import { StylistPerformance, UserRole } from '../../../shared/types';
import ShopLayout from './ShopLayout';

const StylistDashboard: React.FC = () => {
  const { currentEmployee, currentShop, userRole } = useAppStore();
  const [ownPerformance, setOwnPerformance] = useState<StylistPerformance | null>(null);
  const [allPerformances, setAllPerformances] = useState<StylistPerformance[]>([]);
  const [todayBookings, setTodayBookings] = useState<any[]>([]);

  const isManagerOrCEO =
    userRole === UserRole.CEO || userRole === UserRole.SHOP_MANAGER;

  useEffect(() => {
    if (!currentShop || !userRole) return;

    // 发型师自己的业绩
    if (currentEmployee) {
      const perf = getMockStylistPerformance(currentEmployee.id, currentShop.id);
      setOwnPerformance(perf);
    }

    // 店长/CEO：加载所有发型师的业绩
    if (isManagerOrCEO) {
      const stylists = mockShops
        .find((s) => s.id === currentShop.id)
        ?.employees.filter((e) => e.role === UserRole.STYLIST && e.isActive) || [];

      const allPerf = stylists.map((stylist) =>
        getMockStylistPerformance(stylist.id, currentShop.id),
      );
      setAllPerformances(allPerf);
    }

    // 筛选预约
    const bookings = mockBookings.filter(
      (b) =>
        b.shopId === currentShop.id &&
        (userRole === UserRole.STYLIST ? b.barberId === currentEmployee?.id : true),
    );
    setTodayBookings(bookings);
  }, [currentEmployee, currentShop, userRole, isManagerOrCEO]);

  // ========== 店长/CEO 视图：全员业绩看板 ==========
  if (isManagerOrCEO && allPerformances.length > 0) {
    // 汇总数据
    const totalToday = allPerformances.reduce((sum, p) => sum + p.revenue.today, 0);
    const totalWeek = allPerformances.reduce((sum, p) => sum + p.revenue.week, 0);
    const totalMonth = allPerformances.reduce((sum, p) => sum + p.revenue.month, 0);
    const totalOrders = allPerformances.reduce((sum, p) => sum + p.services.total, 0);
    const avgRating = (
      allPerformances.reduce((sum, p) => sum + p.averageRating, 0) / allPerformances.length
    ).toFixed(1);

    // 按本月产值排序
    const sorted = [...allPerformances].sort(
      (a, b) => b.revenue.month - a.revenue.month,
    );

    return (
      <ShopLayout title="发型师看板">
        {/* 汇总数据卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-5 text-white shadow-md">
            <div className="flex items-center gap-2 text-orange-100 mb-1">
              <DollarSign size={14} />
              <span className="text-xs">今日全店产值</span>
            </div>
            <div className="text-2xl font-bold">¥{totalToday.toLocaleString()}</div>
            <div className="text-xs text-orange-200 mt-1">本周 ¥{totalWeek.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <BarChart3 size={14} />
              <span>本月总产值</span>
            </div>
            <div className="text-2xl font-bold text-gray-800">¥{totalMonth.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">年化 ¥{(totalMonth * 12).toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Scissors size={14} />
              <span>本月总接单</span>
            </div>
            <div className="text-2xl font-bold text-gray-800">{totalOrders}</div>
            <div className="text-xs text-gray-400 mt-1">
              {allPerformances.length} 名发型师
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Star size={14} />
              <span>平均评分</span>
            </div>
            <div className="text-2xl font-bold text-yellow-500">{avgRating}</div>
            <div className="text-xs text-gray-400 mt-1">
              {allPerformances.length} 位发型师
            </div>
          </div>
        </div>

        {/* 发型师业绩排行榜 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Users size={18} className="text-orange-500" />
              发型师业绩排行
              <span className="text-sm font-normal text-gray-500">
                （按本月产值排序）
              </span>
            </h2>
          </div>

          {/* 表头 */}
          <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-gray-50 text-xs text-gray-500 font-medium">
            <div className="col-span-1 text-center">排名</div>
            <div className="col-span-2">发型师</div>
            <div className="col-span-1 text-center">评分</div>
            <div className="col-span-2 text-right">今日产值</div>
            <div className="col-span-2 text-right">本周产值</div>
            <div className="col-span-2 text-right">本月产值</div>
            <div className="col-span-2 text-center">服务统计</div>
          </div>

          {/* 排名行 */}
          {sorted.map((perf, index) => {
            const shop = mockShops.find((s) => s.id === currentShop?.id);
            const stylist = shop?.employees.find((e) => e.id === perf.stylistId);
            const rank = index + 1;
            const rankColor =
              rank === 1
                ? 'bg-yellow-100 text-yellow-700'
                : rank === 2
                ? 'bg-gray-100 text-gray-600'
                : rank === 3
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-50 text-gray-500';

            return (
              <div
                key={perf.stylistId}
                className="grid grid-cols-12 gap-2 px-5 py-4 border-b border-gray-50 hover:bg-orange-50/30 transition-colors items-center"
              >
                {/* 排名 */}
                <div className="col-span-1 flex justify-center">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${rankColor}`}
                  >
                    {rank}
                  </span>
                </div>

                {/* 发型师信息 */}
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <UserCircle size={20} className="text-orange-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-gray-800 text-sm truncate">
                      {perf.stylistName}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {stylist?.title || '发型师'}
                    </div>
                  </div>
                </div>

                {/* 评分 */}
                <div className="col-span-1 flex justify-center items-center gap-0.5">
                  <Star
                    size={12}
                    className="fill-yellow-400 text-yellow-400"
                  />
                  <span className="text-sm font-bold text-gray-700">
                    {perf.averageRating.toFixed(1)}
                  </span>
                </div>

                {/* 今日 */}
                <div className="col-span-2 text-right">
                  <span className="text-sm font-bold text-orange-500">
                    ¥{perf.revenue.today.toLocaleString()}
                  </span>
                </div>

                {/* 本周 */}
                <div className="col-span-2 text-right">
                  <span className="text-sm font-medium text-gray-700">
                    ¥{perf.revenue.week.toLocaleString()}
                  </span>
                </div>

                {/* 本月 */}
                <div className="col-span-2 text-right">
                  <span className="text-sm font-bold text-gray-800">
                    ¥{perf.revenue.month.toLocaleString()}
                  </span>
                </div>

                {/* 服务统计 */}
                <div className="col-span-2 text-center">
                  <div className="text-sm font-medium text-gray-700">
                    {perf.services.total} 单
                  </div>
                  <div className="text-xs text-gray-400 flex justify-center gap-1 flex-wrap">
                    {Object.entries(perf.services.byType).map(([type, count]) => (
                      <span key={type} className="text-gray-400">
                        {type}{count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 各发型师服务类型明细 */}
        <div className="mt-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Award size={18} className="text-orange-500" />
            服务类型分布
          </h2>
          <div className="space-y-4">
            {sorted.map((perf) => (
              <div key={perf.stylistId} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-800 text-sm">{perf.stylistName}</span>
                  <span className="text-xs text-gray-400">共 {perf.services.total} 单</span>
                </div>
                <div className="flex gap-1 h-6 rounded-full overflow-hidden">
                  {Object.entries(perf.services.byType).map(([type, count]) => {
                    const pct = Math.round(((count as number) / perf.services.total) * 100);
                    const colorMap: Record<string, string> = {
                      '精剪': 'bg-blue-400',
                      '烫染': 'bg-purple-400',
                      '护理': 'bg-green-400',
                    };
                    return (
                      <div
                        key={type}
                        className={`${colorMap[type] || 'bg-gray-300'} rounded-full flex items-center justify-center text-white text-xs font-medium`}
                        style={{ width: `${pct}%` }}
                        title={`${type}: ${count}单 (${pct}%)`}
                      >
                        {pct >= 15 ? `${type}${count}` : pct >= 5 ? `${count}` : ''}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-1 text-xs text-gray-400">
                  {Object.entries(perf.services.byType).map(([type, count]) => {
                    const pct = Math.round(((count as number) / perf.services.total) * 100);
                    return (
                      <span key={type}>
                        {type} <span className="text-gray-600 font-medium">{count}单</span>{' '}
                        <span>({pct}%)</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ShopLayout>
    );
  }

  // ========== 发型师自己视图 ==========
  if (!ownPerformance) {
    return (
      <ShopLayout title="发型师看板">
        <div className="text-gray-500 text-center py-12">加载中...</div>
      </ShopLayout>
    );
  }

  return (
    <ShopLayout title="发型师看板">
      {/* 发型师个人信息卡片 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
            <UserCircle size={56} className="text-orange-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {currentEmployee?.name || '发型师'}
            </h2>
            <p className="text-sm text-gray-500">
              {currentEmployee?.title || '首席发型师'}
            </p>
          </div>
        </div>
      </div>

      {/* 业绩概览卡片组 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <DollarSign size={16} />
            <span>今日业绩</span>
          </div>
          <div className="text-2xl font-bold text-orange-500">
            ¥{ownPerformance.revenue.today.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            预计提成: ¥{ownPerformance.estimatedCommission.toLocaleString()}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <TrendingUp size={16} />
            <span>本周业绩</span>
          </div>
          <div className="text-2xl font-bold text-green-500">
            ¥{ownPerformance.revenue.week.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            本月: ¥{ownPerformance.revenue.month.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 评分和服务统计 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Star size={20} />
          <span>服务表现</span>
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-yellow-50 rounded-xl">
            <div className="text-2xl font-bold text-yellow-500">
              {ownPerformance.averageRating}
            </div>
            <div className="text-xs text-gray-500 mt-1">平均评分</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-xl">
            <div className="text-2xl font-bold text-blue-500">
              {ownPerformance.services.total}
            </div>
            <div className="text-xs text-gray-500 mt-1">总服务次数</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-xl">
            <div className="text-2xl font-bold text-purple-500">
              {Object.keys(ownPerformance.services.byType).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">服务类型</div>
          </div>
        </div>

        {/* 服务类型明细 */}
        <div className="pt-4 border-t border-gray-100">
          <h4 className="text-sm font-medium text-gray-700 mb-2">服务类型统计</h4>
          <div className="space-y-2">
            {Object.entries(ownPerformance.services.byType).map(([type, count]) => (
              <div key={type} className="flex justify-between text-sm">
                <span className="text-gray-600">{type}</span>
                <span className="font-medium text-gray-800">{count}次</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 预约列表 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Clock size={20} />
          <span>预约列表</span>
        </h3>

        {todayBookings.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">暂无预约</div>
        ) : (
          <div className="space-y-3">
            {todayBookings.map((booking) => (
              <div
                key={booking.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                    {booking.queueNumber || '·'}
                  </div>
                  <div>
                    <div className="font-medium text-gray-800">{booking.customerName}</div>
                    <div className="text-xs text-gray-500">
                      {booking.serviceName} ·{' '}
                      {new Date(booking.scheduledTime).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
                {booking.status === 'completed' ? (
                  <div className="flex items-center gap-1 text-green-600 text-sm">
                    <CheckCircle size={14} />
                    <span>已完成</span>
                  </div>
                ) : booking.status === 'confirmed' ? (
                  <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                    待服务
                  </div>
                ) : booking.status === 'pending' ? (
                  <div className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                    待确认
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">已取消</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ShopLayout>
  );
};

export default StylistDashboard;
