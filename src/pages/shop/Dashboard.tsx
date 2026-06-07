import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  DollarSign,
  Star,
  CheckCircle,
  XCircle,
  ArrowLeft,
  LogOut,
  Settings,
  MessageSquare,
  TrendingUp,
  User,
  Check,
  Eye,
  BarChart3,
  FileSpreadsheet,
  Building2,
  AlertTriangle,
  Package,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Booking, Employee } from '../../../shared/types';
import { useAppStore } from '../../store';
import { mockBookings } from '../../../shared/mockData';

const Dashboard: React.FC = () => {
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [newTime, setNewTime] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBookingId, setCancelBookingId] = useState('');
  const [showAllBookings, setShowAllBookings] = useState(false);
  const navigate = useNavigate();
  const { currentShop, logout } = useAppStore();

  // 生成可用时间
  const timeSlots = [];
  for (let h = 9; h <= 20; h++) {
    timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
    timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
  }

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

  const handleEditTime = (booking: Booking) => {
    setEditingBooking(booking);
    setNewTime(new Date(booking.scheduledTime).toTimeString().slice(0, 5));
    setShowEditModal(true);
  };

  const saveEditedTime = () => {
    if (editingBooking && newTime) {
      const date = new Date(editingBooking.scheduledTime).toISOString().split('T')[0];
      const newDateTime = new Date(`${date}T${newTime}`);
      
      setTodayBookings((prev) =>
        prev.map((b) =>
          b.id === editingBooking.id
            ? { ...b, scheduledTime: newDateTime }
            : b
        )
      );
      
      const mockIndex = mockBookings.findIndex(b => b.id === editingBooking.id);
      if (mockIndex !== -1) {
        mockBookings[mockIndex].scheduledTime = newDateTime;
      }
    }
    setShowEditModal(false);
    setEditingBooking(null);
    setNewTime('');
  };

  const handleCancelWithReason = (bookingId: string) => {
    setCancelBookingId(bookingId);
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    updateBookingStatus(cancelBookingId, 'cancelled');
    setShowCancelModal(false);
    setCancelReason('');
    setCancelBookingId('');
  };

  // 计算今日已完成订单的总营业额
  const completedBookings = todayBookings.filter((b) => b.status === 'completed');
  const totalRevenue = completedBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  
  // 计算已预约但未到店的顾客（pending和confirmed状态）
  const pendingBookings = todayBookings.filter((b) => b.status === 'pending' || b.status === 'confirmed');
  
  // 显示的预约列表（大于5人时折叠）
  const displayBookings = showAllBookings ? pendingBookings : pendingBookings.slice(0, 5);

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

        {/* 今日预约列表 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Calendar size={20} className="text-orange-500" />
              今日预约
            </h2>
            <div className="text-sm text-gray-600">
              已预约未到店: <span className="font-bold text-orange-600">{pendingBookings.length}</span>人 | 
              总预约: <span className="font-bold text-blue-600">{todayBookings.length}</span>人
            </div>
          </div>

          {loading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : displayBookings.length > 0 ? (
            <div className="space-y-4">
              {displayBookings.map((booking) => (
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
                            onClick={() => handleCancelWithReason(booking.id)}
                            className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            拒绝
                          </button>
                        </>
                      )}
                      {booking.status === 'confirmed' && (
                        <>
                          <button
                            onClick={() => handleEditTime(booking)}
                            className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            修改时间
                          </button>
                          <button
                            onClick={() => handleCancelWithReason(booking.id)}
                            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => updateBookingStatus(booking.id, 'completed')}
                            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            完成
                          </button>
                        </>
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

          {/* 展开/折叠按钮 */}
          {pendingBookings.length > 5 && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowAllBookings(!showAllBookings)}
                className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-orange-600 hover:bg-orange-50 rounded-xl transition-colors"
              >
                {showAllBookings ? (
                  <>
                    <ChevronUp size={16} />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    查看全部 {pendingBookings.length} 条预约
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 快捷菜单 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/shop/manage')}
            className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow"
          >
            <Settings size={24} className="text-orange-500 mb-2" />
            <div className="font-medium text-gray-800">店铺管理</div>
            <div className="text-sm text-gray-500">编辑店铺信息和服务</div>
          </button>
          <button
            onClick={() => navigate('/shop/products')}
            className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow"
          >
            <Package size={24} className="text-pink-500 mb-2" />
            <div className="font-medium text-gray-800">商品管理</div>
            <div className="text-sm text-gray-500">上架商品和库存管理</div>
          </button>
          <button
            onClick={() => navigate('/shop/reviews')}
            className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow"
          >
            <MessageSquare size={24} className="text-orange-500 mb-2" />
            <div className="font-medium text-gray-800">评价管理</div>
            <div className="text-sm text-gray-500">查看和回复顾客评价</div>
          </button>
          <button
            onClick={() => navigate('/shop/financial')}
            className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow"
          >
            <BarChart3 size={24} className="text-green-500 mb-2" />
            <div className="font-medium text-gray-800">财务报表</div>
            <div className="text-sm text-gray-500">查看营收和导出Excel</div>
          </button>
          <button
            onClick={() => navigate('/shop/stylist')}
            className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow"
          >
            <FileSpreadsheet size={24} className="text-blue-500 mb-2" />
            <div className="font-medium text-gray-800">发型师看板</div>
            <div className="text-sm text-gray-500">个人业绩和预约</div>
          </button>
          <button
            onClick={() => navigate('/shop/refunds')}
            className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow"
          >
            <AlertTriangle size={24} className="text-red-500 mb-2" />
            <div className="font-medium text-gray-800">退款管理</div>
            <div className="text-sm text-gray-500">处理退款申请</div>
          </button>
          <button
            onClick={() => navigate('/shop/owner')}
            className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow text-white"
          >
            <Building2 size={24} className="mb-2" />
            <div className="font-medium">老板视图</div>
            <div className="text-sm opacity-80">多店铺统一管理</div>
          </button>
        </div>
      </div>

      {/* 编辑时间模态框 */}
      {showEditModal && editingBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">修改预约时间</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">选择新时间</label>
              <div className="grid grid-cols-4 gap-2">
                {timeSlots.map((time) => (
                  <button
                    key={time}
                    onClick={() => setNewTime(time)}
                    className={`py-2 rounded-lg text-center transition-all ${
                      newTime === time
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingBooking(null);
                  setNewTime('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveEditedTime}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 取消预约模态框 */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-2">取消预约</h3>
            <p className="text-gray-600 mb-4">请填写取消原因（选填）</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="例如：该时段发型师已约满..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none mb-4"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                  setCancelBookingId('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmCancel}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
