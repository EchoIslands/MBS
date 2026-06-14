import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  DollarSign,
  Star,
  CheckCircle,
  ArrowRight,
  Clock,
  Scissors,
  MessageSquare,
  UserCircle,
} from 'lucide-react';
import { Booking, UserRole } from '../../../shared/types';
import { useAppStore } from '../../store';
import { mockBookings, mockCustomers } from '../../../shared/mockData';
import ShopLayout from './ShopLayout';

const Dashboard: React.FC = () => {
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const navigate = useNavigate();
  const { currentShop, userRole } = useAppStore();

  useEffect(() => {
    if (!currentShop) return;
    // 模拟筛选今天的预约
    const bookings = mockBookings.filter((b) => b.shopId === currentShop.id);
    setTodayBookings(bookings);
  }, [currentShop]);

  if (!currentShop) return null;

  // 角色显示名称
  const roleLabel: Record<string, string> = {
    [UserRole.CEO]: 'CEO',
    [UserRole.CUSTOMER_SERVICE]: '客服专员',
    [UserRole.SHOP_MANAGER]: '店长',
    [UserRole.STYLIST]: '发型师',
    [UserRole.SHOP_OWNER]: '老板',
  };

  const welcomeRole = roleLabel[userRole || ''] || '管理员';

  // 统计卡片
  const completedCount = todayBookings.filter((b) => b.status === 'completed').length;
  const pendingCount = todayBookings.filter(
    (b) => b.status === 'pending' || b.status === 'confirmed',
  ).length;
  const totalRevenue = todayBookings
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + (b.price || 0), 0);

  const stats = [
    { label: '今日预约', value: todayBookings.length, icon: Calendar, color: 'text-blue-500' },
    { label: '待处理', value: pendingCount, icon: Clock, color: 'text-yellow-500' },
    { label: '已完成', value: completedCount, icon: CheckCircle, color: 'text-green-500' },
    { label: '今日营收', value: `¥${totalRevenue}`, icon: DollarSign, color: 'text-orange-500' },
  ];

  // 快捷操作（不同角色显示不同）
  const quickActions = [
    {
      label: '客户管理',
      desc: '查看客户信息',
      icon: <Users size={20} />,
      path: '/shop/customers',
      show: true,
    },
    {
      label: '评价管理',
      desc: '查看和回复评价',
      icon: <MessageSquare size={20} />,
      path: '/shop/reviews',
      show: userRole !== UserRole.STYLIST || true,
    },
    {
      label: '发型师看板',
      desc: '业绩和预约',
      icon: <Scissors size={20} />,
      path: '/shop/stylist',
      show: true,
    },
    {
      label: '客户画像',
      desc: '记录客户偏好',
      icon: <UserCircle size={20} />,
      path: '/shop/customer-profile',
      show: true,
    },
    {
      label: '会员管理',
      desc: '会员等级权益',
      icon: <Star size={20} />,
      path: '/shop/membership',
      show: userRole === UserRole.CEO || userRole === UserRole.SHOP_MANAGER || userRole === UserRole.CUSTOMER_SERVICE,
    },
    {
      label: '财务报表',
      desc: '营收数据',
      icon: <DollarSign size={20} />,
      path: '/shop/financial',
      show: userRole === UserRole.CEO,
    },
  ].filter((a) => a.show);

  // 最近预约列表
  const recentBookings = todayBookings.slice(0, 5);

  // 最近客户
  const recentCustomers = mockCustomers.slice(0, 5);

  return (
    <ShopLayout title="首页概览">
      {/* 欢迎区 */}
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow text-white p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">你好，{welcomeRole}</h2>
            <p className="text-orange-100 text-sm">
              {currentShop.name} · {new Date().toLocaleDateString('zh-CN')}
            </p>
          </div>
          <div className="hidden md:block text-right text-sm">
            <div className="opacity-80">今日预约</div>
            <div className="text-3xl font-bold">{todayBookings.length}</div>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-2xl shadow-sm p-4 md:p-5 border border-gray-100"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={stat.color} size={22} />
              </div>
              <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
              <div className="text-xs md:text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* 今日预约 */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Calendar size={20} className="text-orange-500" />
              今日预约
            </h3>
          </div>

          {recentBookings.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">暂无预约</div>
          ) : (
            <div className="space-y-3">
              {recentBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-orange-50 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-bold">
                      {booking.queueNumber || '·'}
                    </div>
                    <div>
                      <div className="font-medium text-gray-800 text-sm">
                        {booking.customerName || '顾客'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {booking.serviceName} · {booking.barberName || '待分配'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-700">
                      ¥{booking.price || 0}
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        booking.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : booking.status === 'confirmed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {booking.status === 'completed'
                        ? '已完成'
                        : booking.status === 'confirmed'
                        ? '已确认'
                        : booking.status === 'cancelled'
                        ? '已取消'
                        : '待处理'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 快捷入口 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ArrowRight size={20} className="text-orange-500" />
            快捷入口
          </h3>
          <div className="space-y-2">
            {quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-orange-50 hover:text-orange-700 rounded-xl text-left transition-colors group"
              >
                <div className="w-9 h-9 bg-white text-orange-500 rounded-lg shadow-sm flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                  {action.icon}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-800 group-hover:text-orange-700">
                    {action.label}
                  </div>
                  <div className="text-xs text-gray-400">{action.desc}</div>
                </div>
                <ArrowRight size={14} className="text-gray-300 group-hover:text-orange-500" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 最近客户 */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Users size={20} className="text-orange-500" />
            最近客户
          </h3>
          <button
            onClick={() => navigate('/shop/customers')}
            className="text-sm text-orange-500 hover:text-orange-600 flex items-center gap-1"
          >
            查看全部 <ArrowRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {recentCustomers.map((customer) => (
            <div
              key={customer.id}
              onClick={() => navigate('/shop/customers')}
              className="p-4 bg-gray-50 hover:bg-orange-50 rounded-xl text-center transition-colors cursor-pointer"
            >
              <div className="w-12 h-12 mx-auto bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-lg font-bold mb-2">
                {(customer.name || '顾').charAt(0)}
              </div>
              <div className="font-medium text-gray-800 text-sm">{customer.name}</div>
              <div className="text-xs text-gray-400 mt-1">
                {(customer.phone || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ShopLayout>
  );
};

export default Dashboard;
