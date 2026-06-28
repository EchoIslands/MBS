import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock as ClockIcon, MapPin, Bell, Music, CheckCircle, User, Calendar,
  Scissors, Star, Sparkles, Award, ChevronRight, Zap, Users,
} from 'lucide-react';
import { Booking, Queue as QueueType, Employee, Shop } from '../../../shared/types';
import { mockShops } from '../../../shared/mockData';
import { bookingApi, queueApi, shopApi } from '../../../src/api';

// 模拟服务步骤（用于可视化进度）
const serviceSteps = [
  { key: 'checkin', label: '到店确认', icon: CheckCircle, duration: 5 },
  { key: 'wash', label: '洗发', icon: Sparkles, duration: 10 },
  { key: 'haircut', label: '剪发/造型', icon: Scissors, duration: 25 },
  { key: 'finish', label: '吹干整理', icon: Star, duration: 10 },
];

const Queue: React.FC = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [queue, setQueue] = useState<QueueType | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [selectedSound] = useState('清脆铃声');
  const navigate = useNavigate();

  // 服务进度状态
  const [currentStep, setCurrentStep] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [serviceStarted, setServiceStarted] = useState(false);
  // 标记是否从后端获取到了真实数据
  const [isFromApi, setIsFromApi] = useState(false);

  // 响应式计算：判断预约时间是否已到（当booking更新时会重新计算）
  // 只有从后端获取真实数据后才计算，否则显示倒计时
  const isAppointmentTimeReached = useMemo(() => {
    if (!booking) return false;
    // 如果是模拟数据（15分钟后），永远不认为时间到达
    if (!isFromApi) return false;
    return new Date() >= new Date(booking.scheduledTime);
  }, [booking, isFromApi]);

  // 加载预约数据（使用 bookingApi，与创建预约使用同一数据源）
  useEffect(() => {
    async function fetchBooking() {
      try {
        // 优先使用 bookingApi.getBooking（与 createBooking 使用同一数据源）
        const result = await bookingApi.getBooking(bookingId || '');
        if (result && result.id) {
          // bookingApi 返回的 scheduledTime 可能是 Date 对象或 ISOstring
          const scheduledTimeDate = result.scheduledTime instanceof Date
            ? result.scheduledTime
            : new Date(result.scheduledTime);

          // 后端可能返回 stylistId/stylistName，前端使用 barberId/barberName
          const fetchedBooking: Booking = {
            ...result,
            scheduledTime: scheduledTimeDate,
            barberId: (result as any).barberId || (result as any).stylistId,
            barberName: (result as any).barberName || (result as any).stylistName,
          };
          // 标记为真实数据（从 bookingApi 获取，无论是 mock 还是真实 API）
          setIsFromApi(true);
          console.log('从 bookingApi 获取到预约:', fetchedBooking);
          console.log('预约时间:', fetchedBooking.scheduledTime);
          console.log('是否已到达预约时间:', new Date() >= scheduledTimeDate);
          setBooking(fetchedBooking);

          // 同时获取该店铺的排队信息与店铺详情
          try {
            const [queueResult, shopResult] = await Promise.all([
              queueApi.getQueue(fetchedBooking.shopId),
              shopApi.getShop(fetchedBooking.shopId),
            ]);
            if (queueResult) setQueue(queueResult);
            if (shopResult) setShop(shopResult);
          } catch (e) {
            console.log('获取店铺/排队信息失败:', e);
          }

          setLoading(false);
          return;
        }
      } catch (error) {
        console.log('从 bookingApi 获取预约失败，使用模拟数据:', error);
      }

      // 兜底：使用模拟数据（兼容演示模式）
      console.log('使用模拟数据，预约时间将是15分钟后');
      const currentShop = mockShops[0];
      const mockBooking: Booking = {
        id: bookingId || 'queue-demo',
        shopId: currentShop.id,
        customerId: 'cust1',
        serviceId: 's1',
        scheduledTime: new Date(Date.now() + 15 * 60 * 1000),
        status: 'confirmed',
        queueNumber: 2,
        serviceName: '精剪',
        price: 68,
        customerName: '张三',
        shopName: currentShop.name,
        barberId: currentShop.employees[0]?.id,
        barberName: currentShop.employees[0]?.name,
      };
      setBooking(mockBooking);
      setQueue({
        id: 'queue1',
        shopId: currentShop.id,
        currentNumber: 1,
        estimatedWaitTime: 15,
        bookings: [mockBooking],
      });
      setShop(currentShop);
      setLoading(false);
    }

    fetchBooking();
  }, [bookingId]);

  // 启动服务进度模拟
  useEffect(() => {
    if (!booking || !isAppointmentTimeReached) {
      setServiceStarted(false);
      return;
    }

    setServiceStarted(true);
    setCurrentStep(0);
    setStepProgress(0);

    const timer = setInterval(() => {
      setStepProgress((prev) => {
        const next = prev + 5;
        if (next >= 100) {
          setCurrentStep((c) => Math.min(c + 1, serviceSteps.length - 1));
          return 0;
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [isAppointmentTimeReached, booking]);

  // 当前为您服务的发型师
  const currentShop = shop || mockShops.find((s) => s.id === booking?.shopId) || mockShops[0];
  const barber: Employee | undefined = currentShop?.employees.find((e) => e.role === 'stylist' || !e.role);
  const stylist: Employee | undefined = barber || currentShop?.employees[0];

  // 获取预约时间信息
  const getTimeUntilAppointment = () => {
    if (!booking) return { totalMinutes: 0, days: 0, hours: 0, minutes: 0, isToday: true };
    const now = new Date();
    const scheduled = new Date(booking.scheduledTime);
    const diffMs = scheduled.getTime() - now.getTime();
    const totalMinutes = Math.floor(diffMs / 60000);
    const isToday = scheduled.toDateString() === now.toDateString();
    const days = Math.floor(totalMinutes / (24 * 60));
    const remainingAfterDays = totalMinutes % (24 * 60);
    const hours = Math.floor(remainingAfterDays / 60);
    const minutes = remainingAfterDays % 60;
    return { totalMinutes, days, hours, minutes, isToday };
  };
  const appointmentInfo = getTimeUntilAppointment();

  // 当前服务进度
  const totalMinutes = serviceSteps.reduce((sum, s) => sum + s.duration, 0);
  const currentStepDuration = serviceSteps[currentStep]?.duration || 0;
  const completedMinutes = serviceSteps.slice(0, currentStep).reduce((sum, s) => sum + s.duration, 0) +
    Math.floor((stepProgress / 100) * currentStepDuration);
  const overallProgress = totalMinutes > 0 ? Math.min(100, Math.floor((completedMinutes / totalMinutes) * 100)) : 0;
  const remainingMinutes = Math.max(0, totalMinutes - completedMinutes);

  // 排队号与前方等待人数
  const position = Math.max(1, booking?.queueNumber || 1);
  const currentNumber = Math.max(1, queue?.currentNumber || 1);
  const aheadCount = Math.max(0, position - currentNumber);

  // 距离与步行时间：优先使用店铺数据，否则使用默认值
  const distance = currentShop?.distance ?? 1.0;
  // 按 5km/h 估算：1km ≈ 12 分钟，兜底至少 5 分钟
  const walkTime = Math.max(5, Math.ceil(distance / 0.083));

  // 如果服务已开始，显示剩余分钟；否则优先使用排队系统的预计等待时间，
  // 没有则按前方人数 × 30 分钟估算，最后兜底 15 分钟
  const waitTime = serviceStarted
    ? remainingMinutes
    : (queue?.estimatedWaitTime ?? (aheadCount > 0 ? aheadCount * 30 : 15));

  // “该出发了”仅在预约当天、尚未开始服务、且距离预约时间较近时显示
  const shouldLeaveNow =
    !serviceStarted &&
    appointmentInfo.isToday &&
    appointmentInfo.totalMinutes > 0 &&
    appointmentInfo.totalMinutes <= walkTime + 30;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-yellow-50">
      {/* 顶部导航 */}
      <header className="sticky top-0 bg-white/90 backdrop-blur shadow-sm z-50">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <button
            onClick={() => navigate('/customer')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-semibold text-gray-800">排队状态</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-8 pt-5">

        {/* ===== 【核心区域 1】当前发型师卡片 ===== */}
        <div className="bg-white rounded-3xl shadow-lg p-5 mb-4 border border-orange-100">
          <div className="flex items-center gap-2 mb-4 text-sm">
            {isAppointmentTimeReached && serviceStarted ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                正在为您服务
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                <ClockIcon size={14} />
                等待预约时间
              </div>
            )}
          </div>

          <div className="flex items-start gap-4">
            {/* 发型师头像 */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-400 to-yellow-400 flex items-center justify-center shadow-md overflow-hidden">
                {stylist?.avatar ? (
                  <img src={stylist.avatar} alt={stylist.name} className="w-full h-full object-cover" />
                ) : (
                  <User size={36} className="text-white" />
                )}
              </div>
              {/* 手艺值徽章 */}
              <div className="absolute -bottom-2 -right-2 bg-white rounded-full shadow-md border border-orange-100 px-2 py-1">
                <div className="flex items-center gap-0.5 text-xs font-bold text-yellow-600">
                  <Star size={12} className="fill-yellow-500 text-yellow-500" />
                  {stylist?.skillValue || 4.9}
                </div>
              </div>
            </div>

            {/* 发型师信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-gray-800">{stylist?.name || '李明'}</h2>
                {stylist?.title && (
                  <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                    {stylist.title}
                  </span>
                )}
              </div>

              {/* 服务数据行 */}
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <span className="flex items-center gap-1">
                  <Award size={12} className="text-yellow-500" />
                  手艺值 {(stylist?.skillValue || 4.9).toFixed(1)}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  服务 {stylist?.totalServices || 1250}+ 次
                </span>
                <span className="flex items-center gap-1">
                  <Star size={12} className="fill-yellow-300 text-yellow-400" />
                  {stylist?.reviewCount || 328} 评价
                </span>
              </div>

              {/* 擅长标签 */}
              {stylist?.tags && stylist.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {stylist.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 bg-gradient-to-r from-orange-50 to-yellow-50 text-orange-700 rounded-full border border-orange-100"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== 【核心区域 2】服务进度可视化（仅预约时间到达后显示） ===== */}
        {isAppointmentTimeReached && serviceStarted && (
          <div className="bg-white rounded-3xl shadow-lg p-5 mb-4 border border-orange-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base">
                <Scissors size={18} className="text-orange-500" />
                服务进度
              </h3>
              <div className="text-right">
                <div className="text-2xl font-bold text-orange-600">{remainingMinutes}</div>
                <div className="text-xs text-gray-500">预计剩余分钟</div>
              </div>
            </div>

            {/* 总体进度条 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-gray-500">总进度</span>
                <span className="font-bold text-gray-700">{overallProgress}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 via-orange-500 to-yellow-400 rounded-full transition-all duration-1000 shadow-sm"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            {/* 步骤进度 — 横向时间线 */}
            <div className="space-y-2.5">
              {serviceSteps.map((step, idx) => {
                const isDone = idx < currentStep;
                const isActive = idx === currentStep;
                const StepIcon = step.icon;
                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                      isActive ? 'bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 shadow-sm' :
                      isDone ? 'bg-green-50/50' : 'bg-gray-50'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isDone ? 'bg-green-500 text-white' :
                      isActive ? 'bg-orange-500 text-white shadow-md' :
                      'bg-gray-200 text-gray-400'
                    }`}>
                      {isDone ? <CheckCircle size={18} /> : <StepIcon size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${isActive ? 'text-orange-700' : isDone ? 'text-green-700' : 'text-gray-500'}`}>
                        {step.label}
                        <span className="ml-2 text-xs text-gray-400 font-normal">· 约 {step.duration} 分钟</span>
                      </div>
                      {isActive && (
                        <div className="mt-1">
                          <div className="h-1.5 bg-white rounded-full overflow-hidden border border-orange-100">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all duration-1000"
                              style={{ width: `${stepProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {isDone && <span className="text-xs text-green-600 font-medium">✓ 完成</span>}
                      {isActive && <span className="text-xs text-orange-600 font-medium">进行中 {stepProgress}%</span>}
                      {!isDone && !isActive && <span className="text-xs text-gray-400">等待</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== 预约尚未到达提醒 ===== */}
        {!isAppointmentTimeReached && booking && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-3xl shadow-lg p-5 mb-4 border border-blue-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <ClockIcon size={24} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">预约尚未开始</h3>
                <p className="text-sm text-gray-500">当前为预计排队状态，到店后将自动切换为实时排队</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-500 text-sm">预约时间</span>
                <span className="font-bold text-blue-600">
                  {new Date(booking.scheduledTime).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} {new Date(booking.scheduledTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">距离预约</span>
                <span className="font-bold text-gray-800">
                  {appointmentInfo.days > 0 ? `${appointmentInfo.days}天 ` : ''}
                  {appointmentInfo.hours}小时{appointmentInfo.minutes}分钟
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ===== 排队状态卡片 ===== */}
        <div className="bg-white rounded-3xl shadow-lg p-5 mb-4 border border-blue-100">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Calendar size={18} className="text-blue-500" />
                {isAppointmentTimeReached && serviceStarted ? '实时排队状态' : '预计排队状态'}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {isAppointmentTimeReached && serviceStarted
                  ? '服务进行中 · 数据随门店操作实时变化'
                  : '基于当前预约顺序估算 · 到店后将切换为实时状态'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-blue-50 rounded-2xl p-4 text-center">
              <div className="text-xs text-blue-600 mb-1">您的排队号</div>
              <div className="text-4xl font-bold text-blue-700">#{position}</div>
              <div className="text-xs text-blue-500 mt-1">前面还有 {aheadCount} 位</div>
            </div>
            <div className="bg-orange-50 rounded-2xl p-4 text-center">
              <div className="text-xs text-orange-600 mb-1">预计等待</div>
              <div className="text-4xl font-bold text-orange-700">{waitTime}</div>
              <div className="text-xs text-orange-500 mt-1">分钟</div>
            </div>
          </div>

          {/* 该出发了提醒 */}
          {shouldLeaveNow && (
            <a
              href={currentShop?.address
                ? `https://uri.amap.com/search?keyword=${encodeURIComponent(currentShop.address)}`
                : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-3.5 flex items-center gap-3 animate-pulse"
            >
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
                <MapPin size={18} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-green-800 text-sm">该出发了！</div>
                <div className="text-xs text-green-600 mt-0.5">
                  步行 {walkTime} 分钟到店，距离 {distance.toFixed(1)}km · 预计 {new Date(Date.now() + walkTime * 60 * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 到店
                </div>
              </div>
              <ChevronRight size={18} className="text-green-500" />
            </a>
          )}
        </div>

        {/* ===== 位置与提醒设置 ===== */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <a
            href={currentShop?.address
              ? `https://uri.amap.com/search?keyword=${encodeURIComponent(currentShop.address)}`
              : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500">
              <MapPin size={14} className="text-blue-500" /> 到店距离
            </div>
            <div className="text-2xl font-bold text-gray-800 mb-1">{distance.toFixed(1)} <span className="text-sm text-gray-500">km</span></div>
            <div className="text-xs text-gray-500 line-clamp-2">{currentShop?.address || '地址未设置'} · 步行约 {walkTime} 分钟</div>
          </a>
          <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500">
              <Bell size={14} className="text-orange-500" /> 提醒
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${reminderEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                {reminderEnabled ? '已开启' : '已关闭'}
              </span>
              <button
                onClick={() => setReminderEnabled(!reminderEnabled)}
                className={`w-11 h-6 rounded-full transition-all relative ${
                  reminderEnabled ? 'bg-orange-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${
                    reminderEnabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            {reminderEnabled && (
              <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                <Music size={12} />
                {selectedSound}
              </div>
            )}
          </div>
        </div>

        {/* ===== 预约信息 ===== */}
        {booking && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 text-base">预约信息</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Scissors size={14} className="text-orange-500" /> 服务项目
                </span>
                <span className="font-bold text-gray-800">{booking.serviceName} · ¥{booking.price}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Calendar size={14} className="text-blue-500" /> 预约时间
                </span>
                <span className="font-medium text-gray-800 text-right">
                  {new Date(booking.scheduledTime).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
                  <div className="text-blue-600 font-bold text-base">
                    {new Date(booking.scheduledTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 flex items-center gap-2">
                  <User size={14} className="text-purple-500" /> 发型师
                </span>
                <span className="font-medium text-gray-800">{booking.barberName || stylist?.name}</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Queue;
