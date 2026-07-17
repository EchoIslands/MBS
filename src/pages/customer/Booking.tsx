import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar as CalendarIcon, Clock, User, CheckCircle, Star, Users,
  Scissors, Sparkles, Award, Zap
} from 'lucide-react';
import { mockShops, mockBookings } from '../../../shared/mockData';
import { Employee, Shop, UserRole, Booking } from '../../../shared/types';
import { bookingApi, shopApi } from '../../../src/api';
import { useAppStore } from '../../store';
import { calcDiscountedItemPrice } from '../../lib/membership';
import { VerticalScrollSlider } from '../../components/VerticalScrollSlider';

type SelectionMode = 'specific' | 'fastest';

const BookingPage: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const { currentCustomer } = useAppStore();

  const [shop, setShop] = useState<Shop | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [existingBookings, setExistingBookings] = useState<Booking[]>(mockBookings);

  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('fastest');
  const [notes, setNotes] = useState<string>('');
  const [booking, setBooking] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadShop = async () => {
      if (!shopId) {
        setShop(mockShops[0]);
        setLoadingShop(false);
        return;
      }
      try {
        const shopData = await shopApi.getShop(shopId);
        setShop(shopData);
      } catch (error) {
        console.error('加载店铺信息失败:', error);
        setShop(mockShops.find((s) => s.id === shopId) || mockShops[0]);
      } finally {
        setLoadingShop(false);
      }
    };
    loadShop();
  }, [shopId]);

  // 加载店铺已有预约，用于自动匹配发型师时判断档期
  useEffect(() => {
    async function loadBookings() {
      if (!shop?.id || !selectedDate) return;
      try {
        const data = await bookingApi.getBookingsByShop(shop.id, selectedDate);
        setExistingBookings(data && data.length > 0 ? data : mockBookings);
      } catch (error) {
        console.error('加载店铺预约失败:', error);
        setExistingBookings(mockBookings);
      }
    }
    loadBookings();
  }, [shop?.id, selectedDate]);

  // 生成未来7天日期
  const dates = useMemo(() => {
    const arr: { value: string; label: string; weekDay: string }[] = [];
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      arr.push({
        value: dateStr,
        label: `${d.getMonth() + 1}月${d.getDate()}日`,
        weekDay: weekDays[d.getDay()],
      });
    }
    return arr;
  }, []);

  // 生成时段（每30分钟）
  // 如果是今天，只显示当前时间之后的时段；如果是未来日期，显示所有时段
  const availableTimeSlots = useMemo(() => {
    const arr: string[] = [];
    for (let h = 9; h <= 20; h++) {
      arr.push(`${h.toString().padStart(2, '0')}:00`);
      arr.push(`${h.toString().padStart(2, '0')}:30`);
    }
    // 判断是否是今天
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (selectedDate === todayStr) {
      // 今天，只显示当前时间之后的时段
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();
      return arr.filter((time) => {
        const [h, m] = time.split(':').map(Number);
        if (h > currentHour) return true;
        if (h === currentHour && m > currentMinute) return true;
        return false;
      });
    }
    return arr;
  }, [selectedDate]);

  // 默认选择第一个可用的时段
  useEffect(() => {
    if (availableTimeSlots.length > 0 && !availableTimeSlots.includes(selectedTime)) {
      setSelectedTime(availableTimeSlots[0]);
    }
  }, [availableTimeSlots, selectedTime]);

  useEffect(() => {
    if (shop && shop.services.length > 0 && !selectedService) {
      setSelectedService(shop.services[0].id);
    }
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0].value);
    }
  }, [shop, dates, selectedService, selectedDate]);

  const isStylist = (e: Employee) => {
    if (e.role) return e.role === UserRole.STYLIST;
    const title = e.title || '';
    return /发型师|造型师|总监|设计师|老师|剪发|烫染|护理/.test(title);
  };

  const stylists = useMemo(() =>
    shop?.employees.filter((e) => isStylist(e) && e.isActive !== false) || [],
  [shop]);

  // 技师在特定时段是否已被预约
  const isBarberBusy = (barberId: string, date: string, time: string) =>
    existingBookings.some((bk) => {
      if (bk.status === 'cancelled') return false;
      if (bk.barberId !== barberId && bk.stylistId !== barberId) return false;
      const bkDate = new Date(bk.scheduledTime);
      return bkDate.toISOString().split('T')[0] === date
        && bkDate.toTimeString().slice(0, 5) === time;
    });

  // 计算技师可用性与预计等待时间
  // 等待时间基于该技师在当天的已有预约数稳定计算，不再使用 Math.random()，
  // 避免用户在备注栏输入时组件重渲染导致数字乱跳。
  const getBarberAvailability = (barber: Employee, date: string, time: string) => {
    if (isBarberBusy(barber.id, date, time)) return { isAvailable: false, waitTime: -1 };

    const sameDayBookings = existingBookings.filter((bk) => {
      if (bk.barberId !== barber.id && bk.stylistId !== barber.id) return false;
      if (bk.status === 'cancelled') return false;
      const bkDate = new Date(bk.scheduledTime);
      return bkDate.toISOString().split('T')[0] === date;
    });

    // 每位预约大致占用 30 分钟，评分高的技师效率略高，最多扣减 10 分钟
    const ratingBonus = Math.min(10, ((barber.rating || 4.5) - 4) * 10);
    const waitTime = Math.max(0, sameDayBookings.length * 30 - Math.floor(ratingBonus));
    return { isAvailable: true, waitTime };
  };

  // 找最快可服务的技师（基于真实预约数据）
  const fastest = useMemo(() => {
    if (!stylists || stylists.length === 0 || !selectedDate || !selectedTime) return null;
    let best: Employee | null = null;
    let min = Infinity;
    for (const barber of stylists) {
      if (isBarberBusy(barber.id, selectedDate, selectedTime)) continue;

      const sameDayBookings = existingBookings.filter((bk) => {
        if (bk.barberId !== barber.id && bk.stylistId !== barber.id) return false;
        if (bk.status === 'cancelled') return false;
        const bkDate = new Date(bk.scheduledTime);
        return bkDate.toISOString().split('T')[0] === selectedDate;
      });

      const ratingBonus = Math.min(10, ((barber.rating || 4.5) - 4) * 10);
      const waitTime = Math.max(0, sameDayBookings.length * 30 - Math.floor(ratingBonus));

      if (waitTime < min) {
        min = waitTime;
        best = barber;
      }
    }
    return best;
  }, [stylists, selectedDate, selectedTime, existingBookings]);

  const handleBooking = async () => {
    if (!selectedService || !selectedDate || !selectedTime) {
      alert('请填写完整预约信息');
      return;
    }
    if (!currentCustomer) {
      alert('请先登录顾客账号');
      navigate('/customer/login');
      return;
    }
    const target = selectionMode === 'specific'
      ? stylists.find((e) => e.id === selectedBarberId)
      : fastest;
    if (!target) {
      alert('当前所选时间没有可用发型师，请更换时间');
      return;
    }
    setBooking(true);

    // 构建预约时间
    const scheduledTime = new Date(`${selectedDate}T${selectedTime}:00`);
    console.log('🔍 传给后端的 scheduledTime:', {
      selectedDate,
      selectedTime,
      scheduledTime,
      scheduledTimeISO: scheduledTime.toISOString(),
      isValid: !isNaN(scheduledTime.getTime())
    });

    try {
      // 调用后端API创建预约
      const newBooking = await bookingApi.createBooking({
        shopId: shop?.id || 'shop1',
        customerId: currentCustomer.id,
        serviceId: selectedService,
        scheduledTime: scheduledTime.toISOString(), // 明确转换为 ISO 字符串
        barberId: target.id,
        barberName: target.name,
        stylistId: target.id,
        stylistName: target.name,
        notes,
      });
      
      // 使用真实的预约ID跳转
      navigate(`/customer/queue/${newBooking.id}`);
    } catch (error) {
      console.error('预约失败:', error);
      alert('预约失败，请检查网络连接');
      setBooking(false);
    }
  };

  const selectedServiceData = shop?.services.find((s) => s.id === selectedService);

  if (loadingShop || !shop) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">店铺加载中...</div>;
  }

  // ============= 渲染函数 =============
  const renderSkillStars = (skillValue = 4.5) => {
    // 手艺值：小数 0-5，我们渲染成 5 颗星
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={13}
            className={i <= Math.round(skillValue) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-200'}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      {/* 顶部导航 */}
      <header className="sticky top-0 bg-white shadow-sm z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-semibold text-gray-800">预约服务</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4">
        {/* 店铺信息 */}
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-4 mt-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <img
              src={shop.images[0]}
              alt={shop.name}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover flex-shrink-0"
            />
            <div className="min-w-0">
              <h2 className="font-bold text-gray-800 truncate">{shop.name}</h2>
              <p className="text-xs sm:text-sm text-gray-500 truncate">{shop.address}</p>
            </div>
          </div>
        </div>

        {/* 选择服务 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-3 sm:mb-4">选择服务</h3>
          <VerticalScrollSlider maxHeight={320} containerClassName="space-y-2 sm:space-y-3 pr-1">
            {shop.services.map((service) => {
              const memberPrice = calcDiscountedItemPrice(
                service.price,
                currentCustomer?.purchaseVIPLevel,
                currentCustomer?.storedValueLevel,
                'service'
              );
              const hasDiscount = memberPrice < service.price;
              return (
                <label
                  key={service.id}
                  className={`flex items-center justify-between p-3 sm:p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    selectedService === service.id
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-orange-200'
                  }`}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <input
                      type="radio"
                      name="service"
                      checked={selectedService === service.id}
                      onChange={() => setSelectedService(service.id)}
                      className="accent-orange-500 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800 text-sm sm:text-base">{service.name}</div>
                      <div className="text-xs sm:text-sm text-gray-500">约 {service.duration} 分钟</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    {hasDiscount && (
                      <div className="text-xs text-gray-400 line-through">¥{service.price}</div>
                    )}
                    <div className="flex items-center gap-1.5 justify-end">
                      {hasDiscount && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-medium">
                          会员价
                        </span>
                      )}
                      <span className="text-orange-500 font-bold text-base sm:text-lg">
                        ¥{memberPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </VerticalScrollSlider>
          {shop.services.length === 0 && (
            <div className="text-center text-gray-500 py-6 text-sm">暂无可用服务</div>
          )}
        </div>

        {/* 选择日期 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
            <CalendarIcon size={18} className="sm:hidden" />
            <CalendarIcon size={20} className="hidden sm:inline" />
            选择日期
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {dates.map((d) => (
              <button
                key={d.value}
                onClick={() => setSelectedDate(d.value)}
                className={`flex-shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-center transition-all min-w-[72px] sm:min-w-[78px] ${
                  selectedDate === d.value
                    ? 'bg-orange-500 text-white shadow'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="text-sm font-medium">{d.label}</div>
                <div className="text-xs opacity-80 mt-0.5">{d.weekDay}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 选择时间 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
            <Clock size={18} className="sm:hidden" />
            <Clock size={20} className="hidden sm:inline" />
            选择时间
          </h3>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {availableTimeSlots.map((time) => {
              const allBusy = stylists.every((e) => isBarberBusy(e.id, selectedDate, time));
              return (
                <button
                  key={time}
                  onClick={() => !allBusy && setSelectedTime(time)}
                  disabled={allBusy}
                  className={`py-2.5 sm:py-3 rounded-xl text-center transition-all text-sm ${
                    selectedTime === time
                      ? 'bg-orange-500 text-white shadow'
                      : allBusy
                        ? 'bg-gray-200 text-gray-400 line-through cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {time}
                  {allBusy && <span className="text-[10px] block opacity-75">已满</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 选择发型师 —— 核心改造 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 mt-4">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
            <Scissors size={20} className="text-orange-500" />
            选择发型师
          </h3>

          {/* 智能匹配卡片 */}
          <div className={`p-3 sm:p-4 border-2 rounded-2xl cursor-pointer transition-all mb-3 sm:mb-4 ${
            selectionMode === 'fastest'
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-green-300'
          }`}
          >
            <label className="flex items-start gap-2 sm:gap-3 cursor-pointer">
              <input
                type="radio"
                name="barberSelection"
                checked={selectionMode === 'fastest'}
                onChange={() => setSelectionMode('fastest')}
                className="mt-2 sm:mt-3 accent-green-500 flex-shrink-0"
              />
              <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center flex-shrink-0">
                  <Zap size={18} className="sm:hidden text-green-600" />
                  <Zap size={22} className="hidden sm:inline text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-gray-800 text-sm sm:text-base">智能匹配 · 最快服务</span>
                    <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-600 text-white rounded-full">推荐</span>
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 mb-2 line-clamp-2">
                    系统为您匹配当前最空闲的发型师，节省等待时间
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm flex-wrap">
                    {fastest ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded border border-gray-200 text-gray-700">
                          <User size={12} /> {fastest.name}
                        </span>
                        <span className="text-green-600 font-medium">
                          等待 {getBarberAvailability(fastest, selectedDate, selectedTime).waitTime} 分钟
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-400">正在计算...</span>
                    )}
                  </div>
                </div>
              </div>
            </label>
          </div>

          {/* 分隔线 —— 手机端简化，只保留一行 */}
          <div className="relative my-3 sm:my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 sm:px-4 text-xs text-gray-500">或选择指定发型师</span>
            </div>
          </div>

          {/* 发型师列表 —— 手机端卡片压缩信息密度，桌面端完整展示 */}
          <div className="space-y-2 sm:space-y-3">
            {stylists.map((stylist) => {
              const av = getBarberAvailability(stylist, selectedDate, selectedTime);
              const isSelected = selectionMode === 'specific' && selectedBarberId === stylist.id;
              return (
                <label
                  key={stylist.id}
                  className={`flex items-start p-3 sm:p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50'
                      : av.isAvailable
                        ? 'border-gray-200 hover:border-orange-200'
                        : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="radio"
                    name="barberSelection"
                    checked={isSelected}
                    disabled={!av.isAvailable}
                    onChange={() => {
                      if (av.isAvailable) {
                        setSelectionMode('specific');
                        setSelectedBarberId(stylist.id);
                      }
                    }}
                    className="mt-3 sm:mt-4 accent-orange-500 mr-2 sm:mr-3 flex-shrink-0"
                  />

                  {/* 头像 —— 手机端小一点 */}
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center overflow-hidden flex-shrink-0 mr-2 sm:mr-3">
                    {stylist.avatar ? (
                      <img src={stylist.avatar} alt={stylist.name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={22} className="sm:hidden text-orange-600" />
                      )}
                    {stylist.avatar ? null : (
                      <User size={26} className="hidden sm:inline text-orange-600" />
                    )}
                  </div>

                  {/* 信息 —— 手机端更紧凑 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-gray-800 text-sm sm:text-base">{stylist.name}</span>
                      {stylist.title && (
                        <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                          {stylist.title}
                        </span>
                      )}
                      {!av.isAvailable && (
                        <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                          已约
                        </span>
                      )}
                    </div>

                    {/* 手艺值行 —— 手机端只展示关键数据，桌面端完整显示 */}
                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600 mb-1.5 sm:mb-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Award size={12} className="sm:hidden text-yellow-500" />
                        <Award size={14} className="hidden sm:inline text-yellow-500" />
                        <span className="font-bold text-gray-800 text-xs sm:text-sm">
                          {(stylist.skillValue || stylist.rating || 4.5).toFixed(1)}
                        </span>
                        {/* 只在桌面端显示 5 颗星 —— 手机端省略以省空间 */}
                        <div className="hidden sm:flex items-center gap-0.5">
                          {renderSkillStars(stylist.skillValue || stylist.rating)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 text-[11px] sm:text-xs">
                        <Users size={12} className="sm:hidden" />
                        <Users size={12} className="hidden sm:inline" />
                        <span>{stylist.totalServices || 200}+次</span>
                      </div>
                    </div>

                    {/* 擅长标签 —— 手机端只显示前 2 个 */}
                    {stylist.tags && stylist.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5 sm:mb-2">
                        {stylist.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] sm:text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
                          >
                            #{tag}
                          </span>
                        ))}
                        {stylist.tags.length > 2 && (
                          <span className="text-[10px] sm:text-xs text-gray-400">
                            +{stylist.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 等待时间 */}
                    <div className={`text-xs sm:text-sm font-semibold ${
                      av.isAvailable ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {av.isAvailable ? `预计等待 ${av.waitTime} 分钟` : '当前时段已满'}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* 备注 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
            <Sparkles size={18} className="sm:hidden" />
            <Sparkles size={20} className="hidden sm:inline" />
            备注（可选）
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="您的发型偏好、特殊需求等..."
            className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none text-sm sm:text-base"
            rows={3}
          />
        </div>

        {/* 预约信息摘要 */}
        {selectedServiceData && (
          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-2xl p-4 sm:p-6 mt-4 border border-orange-100">
            <h3 className="font-bold text-gray-800 mb-2 sm:mb-3 text-sm sm:text-base">预约信息</h3>
            <div className="space-y-1.5 sm:space-y-2 text-gray-700 text-xs sm:text-sm">
              <div className="flex justify-between gap-4">
                <span className="flex-shrink-0">服务项目</span>
                <span className="font-medium text-right">{selectedServiceData.name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="flex-shrink-0">预约时间</span>
                <span className="font-medium text-right">{selectedDate} {selectedTime || '--:--'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="flex-shrink-0">发型师</span>
                <span className="font-medium text-right">
                  {selectionMode === 'fastest'
                    ? (fastest ? fastest.name : '待安排')
                    : stylists.find((e) => e.id === selectedBarberId)?.name || '待安排'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-orange-200 text-sm sm:text-base gap-4">
                <span className="font-bold flex-shrink-0">预计费用</span>
                <div className="text-right">
                  {(() => {
                    const memberPrice = calcDiscountedItemPrice(
                      selectedServiceData.price,
                      currentCustomer?.purchaseVIPLevel,
                      currentCustomer?.storedValueLevel,
                      'service'
                    );
                    const hasDiscount = memberPrice < selectedServiceData.price;
                    return (
                      <>
                        {hasDiscount && (
                          <span className="block text-xs text-gray-400 line-through">¥{selectedServiceData.price}</span>
                        )}
                        <span className={`font-bold ${hasDiscount ? 'text-orange-600' : 'text-gray-800'}`}>
                          ¥{memberPrice.toFixed(2)}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 底部按钮占位 —— 防止底部固定按钮遮挡内容 */}
        <div className="h-24" />
      </div>

      {/* 底部固定按钮 —— 手机端保持较大的点击区域 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-3 sm:p-4 z-30">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBooking}
            disabled={booking}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-3.5 sm:py-4 px-4 sm:px-6 rounded-xl font-bold text-base sm:text-lg shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle size={18} className="sm:hidden" />
            <CheckCircle size={20} className="hidden sm:inline" />
            {booking ? '预约中...' : '确认预约'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;
