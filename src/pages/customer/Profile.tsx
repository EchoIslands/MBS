import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Calendar, Star, LogOut, Clock, MapPin, CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';
import { Booking } from '../../../shared/types';
import { bookingApi } from '../../api';
import { useAppStore } from '../../store';

const Profile: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { currentCustomer, logout } = useAppStore();

  useEffect(() => {
    if (!currentCustomer) {
      navigate('/customer/login');
      return;
    }
    loadBookings();
  }, [currentCustomer]);

  const loadBookings = async () => {
    try {
      const data = await bookingApi.getCustomerBookings(currentCustomer!.id);
      setBookings(data);
    } catch (error) {
      console.error('Failed to load bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '待确认',
      confirmed: '已确认',
      completed: '已完成',
      cancelled: '已取消',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'text-yellow-600 bg-yellow-50',
      confirmed: 'text-blue-600 bg-blue-50',
      completed: 'text-green-600 bg-green-50',
      cancelled: 'text-gray-600 bg-gray-100',
    };
    return colorMap[status] || 'text-gray-600 bg-gray-100';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <User size={40} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{currentCustomer?.name}</h1>
              <p className="text-blue-100">{currentCustomer?.phone}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 我的预约 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-blue-500" />
            我的预约
          </h2>

          {loading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : bookings.length > 0 ? (
            <div className="space-y-4">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-gray-800">{booking.shopName}</div>
                      <div className="text-sm text-gray-500">{booking.serviceName}</div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                        booking.status
                      )}`}
                    >
                      {getStatusText(booking.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(booking.scheduledTime).toLocaleString()}
                    </div>
                    <div className="font-medium text-orange-500">¥{booking.price}</div>
                  </div>
                  {booking.status === 'pending' && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => navigate(`/customer/queue/${booking.id}`)}
                        className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                      >
                        查看排队
                      </button>
                    </div>
                  )}
                  {booking.status === 'completed' && !booking.id.includes('reviewed') && (
                    <div className="mt-4">
                      <button
                        onClick={() => navigate(`/customer/review/${booking.id}`)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        <Star size={14} className="inline mr-1" />
                        去评价
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Calendar size={48} className="mx-auto mb-2 opacity-50" />
              <p>暂无预约记录</p>
            </div>
          )}
        </div>

        {/* 快捷功能 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => navigate('/customer/refund')}
            className="bg-white rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition-shadow"
          >
            <AlertCircle size={24} className="text-orange-500 mb-2" />
            <div className="font-medium text-gray-800">退款管理</div>
            <div className="text-sm text-gray-500">申请退款和查看进度</div>
          </button>
          <button
            onClick={() => navigate('/customer/feedback')}
            className="bg-white rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition-shadow"
          >
            <MessageSquare size={24} className="text-blue-500 mb-2" />
            <div className="font-medium text-gray-800">意见反馈</div>
            <div className="text-sm text-gray-500">提交建议和投诉</div>
          </button>
        </div>

        {/* 退出登录 */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 py-4 px-6 rounded-xl hover:bg-red-50 transition-colors"
        >
          <LogOut size={20} />
          退出登录
        </button>
      </div>
    </div>
  );
};

export default Profile;
