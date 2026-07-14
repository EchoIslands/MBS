import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Star, Send, CheckCircle, Share2, Gift, Sparkles, User, Heart, MessageCircle,
  Award, Copy, HelpCircle
} from 'lucide-react';
import { Booking, Review } from '../../../shared/types';
import { useAppStore } from '../../store';
import { bookingApi, reviewApi } from '../../api';

const ReviewPage: React.FC = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [serviceScore, setServiceScore] = useState(5);
  const [stylistScore, setStylistScore] = useState(5);
  const [serviceComment, setServiceComment] = useState('');
  const [stylistComment, setStylistComment] = useState('');
  const [isAwareOfMembershipBenefits, setIsAwareOfMembershipBenefits] = useState(false);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [shared, setShared] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [existingReview, setExistingReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showWechatGuide, setShowWechatGuide] = useState<'friend' | 'moments' | null>(null);
  const navigate = useNavigate();
  const { currentCustomer } = useAppStore();

  const shareUrl = useMemo(
    () => `https://www.hfmbs.cn/s/${booking?.shopId || 'shop1'}`,
    [booking]
  );
  const shareTitle = '我刚在这家店做了发型，服务超棒，推荐给你！';
  const isWechatBrowser = useMemo(() => /MicroMessenger/i.test(navigator.userAgent), []);

  useEffect(() => {
    async function fetchBooking() {
      if (!bookingId) return;
      try {
        const [data, review] = await Promise.all([
          bookingApi.getBooking(bookingId),
          reviewApi.getReviewByBookingId(bookingId).catch(() => null),
        ]);
        setBooking(data);
        setExistingReview(review);
      } catch (error) {
        console.error('加载预约信息失败:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchBooking();
  }, [bookingId]);

  const handleSubmit = async () => {
    if (!booking || !currentCustomer) {
      alert('无法提交评价，缺少预约或登录信息');
      return;
    }

    setSubmitting(true);
    try {
      await reviewApi.createReview({
        shopId: booking.shopId,
        customerId: currentCustomer.id,
        bookingId: booking.id,
        stylistId: booking.barberId,
        serviceScore,
        stylistScore,
        serviceComment,
        stylistComment,
        isAwareOfMembershipBenefits,
        comment,
      });
      setSubmitted(true);
    } catch (error) {
      console.error('提交评价失败:', error);
      alert('提交评价失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // ========== 星级评价渲染（支持半星） ==========
  const renderStarSelector = (
    score: number,
    setScore: (s: number) => void,
    label: string,
    icon?: React.ReactNode
  ) => {
    const starSize = 28;
    return (
      <div className="mb-4 sm:mb-5">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <label className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1.5">
            {icon || <Star size={14} className="text-yellow-500" />}
            {label}
          </label>
          <span className="text-base sm:text-lg font-bold text-orange-600">{score.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl p-3">
          {[1, 2, 3, 4, 5].map((star) => {
            const isFull = score >= star;
            const isHalf = score >= star - 0.5 && score < star;
            return (
              <div
                key={star}
                className="relative w-12 h-12 sm:w-auto sm:h-auto flex items-center justify-center flex-shrink-0"
                style={{ width: starSize, height: starSize }}
              >
                {/* 空星背景 */}
                <Star
                  size={starSize}
                  className="text-gray-300 hover:text-yellow-300 transition-colors"
                />
                {/* 填充层：满星或半星 */}
                {(isFull || isHalf) && (
                  <div
                    className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none"
                    style={isHalf ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
                  >
                    <Star
                      size={starSize}
                      className="text-yellow-500 fill-yellow-500"
                    />
                  </div>
                )}
                {/* 左半星点击区 */}
                <button
                  type="button"
                  onClick={() => setScore(star - 0.5)}
                  className="absolute left-0 top-0 w-1/2 h-full z-10"
                  aria-label={`${star - 0.5} 星`}
                />
                {/* 右半星点击区 */}
                <button
                  type="button"
                  onClick={() => setScore(star)}
                  className="absolute right-0 top-0 w-1/2 h-full z-10"
                  aria-label={`${star} 星`}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareTitle} ${shareUrl}`);
      setShared(true);
      alert('链接已复制，快去分享给好友吧～');
    } catch {
      alert('复制失败，请手动复制链接');
    }
  };

  const handleSystemShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl });
        setShared(true);
      } catch {
        // 用户取消或分享失败，不处理
      }
      return;
    }
    // 不支持系统分享时降级复制
    await handleCopyLink();
  };

  const handleShareButton = (channel: 'wechat' | 'moments' | 'copy') => {
    if (channel === 'copy') {
      handleCopyLink();
      return;
    }

    if (isWechatBrowser) {
      // 微信内：展开对应的菜单引导（wechat 映射为 friend）
      setShowWechatGuide(channel === 'wechat' ? 'friend' : channel);
      return;
    }

    // 非微信环境：优先调起系统分享，否则复制链接
    handleSystemShare();
  };

  // ========== 加载中 ==========
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">加载中...</div>
      </div>
    );
  }

  // 评价只能在服务完成后进行
  if (booking && booking.status !== 'completed') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-800">发表评价</h1>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-500 mb-6">服务完成后才能进行评价</p>
          <button
            onClick={() => navigate('/customer/profile')}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-medium"
          >
            返回个人中心
          </button>
        </div>
      </div>
    );
  }

  // 已经评价过，不能再评价
  if (existingReview) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-800">发表评价</h1>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <p className="text-gray-800 font-medium mb-2">您已经评价过这次服务了</p>
          <p className="text-sm text-gray-500 mb-6">
            综合评分 {existingReview.overallScore} 分 · {new Date(existingReview.createdAt).toLocaleDateString()}
          </p>
          <button
            onClick={() => navigate('/customer/profile')}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-medium"
          >
            返回个人中心
          </button>
        </div>
      </div>
    );
  }

  // ========== 提交前：评价表单 ==========
  if (!submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-800">发表评价</h1>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          {/* 服务信息卡片 */}
          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 mb-3 sm:mb-4 border border-gray-100">
            <div className="flex items-center gap-3 mb-3 sm:mb-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-orange-100 to-yellow-100 flex items-center justify-center flex-shrink-0">
                <User size={24} className="sm:hidden text-orange-500" />
                <User size={28} className="hidden sm:inline text-orange-500" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-800 text-sm sm:text-base truncate">
                  {booking?.barberName || '发型师'} · {booking?.shopName || '店铺'}
                </div>
                <div className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  {booking?.serviceName || '服务'} · ¥{booking?.price || 0}
                </div>
              </div>
            </div>
            <div className="text-xs sm:text-sm text-gray-500 flex items-center gap-1">
              <Sparkles size={14} className="text-yellow-500 flex-shrink-0" />
              您的评价将帮助其他顾客做出更好的选择
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
            {/* 本次店铺服务评价 */}
            {renderStarSelector(serviceScore, setServiceScore, '本次店铺服务评价', <Heart size={14} className="text-pink-500" />)}
            <div className="mb-4 sm:mb-5">
              <textarea
                value={serviceComment}
                onChange={(e) => setServiceComment(e.target.value)}
                placeholder="对本次店铺服务进行补充描述（可选）"
                rows={3}
                className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none text-gray-700 text-sm sm:text-base"
              />
            </div>

            {/* 本次发型师服务评价 */}
            {renderStarSelector(stylistScore, setStylistScore, '本次发型师服务评价', <Award size={14} className="text-yellow-500" />)}
            <div className="mb-4 sm:mb-5">
              <textarea
                value={stylistComment}
                onChange={(e) => setStylistComment(e.target.value)}
                placeholder="对本次发型师服务进行补充描述（可选）"
                rows={3}
                className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none text-gray-700 text-sm sm:text-base"
              />
            </div>

            {/* 会员/优惠活动知晓度 */}
            <div className="mb-4 sm:mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2 sm:mb-3">
                <HelpCircle size={14} className="inline mr-1 text-gray-500" />
                您是否知晓店铺会员制度、近期优惠活动等？
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAwareOfMembershipBenefits(true)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                    isAwareOfMembershipBenefits
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-orange-300'
                  }`}
                >
                  是
                </button>
                <button
                  type="button"
                  onClick={() => setIsAwareOfMembershipBenefits(false)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                    !isAwareOfMembershipBenefits
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-orange-300'
                  }`}
                >
                  否
                </button>
              </div>
            </div>

            {/* 文字评价 */}
            <div className="mb-4 sm:mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2 sm:mb-3">
                <MessageCircle size={14} className="inline mr-1 text-gray-500" />
                说点什么（可选）
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="分享您的服务体验、发型建议等..."
                rows={4}
                className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none text-gray-700 text-sm sm:text-base"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-xl font-bold text-base sm:text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 min-h-[52px]"
            >
              <Send size={18} className="sm:hidden" />
              <Send size={20} className="hidden sm:inline" />
              {submitting ? '提交中...' : '提交评价'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== 提交后：分享得优惠券 ==========
  const avgScore = ((serviceScore + stylistScore) / 2).toFixed(1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      <header className="bg-white/80 backdrop-blur shadow-sm sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/customer')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="font-semibold text-gray-800">评价完成</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {/* 成功提交动画 */}
        <div className="bg-white rounded-3xl shadow-lg p-5 sm:p-8 text-center mb-4 sm:mb-6 border border-orange-100">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center mb-3 sm:mb-4 shadow-lg">
            <CheckCircle size={40} className="sm:hidden text-white" />
            <CheckCircle size={52} className="hidden sm:inline text-white" />
          </div>
          <h2 className="text-lg sm:text-2xl font-bold text-gray-800 mb-2">
            评价提交成功，感谢您的反馈！
          </h2>
          <div className="flex items-center justify-center gap-1 mb-1 sm:mb-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                size={16}
                className={i <= Math.round(Number(avgScore)) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}
              />
            ))}
            <span className="text-sm sm:text-lg font-bold text-gray-700 ml-1 sm:ml-2">{avgScore} 分</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500">您的评价将在 24 小时内公开展示</p>
        </div>

        {/* 分享得优惠券卡片 */}
        <div className="bg-white rounded-3xl shadow-lg p-4 sm:p-6 border border-orange-100 mb-4 sm:mb-6">
          <div className="mb-3 sm:mb-4">
            <h3 className="font-bold text-gray-800 text-sm sm:text-lg flex items-center gap-2">
              <Gift size={18} className="sm:hidden text-orange-500" />
              <Gift size={22} className="hidden sm:inline text-orange-500" />
              分享给好友，双方各得 ¥10 优惠券
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">
              好友通过您的分享链接完成首次服务，双方自动获得优惠券
            </p>
          </div>

          {/* 优惠券预览 */}
          <div className="bg-gradient-to-r from-orange-500 to-yellow-500 rounded-2xl p-4 sm:p-5 text-white shadow-lg mb-3 sm:mb-4 overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-1/2 border-l-2 border-dashed border-white/30" />
            <div className="flex items-center gap-3 sm:gap-4 relative">
              <div className="text-center flex-1">
                <div className="text-2xl sm:text-4xl font-bold mb-1">¥10</div>
                <div className="text-[10px] sm:text-xs text-white/90">新人体验券 · 满 50 可用</div>
              </div>
              <div className="flex-1 text-right">
                <div className="text-xs sm:text-sm font-medium mb-1">皓诗形象设计</div>
                <div className="text-[10px] sm:text-xs text-white/90">有效期 30 天</div>
                <div className="text-[10px] sm:text-xs text-white/90 mt-1">全店服务通用</div>
              </div>
            </div>
            <div className="absolute -right-3 -bottom-3 w-12 sm:w-16 sm:h-16 h-12 bg-white/10 rounded-full" />
            <div className="absolute -right-8 -top-8 w-16 sm:w-20 h-16 sm:h-20 bg-white/10 rounded-full" />
          </div>

          {/* 分享按钮组 */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
            <button
              onClick={() => handleShareButton('wechat')}
              className="flex flex-col items-center gap-1 sm:gap-2 p-3 sm:p-4 bg-green-50 hover:bg-green-100 rounded-2xl transition-colors border border-green-100"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-500 flex items-center justify-center text-white flex-shrink-0">
                <MessageCircle size={16} className="sm:hidden" />
                <MessageCircle size={20} className="hidden sm:inline" />
              </div>
              <span className="text-[11px] sm:text-xs font-medium text-green-700 text-center">
                {isWechatBrowser ? '微信好友' : '系统分享'}
              </span>
            </button>

            <button
              onClick={() => handleShareButton('moments')}
              className="flex flex-col items-center gap-1 sm:gap-2 p-3 sm:p-4 bg-orange-50 hover:bg-orange-100 rounded-2xl transition-colors border border-orange-100"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-orange-500 flex items-center justify-center text-white flex-shrink-0">
                <Share2 size={16} className="sm:hidden" />
                <Share2 size={20} className="hidden sm:inline" />
              </div>
              <span className="text-[11px] sm:text-xs font-medium text-orange-700 text-center">
                {isWechatBrowser ? '朋友圈' : '复制链接'}
              </span>
            </button>

            <button
              onClick={() => handleShareButton('copy')}
              className="flex flex-col items-center gap-1 sm:gap-2 p-3 sm:p-4 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-colors border border-gray-200"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-500 flex items-center justify-center text-white flex-shrink-0">
                <Copy size={16} className="sm:hidden" />
                <Copy size={20} className="hidden sm:inline" />
              </div>
              <span className="text-[11px] sm:text-xs font-medium text-gray-700 text-center">复制链接</span>
            </button>
          </div>

          {/* 微信内：右上角菜单引导 */}
          {isWechatBrowser && (
            <div className="space-y-3 mb-3 sm:mb-4">
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 sm:p-4 text-center">
                <div className="text-green-700 font-medium mb-1 text-sm sm:text-base">微信内分享</div>
                <p className="text-xs sm:text-sm text-green-600">
                  点击右上角 <span className="font-bold">···</span> 菜单，选择分享方式
                </p>
              </div>

              {showWechatGuide === 'friend' && (
                <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-100 shadow-sm">
                  <div className="font-medium text-gray-800 mb-2 text-sm sm:text-base">分享给微信好友步骤</div>
                  <ol className="text-xs sm:text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
                    <li>点击右上角 <span className="font-bold">···</span> 打开菜单</li>
                    <li>选择「发送给朋友」</li>
                    <li>选择微信好友并发送</li>
                  </ol>
                </div>
              )}

              {showWechatGuide === 'moments' && (
                <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-100 shadow-sm">
                  <div className="font-medium text-gray-800 mb-2 text-sm sm:text-base">分享到朋友圈步骤</div>
                  <ol className="text-xs sm:text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
                    <li>点击右上角 <span className="font-bold">···</span> 打开菜单</li>
                    <li>选择「分享到朋友圈」</li>
                    <li>编辑文案并发表</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* 非微信环境：二维码 + 复制链接 */}
          {!isWechatBrowser && (
            <div className="space-y-3 mb-3 sm:mb-4">
              <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
                <div className="text-gray-700 font-medium mb-2 text-sm sm:text-base">微信扫码打开店铺</div>
                <div className="w-36 h-36 sm:w-44 sm:h-44 mx-auto bg-white p-2 rounded-lg shadow-sm">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(shareUrl)}&size=200x200`}
                    alt="店铺二维码"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-2">截图保存二维码，微信扫码即可打开</p>
              </div>

              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-xl transition-colors text-sm sm:text-base"
              >
                <Copy size={18} />
                <span>复制店铺链接</span>
              </button>
            </div>
          )}

          {shared ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
              <CheckCircle size={16} className="sm:hidden text-green-600 flex-shrink-0 mt-0.5" />
              <CheckCircle size={20} className="hidden sm:inline text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-green-700 mb-1 text-sm sm:text-base">
                  🎉 您已获得 ¥10 优惠券
                </div>
                <div className="text-xs sm:text-sm text-green-600">
                  优惠券已自动发放到您的账户，下次消费可直接使用
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-2 text-xs sm:text-sm text-yellow-700">
              <Sparkles size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>小提示：</strong>分享给好友，好友通过链接完成首次消费，双方各得 1 张券～
              </span>
            </div>
          )}
        </div>

        {/* 底部按钮 —— 手机端保持较大点击区域 */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/customer')}
            className="py-3 sm:py-4 px-4 sm:px-6 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-medium transition-colors border border-gray-200 shadow-sm text-sm sm:text-base min-h-[52px]"
          >
            返回首页
          </button>
          <button
            onClick={() => navigate(`/customer/shop/${booking?.shopId || 'shop1'}`)}
            className="py-3 sm:py-4 px-4 sm:px-6 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold transition-colors shadow-lg text-sm sm:text-base min-h-[52px]"
          >
            再次预约
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewPage;
