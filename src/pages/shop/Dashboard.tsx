import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  DollarSign,
  Star,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
  LogOut,
  Settings,
  MessageSquare,
  TrendingUp,
  Bell,
  User,
  Check,
  Eye,
} from 'lucide-react';
import { Booking, Employee } from '../../../shared/types';
import { useAppStore } from '../../store';
import { mockBookings } from '../../../shared/mockData';

const Dashboard: React.FC = () => {
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [currentNumber, setCurrentNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const navigate = useNavigate();
  const { currentShop, logout } = useAppStore();

  useEffect(() => {
    if (!currentShop) {
      navigate('/shop/login');
      return;
    }
    // 模拟加载今天的预约
    const today = new Date().toDateString();
    const todayData = mockBookings.filter((b) => new Date(b.scheduledTime).toDateString() === today || true);
    setTodayBookings(todayData);
    setLoading(false);
  }, [currentShop]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const updateBookingStatus = (bookingId: string, status: Booking['status']) => {
    setTodayBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status } : b))
    );
  };

  const callNext = () => {
    setCalling(true);
    setTimeout(() => {
      setCurrentNumber((prev) => prev + 1);
      setCalling(false);
    }, 500);
  };

  const resetQueue = () => {
    setCurrentNumber(1);
  };

  // 计算今日已完成订单的总营业额
  const completedBookings = todayBookings.filter((b) => b.status === 'completed');
  const totalRevenue = completedBookings.reduce((sum, b) => sum + (b.price || 0), 0);

  const stats = [
    { label: '今日预约', value: todayBookings.length, icon: Calendar, color: 'text-blue-500' },
    { label: '已完成', value: completedBookings.length, icon: CheckCircle, color: 'text-green-500' },
    { label: '营业额', value: `¥${totalRevenue}`, icon: DollarSign, color: 'text-orange-500' },
    { label: '店铺评分', value: currentShop?.rating.toFixed(1) || '0', icon: Star, color: 'text-yellow-500' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-gradient-to-r from-orange-500 to-orange-600 text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{currentShop?.name}</h1>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 p-2 hover:bg-orange-400 rounded-lg transition-colors"
            >
              <LogOut size={20} />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-2">
                  <Icon size={24} className={stat.color} />
                  {stat.label === '今日预约' && (
                    <TrendingUp size={16} className="text-green-500" />
                  )}
                </div>
                <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* 排队管理 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Clock size={20} className="text-orange-500" />
              排队管理
            </h2>
            <div className="flex gap-3">
              <button
                onClick={resetQueue}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all text-sm"
              >
                重置叫号
              </button>
              <button
                onClick={callNext}
                disabled={calling}
                className={`bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-6 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${calling ? 'opacity-75 cursor-not-allowed' : ''}`}
              >
                <Bell size={18} />
                {calling ? '叫号中...' : '叫号'}
              </button>
            </div>
          </div>

          <div className={`text-center mb-6 ${calling ? 'animate-pulse' : ''}`}>
            <div className={`text-6xl font-bold mb-2 ${calling ? 'text-red-600' : 'text-orange-600'}`}>
              {currentNumber}
            </div>
            <div className="text-gray-500">当前叫号</div>
          </div>
        </div>

        {/* 今日预约列表 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-orange-500" />
            今日预约
          </h2>

          {loading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : todayBookings.length > 0 ? (
            <div className="space-y-4">
              {todayBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-gray-800 flex items-center gap-2">
                        <span className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">
                          {booking.queueNumber}
                        </span>
                        {booking.customerName}
                      </div>
                      <div className="text-sm text-gray-500">
                        {booking.serviceName} · {new Date(booking.scheduledTime).toLocaleTimeString()}
                        {booking.barberName && (
                          <span className="ml-2 text-blue-600">
                            · {booking.barberName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {booking.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => updateBookingStatus(booking.id, 'cancelled')}
                            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors"
                          >
                            取消
                          </button>
                        </>
                      )}
                      {booking.status === 'confirmed' && (
                        <button
                          onClick={() => updateBookingStatus(booking.id, 'completed')}
                          className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          完成
                        </button>
                      )}
                      {booking.status === 'completed' && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                          已完成
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-orange-500 font-bold">¥{booking.price}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      booking.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      booking.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {booking.status === 'pending' ? '待确认' :
                       booking.status === 'confirmed' ? '已确认' :
                       booking.status === 'completed' ? '已完成' : '已取消'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Calendar size={48} className="mx-auto mb-2 opacity-50" />
              <p>今日暂无预约</p>
            </div>
          )}
        </div>

        {/* 理发师名单 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Users size={20} className="text-orange-500" />
              本店理发师
            </h2>
            <button
              onClick={() => navigate('/shop/manage')}
              className="px-4 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-xl font-medium transition-all text-sm"
            >
              管理理发师
            </button>
          </div>

          {currentShop?.employees && currentShop.employees.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentShop.employees.map((employee) => (
                <div
                  key={employee.id}
                  className={`border-2 rounded-xl p-4 transition-all hover:shadow-md ${
                    employee.isActive
                      ? 'border-orange-200 bg-white'
                      : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-4 mb-3">
                    <img
                      src={employee.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(employee.name)}`}
                      alt={employee.name}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-gray-800">{employee.name}</div>
                        {employee.isActive ? (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                            <Check size={12} />
                            在岗
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            休假
                          </span>
                        )}
                      </div>
                      {employee.title && (
                        <div className="text-sm text-gray-500">{employee.title}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Star size={14} className="text-yellow-500 fill-yellow-500" />
                      <span>评分: {employee.rating}</span>
                    </div>
                    {employee.specialty && (
                      <div className="text-gray-500">
                        专长: {employee.specialty}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Users size={48} className="mx-auto mb-2 opacity-50" />
              <p>暂无理发师，快去添加吧！</p>
            </div>
          )}
        </div>

        {/* 快捷菜单 */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/shop/manage')}
            className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow"
          >
            <Settings size={24} className="text-orange-500 mb-2" />
            <div className="font-medium text-gray-800">店铺管理</div>
            <div className="text-sm text-gray-500">编辑店铺信息和服务</div>
          </button>
          <button
            onClick={() => navigate('/shop/reviews')}
            className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow"
          >
            <MessageSquare size={24} className="text-orange-500 mb-2" />
            <div className="font-medium text-gray-800">评价管理</div>
            <div className="text-sm text-gray-500">查看和回复顾客评价</div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
