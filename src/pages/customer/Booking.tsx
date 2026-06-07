import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar as CalendarIcon, Clock, User, CheckCircle, Star, Users, Zap } from 'lucide-react';
import { Shop, Employee, Booking as BookingType } from '../../../shared/types';
import { shopApi, bookingApi } from '../../api';
import { useAppStore } from '../../store';
import { mockBookings } from '../../../shared/mockData';

// 定义选择模式
type SelectionMode = 'specific' | 'fastest';

const Booking: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('fastest'); // 默认最快匹配
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const navigate = useNavigate();
  const { currentCustomer } = useAppStore();

  // 生成可用时间
  const timeSlots = [];
  for (let h = 9; h <= 20; h++) {
    timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
    timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
  }

  // 生成未来7天的日期
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    dates.push({
      value: dateStr,
      label: `${date.getMonth() + 1}月${date.getDate()}日`,
      weekDay: weekDays[date.getDay()],
    });
  }

  useEffect(() => {
    if (shopId) {
      loadShop();
    }
    if (dates.length > 0) {
      setSelectedDate(dates[0].value);
    }
  }, [shopId]);

  const loadShop = async () => {
    try {
      const data = await shopApi.getShop(shopId!);
      setShop(data);
      if (data.services.length > 0) {
        setSelectedService(data.services[0].id);
      }
    } catch (error) {
      console.error('Failed to load shop:', error);
    } finally {
      setLoading(false);
    }
  };

  // 检查技师在特定时间段是否已被预约
  const isBarberBusy = (barberId: string, date: string, time: string): boolean => {
    const selectedDateTime = new Date(`${date}T${time}`);
    
    return mockBookings.some(booking => {
      if (booking.barberId !== barberId) return false;
      if (booking.status === 'cancelled') return false;
      
      const bookingDateTime = new Date(booking.scheduledTime);
      const bookingDate = bookingDateTime.toISOString().split('T')[0];
      const bookingTime = bookingDateTime.toTimeString().slice(0, 5);
      
      return bookingDate === date && bookingTime === time;
    });
  };

  // 计算技师在特定时间段的可用性和预计等待时间
  const getBarberAvailability = (barber: Employee, date: string, time: string): { isAvailable: boolean, waitTime: number } => {
    // 检查是否已被预约
    if (isBarberBusy(barber.id, date, time)) {
      return { isAvailable: false, waitTime: -1 };
    }
    
    // 根据技师评分和随机值生成等待时间
    const baseWaitTime = Math.floor(Math.random() * 30); // 0-30分钟基础等待
    const ratingBonus = (barber.rating - 4) * 5; 
    const waitTime = Math.max(0, baseWaitTime - ratingBonus);
    
    return { isAvailable: true, waitTime };
  };

  // 获取最快可用的技师
  const getFastestBarber = (date: string, time: string): Employee | null => {
    if (!shop || shop.employees.length === 0) return null;
    
    const activeEmployees = shop.employees.filter(e => e.isActive);
    if (activeEmployees.length === 0) return null;
    
    let fastestBarber: Employee | null = null;
    let minWaitTime = Infinity;
    
    for (const barber of activeEmployees) {
      const { isAvailable, waitTime } = getBarberAvailability(barber, date, time);
      if (isAvailable && waitTime < minWaitTime) {
        minWaitTime = waitTime;
        fastestBarber = barber;
      }
    }
    
    return fastestBarber;
  };

  const handleBooking = async () => {
    if (!selectedService || !selectedDate || !selectedTime || !currentCustomer) {
      alert('请填写完整信息');
      return;
    }

    let targetBarberId: string | undefined;
    let targetBarberName: string | undefined;
    
    if (selectionMode === 'specific' && selectedBarberId) {
      // 选择了特定技师
      targetBarberId = selectedBarberId;
      targetBarberName = shop?.employees.find(e => e.id === selectedBarberId)?.name;
    } else if (selectionMode === 'fastest' && shop) {
      // 最快匹配
      const fastestBarber = getFastestBarber(selectedDate, selectedTime);
      if (fastestBarber) {
        targetBarberId = fastestBarber.id;
        targetBarberName = fastestBarber.name;
      }
    }
    
    setBooking(true);
    try {
      const scheduledTime = new Date(`${selectedDate}T${selectedTime}`);
      const newBooking = await bookingApi.createBooking({
        shopId: shopId!,
        customerId: currentCustomer.id,
        serviceId: selectedService,
        barberId: targetBarberId,
        barberName: targetBarberName,
        scheduledTime,
        status: 'pending',
        notes: notes || undefined,
      });
      navigate(`/customer/queue/${newBooking.id}`);
    } catch (error) {
      alert('预约失败，请重试');
    } finally {
      setBooking(false);
    }
  };

  const selectedServiceData = shop?.services.find((s) => s.id === selectedService);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-white shadow-sm z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-semibold text-gray-800">预约服务</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-40">
        {/* 店铺信息 */}
        {shop && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mt-4">
            <div className="flex items-center gap-4">
              <img
                src={shop.images[0]}
                alt={shop.name}
                className="w-16 h-16 rounded-xl object-cover"
              />
              <div>
                <h2 className="font-bold text-gray-800">{shop.name}</h2>
                <p className="text-sm text-gray-500">{shop.address}</p>
              </div>
            </div>
          </div>
        )}

        {/* 选择服务 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-4">选择服务</h3>
          <div className="space-y-3">
            {shop?.services.map((service) => (
              <label
                key={service.id}
                className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-all ${
                  selectedService === service.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="service"
                    value={service.id}
                    checked={selectedService === service.id}
                    onChange={(e) => setSelectedService(e.target.value)}
                  />
                  <div>
                    <div className="font-medium text-gray-800">{service.name}</div>
                    <div className="text-sm text-gray-500">{service.duration} 分钟</div>
                  </div>
                </div>
                <div className="text-orange-500 font-bold">¥{service.price}</div>
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
          <div className="flex gap-3 overflow-x-auto pb-2">
            {dates.map((date) => (
              <button
                key={date.value}
                onClick={() => setSelectedDate(date.value)}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-center transition-all ${
                  selectedDate === date.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="text-sm">{date.label}</div>
                <div className="text-xs opacity-75">{date.weekDay}</div>
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
              // 检查该时间是否对所有技师都不可用
              const allBarbersBusy = shop?.employees
                .filter(e => e.isActive)
                .every(e => isBarberBusy(e.id, selectedDate, time)) || false;
              
              return (
                <button
                  key={time}
                  onClick={() => !allBarbersBusy && setSelectedTime(time)}
                  disabled={allBarbersBusy}
                  className={`py-3 rounded-xl text-center transition-all ${
                    selectedTime === time
                      ? 'bg-blue-500 text-white'
                      : allBarbersBusy
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed line-through'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {time}
                  {allBarbersBusy && <span className="text-xs block opacity-75">已满</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 选择发型师 */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mt-4">
          <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Users size={24} />
            选择发型师
          </h3>
          
          {/* 智能匹配选项 */}
          <div className="space-y-4 mb-8">
            {/* 最快匹配 */}
            <label
              className={`flex items-center p-5 border-3 rounded-2xl cursor-pointer transition-all ${
                selectionMode === 'fastest'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <input
                type="radio"
                name="barberSelection"
                value="fastest"
                checked={selectionMode === 'fastest'}
                onChange={() => setSelectionMode('fastest')}
                className="mr-4"
              />
              <div className="flex items-center gap-4 flex-1">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center flex-shrink-0">
                  <Zap size={28} className="text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg text-gray-800">最快匹配</span>
                    <span className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                      推荐
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">系统自动匹配最快可服务的发型师</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-green-600">
                    {getFastestBarber(selectedDate, selectedTime) 
                      ? `等待 ${getBarberAvailability(getFastestBarber(selectedDate, selectedTime)!, selectedDate, selectedTime).waitTime}分钟` 
                      : '计算中...'}
                  </div>
                </div>
              </div>
            </label>
          </div>
          
          {/* 分隔线 */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-6 text-sm font-medium text-gray-600">或选择指定发型师</span>
            </div>
          </div>
          
          {/* 发型师列表 */}
          <div className="space-y-4">
            {shop?.employees
              ?.filter(emp => emp.isActive)
              .map((employee) => {
                const { isAvailable, waitTime } = getBarberAvailability(employee, selectedDate, selectedTime);
                return (
                  <label
                    key={employee.id}
                    className={`flex items-center p-5 border-3 rounded-2xl cursor-pointer transition-all ${
                      selectionMode === 'specific' && selectedBarberId === employee.id
                        ? 'border-blue-500 bg-blue-50'
                        : isAvailable
                          ? 'border-gray-200 hover:border-blue-300'
                          : 'border-gray-100 bg-gray-50 opacity-60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="barberSelection"
                      value={employee.id}
                      checked={selectionMode === 'specific' && selectedBarberId === employee.id}
                      onChange={() => {
                        if (isAvailable) {
                          setSelectionMode('specific');
                          setSelectedBarberId(employee.id);
                        }
                      }}
                      disabled={!isAvailable}
                      className="mr-4"
                    />
                    <div className="flex items-center gap-4 flex-1">
                      <img
                        src={employee.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(employee.name)}`}
                        alt={employee.name}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-gray-800">{employee.name}</span>
                          {employee.title && (
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                              {employee.title}
                            </span>
                          )}
                          {!isAvailable && (
                            <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                              该时段已约
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                          <div className="flex items-center gap-1">
                            <Star size={14} className="text-yellow-500 fill-yellow-500" />
                            <span>{employee.rating}</span>
                          </div>
                          {employee.specialty && (
                            <>
                              <span>·</span>
                              <span>{employee.specialty}</span>
                            </>
                          )}
                          <span className={`ml-auto font-bold text-base ${
                            isAvailable ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {isAvailable ? `等待 ${waitTime} 分钟` : '已约满'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
          </div>
        </div>

        {/* 备注 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-4">备注（可选）</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="请输入您的特殊需求或备注..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            rows={3}
          />
        </div>

        {/* 预约信息摘要 */}
        {selectedServiceData && (
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl p-6 mt-4">
            <h3 className="font-bold text-gray-800 mb-4">预约信息</h3>
            <div className="space-y-2 text-gray-700">
              <div className="flex justify-between">
                <span>服务项目</span>
                <span className="font-medium">{selectedServiceData.name}</span>
              </div>
              <div className="flex justify-between">
                <span>预约时间</span>
                <span className="font-medium">
                  {selectedDate} {selectedTime || '--:--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>发型师</span>
                <span className="font-medium">
                  {selectionMode === 'fastest' 
                    ? (() => {
                        const fastest = getFastestBarber(selectedDate, selectedTime);
                        return fastest ? fastest.name : '计算中...';
                      })()
                    : shop?.employees.find(e => e.id === selectedBarberId)?.name || '待安排'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-200">
                <span className="font-bold">预计费用</span>
                <span className="font-bold text-orange-500 text-xl">
                  ¥{selectedServiceData.price}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBooking}
            disabled={booking}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg transition-all"
          >
            {booking ? '预约中...' : '确认预约'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Booking;
