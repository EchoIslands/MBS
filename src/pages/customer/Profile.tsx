import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Calendar, Star, LogOut, Clock, CheckCircle, AlertCircle, MessageSquare,
  Crown, Gift, Sparkles, Wallet, ChevronRight, Award,
  X, Phone, Scissors, MapPin, Loader2,
} from 'lucide-react';
import { Booking, Review, PurchaseVIPLevel, StoredValueLevel, BenefitType } from '../../../shared/types';
import { mockShops, mockMemberBenefitRecords, purchaseVIPPlans, storedValuePlans } from '../../../shared/mockData';
import { useAppStore } from '../../store';
import { bookingApi, reviewApi } from '../../api';
import {
  getPurchaseVIPLabel,
  getStoredValueLabel,
  getCustomerEffectiveDiscount,
  isVIPExpiringSoon,
  isStoredValueExpiringSoon,
} from '../../lib/membership';

// 旧的会员等级标签与颜色（兼容股东展示）

const purchaseVIPGradient: Record<PurchaseVIPLevel, string> = {
  [PurchaseVIPLevel.REGULAR]: 'from-gray-400 to-gray-500',
  [PurchaseVIPLevel.BRONZE]: 'from-orange-400 to-orange-500',
  [PurchaseVIPLevel.SILVER]: 'from-blue-400 to-blue-600',
  [PurchaseVIPLevel.GOLD]: 'from-yellow-400 to-yellow-600',
  [PurchaseVIPLevel.DIAMOND]: 'from-purple-500 via-pink-500 to-orange-500',
};

// 购买 VIP 权益对比表
const vipBenefits = [
  { feature: '服务折扣', bronze: '8.8折', silver: '7.8折', gold: '6.8折', diamond: '5.8折' },
  { feature: '购买价格', bronze: '¥29/年', silver: '¥59/年', gold: '¥79/年', diamond: '¥99/年' },
  { feature: '满59元赠洗护', bronze: '洗发水', silver: '洗发水+护发素', gold: '洗发水+护发素', diamond: '洗发水+护发素' },
  { feature: '饮品权益', bronze: '每次消费送', silver: '每次消费送', gold: '每次消费送', diamond: '每次消费送' },
  { feature: '不满意重做', bronze: '-', silver: '-', gold: '支持', diamond: '支持' },
  { feature: '免费剪发', bronze: '-', silver: '-', gold: '-', diamond: '1次' },
];

// 储值会员权益对比表
const storedBenefits = [
  { feature: '储值金额', store500: '¥500', store1000: '¥1000', store2000: '¥2000', store5000: '¥5000' },
  { feature: '折上折折扣', store500: '9折', store1000: '8.5折', store2000: '8折', store5000: '7折' },
];

const Profile: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customerReviews, setCustomerReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const navigate = useNavigate();
  const { currentCustomer, logout } = useAppStore();

  const bookingReviewMap = useMemo(() => {
    const map = new Map<string, Review>();
    customerReviews.forEach((r) => map.set(r.bookingId, r));
    return map;
  }, [customerReviews]);

  const loadBookings = React.useCallback(async () => {
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
  }, [currentCustomer]);

  const loadCustomerReviews = React.useCallback(async () => {
    if (!currentCustomer) return;
    try {
      const data = await reviewApi.getCustomerReviews(currentCustomer.id);
      setCustomerReviews(data);
    } catch (error) {
      console.error('加载顾客评价失败:', error);
      setCustomerReviews([]);
    }
  }, [currentCustomer]);

  useEffect(() => {
    if (!currentCustomer) {
      navigate('/customer/login');
      return;
    }

    loadBookings();
    loadCustomerReviews();
  }, [currentCustomer, navigate, loadBookings, loadCustomerReviews]);

  const handleCancelBooking = async () => {
    if (!viewingBooking || !currentCustomer) return;
    if (!window.confirm('确定要取消这次预约吗？')) return;

    setCancelling(true);
    try {
      await bookingApi.updateBookingStatus(viewingBooking.id, 'cancelled', currentCustomer.id);
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
  const purchaseLevel = currentCustomer?.purchaseVIPLevel ?? PurchaseVIPLevel.REGULAR;
  const storedLevel = currentCustomer?.storedValueLevel ?? StoredValueLevel.NONE;
  const purchasePlan = purchaseVIPPlans.find((p) => p.level === purchaseLevel);
  const storedPlan = storedValuePlans.find((p) => p.level === storedLevel);
  const effectiveDiscount = currentCustomer ? getCustomerEffectiveDiscount(currentCustomer) : 1;
  const expiringSoon = currentCustomer ? isVIPExpiringSoon(currentCustomer) : false;
  const storedExpiringSoon = currentCustomer ? isStoredValueExpiringSoon(currentCustomer) : false;
  const balance = currentCustomer?.storedValueBalance ?? 0;
  const withdrawable = currentCustomer?.withdrawableReferralAmount ?? 0;
  const points = currentCustomer?.points ?? 0;
  const totalSpent = currentCustomer?.totalSpent ?? 0;

  // 当前店铺信息（默认取第一个）
  const shop = mockShops[0];

  // 我的可用权益
  const myBenefits = currentCustomer
    ? mockMemberBenefitRecords.filter(
        (b) => b.customerId === currentCustomer.id && b.status === 'available'
      )
    : [];

  if (!currentCustomer) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 顶部会员卡（视觉焦点区域 — 让会员一眼看到自己的权益价值） */}
      <div className={`bg-gradient-to-br ${purchaseVIPGradient[purchaseLevel]} text-white relative overflow-hidden`}>
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
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 px-3 py-1.5 bg-white/20 rounded-full backdrop-blur-sm">
                <Crown size={14} />
                <span className="text-sm font-medium">{getPurchaseVIPLabel(purchaseLevel)}</span>
              </div>
              {storedLevel !== StoredValueLevel.NONE && (
                <div className="flex items-center gap-1 px-3 py-1 bg-white/10 rounded-full backdrop-blur-sm">
                  <Wallet size={12} />
                  <span className="text-xs font-medium">{getStoredValueLabel(storedLevel)}</span>
                </div>
              )}
            </div>
          </div>

          {/* 核心价值数字：当前综合折扣 */}
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 sm:p-5 mb-3 sm:mb-4">
            <div className="text-xs sm:text-sm text-white/80 mb-1 flex items-center gap-1.5">
              <Sparkles size={12} className="sm:hidden" />
              <Sparkles size={14} className="hidden sm:inline" />
              您当前的消费折扣
            </div>
            <div className="text-3xl sm:text-5xl font-bold mb-1">{(effectiveDiscount * 10).toFixed(2)} 折</div>
            <div className="text-xs sm:text-sm text-white/70">
              {purchaseLevel !== PurchaseVIPLevel.REGULAR && storedLevel !== StoredValueLevel.NONE
                ? `${getPurchaseVIPLabel(purchaseLevel)} × ${getStoredValueLabel(storedLevel)} 折上折`
                : purchaseLevel !== PurchaseVIPLevel.REGULAR
                ? `已开通 ${getPurchaseVIPLabel(purchaseLevel)}`
                : storedLevel !== StoredValueLevel.NONE
                ? `已开通 ${getStoredValueLabel(storedLevel)}`
                : '开通会员享受专属折扣'}
            </div>
          </div>

          {/* 数据速览 — 余额/返现/积分/综合折扣 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Wallet size={12} /> 储值余额
              </div>
              <div className="text-lg sm:text-xl font-bold">¥{balance}</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Gift size={12} /> 可提现返现
              </div>
              <div className="text-lg sm:text-xl font-bold">¥{withdrawable}</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Star size={12} /> 积分
              </div>
              <div className="text-lg sm:text-xl font-bold">{points}</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Award size={12} /> 累计消费
              </div>
              <div className="text-sm sm:text-xl font-bold text-white">¥{totalSpent}</div>
            </div>
          </div>

          {/* VIP 到期提醒 */}
          {expiringSoon && currentCustomer.purchaseVIPExpiresAt && (
            <div className="mt-4 bg-yellow-400/20 backdrop-blur-sm rounded-xl p-4 border border-yellow-200/30">
              <div className="flex items-center gap-2 text-sm text-white font-medium">
                <AlertCircle size={16} />
                您的 {getPurchaseVIPLabel(purchaseLevel)} 将于{' '}
                {new Date(currentCustomer.purchaseVIPExpiresAt).toLocaleDateString()} 到期，请及时续费
              </div>
            </div>
          )}

          {/* 储值到期提醒 */}
          {storedExpiringSoon && currentCustomer.storedValueExpiresAt && (
            <div className="mt-4 bg-orange-400/20 backdrop-blur-sm rounded-xl p-4 border border-orange-200/30">
              <div className="flex items-center gap-2 text-sm text-white font-medium">
                <AlertCircle size={16} />
                您的 {getStoredValueLabel(storedLevel)} 将于{' '}
                {new Date(currentCustomer.storedValueExpiresAt).toLocaleDateString()} 到期。到期前充值满额可延续储值福利，到期未充值将不再享受储值折扣
              </div>
            </div>
          )}

          {/* 股东会员专属 — 推荐提成信息 */}
          {currentCustomer.isStockholder && (
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

        {/* 我的可用权益 */}
        {myBenefits.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 border border-gray-100">
            <h2 className="text-sm sm:text-base font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
              <Gift size={18} className="sm:hidden text-pink-500" />
              <Gift size={20} className="hidden sm:inline text-pink-500" />
              我的可用权益
            </h2>
            <div className="space-y-2">
              {myBenefits.map((benefit) => (
                <div
                  key={benefit.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    {benefit.type === BenefitType.SHAMPOO && <Sparkles size={16} className="text-blue-500" />}
                    {benefit.type === BenefitType.CONDITIONER && <Sparkles size={16} className="text-pink-500" />}
                    {benefit.type === BenefitType.FREE_HAIRCUT && <Scissors size={16} className="text-purple-500" />}
                    {benefit.type === BenefitType.DRINK && <Star size={16} className="text-orange-500" />}
                    {benefit.type === BenefitType.REDO && <AlertCircle size={16} className="text-red-500" />}
                    <span className="text-sm font-medium text-gray-800">{benefit.name}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {benefit.expiresAt
                      ? `有效期至 ${new Date(benefit.expiresAt).toLocaleDateString()}`
                      : '无固定期限'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 购买 VIP 权益对比 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 border border-gray-100">
          <h2 className="text-sm sm:text-base font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
            <Crown size={18} className="sm:hidden text-orange-500" />
            <Crown size={20} className="hidden sm:inline text-orange-500" />
            购买 VIP 权益
          </h2>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs sm:text-sm min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 sm:py-3 text-gray-600 font-medium pl-1">权益</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">普卡</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">银卡</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">金卡</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">钻石</th>
                </tr>
              </thead>
              <tbody>
                {vipBenefits.map((b, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 sm:py-3 text-gray-700 font-medium pl-1">{b.feature}</td>
                    <td className={`py-2.5 sm:py-3 text-center ${purchaseLevel === PurchaseVIPLevel.BRONZE ? 'text-orange-600 font-bold bg-orange-50/50' : 'text-gray-500'}`}>{b.bronze}</td>
                    <td className={`py-2.5 sm:py-3 text-center ${purchaseLevel === PurchaseVIPLevel.SILVER ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-gray-500'}`}>{b.silver}</td>
                    <td className={`py-2.5 sm:py-3 text-center ${purchaseLevel === PurchaseVIPLevel.GOLD ? 'text-yellow-600 font-bold bg-yellow-50/50' : 'text-gray-500'}`}>{b.gold}</td>
                    <td className={`py-2.5 sm:py-3 text-center ${purchaseLevel === PurchaseVIPLevel.DIAMOND ? 'text-purple-600 font-bold bg-purple-50/50' : 'text-gray-500'}`}>{b.diamond}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {purchasePlan && (
            <div className="mt-3 sm:mt-4 p-3 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border border-orange-100">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-bold text-orange-700">当前：{purchasePlan.name}</div>
                  <div className="text-[11px] sm:text-xs text-orange-600/80 mt-0.5">
                    {purchasePlan.benefits.join(' · ')}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/customer/shop/${shop?.id}`)}
                  className="flex-shrink-0 text-xs sm:text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white px-3 sm:px-4 py-2 rounded-lg transition-colors"
                >
                  了解更多
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 储值会员权益对比 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 border border-gray-100">
          <h2 className="text-sm sm:text-base font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
            <Wallet size={18} className="sm:hidden text-green-500" />
            <Wallet size={20} className="hidden sm:inline text-green-500" />
            储值会员权益（折上折）
          </h2>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs sm:text-sm min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 sm:py-3 text-gray-600 font-medium pl-1">权益</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">储值卡</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">安心卡</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">顺心卡</th>
                  <th className="text-center py-2.5 sm:py-3 text-gray-500 font-normal">随心卡</th>
                </tr>
              </thead>
              <tbody>
                {storedBenefits.map((b, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 sm:py-3 text-gray-700 font-medium pl-1">{b.feature}</td>
                    <td className={`py-2.5 sm:py-3 text-center ${storedLevel === StoredValueLevel.STORE_500 ? 'text-green-600 font-bold bg-green-50/50' : 'text-gray-500'}`}>{b.store500}</td>
                    <td className={`py-2.5 sm:py-3 text-center ${storedLevel === StoredValueLevel.STORE_1000 ? 'text-cyan-600 font-bold bg-cyan-50/50' : 'text-gray-500'}`}>{b.store1000}</td>
                    <td className={`py-2.5 sm:py-3 text-center ${storedLevel === StoredValueLevel.STORE_2000 ? 'text-indigo-600 font-bold bg-indigo-50/50' : 'text-gray-500'}`}>{b.store2000}</td>
                    <td className={`py-2.5 sm:py-3 text-center ${storedLevel === StoredValueLevel.STORE_5000 ? 'text-red-600 font-bold bg-red-50/50' : 'text-gray-500'}`}>{b.store5000}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {storedPlan && (
            <div className="mt-3 sm:mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-bold text-green-700">当前：{storedPlan.name}</div>
                  <div className="text-[11px] sm:text-xs text-green-600/80 mt-0.5">
                    储值 {storedPlan.amount} 元，折上折再享 {(storedPlan.discount * 10).toFixed(storedPlan.discount === 0.7 ? 1 : 2)} 折
                  </div>
                </div>
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
                          {bookingReviewMap.has(booking.id) ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/customer/shop/${booking.shopId}`);
                              }}
                              className="text-green-600 hover:text-green-700 text-sm font-medium flex items-center gap-1"
                            >
                              <CheckCircle size={14} />
                              已评价，查看评价
                            </button>
                          ) : (
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
                          )}
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
                {(viewingBooking as { customerPhone?: string }).customerPhone && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500 flex items-center gap-2">
                      <Phone size={16} /> 手机号
                    </span>
                    <span className="font-medium text-gray-800">{(viewingBooking as { customerPhone?: string }).customerPhone}</span>
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
