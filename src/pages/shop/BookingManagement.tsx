import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  User,
  Phone,
  Scissors,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  MessageSquare,
  ChevronRight,
  X,
  Loader2,
  LayoutList,
  Columns,
} from 'lucide-react';
import { Booking, UserRole } from '../../../shared/types';
import ShopLayout from './ShopLayout';

const API_BASE = '/api';

const BookingManagement: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<Booking['status'] | 'all'>('all');
  const [barberFilter, setBarberFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('board');
  const [completing, setCompleting] = useState(false);

  // 从 API 获取预约列表
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('shopId', 'shop1');
      params.set('page', '1');
      params.set('pageSize', '50');
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (dateFilter) {
        params.set('dateStart', dateFilter);
      }

      const res = await fetch(`${API_BASE}/bookings?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.data) {
        setBookings(data.data);
      } else {
        setError(data.error || '获取预约列表失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFilter]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // 完成服务
  const handleCompleteBooking = async () => {
    if (!viewingBooking) return;
    if (!window.confirm('确认该预约已完成服务吗？')) return;

    setCompleting(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${viewingBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      const data = await res.json();

      if (data.success) {
        setViewingBooking(null);
        fetchBookings();
      } else {
        setError(data.error || '完成服务失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setCompleting(false);
    }
  };

  // 客户未到
  const [noShowing, setNoShowing] = useState(false);
  const handleNoShow = async () => {
    if (!viewingBooking) return;
    if (!window.confirm('确认标记该预约为"客户未到"吗？')) return;

    setNoShowing(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${viewingBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();

      if (data.success) {
        setViewingBooking(null);
        fetchBookings();
      } else {
        setError(data.error || '标记失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setNoShowing(false);
    }
  };

  // 兼容 API 返回的 stylistName/stylistId 与 mock 使用的 barberName/barberId
  const getBarberName = (booking: Booking) =>
    (booking as any).stylistName || booking.barberName || '';
  const getBarberId = (booking: Booking) =>
    (booking as any).stylistId || booking.barberId || '';

  // 判断预约是否已过期（confirmed 状态且预约时间已过）
  const isExpired = (booking: Booking) => {
    if (booking.status !== 'confirmed') return false;
    const scheduled = new Date(booking.scheduledTime);
    return scheduled.getTime() < Date.now();
  };

  // 状态配置
  const statusConfig: Record<
    Booking['status'],
    { label: string; color: string; bgColor: string; icon: React.ElementType }
  > = {
    pending: {
      label: '待确认',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-100',
      icon: AlertCircle,
    },
    confirmed: {
      label: '已确认',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
      icon: CheckCircle,
    },
    completed: {
      label: '已完成',
      color: 'text-green-700',
      bgColor: 'bg-green-100',
      icon: CheckCircle,
    },
    cancelled: {
      label: '已取消',
      color: 'text-gray-500',
      bgColor: 'bg-gray-100',
      icon: XCircle,
    },
  };

  // 统计
  const stats = useMemo(() => {
    return [
      {
        label: '待确认',
        value: bookings.filter((b) => b.status === 'pending').length,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
      },
      {
        label: '今日预约',
        value: bookings.filter((b) => {
          const today = new Date().toDateString();
          return new Date(b.scheduledTime).toDateString() === today;
        }).length,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
      },
      {
        label: '本周预约',
        value: bookings.filter((b) => {
          const now = new Date();
          const bookingDate = new Date(b.scheduledTime);
          const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          return bookingDate >= weekStart && bookingDate <= weekEnd;
        }).length,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
      },
      {
        label: '本月完成',
        value: bookings.filter((b) => b.status === 'completed').length,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
      },
    ];
  }, [bookings]);

  // 从所有预约中提取发型师选项（用于下拉筛选）
  const barberOptions = useMemo(() => {
    const names = new Set<string>();
    bookings.forEach((b) => {
      const name = getBarberName(b);
      if (name) names.add(name);
    });
    return Array.from(names).sort();
  }, [bookings]);

  // 筛选（列表视图用：包含状态和发型师筛选）
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const matchesSearch =
        searchTerm === '' ||
        b.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getBarberName(b)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.serviceName?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchesBarber = barberFilter === 'all' || getBarberName(b) === barberFilter;

      const matchesDate =
        !dateFilter ||
        new Date(b.scheduledTime).toDateString() === new Date(dateFilter).toDateString();

      return matchesSearch && matchesStatus && matchesBarber && matchesDate;
    });
  }, [bookings, searchTerm, statusFilter, barberFilter, dateFilter]);

  // 看板视图用：仅按搜索、日期和发型师筛选，状态用于列内分组
  const boardBookings = useMemo(() => {
    return bookings.filter((b) => {
      const matchesSearch =
        searchTerm === '' ||
        b.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getBarberName(b)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.serviceName?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesBarber = barberFilter === 'all' || getBarberName(b) === barberFilter;
      const matchesDate =
        !dateFilter ||
        new Date(b.scheduledTime).toDateString() === new Date(dateFilter).toDateString();

      return matchesSearch && matchesBarber && matchesDate;
    });
  }, [bookings, searchTerm, barberFilter, dateFilter]);

  // 按状态分组（看板视图用）
  const boardGroups = useMemo(() => {
    const groups: Record<Booking['status'], Booking[]> = {
      pending: [],
      confirmed: [],
      completed: [],
      cancelled: [],
    };
    boardBookings.forEach((booking) => {
      groups[booking.status].push(booking);
    });
    return groups;
  }, [boardBookings]);

  // 按日期分组
  const groupedBookings = useMemo(() => {
    const groups: Record<string, Booking[]> = {};
    filteredBookings.forEach((booking) => {
      const dateKey = new Date(booking.scheduledTime).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(booking);
    });
    return groups;
  }, [filteredBookings]);

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setBarberFilter('all');
    setDateFilter('');
  };

  return (
    <ShopLayout title="预约管理">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={`${stat.bgColor} rounded-2xl p-4 border border-gray-100`}
          >
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5 border border-gray-100">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="搜索客户姓名 / 发型师 / 服务..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Booking['status'] | 'all')}
            className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
          >
            <option value="all">全部状态</option>
            <option value="pending">待确认</option>
            <option value="confirmed">已确认</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>

          <select
            value={barberFilter}
            onChange={(e) => setBarberFilter(e.target.value)}
            className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
          >
            <option value="all">全部发型师</option>
            {barberOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
          />

          {(searchTerm || statusFilter !== 'all' || barberFilter !== 'all' || dateFilter) && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-2 px-4 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm"
            >
              <RefreshCw size={16} />
              重置
            </button>
          )}
          <button
            onClick={fetchBookings}
            className="flex items-center gap-2 px-4 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm"
            title="刷新数据"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* 视图切换 */}
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm transition-colors ${
                viewMode === 'list'
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="列表视图"
            >
              <LayoutList size={16} />
              列表
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm transition-colors ${
                viewMode === 'board'
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="看板视图"
            >
              <Columns size={16} />
              看板
            </button>
          </div>
        </div>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
          <Loader2 size={48} className="mx-auto mb-3 text-orange-500 animate-spin" />
          <p className="text-gray-500">加载中...</p>
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <div className="bg-red-50 rounded-2xl shadow-sm p-12 text-center border border-red-100">
          <AlertCircle size={48} className="mx-auto mb-3 text-red-400" />
          <p className="text-red-600 mb-3">{error}</p>
          <button
            onClick={fetchBookings}
            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-colors text-sm"
          >
            重试
          </button>
        </div>
      )}

      {/* 预约列表 / 看板 */}
      {viewMode === 'list' ? (
        <div className="space-y-6">
          {Object.keys(groupedBookings).length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
              <Calendar size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">暂无预约记录</p>
              <button
                onClick={resetFilters}
                className="mt-3 px-4 py-2 text-sm bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-100 transition-colors"
              >
                重置筛选
              </button>
            </div>
          ) : (
            Object.entries(groupedBookings).map(([date, dateBookings]) => (
              <div key={date} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Calendar size={16} className="text-orange-500" />
                    {date}
                  </div>
                  <span className="text-xs text-gray-400">{dateBookings.length} 个预约</span>
                </div>

                <div className="divide-y divide-gray-50">
                  {dateBookings.map((booking) => {
                    const StatusIcon = statusConfig[booking.status].icon;
                    const expired = isExpired(booking);
                    return (
                      <div
                        key={booking.id}
                        className={`px-5 py-4 hover:bg-orange-50/30 transition-colors cursor-pointer ${expired ? 'bg-red-50/50' : ''}`}
                        onClick={() => setViewingBooking(booking)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* 排队号 */}
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${expired ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                              {booking.queueNumber || '-'}
                            </div>

                            {/* 信息 */}
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-gray-800">{booking.customerName}</span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[booking.status].bgColor} ${statusConfig[booking.status].color}`}>
                                  <StatusIcon size={12} />
                                  {statusConfig[booking.status].label}
                                </span>
                                {expired && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                                    已过期
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Scissors size={14} />
                                  {booking.serviceName}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock size={14} />
                                  {new Date(booking.scheduledTime).toLocaleTimeString('zh-CN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                {getBarberName(booking) && (
                                  <span className="flex items-center gap-1">
                                    <User size={14} />
                                    {getBarberName(booking)}
                                  </span>
                                )}
                                {booking.price && (
                                  <span className="text-orange-600 font-medium">¥{booking.price}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {(Object.keys(boardGroups) as Booking['status'][]).map((status) => {
            const StatusIcon = statusConfig[status].icon;
            const columnBookings = boardGroups[status];
            return (
              <div key={status} className="bg-gray-50 rounded-2xl p-3 border border-gray-100 flex flex-col min-h-[300px]">
                {/* 列标题 */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-xl mb-3 ${statusConfig[status].bgColor}`}>
                  <div className="flex items-center gap-2">
                    <StatusIcon size={16} className={statusConfig[status].color} />
                    <span className={`font-medium text-sm ${statusConfig[status].color}`}>
                      {statusConfig[status].label}
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/70 ${statusConfig[status].color}`}>
                    {columnBookings.length}
                  </span>
                </div>

                {/* 卡片列表 */}
                <div className="flex-1 space-y-2">
                  {columnBookings.length === 0 ? (
                    <div className="text-center py-8 text-xs text-gray-400">暂无</div>
                  ) : (
                    columnBookings.map((booking) => {
                      const expired = isExpired(booking);
                      return (
                        <div
                          key={booking.id}
                          onClick={() => setViewingBooking(booking)}
                          className={`bg-white rounded-xl p-3 border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer ${expired ? 'ring-1 ring-red-200' : ''}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-bold text-sm text-gray-800">{booking.customerName}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusConfig[status].bgColor} ${statusConfig[status].color}`}>
                              #{booking.queueNumber || '-'}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Scissors size={12} />
                              {booking.serviceName}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(booking.scheduledTime).toLocaleString('zh-CN', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            {getBarberName(booking) && (
                              <div className="flex items-center gap-1">
                                <User size={12} />
                                {getBarberName(booking)}
                              </div>
                            )}
                            {booking.price && (
                              <div className="text-orange-600 font-medium">¥{booking.price}</div>
                            )}
                          </div>
                          {expired && (
                            <div className="mt-2 text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              已过期
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 预约详情弹窗 */}
      {viewingBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-gray-800">预约详情</h3>
              <button
                onClick={() => setViewingBooking(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* 状态 */}
              <div className={`flex items-center gap-3 p-4 rounded-xl ${statusConfig[viewingBooking.status].bgColor}`}>
                {React.createElement(statusConfig[viewingBooking.status].icon, {
                  size: 20,
                  className: statusConfig[viewingBooking.status].color,
                })}
                <span className={`font-medium ${statusConfig[viewingBooking.status].color}`}>
                  {statusConfig[viewingBooking.status].label}
                </span>
              </div>

              {/* 基本信息 */}
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-2">
                    <User size={16} /> 客户姓名
                  </span>
                  <span className="font-medium text-gray-800">{viewingBooking.customerName}</span>
                </div>
                {(viewingBooking as any).customerPhone && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500 flex items-center gap-2">
                      <Phone size={16} /> 手机号
                    </span>
                    <span className="font-medium text-gray-800">{(viewingBooking as any).customerPhone}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Scissors size={16} /> 服务项目
                  </span>
                  <span className="font-medium text-gray-800">{viewingBooking.serviceName}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Calendar size={16} /> 预约时间
                  </span>
                  <span className="font-medium text-gray-800">
                    {new Date(viewingBooking.scheduledTime).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-2">
                    <User size={16} /> 指定发型师
                  </span>
                  <span className="font-medium text-gray-800">{getBarberName(viewingBooking) || '未指定'}</span>
                </div>
                {viewingBooking.price && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500 flex items-center gap-2">
                      ¥ 服务价格
                    </span>
                    <span className="font-bold text-orange-500">¥{viewingBooking.price}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-2">
                    # 排队号
                  </span>
                  <span className="font-medium text-gray-800">#{viewingBooking.queueNumber || '-'}</span>
                </div>
                {viewingBooking.notes && (
                  <div className="py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm flex items-center gap-2 mb-1">
                      <MessageSquare size={16} /> 备注
                    </span>
                    <p className="text-gray-700 mt-1">{viewingBooking.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 mt-6">
              {viewingBooking.status === 'pending' && (
                <>
                  <button className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors">
                    确认预约
                  </button>
                  <button className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium transition-colors">
                    取消预约
                  </button>
                </>
              )}
              {viewingBooking.status === 'confirmed' && (
                <>
                  <button
                    onClick={handleCompleteBooking}
                    disabled={completing}
                    className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {completing ? <Loader2 size={18} className="animate-spin" /> : null}
                    完成服务
                  </button>
                  {isExpired(viewingBooking) && (
                    <button
                      onClick={handleNoShow}
                      disabled={noShowing}
                      className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {noShowing ? <Loader2 size={18} className="animate-spin" /> : null}
                      客户未到
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => setViewingBooking(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default BookingManagement;
