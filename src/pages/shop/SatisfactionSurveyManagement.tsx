import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Star,
  ThumbsUp,
  Search,
  Filter,
  ChevronDown,
  Send,
  Eye,
  Calendar,
  User,
  Loader2,
} from 'lucide-react';
import { SatisfactionSurvey, Customer, Booking } from '../../../shared/types';
import { useAppStore } from '../../store';
import { surveyApi, customerApi, bookingApi } from '../../api';
import ShopLayout from './ShopLayout';

const SatisfactionSurveyManagement: React.FC = () => {
  const { currentShop } = useAppStore();
  const [surveys, setSurveys] = useState<SatisfactionSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRating, setSelectedRating] = useState<number | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [viewingSurvey, setViewingSurvey] = useState<SatisfactionSurvey | null>(null);

  // 发起回访
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [newRating, setNewRating] = useState(5);
  const [newRecommended, setNewRecommended] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 加载回访记录
  const fetchSurveys = async () => {
    if (!currentShop?.id) return;
    setLoading(true);
    try {
      const data = await surveyApi.getByShop(currentShop.id);
      if (Array.isArray(data)) {
        setSurveys(data.map((s: unknown) => {
          const item = s as Partial<SatisfactionSurvey>;
          return {
            ...item,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          } as SatisfactionSurvey;
        }));
      }
    } catch (err: unknown) {
      console.error('[SatisfactionSurveyManagement] 获取回访记录失败:', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurveys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShop?.id]);

  // 加载客户列表
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const data = await customerApi.getAll();
        if (Array.isArray(data)) {
          setCustomers(data);
        }
      } catch (err: unknown) {
        console.error('[SatisfactionSurveyManagement] 获取客户列表失败:', (err as Error).message);
      }
    };
    fetchCustomers();
  }, []);

  // 选择客户后加载预约列表
  useEffect(() => {
    const fetchBookings = async () => {
      if (!selectedCustomerId) {
        setBookings([]);
        return;
      }
      try {
        const data = await bookingApi.getCustomerBookings(selectedCustomerId);
        if (Array.isArray(data)) {
          setBookings(data.map((b: unknown) => {
            const item = b as Partial<Booking>;
            return {
              ...item,
              scheduledTime: item.scheduledTime ? new Date(item.scheduledTime) : new Date(),
              createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            } as Booking;
          }));
        }
      } catch (err: unknown) {
        console.error('[SatisfactionSurveyManagement] 获取客户预约失败:', (err as Error).message);
      }
    };
    fetchBookings();
  }, [selectedCustomerId]);

  const filteredSurveys = surveys.filter((survey) => {
    const matchesSearch =
      survey.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      survey.bookingId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRating = selectedRating === 'all' || survey.rating === selectedRating;

    return matchesSearch && matchesRating;
  });

  const totalSurveys = surveys.length;
  const avgRating = totalSurveys > 0
    ? (surveys.reduce((sum, s) => sum + s.rating, 0) / totalSurveys).toFixed(1)
    : '0.0';
  const recommendRate = totalSurveys > 0
    ? `${Math.round((surveys.filter((s) => s.recommended).length / totalSurveys) * 100)}%`
    : '0%';
  const thisWeekSurveys = surveys.filter(
    (s) => new Date(s.createdAt) > new Date(Date.now() - 7 * 86400000)
  ).length;

  const stats = [
    { label: '总回访数', value: totalSurveys, icon: MessageSquare, color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { label: '平均评分', value: avgRating, icon: Star, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
    { label: '推荐率', value: recommendRate, icon: ThumbsUp, color: 'text-green-600', bgColor: 'bg-green-100' },
    { label: '本周回访', value: thisWeekSurveys, icon: Calendar, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  ];

  const getRatingStars = (rating: number) => {
    return Array(5).fill(0).map((_, i) => (
      <Star
        key={i}
        size={16}
        className={i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
      />
    ));
  };

  const handleSubmitSurvey = async () => {
    if (!selectedCustomerId || !selectedBookingId) {
      alert('请选择客户和预约单号');
      return;
    }
    const customer = customers.find((c) => c.id === selectedCustomerId);

    setSubmitting(true);
    try {
      const created = await surveyApi.create({
        bookingId: selectedBookingId,
        customerId: selectedCustomerId,
        customerName: customer?.name || '顾客',
        rating: newRating,
        recommended: newRecommended,
        comment: newComment,
      });
      if (created) {
        setSurveys([
          {
            ...created,
            createdAt: created.createdAt ? new Date(created.createdAt) : new Date(),
          },
          ...surveys,
        ]);
        // 重置表单
        setSelectedCustomerId('');
        setSelectedBookingId('');
        setNewRating(5);
        setNewRecommended(true);
        setNewComment('');
      } else {
        alert('创建回访失败，请重试');
      }
    } catch (err: unknown) {
      console.error('[SatisfactionSurveyManagement] 创建回访失败:', (err as Error).message);
      alert('创建回访失败：' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ShopLayout title="满意度回访">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${stat.bgColor} rounded-xl flex items-center justify-center`}>
                    <Icon size={20} className={stat.color} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
                    <div className="text-sm text-gray-500">{stat.label}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索客户姓名或预约单号..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-2 px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Filter size={20} />
                <span>筛选评分</span>
                <ChevronDown size={16} />
              </button>

              {showFilterDropdown && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg p-4 w-48 z-10">
                  <button
                    onClick={() => { setSelectedRating('all'); setShowFilterDropdown(false); }}
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all ${
                      selectedRating === 'all'
                        ? 'bg-teal-500 text-white'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    全部
                  </button>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => { setSelectedRating(rating); setShowFilterDropdown(false); }}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all flex items-center gap-2 ${
                        selectedRating === rating
                          ? 'bg-teal-500 text-white'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span>{rating}星</span>
                      <div className="flex">{getRatingStars(rating)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center text-gray-500 py-12">
              <Loader2 size={48} className="mx-auto mb-2 opacity-50 animate-spin" />
              <p>加载中...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSurveys.length > 0 ? (
                filteredSurveys.map((survey) => (
                  <div
                    key={survey.id}
                    className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                          <User size={24} className="text-teal-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-bold text-gray-800 text-lg">{survey.customerName}</span>
                            <div className="flex">{getRatingStars(survey.rating)}</div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {new Date(survey.createdAt).toLocaleDateString()}
                            </span>
                            <span>预约号: {survey.bookingId}</span>
                            {survey.recommended && (
                              <span className="flex items-center gap-1 text-green-500">
                                <ThumbsUp size={14} />
                                愿意推荐
                              </span>
                            )}
                          </div>
                          {survey.comment && (
                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                              {survey.comment}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewingSurvey(survey)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="查看详情"
                        >
                          <Eye size={18} className="text-gray-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <MessageSquare size={48} className="mx-auto mb-2 opacity-50" />
                  <p>暂无回访记录</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mt-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Send size={20} className="text-teal-500" />
            发起回访
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">选择客户</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setSelectedBookingId('');
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
              >
                <option value="">请选择客户</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({customer.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">预约单号</label>
              <select
                value={selectedBookingId}
                onChange={(e) => setSelectedBookingId(e.target.value)}
                disabled={!selectedCustomerId || bookings.length === 0}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none disabled:bg-gray-100"
              >
                <option value="">{selectedCustomerId ? (bookings.length === 0 ? '暂无预约' : '请选择预约') : '请先选择客户'}</option>
                {bookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.id} - {booking.serviceName || '服务'} ({new Date(booking.scheduledTime).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">评分</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => setNewRating(rating)}
                    className="p-1"
                  >
                    <Star
                      size={28}
                      className={rating <= newRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
                    />
                  </button>
                ))}
                <span className="ml-2 text-sm text-gray-600">{newRating} 星</span>
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRecommended}
                  onChange={(e) => setNewRecommended(e.target.checked)}
                  className="w-5 h-5 text-teal-500 rounded focus:ring-teal-500"
                />
                <span className="text-gray-700">愿意推荐给朋友</span>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">评价内容</label>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
              placeholder="请输入客户反馈..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          <button
            onClick={handleSubmitSurvey}
            disabled={submitting || !selectedCustomerId || !selectedBookingId}
            className="w-full md:w-auto px-8 py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            {submitting ? '提交中...' : '发送回访'}
          </button>
        </div>
      </div>

      {viewingSurvey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">回访详情</h3>
              <button onClick={() => setViewingSurvey(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <span className="text-gray-500 text-xl">&times;</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <User size={32} className="text-teal-500" />
                </div>
                <h4 className="text-xl font-bold text-gray-800">{viewingSurvey.customerName}</h4>
                <div className="flex mt-2">{getRatingStars(viewingSurvey.rating)}</div>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">预约单号</span>
                <span className="font-medium">{viewingSurvey.bookingId}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Calendar size={16} />
                  回访时间
                </span>
                <span className="font-medium">{new Date(viewingSurvey.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">是否推荐</span>
                <span className={`font-medium flex items-center gap-1 ${viewingSurvey.recommended ? 'text-green-500' : 'text-gray-500'}`}>
                  <ThumbsUp size={16} />
                  {viewingSurvey.recommended ? '愿意推荐' : '暂不推荐'}
                </span>
              </div>
              {viewingSurvey.comment && (
                <div>
                  <span className="text-gray-500 block mb-2">评价内容</span>
                  <p className="text-gray-600 bg-gray-50 p-4 rounded-xl">
                    {viewingSurvey.comment}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default SatisfactionSurveyManagement;
