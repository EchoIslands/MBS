import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  MapPin,
  Bell,
  Music,
  CheckCircle,
  User,
} from 'lucide-react';
import { Booking, Queue as QueueType } from '../../../shared/types';
import { bookingApi, queueApi, shopApi } from '../../api';
import { soundOptions } from '../../../shared/mockData';

const Queue: React.FC = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [queue, setQueue] = useState<QueueType | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [selectedSound, setSelectedSound] = useState('chime');
  const [distance, setDistance] = useState(1.2); // 模拟距离，单位公里
  const [walkTime, setWalkTime] = useState(15); // 模拟步行时间，单位分钟
  const navigate = useNavigate();

  useEffect(() => {
    if (bookingId) {
      loadData();
    }
  }, [bookingId]);

  const loadData = async () => {
    try {
      const bookingData = await bookingApi.getBooking(bookingId!);
      setBooking(bookingData);
      // 这里简化处理，实际应该根据shopId获取队列
      const mockQueue: QueueType = {
        id: 'queue1',
        shopId: bookingData.shopId,
        currentNumber: 1,
        estimatedWaitTime: 45,
        bookings: [bookingData],
      };
      setQueue(mockQueue);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const testSound = (sound: string) => {
    // 模拟播放音效
    alert(`播放音效: ${soundOptions.find((s) => s.id === sound)?.name}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">加载中...</div>
      </div>
    );
  }

  const position = booking?.queueNumber || 1;
  const waitTime = queue?.estimatedWaitTime || 0;
  const shouldLeaveNow = waitTime <= walkTime + 5;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      <header className="sticky top-0 bg-white/80 backdrop-blur shadow-sm z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/customer')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-semibold text-gray-800">排队状态</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-8">
        {/* 排队进度 */}
        <div className="bg-white rounded-3xl shadow-lg p-8 mt-6 text-center">
          <div className="mb-6">
            <div className="text-6xl font-bold text-blue-600 mb-2">{position}</div>
            <div className="text-gray-500">当前排队号</div>
          </div>

          <div className="bg-blue-50 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Clock size={24} className="text-blue-600" />
              <div className="text-3xl font-bold text-blue-700">
                约 {waitTime} 分钟
              </div>
            </div>
            <div className="text-gray-600">预计等待时间</div>
          </div>

          {/* 进度条 */}
          <div className="mb-6">
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-1000"
                style={{ width: `${Math.max(0, 100 - (position / 10) * 100)}%` }}
              />
            </div>
          </div>

          {shouldLeaveNow && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6 animate-pulse">
              <div className="flex items-center justify-center gap-2 text-orange-700 font-bold">
                <MapPin size={20} />
                该出发了！步行需要 {walkTime} 分钟
              </div>
            </div>
          )}
        </div>

        {/* 距离和步行时间 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <MapPin size={20} className="text-blue-500" />
            位置信息
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">{distance.toFixed(1)} km</div>
              <div className="text-sm text-gray-500">到店距离</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">{walkTime} 分钟</div>
              <div className="text-sm text-gray-500">步行时间</div>
            </div>
          </div>
        </div>

        {/* 提醒设置 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Bell size={20} className="text-blue-500" />
            提醒设置
          </h3>

          <div className="flex items-center justify-between mb-6">
            <span className="text-gray-700">开启提醒</span>
            <button
              onClick={() => setReminderEnabled(!reminderEnabled)}
              className={`w-14 h-8 rounded-full transition-colors ${
                reminderEnabled ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-6 h-6 bg-white rounded-full shadow transform transition-transform ${
                  reminderEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {reminderEnabled && (
            <>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-700">提前提醒时间</span>
                  <span className="font-bold text-blue-600">{reminderMinutes} 分钟</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Music size={20} className="text-blue-500" />
                  <span className="text-gray-700 font-medium">提醒音效</span>
                </div>
                <div className="space-y-2">
                  {soundOptions.map((sound) => (
                    <label
                      key={sound.id}
                      className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedSound === sound.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="sound"
                          value={sound.id}
                          checked={selectedSound === sound.id}
                          onChange={(e) => setSelectedSound(e.target.value)}
                        />
                        <span className="font-medium text-gray-800">{sound.name}</span>
                      </div>
                      <button
                        onClick={() => testSound(sound.id)}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors"
                      >
                        试听
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 预约信息 */}
        {booking && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
            <h3 className="font-bold text-gray-800 mb-4">预约信息</h3>
            <div className="space-y-3 text-gray-600">
              <div className="flex justify-between">
                <span>服务项目</span>
                <span className="font-medium text-gray-800">{booking.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span>预约时间</span>
                <span className="font-medium text-gray-800">
                  {new Date(booking.scheduledTime).toLocaleString()}
                </span>
              </div>
              {booking.barberName && (
                <div className="flex justify-between">
                  <span>发型师</span>
                  <span className="font-medium text-gray-800">{booking.barberName}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span>状态</span>
                <span className="font-medium text-blue-600">
                  {booking.status === 'pending' ? '等待确认' : '已确认'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Queue;
