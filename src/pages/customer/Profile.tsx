import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Calendar, Star, LogOut, Clock, CheckCircle, AlertCircle, MessageSquare,
  Crown, Gift, Sparkles, Wallet, ChevronRight, Award,
} from 'lucide-react';
import { Booking, MembershipLevel } from '../../../shared/types';
import { mockShops } from '../../../shared/mockData';
import { useAppStore } from '../../store';

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
  const navigate = useNavigate();
  const { currentCustomer, logout } = useAppStore();

  useEffect(() => {
    if (!currentCustomer) {
      navigate('/customer/login');
      return;
    }
    setBookings([]);
    setLoading(false);
  }, [currentCustomer]);

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

          {/* 核心价值数字 — "您已累计节省 ¥568" — 让会员感受到实实在在的优惠 */}
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 mb-4">
            <div className="text-sm text-white/80 mb-1 flex items-center gap-1.5">
              <Sparkles size={14} />
              您已累计节省
            </div>
            <div className="text-5xl font-bold mb-1">¥{totalSaved}</div>
            <div className="text-sm text-white/70">
              感谢您的信任 · 到店 {visitCount} 次 · 累计消费 ¥{totalSpent}
            </div>
          </div>

          {/* 数据速览 — 余额/积分/消费次数 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-xs text-white/70 mb-1 flex items-center gap-1">
                <Wallet size={12} /> 储值余额
              </div>
              <div className="text-xl font-bold">¥{balance}</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-xs text-white/70 mb-1 flex items-center gap-1">
                <Star size={12} /> 积分
              </div>
              <div className="text-xl font-bold">{points}</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="text-xs text-white/70 mb-1 flex items-center gap-1">
                <Award size={12} /> 会员等级
              </div>
              <div className="text-xl font-bold">{levelInfo.label}</div>
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

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 -mt-3">

        {/* 会员权益对比 — 让会员清楚知道自己有什么特权、下一级有什么更好的 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 border border-gray-100">
          <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Gift size={20} className="text-orange-500" />
            会员权益对比
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 text-gray-600 font-medium">权益</th>
                  <th className="text-center py-3 text-gray-500 font-normal">普通会员</th>
                  <th className={`text-center py-3 font-medium ${memberLevel === MembershipLevel.PREMIUM ? 'text-blue-600' : 'text-gray-500'}`}>
                    高级会员
                    {memberLevel === MembershipLevel.PREMIUM && <span className="text-xs block">· 当前</span>}
                  </th>
                  <th className={`text-center py-3 font-medium ${memberLevel === MembershipLevel.STOCKHOLDER ? 'text-purple-600' : 'text-gray-500'}`}>
                    股东会员
                    {memberLevel === MembershipLevel.STOCKHOLDER && <span className="text-xs block">· 当前</span>}
                  </th>
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
                      <td className="py-3 text-gray-700 font-medium">{b.feature}</td>
                      <td className="py-3 text-center text-gray-500">{b.regular}</td>
                      <td className={`py-3 text-center ${memberLevel === MembershipLevel.PREMIUM ? 'text-blue-600 font-bold bg-blue-50/50 rounded-lg' : 'text-gray-500'}`}>
                        {b.premium}
                      </td>
                      <td className={`py-3 text-center ${memberLevel === MembershipLevel.STOCKHOLDER ? 'text-purple-600 font-bold bg-purple-50/50 rounded-lg' : 'text-gray-500'}`}>
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
            <div className="mt-4 p-3 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border border-orange-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-orange-700">升级享受更多专属特权</div>
                  <div className="text-xs text-orange-600/80 mt-0.5">
                    {memberLevel === MembershipLevel.REGULAR
                      ? '升级高级会员，享 9 折 + 生日免费护理'
                      : '升级股东会员，享 8 折 + 客户推荐提成'}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/customer/shop/${shop?.id}`)}
                  className="flex items-center gap-1 text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  了解详情 <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 我的预约列表（保留原有功能） */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 border border-gray-100">
          <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-blue-500" />
            我的预约
          </h2>

          {loading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : bookings.length > 0 ? (
            <div className="space-y-3">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-gray-800">{booking.shopName}</div>
                      <div className="text-sm text-gray-500">{booking.serviceName}</div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        booking.status === 'completed' ? 'text-green-600 bg-green-50' :
                        booking.status === 'confirmed' ? 'text-blue-600 bg-blue-50' :
                        booking.status === 'pending' ? 'text-yellow-600 bg-yellow-50' :
                        'text-gray-600 bg-gray-100'
                      }`}
                    >
                      {booking.status === 'pending' ? '待确认' :
                       booking.status === 'confirmed' ? '已确认' :
                       booking.status === 'completed' ? '已完成' : '已取消'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(booking.scheduledTime).toLocaleString()}
                    </div>
                    <div className="font-medium text-orange-500">¥{booking.price}</div>
                  </div>
                  {booking.status === 'pending' && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => navigate(`/customer/queue/${booking.id}`)}
                        className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                      >
                        查看排队
                      </button>
                    </div>
                  )}
                  {booking.status === 'completed' && (
                    <div className="mt-4">
                      <button
                        onClick={() => navigate(`/customer/review/${booking.id}`)}
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
          ) : (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto mb-3 bg-gray-50 rounded-full flex items-center justify-center">
                <Calendar size={28} className="text-gray-300" />
              </div>
              <div className="text-gray-500 mb-3">暂无预约记录</div>
              <button
                onClick={() => navigate(`/customer/shop/${shop?.id}`)}
                className="text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg transition-colors inline-flex items-center gap-1"
              >
                去预约 <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* 快捷功能 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => navigate('/customer/refund')}
            className="bg-white rounded-2xl shadow-sm p-4 text-left hover:shadow-md transition-shadow border border-gray-100"
          >
            <AlertCircle size={22} className="text-orange-500 mb-2" />
            <div className="font-medium text-gray-800 text-sm">退款管理</div>
            <div className="text-xs text-gray-500 mt-0.5">申请退款和查看进度</div>
          </button>
          <button
            onClick={() => navigate(`/customer/shop/${shop?.id}`)}
            className="bg-white rounded-2xl shadow-sm p-4 text-left hover:shadow-md transition-shadow border border-gray-100"
          >
            <MessageSquare size={22} className="text-blue-500 mb-2" />
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
    </div>
  );
};

export default Profile;
