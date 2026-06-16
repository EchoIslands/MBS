import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock as ClockIcon, MapPin, Bell, Music, CheckCircle, User, Calendar,
  Scissors, Star, Sparkles, Award, ChevronRight, Zap, Users,
} from 'lucide-react';
import { Booking, Queue as QueueType, Employee } from '../../../shared/types';
import { mockShops } from '../../../shared/mockData';

// 模拟服务步骤（用于可视化进度）
const serviceSteps = [
  { key: 'checkin', label: '到店确认', icon: CheckCircle, duration: 5 },
  { key: 'wash', label: '洗发', icon: Sparkles, duration: 10 },
  { key: 'haircut', label: '剪发/造型', icon: Scissors, duration: 25 },
  { key: 'finish', label: '吹干整理', icon: Star, duration: 10 },
];

// 烫发服务步骤
const permServiceSteps = [
  { key: 'checkin', label: '到店确认', icon: CheckCircle, duration: 5 },
  { key: 'wash', label: '洗发', icon: Sparkles, duration: 10 },
  { key: 'soften', label: '软化/冷烫', icon: Zap, duration: 30 },
  { key: 'shape', label: '上卷定型', icon: Scissors, duration: 35 },
  { key: 'finish', label: '吹干整理', icon: Star, duration: 15 },
];

const Queue: React.FC = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [queue, setQueue] = useState<QueueType | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [selectedSound] = useState('清脆铃声');
  const [distance] = useState(1.2); // 模拟距离
  const [walkTime] = useState(15);
  const navigate = useNavigate();

  // 判断预约时间是否已到或已过
  const isAppointmentTimeReached = () => {
    if (!booking) return false;
    const now = new Date();
    const scheduled = new Date(booking.scheduledTime);
    return now >= scheduled;
  };

  // 实时模拟服务进度（仅在预约时间到达后开始）
  const [currentStep, setCurrentStep] = useState(1);
  const [stepProgress, setStepProgress] = useState(0); // 初始为0，不是35
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [serviceStarted, setServiceStarted] = useState(false);
  const appointmentReached = isAppointmentTimeReached();

  useEffect(() => {
    if (!appointmentReached || !booking) {
      // 预约时间未到，不启动服务模拟
      setServiceStarted(false);
      return;
    }

    // 预约时间已到，等待队列轮到后开始服务
    setServiceStarted(true);

    // 模拟：逐步推进服务进度
    const timer = setInterval(() => {
      setStepProgress((prev) => {
        const next = prev + 5;
        if (next >= 100) {
          setCurrentStep((c) => Math.min(c + 1, serviceSteps.length - 1));
          return 0;
        }
        return next;
      });
      setElapsedMinutes((prev) => prev + 1);
    }, 3000);

    return () => clearInterval(timer);
  }, [appointmentReached, booking]);

  // 加载预约数据
  useEffect(() => {
    // 模拟：从 mock 数据读取预约信息
    const currentShop = mockShops[0];
    const mockBooking: Booking = {
      id: bookingId || 'queue-demo',
      shopId: currentShop.id,
      customerId: 'cust1',
      serviceId: 's1',
      scheduledTime: new Date(Date.now() + 15 * 60 * 1000), // 默认15分钟后
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
    setLoading(false);
  }, [bookingId]);

  // 当前为您服务的发型师
  const currentShop = mockShops[0];
  const barber: Employee | undefined = currentShop?.employees.find((e) => e.role === 'stylist' || !e.role);
  const stylist: Employee | undefined = barber || currentShop?.employees[0];

  // 当前服务进度
  const totalMinutes = serviceSteps.reduce((sum, s) => sum + s.duration, 0);
  const completedMinutes = serviceSteps.slice(0, currentStep).reduce((sum, s) => sum + s.duration, 0) +
    Math.floor((stepProgress / 100) * serviceSteps[currentStep].duration);
  const overallProgress = Math.min(100, Math.floor((completedMinutes / totalMinutes) * 100));
  const remainingMinutes = Math.max(0, totalMinutes - completedMinutes);

  const position = booking?.queueNumber || 2;
  const waitTime = queue?.estimatedWaitTime || remainingMinutes;
  const shouldLeaveNow = waitTime <= walkTime + 5;

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
            {appointmentReached && serviceStarted ? (
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
        {appointmentReached && serviceStarted && (
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
        {!appointmentReached && booking && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-3xl shadow-lg p-5 mb-4 border border-blue-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <ClockIcon size={24} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">预约尚未开始</h3>
                <p className="text-sm text-gray-500">请在预约时间到达后刷新页面</p>
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
                排队状态
              </h3>
              <p className="text-xs text-gray-500 mt-1">实时更新 · 最后更新于 {new Date().toLocaleTimeString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-blue-50 rounded-2xl p-4 text-center">
              <div className="text-xs text-blue-600 mb-1">您的排队号</div>
              <div className="text-4xl font-bold text-blue-700">#{position}</div>
              <div className="text-xs text-blue-500 mt-1">前面还有 {position - 1} 位</div>
            </div>
            <div className="bg-orange-50 rounded-2xl p-4 text-center">
              <div className="text-xs text-orange-600 mb-1">预计等待</div>
              <div className="text-4xl font-bold text-orange-700">{waitTime}</div>
              <div className="text-xs text-orange-500 mt-1">分钟</div>
            </div>
          </div>

          {/* 该出发了提醒 */}
          {shouldLeaveNow && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-3.5 flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
                <MapPin size={18} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-green-800 text-sm">该出发了！</div>
                <div className="text-xs text-green-600 mt-0.5">步行 {walkTime} 分钟到店，距离 {distance}km · 预计 {new Date(Date.now() + walkTime * 60 * 1000).toLocaleTimeString()} 到店</div>
              </div>
              <ChevronRight size={18} className="text-green-500" />
            </div>
          )}
        </div>

        {/* ===== 位置与提醒设置 ===== */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500">
              <MapPin size={14} className="text-blue-500" /> 到店距离
            </div>
            <div className="text-2xl font-bold text-gray-800 mb-1">{distance.toFixed(1)} <span className="text-sm text-gray-500">km</span></div>
            <div className="text-xs text-gray-500">步行约 {walkTime} 分钟</div>
          </div>
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
