import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar as CalendarIcon, Clock, User, CheckCircle, Star, Users, Zap,
  Scissors, Sparkles, ChevronRight, Award, ThumbsUp
} from 'lucide-react';
import { mockShops, mockBookings } from '../../../shared/mockData';
import { Employee } from '../../../shared/types';

type SelectionMode = 'specific' | 'fastest';

const Booking: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const shop = useMemo(
    () => mockShops.find((s) => s.id === shopId) || mockShops[0],
    [shopId]
  );

  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('fastest');
  const [notes, setNotes] = useState<string>('');
  const [booking, setBooking] = useState(false);
  const navigate = useNavigate();

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
  const timeSlots = useMemo(() => {
    const arr: string[] = [];
    for (let h = 9; h <= 20; h++) {
      arr.push(`${h.toString().padStart(2, '0')}:00`);
      arr.push(`${h.toString().padStart(2, '0')}:30`);
    }
    return arr;
  }, []);

  useEffect(() => {
    if (shop && shop.services.length > 0 && !selectedService) {
      setSelectedService(shop.services[0].id);
    }
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0].value);
    }
  }, [shop, dates]);

  const stylists = useMemo(() =>
    shop?.employees.filter((e) => e.role === 'stylist' || !e.role) || [],
  [shop]);

  // 技师在特定时段是否已被预约
  const isBarberBusy = (barberId: string, date: string, time: string) =>
    mockBookings.some((bk) => {
      if (bk.barberId !== barberId) return false;
      const bkDate = new Date(bk.scheduledTime);
      return bkDate.toISOString().split('T')[0] === date
        && bkDate.toTimeString().slice(0, 5) === time;
    });

  // 计算技师可用性与预计等待时间
  const getBarberAvailability = (barber: Employee, date: string, time: string) => {
    if (isBarberBusy(barber.id, date, time)) return { isAvailable: false, waitTime: -1 };
    const ratingBonus = ((barber.rating || 4.5) - 4) * 5;
    const waitTime = Math.max(0, Math.floor(Math.random() * 20) - ratingBonus);
    return { isAvailable: true, waitTime };
  };

  // 找最快可服务的技师
  const fastest = useMemo(() => {
    if (!stylists || stylists.length === 0) return null;
    let best: Employee | null = null;
    let min = Infinity;
    for (const barber of stylists) {
      const av = getBarberAvailability(barber, selectedDate, selectedTime);
      if (av.isAvailable && av.waitTime < min) {
        min = av.waitTime;
        best = barber;
      }
    }
    return best;
  }, [stylists, selectedDate, selectedTime]);

  const handleBooking = async () => {
    if (!selectedService || !selectedDate || !selectedTime) {
      alert('请填写完整预约信息');
      return;
    }
    let target = selectionMode === 'specific'
      ? stylists.find((e) => e.id === selectedBarberId)
      : fastest;
    if (!target) {
      alert('当前所选时间没有可用发型师，请更换时间');
      return;
    }
    setBooking(true);
    setTimeout(() => {
      const service = shop?.services.find((s) => s.id === selectedService);
      navigate(`/customer/queue/mock_${Date.now()}`);
    }, 600);
  };

  const selectedServiceData = shop?.services.find((s) => s.id === selectedService);

  if (!shop) {
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
        <div className="bg-white rounded-2xl shadow-sm p-4 mt-4">
          <div className="flex items-center gap-4">
            <img
              src={shop.images[0]}
              alt={shop.name}
              className="w-14 h-14 rounded-xl object-cover"
            />
            <div>
              <h2 className="font-bold text-gray-800">{shop.name}</h2>
              <p className="text-sm text-gray-500">{shop.address}</p>
            </div>
          </div>
        </div>

        {/* 选择服务 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-4">选择服务</h3>
          <div className="space-y-3">
            {shop.services.map((service) => (
              <label
                key={service.id}
                className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-all ${
                  selectedService === service.id
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-orange-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="service"
                    checked={selectedService === service.id}
                    onChange={() => setSelectedService(service.id)}
                    className="accent-orange-500"
                  />
                  <div>
                    <div className="font-medium text-gray-800">{service.name}</div>
                    <div className="text-sm text-gray-500">约 {service.duration} 分钟</div>
                  </div>
                </div>
                <div className="text-orange-500 font-bold text-lg">¥{service.price}</div>
              </label>
            ))}
          </div>
        </div>

        {/* 选择日期 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <CalendarIcon size={20} />
            选择日期
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {dates.map((d) => (
              <button
                key={d.value}
                onClick={() => setSelectedDate(d.value)}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-center transition-all min-w-[78px] ${
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
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} />
            选择时间
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {timeSlots.map((time) => {
              const allBusy = stylists.every((e) => isBarberBusy(e.id, selectedDate, time));
              return (
                <button
                  key={time}
                  onClick={() => !allBusy && setSelectedTime(time)}
                  disabled={allBusy}
                  className={`py-2.5 rounded-xl text-center transition-all text-sm ${
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
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Scissors size={22} className="text-orange-500" />
            选择发型师
          </h3>

          {/* 智能匹配卡片 */}
          <div className={`p-4 border-2 rounded-2xl cursor-pointer transition-all mb-4 ${
            selectionMode === 'fastest'
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-green-300'
          }`}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="barberSelection"
                checked={selectionMode === 'fastest'}
                onChange={() => setSelectionMode('fastest')}
                className="mt-2 accent-green-500"
              />
              <div className="flex items-start gap-3 flex-1">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center flex-shrink-0">
                  <Zap size={22} className="text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-800">智能匹配 · 最快服务</span>
                    <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded-full">推荐</span>
                  </div>
                  <div className="text-sm text-gray-500 mb-2">
                    系统为您匹配当前最空闲的发型师，节省等待时间
                  </div>
                  <div className="flex items-center gap-2 text-sm">
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

          {/* 分隔线 */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-xs text-gray-500">或选择指定发型师</span>
            </div>
          </div>

          {/* 发型师列表 —— 每个卡片展示手艺值、擅长标签、服务数 */}
          <div className="space-y-3">
            {stylists.map((stylist) => {
              const av = getBarberAvailability(stylist, selectedDate, selectedTime);
              const isSelected = selectionMode === 'specific' && selectedBarberId === stylist.id;
              return (
                <label
                  key={stylist.id}
                  className={`flex items-start p-4 border-2 rounded-2xl cursor-pointer transition-all ${
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
                    className="mt-4 accent-orange-500 mr-3"
                  />

                  {/* 头像 */}
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center overflow-hidden flex-shrink-0 mr-3">
                    {stylist.avatar ? (
                      <img src={stylist.avatar} alt={stylist.name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={26} className="text-orange-600" />
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-bold text-gray-800">{stylist.name}</span>
                      {stylist.title && (
                        <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                          {stylist.title}
                        </span>
                      )}
                      {!av.isAvailable && (
                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                          该时段已约
                        </span>
                      )}
                    </div>

                    {/* 手艺值行 */}
                    <div className="flex items-center gap-3 text-sm text-gray-600 mb-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Award size={14} className="text-yellow-500" />
                        <span className="text-xs">手艺值</span>
                        <span className="font-bold text-sm text-gray-800">{(stylist.skillValue || stylist.rating || 4.5).toFixed(1)}</span>
                        {renderSkillStars(stylist.skillValue || stylist.rating)}
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 text-xs">
                        <ThumbsUp size={12} />
                        <span>{stylist.reviewCount || 100}+ 评价</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 text-xs">
                        <Users size={12} />
                        <span>服务 {stylist.totalServices || 200}+ 次</span>
                      </div>
                    </div>

                    {/* 擅长标签 */}
                    {stylist.tags && stylist.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {stylist.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 等待时间 */}
                    <div className={`text-sm font-semibold ${
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
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Sparkles size={20} /> 备注（可选）
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="您的发型偏好、特殊需求等..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
            rows={3}
          />
        </div>

        {/* 预约信息摘要 */}
        {selectedServiceData && (
          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-2xl p-6 mt-4 border border-orange-100">
            <h3 className="font-bold text-gray-800 mb-3">预约信息</h3>
            <div className="space-y-2 text-gray-700 text-sm">
              <div className="flex justify-between">
                <span>服务项目</span>
                <span className="font-medium">{selectedServiceData.name}</span>
              </div>
              <div className="flex justify-between">
                <span>预约时间</span>
                <span className="font-medium">{selectedDate} {selectedTime || '--:--'}</span>
              </div>
              <div className="flex justify-between">
                <span>发型师</span>
                <span className="font-medium">
                  {selectionMode === 'fastest'
                    ? (fastest ? fastest.name : '待安排')
                    : stylists.find((e) => e.id === selectedBarberId)?.name || '待安排'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-orange-200 text-base">
                <span className="font-bold">预计费用</span>
                <span className="font-bold text-orange-600 text-lg">¥{selectedServiceData.price}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-30">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBooking}
            disabled={booking}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle size={20} />
            {booking ? '预约中...' : '确认预约'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Booking;
