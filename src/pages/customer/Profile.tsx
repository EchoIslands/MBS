import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Calendar, Star, LogOut, Clock, CheckCircle, AlertCircle, MessageSquare,
  Crown, Gift, Sparkles, Wallet, ChevronRight, Award,
  X, Phone, Scissors, MapPin, Loader2,
} from 'lucide-react';
import { Booking, MembershipLevel } from '../../../shared/types';
import { mockShops } from '../../../shared/mockData';
import { useAppStore } from '../../store';
import { bookingApi } from '../../api';

// 会员等级标签与颜色
const levelConfig = {
  [MembershipLevel.REGULAR]: {
    label: '普通会员',
    gradient: 'from-gray-400 to-gray-500',
    bgLight: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
  },
  [MembershipLevel.PREMIUM]: {
    label: '高级会员',
    gradient: 'from-blue-500 to-indigo-600',
    bgLight: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  [MembershipLevel.STOCKHOLDER]: {
    label: '股东会员',
    gradient: 'from-purple-500 via-pink-500 to-orange-500',
    bgLight: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
};

// 权益对比表
const membershipBenefits = [
  { feature: '服务折扣', regular: '原价', premium: '9折', stockholder: '8折' },
  { feature: '积分倍率', regular: '1倍', premium: '1.5倍', stockholder: '2倍' },
  { feature: '生日福利', regular: '-', premium: '免费护理', stockholder: '免费烫染' },
  { feature: '预约优先权', regular: '-', premium: '优先预约', stockholder: 'VIP通道' },
  { feature: '推荐奖励', regular: '-', premium: '-', stockholder: '5%提成' },
  { feature: '专属发型师', regular: '-', premium: '-', stockholder: '指定首席' },
];

const Profile: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const navigate = useNavigate();
  const { currentCustomer, logout } = useAppStore();

  const loadBookings = async () => {
    if (!currentCustomer) return;
    setLoading(true);
    try {
      const data = await bookingApi.getCustomerBookings(currentCustomer.id);
      setBookings(data);
    } catch (error) {
      console.error('加载预约列表失败:', error);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentCustomer) {
      navigate('/customer/login');
      return;
    }

    loadBookings();
  }, [currentCustomer, navigate]);

  const handleCancelBooking = async () => {
    if (!viewingBooking) return;
    if (!window.confirm('确定要取消这次预约吗？')) return;

    setCancelling(true);
    try {
      await bookingApi.updateBookingStatus(viewingBooking.id, 'cancelled');
      setViewingBooking(null);
      await loadBookings();
    } catch (error) {
      console.error('取消预约失败:', error);
      alert('取消预约失败，请重试');
    } finally {
      setCancelling(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // 会员等级
  const memberLevel = currentCustomer?.membershipLevel ?? MembershipLevel.REGULAR;
  const levelInfo = levelConfig[memberLevel];
  const totalSaved = currentCustomer?.totalSaved ?? 0;
  const balance = currentCustomer?.balance ?? 0;
  const points = currentCustomer?.points ?? 0;
  const visitCount = currentCustomer?.visitCount ?? 0;
  const totalSpent = currentCustomer?.totalSpent ?? 0;

  // 下一级升级所需金额（简单估算：升级到高级会员需再消费500元，升级到股东会员需再消费2000元）
  const nextLevelGoal =
    memberLevel === MembershipLevel.REGULAR ? 500 :
    memberLevel === MembershipLevel.PREMIUM ? 2000 : null;
  const nextLevelProgress = nextLevelGoal ? Math.min(100, Math.floor((totalSpent / nextLevelGoal) * 100)) : 100;
  const nextLevelInfo =
    memberLevel === MembershipLevel.REGULAR ? { name: '高级会员', benefit: '9折 + 生日护理' } :
    memberLevel === MembershipLevel.PREMIUM ? { name: '股东会员', benefit: '8折 + 推荐提成' } :
    null;

  // 当前店铺信息（默认取第一个）
  const shop = mockShops[0];

  if (!currentCustomer) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 顶部会员卡（视觉焦点区域 — 让会员一眼看到自己的权益价值） */}
      <div className={`bg-gradient-to-br ${levelInfo.gradient} text-white relative overflow-hidden`}>
        {/* 装饰性背景 */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -right-16 top-10 w-32 h-32 bg-white/5 rounded-full" />
        <div className="absolute left-4 bottom-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />

        <div className="max-w-4xl mx-auto px-4 pt-6 pb-8 relative">
          {/* 基本信息行 */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <User size={28} />
              </div>
              <div>
                <h1 className="text-xl font-bold">{currentCustomer.name}</h1>
                <p className="text-white/80 text-sm">{currentCustomer.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 bg-white/20 rounded-full backdrop-blur-sm">
              <Crown size={14} />
              <span className="text-sm font-medium">{levelInfo.label}</span>
            </div>
          </div>

          {/* 核心价值数字 — 手机端缩小，桌面端保持大气 */}
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 sm:p-5 mb-3 sm:mb-4">
            <div className="text-xs sm:text-sm text-white/80 mb-1 flex items-center gap-1.5">
              <Sparkles size={12} className="sm:hidden" />
              <Sparkles size={14} className="hidden sm:inline" />
              您已累计节省
            </div>
            <div className="text-3xl sm:text-5xl font-bold mb-1">¥{totalSaved}</div>
            <div className="text-xs sm:text-sm text-white/70">
              到店 {visitCount} 次 · 累计消费 ¥{totalSpent}
            </div>
          </div>

          {/* 数据速览 — 余额/积分/会员等级 */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Wallet size={12} /> 储值余额
              </div>
              <div className="text-lg sm:text-xl font-bold">¥{balance}</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Star size={12} /> 积分
              </div>
              <div className="text-lg sm:text-xl font-bold">{points}</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Award size={12} /> 等级
              </div>
              <div className="text-sm sm:text-xl font-bold text-white">{levelInfo.label}</div>
            </div>
          </div>

          {/* 升级进度条 — 仅对非股东会员显示 */}
          {nextLevelInfo && (
            <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/90 font-medium flex items-center gap-1.5">
                  <Sparkles size={14} /> 距离「{nextLevelInfo.name}」
                </span>
                <span className="text-sm text-white/80 font-medium">{nextLevelProgress}%</span>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${nextLevelProgress}%` }}
                />
              </div>
              <div className="text-xs text-white/70 mt-2">
                再消费 ¥{Math.max(0, nextLevelGoal! - totalSpent)} 可升级，享受「{nextLevelInfo.benefit}」
              </div>
            </div>
          )}

          {/* 股东会员专属 — 推荐提成信息 */}
          {memberLevel === MembershipLevel.STOCKHOLDER && (
            <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-xl p-4">
              <div className="text-sm text-white/80 mb-1 flex items-center gap-1.5">
                <Gift size={14} /> 股东推荐收益
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">¥{currentCustomer.referralEarnings || 0}</div>
                  <div className="text-xs text-white/70 mt-0.5">
                    已推荐客户到店 · 提成比例 {(currentCustomer.referralBonusRate || 0.05) * 100}%
                  </div>
                </div>
                <div className="text-4xl opacity-30">👑</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 主内容区 —— 手机端减少 padding */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 -mt-2 sm:-mt-3 pb-6">

        {/* 会员权益对比 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 border border-gray-100">
          <h2 className="text-sm sm:text-base font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
            <Gift size={18} className="sm:hidden text-orange-500" />
            <Gift size={20} className="hidden sm:inline text-orange-500" />
            会员权益对比
          </h2>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs sm:text-sm min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 sm:py-3 text-gray-600 font-medium pl-1">权益</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">普通</th>
                  <th className={`text-center py-2.5 sm:py-3 font-medium ${memberLevel === MembershipLevel.PREMIUM ? 'text-blue-600' : 'text-gray-500'}`}>高级</th>
                  <th className={`text-center py-2.5 sm:py-3 font-medium ${memberLevel === MembershipLevel.STOCKHOLDER ? 'text-purple-600' : 'text-gray-500'}`}>股东</th>
                </tr>
              </thead>
              <tbody>
                {membershipBenefits.map((b, i) => {
                  const isCurrentRow =
                    (memberLevel === MembershipLevel.REGULAR) ||
                    (memberLevel === MembershipLevel.PREMIUM) ||
                    (memberLevel === MembershipLevel.STOCKHOLDER);
                  return (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 sm:py-3 text-gray-700 font-medium pl-1">{b.feature}</td>
                      <td className="py-2.5 sm:py-3 text-center text-gray-500">{b.regular}</td>
                      <td className={`py-2.5 sm:py-3 text-center ${memberLevel === MembershipLevel.PREMIUM ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-gray-500'}`}>
                        {b.premium}
                      </td>
                      <td className={`py-2.5 sm:py-3 text-center ${memberLevel === MembershipLevel.STOCKHOLDER ? 'text-purple-600 font-bold bg-purple-50/50' : 'text-gray-500'}`}>
                        {b.stockholder}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 升级引导按钮 */}
          {memberLevel !== MembershipLevel.STOCKHOLDER && (
            <div className="mt-3 sm:mt-4 p-3 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border border-orange-100">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-bold text-orange-700">升级享更多特权</div>
                  <div className="text-[11px] sm:text-xs text-orange-600/80 mt-0.5">
                    {memberLevel === MembershipLevel.REGULAR
                      ? '升级高级会员，享 9 折 + 生日免费护理'
                      : '升级股东会员，享 8 折 + 客户推荐提成'}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/customer/shop/${shop?.id}`)}
                  className="flex-shrink-0 text-xs sm:text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white px-3 sm:px-4 py-2 rounded-lg transition-colors"
                >
                  了解详情
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 我的预约列表 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-sm sm:text-base font-bold text-gray-800 flex items-center gap-2">
              <Calendar size={18} className="sm:hidden text-blue-500" />
              <Calendar size={20} className="hidden sm:inline text-blue-500" />
              我的预约
            </h2>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['current', 'history'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                    activeTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {tab === 'current' ? '当前' : '历史'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : (
            (() => {
              const filteredBookings = bookings.filter((b) =>
                activeTab === 'current'
                  ? b.status === 'pending' || b.status === 'confirmed'
                  : b.status === 'completed' || b.status === 'cancelled'
              );

              if (filteredBookings.length === 0) {
                return (
                  <div className="text-center py-8 sm:py-10">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-2 sm:mb-3 bg-gray-50 rounded-full flex items-center justify-center">
                      <Calendar size={24} className="sm:hidden text-gray-300" />
                      <Calendar size={28} className="hidden sm:inline text-gray-300" />
                    </div>
                    <div className="text-gray-500 mb-3 text-sm">
                      {activeTab === 'current' ? '暂无进行中的预约' : '暂无历史预约'}
                    </div>
                    {activeTab === 'current' && (
                      <button
                        onClick={() => navigate(`/customer/shop/${shop?.id}`)}
                        className="text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white px-4 sm:px-5 py-2.5 rounded-lg transition-colors inline-flex items-center gap-1"
                      >
                        去预约 <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filteredBookings.map((booking) => (
                    <div
                      key={booking.id}
                      onClick={() => setViewingBooking(booking)}
                      className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-800 text-sm sm:text-base truncate">{booking.shopName}</div>
                          <div className="text-xs sm:text-sm text-gray-500">{booking.serviceName}</div>
                        </div>
                        <span
                          className={`flex-shrink-0 px-2 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium ${
                            booking.status === 'completed' ? 'text-green-600 bg-green-50' :
                            booking.status === 'confirmed' ? 'text-blue-600 bg-blue-50' :
                            booking.status === 'pending' ? 'text-yellow-600 bg-yellow-50' :
                            'text-gray-600 bg-gray-100'
                          }`}
                        >
                          {booking.status === 'pending' ? '待店铺确认' :
                           booking.status === 'confirmed' ? '已确认' :
                           booking.status === 'completed' ? '已完成' : '已取消'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="sm:hidden" />
                          <Clock size={14} className="hidden sm:inline" />
                          {new Date(booking.scheduledTime).toLocaleString()}
                        </div>
                        <div className="font-medium text-orange-500">¥{booking.price}</div>
                      </div>
                      {booking.status === 'completed' && activeTab === 'history' && (
                        <div className="mt-3 sm:mt-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/customer/review/${booking.id}`);
                            }}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                          >
                            <Star size={14} />
                            去评价，分享得优惠券
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>

        {/* 快捷功能 —— 手机端保持双列，点击区域足够 */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
          <button
            onClick={() => navigate('/customer/refund')}
            className="bg-white rounded-2xl shadow-sm p-3 sm:p-4 text-left hover:shadow-md transition-shadow border border-gray-100 min-h-[96px]"
          >
            <AlertCircle size={20} className="sm:hidden text-orange-500 mb-1" />
            <AlertCircle size={22} className="hidden sm:inline text-orange-500 mb-2" />
            <div className="font-medium text-gray-800 text-sm">退款管理</div>
            <div className="text-xs text-gray-500 mt-0.5">申请退款查看进度</div>
          </button>
          <button
            onClick={() => navigate('/customer/feedback')}
            className="bg-white rounded-2xl shadow-sm p-3 sm:p-4 text-left hover:shadow-md transition-shadow border border-gray-100 min-h-[96px]"
          >
            <MessageSquare size={20} className="sm:hidden text-blue-500 mb-1" />
            <MessageSquare size={22} className="hidden sm:inline text-blue-500 mb-2" />
            <div className="font-medium text-gray-800 text-sm">意见反馈</div>
            <div className="text-xs text-gray-500 mt-0.5">提交建议和投诉</div>
          </button>
        </div>

        {/* 退出登录 */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 py-3.5 px-6 rounded-xl hover:bg-red-50 transition-colors text-sm font-medium shadow-sm"
        >
          <LogOut size={18} />
          退出登录
        </button>

      </div>

      {/* 预约详情弹窗 */}
      {viewingBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 sm:mb-5">
              <h3 className="text-lg sm:text-xl font-bold text-gray-800">预约详情</h3>
              <button
                onClick={() => setViewingBooking(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {/* 状态 */}
              <div className={`flex items-center gap-3 p-3 sm:p-4 rounded-xl ${
                viewingBooking.status === 'completed' ? 'bg-green-50' :
                viewingBooking.status === 'confirmed' ? 'bg-blue-50' :
                viewingBooking.status === 'pending' ? 'bg-yellow-50' : 'bg-gray-50'
              }`}>
                <span className={`font-medium text-sm ${
                  viewingBooking.status === 'completed' ? 'text-green-700' :
                  viewingBooking.status === 'confirmed' ? 'text-blue-700' :
                  viewingBooking.status === 'pending' ? 'text-yellow-700' : 'text-gray-500'
                }`}>
                  {viewingBooking.status === 'pending' ? '待店铺确认' :
                   viewingBooking.status === 'confirmed' ? '已确认' :
                   viewingBooking.status === 'completed' ? '已完成' : '已取消'}
                </span>
              </div>

              {/* 基本信息 */}
              <div className="space-y-2 sm:space-y-3 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-2">
                    <MapPin size={16} /> 店铺
                  </span>
                  <span className="font-medium text-gray-800">{viewingBooking.shopName}</span>
                </div>
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
                    ¥ 服务价格
                  </span>
                  <span className="font-bold text-orange-500">¥{viewingBooking.price}</span>
                </div>
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
            <div className="flex gap-3 mt-5 sm:mt-6">
              {viewingBooking.status === 'confirmed' && (
                <button
                  onClick={() => {
                    setViewingBooking(null);
                    navigate(`/customer/queue/${viewingBooking.id}`);
                  }}
                  className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
                >
                  查看排队状态
                </button>
              )}
              {viewingBooking.status === 'pending' && (
                <div className="flex-1 py-3 bg-yellow-50 text-yellow-700 rounded-xl font-medium text-center text-sm flex items-center justify-center">
                  店铺确认后生成排队信息
                </div>
              )}
              {(viewingBooking.status === 'pending' || viewingBooking.status === 'confirmed') && (
                <button
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {cancelling ? <Loader2 size={18} className="animate-spin" /> : null}
                  取消预约
                </button>
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
    </div>
  );
};

export default Profile;
