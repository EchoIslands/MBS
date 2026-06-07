import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar as CalendarIcon, TrendingUp, Star, Users, DollarSign, Clock, CheckCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { getMockStylistPerformance, mockBookings } from '../../../shared/mockData';
import { StylistPerformance, UserRole } from '../../../shared/types';

const StylistDashboard: React.FC = () => {
  const { currentEmployee, currentShop } = useAppStore();
  const [performance, setPerformance] = useState<StylistPerformance | null>(null);
  const [todayBookings, setTodayBookings] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // 如果没有登录，跳转回选择页面
    if (!currentEmployee || currentEmployee.role !== UserRole.STYLIST) {
      navigate('/');
      return;
    }

    // 加载模拟业绩数据
    if (currentShop && currentEmployee) {
      const perf = getMockStylistPerformance(currentEmployee.id, currentShop.id);
      setPerformance(perf);

      // 筛选今天的预约
      const today = new Date().toISOString().split('T')[0];
      const bookings = mockBookings.filter(
        b => b.shopId === currentShop.id && 
             b.barberId === currentEmployee.id &&
             new Date(b.scheduledTime).toISOString().split('T')[0] === today
      );
      setTodayBookings(bookings);
    }
  }, [currentEmployee, currentShop, navigate]);

  if (!currentEmployee || !performance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 bg-white shadow-sm z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-semibold text-gray-800 text-lg">我的工作台</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* 发型师个人信息卡片 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center gap-4">
            <img
              src={currentEmployee.avatar}
              alt={currentEmployee.name}
              className="w-16 h-16 rounded-full object-cover"
            />
            <div>
              <h2 className="text-xl font-bold text-gray-800">{currentEmployee.name}</h2>
              <p className="text-sm text-gray-500">{currentEmployee.title}</p>
            </div>
          </div>
        </div>

        {/* 业绩概览卡片组 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* 今日业绩 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <DollarSign size={16} />
              <span>今日业绩</span>
            </div>
            <div className="text-2xl font-bold text-orange-500">
              ¥{performance.revenue.today.toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              预计提成: ¥{performance.estimatedCommission.toLocaleString()}
            </div>
          </div>

          {/* 本周业绩 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <TrendingUp size={16} />
              <span>本周业绩</span>
            </div>
            <div className="text-2xl font-bold text-green-500">
              ¥{performance.revenue.week.toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              本月: ¥{performance.revenue.month.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 评分和服务统计 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Star size={20} />
            <span>我的表现</span>
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-500">{performance.averageRating}</div>
              <div className="text-xs text-gray-500 mt-1">平均评分</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{performance.services.total}</div>
              <div className="text-xs text-gray-500 mt-1">总服务次数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-500">
                {Object.keys(performance.services.byType).length}
              </div>
              <div className="text-xs text-gray-500 mt-1">服务类型</div>
            </div>
          </div>

          {/* 服务类型明细 */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 mb-2">服务类型统计</h4>
            <div className="space-y-2">
              {Object.entries(performance.services.byType).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-gray-600">{type}</span>
                  <span className="font-medium text-gray-800">{count}次</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 今日预约 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} />
            <span>今日预约</span>
          </h3>

          {todayBookings.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              今天暂无预约
            </div>
          ) : (
            <div className="space-y-3">
              {todayBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Users size={18} className="text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">{booking.customerName}</div>
                      <div className="text-xs text-gray-500">
                        {booking.serviceName} · {new Date(booking.scheduledTime).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})}
                      </div>
                    </div>
                  </div>
                  {booking.status === 'completed' && (
                    <div className="flex items-center gap-1 text-green-600 text-sm">
                      <CheckCircle size={14} />
                      <span>已完成</span>
                    </div>
                  )}
                  {booking.status === 'confirmed' && (
                    <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                      待服务
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StylistDashboard;
