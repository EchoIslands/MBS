import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Calendar, Star, LogOut, Clock, CheckCircle, AlertCircle, MessageSquare,
  Crown, Gift, Sparkles, Wallet, ChevronRight, Award,
  X, Phone, Scissors, MapPin, Loader2, Ticket, Share2, Package,
} from 'lucide-react';
import { Booking, Review, PurchaseVIPLevel, StoredValueLevel, BenefitType, Shop, MemberBenefitRecord } from '../../../shared/types';
import { mockShops, mockMemberBenefitRecords } from '../../../shared/mockData';
import {isRealApi} from '../../../shared/api-base';
import { useAppStore } from '../../store';
import { bookingApi, reviewApi, shopApi, memberBenefitApi, customerApi } from '../../api';
import {
  getPurchaseVIPLabel,
  getStoredValueLabel,
  getCustomerEffectiveDiscount,
  getEffectivePurchaseVIPLevel,
  getEffectiveStoredValueLevel,
  isVIPExpiringSoon,
  isStoredValueExpiringSoon,
  getStockholderBenefitSummary,
} from '../../lib/membership';

// 旧的会员等级标签与颜色（兼容股东展示）

const purchaseVIPGradient: Record<PurchaseVIPLevel, string> = {
  [PurchaseVIPLevel.REGULAR]: 'from-gray-400 to-gray-500',
  [PurchaseVIPLevel.BRONZE]: 'from-orange-400 to-orange-500',
  [PurchaseVIPLevel.SILVER]: 'from-blue-400 to-blue-600',
  [PurchaseVIPLevel.GOLD]: 'from-yellow-400 to-yellow-600',
  [PurchaseVIPLevel.DIAMOND]: 'from-purple-500 via-pink-500 to-orange-500',
};

const Profile: React.FC = () => {
  const [shop,setShop]=useState<Shop|null>(null);
  const [myBenefits,setMyBenefits]=useState<MemberBenefitRecord[]>([]);
  const [loadError,setLoadError]=useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customerReviews, setCustomerReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  // 延时改签
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [contactShopId, setContactShopId] = useState<string | null>(null);
  const [editingSelf, setEditingSelf] = useState(false);
  const [selfName, setSelfName] = useState('');
  const [selfAvatar, setSelfAvatar] = useState('');
  const [selfGender, setSelfGender] = useState('');
  const [selfBirthday, setSelfBirthday] = useState('');
  const [selfBusy, setSelfBusy] = useState(false);
  const [selfError, setSelfError] = useState('');
  
  const navigate = useNavigate();
  const { currentCustomer, setCurrentCustomer, logout } = useAppStore();
  const customerId = currentCustomer?.id;
  const customerShopId = currentCustomer?.shopId;
  useEffect(() => {
    if (!isRealApi() || !customerId) return;
    let cancelled = false;
    customerApi.getMyProfile(customerId).then(updated => {
      const latest = useAppStore.getState().currentCustomer;
      if (!cancelled && updated && latest?.id === customerId) setCurrentCustomer({ ...latest, ...updated });
    }).catch(() => { /* 其他信息仍可使用已登录资料。 */ });
    return () => { cancelled = true; };
  }, [customerId, setCurrentCustomer]);
  const openSelfEditor = () => {
    if (!currentCustomer) return;
    setSelfName(currentCustomer.name || '');
    setSelfAvatar(currentCustomer.avatar || '');
    setSelfGender(currentCustomer.gender || '');
    setSelfBirthday(currentCustomer.birthday ? new Date(currentCustomer.birthday).toISOString().slice(0, 10) : '');
    setSelfError('');
    setEditingSelf(true);
  };
  const uploadSelfAvatar = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSelfError('请选择不超过 2MB 的 PNG、JPEG 或 WebP 图片'); return;
    }
    setSelfBusy(true); setSelfError('');
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('头像读取失败'));
        reader.readAsDataURL(file);
      });
      setSelfAvatar(await customerApi.uploadMyAvatar(image));
    } catch (err) { setSelfError(err instanceof Error ? err.message : '头像上传失败'); }
    finally { setSelfBusy(false); }
  };
  const saveSelfProfile = async () => {
    if (!currentCustomer || selfBusy) return;
    const name = selfName.trim();
    if (!name || name.length > 40) { setSelfError('称呼需为 1 至 40 个字符'); return; }
    setSelfBusy(true); setSelfError('');
    try {
      const updated = await customerApi.updateSelf(currentCustomer.id, { name, avatar: selfAvatar || null,
        gender: (selfGender || null) as typeof currentCustomer.gender | null, birthday: selfBirthday || null });
      const latest = useAppStore.getState().currentCustomer;
      if (latest?.id !== currentCustomer.id) return;
      setCurrentCustomer({ ...latest, ...updated });
      setEditingSelf(false);
    } catch (err) { setSelfError(err instanceof Error ? err.message : '资料保存失败'); }
    finally { setSelfBusy(false); }
  };

  useEffect(()=>{
    setShop(null);setMyBenefits([]);setLoadError('');
    if(!customerId || !customerShopId) return;
    if(!isRealApi()) {setShop(mockShops[0]);setMyBenefits(mockMemberBenefitRecords.filter(b=>b.customerId===customerId && b.status==='available'));return;}
    let cancelled=false;
    Promise.all([shopApi.getShop(customerShopId),memberBenefitApi.getOwn(customerId)])
      .then(([store,benefits])=>{if(!cancelled){setShop(store);setMyBenefits(benefits);}})
      .catch(()=>{if(!cancelled)setLoadError('门店或权益信息加载失败，请稍后重试');});
    return()=>{cancelled=true;};
  },[customerId,customerShopId]);
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
      setBookings([]);setLoadError('预约信息加载失败，请稍后刷新');
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

  // 打开改时间弹窗
  const openReschedule = (booking: Booking) => {
    const d = new Date(booking.scheduledTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    setRescheduleTarget(booking);
    setRescheduleTime(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  };

  const submitReschedule = async () => {
    if (!rescheduleTarget || !currentCustomer || !rescheduleTime) return;
    setRescheduling(true);
    try {
      await bookingApi.respondDelay(rescheduleTarget.id, {
        customerId: currentCustomer.id,
        action: 'reschedule',
        scheduledTime: rescheduleTime,
      });
      setRescheduleTarget(null);
      await loadBookings();
    } catch (err) {
      alert(err instanceof Error ? err.message : '改时间失败，该时段可能与其他预约冲突');
    } finally {
      setRescheduling(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  

  // 会员等级
  const purchaseLevel = currentCustomer ? getEffectivePurchaseVIPLevel(currentCustomer) : PurchaseVIPLevel.REGULAR;
  const storedLevel = currentCustomer ? getEffectiveStoredValueLevel(currentCustomer) : StoredValueLevel.NONE;
  const effectiveDiscount = currentCustomer ? getCustomerEffectiveDiscount(currentCustomer) : 1;
  const expiringSoon = currentCustomer ? isVIPExpiringSoon(currentCustomer) : false;
  const storedExpiringSoon = currentCustomer ? isStoredValueExpiringSoon(currentCustomer) : false;
  const balance = currentCustomer?.storedValueBalance ?? 0;
  const withdrawable = currentCustomer?.withdrawableReferralAmount ?? 0;
  const points = currentCustomer?.points ?? 0;
  const totalSpent = currentCustomer?.totalSpent ?? 0;

  // 是否为会员（可生成邀请码）
  const isMember = !!(
    currentCustomer &&
    (currentCustomer.isStockholder ||
      purchaseLevel !== PurchaseVIPLevel.REGULAR ||
      storedLevel !== StoredValueLevel.NONE)
  );

  const stockholderSummary=getStockholderBenefitSummary(shop ? currentCustomer:null,shop);

  if (!currentCustomer) return null;

  return (
    <div className="min-h-screen bg-[#fff9f3] pb-8">
      {loadError && <p role="alert" className="p-4 text-red-600">{loadError}</p>}
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
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm overflow-hidden">
                {currentCustomer.avatar ? <img src={currentCustomer.avatar} alt="我的头像" className="w-full h-full object-cover" /> : <User size={28} />}
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
          <div className="flex gap-2 mb-4">
            <button onClick={openSelfEditor} className="flex-1 rounded-xl border border-white/50 bg-white/15 px-3 py-2 text-sm font-semibold">编辑个人资料</button>
            <button onClick={() => navigate('/customer/membership')} className="flex-1 rounded-xl bg-orange-100 px-3 py-2 text-sm font-bold text-orange-900">办理 / 续费会员</button>
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
            <div className="mt-2 space-y-0.5 text-xs text-white/85">
              {currentCustomer.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR && currentCustomer.purchaseVIPExpiresAt &&
                <p>{purchaseLevel === PurchaseVIPLevel.REGULAR ? 'VIP 已于' : 'VIP 有效期至'} {new Date(currentCustomer.purchaseVIPExpiresAt).toLocaleDateString('zh-CN')}{purchaseLevel === PurchaseVIPLevel.REGULAR ? ' 到期' : ''}</p>}
              {currentCustomer.storedValueLevel !== StoredValueLevel.NONE && currentCustomer.storedValueExpiresAt &&
                <p>{storedLevel === StoredValueLevel.NONE ? '储值权益已于' : '储值权益有效期至'} {new Date(currentCustomer.storedValueExpiresAt).toLocaleDateString('zh-CN')}{storedLevel === StoredValueLevel.NONE ? ' 到期（余额仍保留）' : ''}</p>}
            </div>
          </div>

          {/* 数据速览 — 余额/奖励金/积分/综合折扣 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Wallet size={12} /> 储值余额
              </div>
              <div className="text-lg sm:text-xl font-bold">¥{balance}</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-[11px] sm:text-xs text-white/70 mb-1 flex items-center gap-1">
                <Gift size={12} /> 可消费余额
              </div>
              <div className="text-lg sm:text-xl font-bold">¥{withdrawable}</div>
              <div className="mt-1 text-[10px] sm:text-xs text-white/60">股东基金 · 仅限店内消费</div>
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
                    已推荐客户到店 · 提成比例 {(currentCustomer.referralBonusRate || 0.10) * 100}%
                  </div>
                </div>
                <div className="text-4xl opacity-30">👑</div>
              </div>
            </div>
          )}

          {/* 会员邀请入口 */}
          {isMember && (
            <div className="mt-4">
              <button
                onClick={() => navigate('/customer/invite')}
                className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Share2 size={20} className="text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-white font-medium">邀请好友</div>
                    <div className="text-xs text-white/70">
                      好友消费后获得 {(currentCustomer?.referralBonusRate || 0.10) * 100}% 奖励金
                    </div>
                  </div>
                </div>
                <ChevronRight size={20} className="text-white/70" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 主内容区 —— 手机端减少 padding */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 -mt-2 sm:-mt-3 pb-6">

        {/* 股东会员权益说明 */}
        {stockholderSummary.isStockholder && stockholderSummary.enabled && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 border border-amber-100">
            <h2 className="text-sm sm:text-base font-bold text-amber-800 mb-3 flex items-center gap-2">
              <Award size={18} className="sm:hidden text-amber-600" />
              <Award size={20} className="hidden sm:inline text-amber-600" />
              股东会员专享权益
            </h2>
            <div className="flex flex-wrap gap-2">
              {stockholderSummary.benefits.map((benefit) => (
                <span
                  key={benefit}
                  className="text-xs sm:text-sm px-2.5 py-1 bg-white/70 text-amber-700 rounded-full border border-amber-200"
                >
                  {benefit}
                </span>
              ))}
            </div>
          </div>
        )}

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
                      {booking.status === 'confirmed' && <button onClick={e=>{e.stopPropagation();navigate(`/customer/queue/${booking.id}`);}} className="w-full mt-3 rounded-xl bg-orange-100 text-orange-900 py-3 font-bold">查看排队 / 暂离 / 返回 ›</button>}
                      {booking.delayState === 'needs_action' && (
                        <div className="mt-3 sm:mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                          <div className="flex items-start gap-2 text-sm text-amber-700">
                            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <div className="font-medium">发型师临时延时，请选择处理方式</div>
                              {booking.delayReason && <div className="text-xs mt-0.5 opacity-80">{booking.delayReason}</div>}
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openReschedule(booking); }}
                                  className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium"
                                >
                                  改时间
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setContactShopId(contactShopId === booking.id ? null : booking.id); }}
                                  className="flex-1 py-1.5 bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-medium"
                                >
                                  联系门店
                                </button>
                              </div>
                              {contactShopId === booking.id && (
                                <div className="mt-2 text-xs text-amber-700 flex items-center gap-1">
                                  <Phone size={12} /> 门店电话：{shop?.phone || '暂无'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {booking.delayState === 'no_response' && (
                        <div className="mt-3 sm:mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 flex items-center gap-2">
                          <AlertCircle size={16} className="flex-shrink-0" />
                          该预约延时已超时未处理，请联系门店
                        </div>
                      )}
                      {booking.status === 'completed' && activeTab === 'history' && (
                        <div className="mt-3 sm:mt-4">
                          {bookingReviewMap.has(booking.id) ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/customer/review/${booking.id}`);
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

        <button
          type="button"
          onClick={() => {
            if (!currentCustomer?.shopId) {
              alert('门店信息未加载，请刷新个人中心后重试');
              return;
            }
            navigate(`/customer/product-orders/${encodeURIComponent(currentCustomer.shopId)}`);
          }}
          className="w-full flex items-center gap-3 bg-white rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 border border-gray-100 text-left hover:bg-orange-50 transition-colors"
        >
          <Package size={24} className="text-orange-500 shrink-0" />
          <span className="flex-1">
            <span className="block font-bold text-gray-800">我的商品订单</span>
            <span className="block text-sm text-gray-500 mt-1">查看订单、提货与退款</span>
          </span>
          <ChevronRight size={20} className="text-gray-400 shrink-0" />
        </button>

        {/* 快捷功能 —— 手机端保持四列，点击区域足够 */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
          <button
            onClick={() => navigate('/customer/packages')}
            className="bg-white rounded-2xl shadow-sm p-3 sm:p-4 text-left hover:shadow-md transition-shadow border border-gray-100 min-h-[96px]"
          >
            <Ticket size={20} className="sm:hidden text-orange-500 mb-1" />
            <Ticket size={22} className="hidden sm:inline text-orange-500 mb-2" />
            <div className="font-medium text-gray-800 text-sm">我的次卡</div>
            <div className="text-xs text-gray-500 mt-0.5">查看剩余次数</div>
          </button>
          <button
            onClick={() => navigate('/customer/coupons')}
            className="bg-white rounded-2xl shadow-sm p-3 sm:p-4 text-left hover:shadow-md transition-shadow border border-gray-100 min-h-[96px]"
          >
            <Ticket size={20} className="sm:hidden text-orange-500 mb-1" />
            <Ticket size={22} className="hidden sm:inline text-orange-500 mb-2" />
            <div className="font-medium text-gray-800 text-sm">我的优惠券</div>
            <div className="text-xs text-gray-500 mt-0.5">查看已领券</div>
          </button>
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

            {/* 延时处理 */}
            {viewingBooking.delayState === 'needs_action' && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
                <div className="font-medium">发型师临时延时，请选择处理方式</div>
                {viewingBooking.delayReason && <div className="text-xs mt-0.5 opacity-80">{viewingBooking.delayReason}</div>}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { openReschedule(viewingBooking); setViewingBooking(null); }}
                    className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium"
                  >
                    改时间
                  </button>
                  <button
                    onClick={() => setContactShopId(contactShopId === viewingBooking.id ? null : viewingBooking.id)}
                    className="flex-1 py-2 bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 rounded-lg text-sm font-medium"
                  >
                    联系门店
                  </button>
                </div>
                {contactShopId === viewingBooking.id && (
                  <div className="mt-2 text-xs flex items-center gap-1">
                    <Phone size={12} /> 门店电话：{shop.phone || '暂无'}
                  </div>
                )}
              </div>
            )}
            {viewingBooking.delayState === 'no_response' && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 flex items-center gap-2">
                <AlertCircle size={16} className="flex-shrink-0" />
                该预约延时已超时未处理，请联系门店
              </div>
            )}

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

      {editingSelf && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[#fffaf5] rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-lg">编辑个人资料</h2><button onClick={() => !selfBusy && setEditingSelf(false)} aria-label="关闭"><X size={20} /></button></div>
            <label className="flex flex-col items-center mb-4 cursor-pointer">
              <span className="w-16 h-16 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center">{selfAvatar ? <img src={selfAvatar} alt="当前头像" className="w-full h-full object-cover" /> : <User />}</span>
              <span className="text-xs text-gray-600 mt-2">点击更换头像</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={selfBusy} onChange={e => void uploadSelfAvatar(e.target.files?.[0])} />
            </label>
            <label className="block text-sm font-semibold mb-3">称呼 / 昵称<input value={selfName} maxLength={40} onChange={e => setSelfName(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-orange-100 bg-white" /></label>
            <label className="block text-sm font-semibold mb-3">性别（选填）<select value={selfGender} onChange={e => setSelfGender(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-orange-100 bg-white"><option value="">不展示</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option></select></label>
            <label className="block text-sm font-semibold mb-3">生日（选填）<input type="date" max={new Date().toISOString().slice(0, 10)} value={selfBirthday} onChange={e => setSelfBirthday(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-orange-100 bg-white" /></label>
            <p className="text-xs text-gray-600 mb-3">登录手机号：{currentCustomer.phone}。更换手机号请联系门店核实。</p>
            {selfError && <p role="alert" className="text-red-700 text-sm mb-2">{selfError}</p>}
            <button onClick={() => void saveSelfProfile()} disabled={selfBusy} className="w-full rounded-xl bg-[#efa66e] text-[#2b2018] font-bold py-3 disabled:opacity-50">{selfBusy ? '处理中…' : '保存资料'}</button>
          </div>
        </div>
      )}
      {/* 延时改时间弹窗 */}
      {rescheduleTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-bold text-gray-800">更改预约时间</h3>
              <button onClick={() => setRescheduleTarget(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">请选择新的预约时间（避开发型师已有预约）</p>
            <input
              type="datetime-local"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={submitReschedule}
                disabled={rescheduling || !rescheduleTime}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {rescheduling ? <Loader2 size={18} className="animate-spin" /> : null}
                确认改时间
              </button>
              <button
                onClick={() => setRescheduleTarget(null)}
                className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
