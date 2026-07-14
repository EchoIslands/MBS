import React, { useState, useMemo, useEffect } from 'react';
import {
  Star,
  MessageSquare,
  Eye,
  EyeOff,
  Send,
  Filter,
  ChevronDown,
  MessageCircle,
  Store,
  Scissors,
  TrendingUp,
  BarChart2,
  Loader2,
} from 'lucide-react';
import { ShopReview, StylistReview, Review, UserRole } from '../../../shared/types';

import { useAppStore } from '../../store';
import { shopApi, reviewApi } from '../../api';
import ShopLayout from './ShopLayout';

type TabType = 'shop' | 'stylist';
type RatingFilter = 'all' | '5' | '4' | '3' | '2' | '1';

const renderStars = (rating: number, size: number = 16) => {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
        />
      ))}
    </div>
  );
};

const ReviewManagement: React.FC = () => {
  const { currentShop, currentEmployee, userRole } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabType>('shop');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [rawReviews, setRawReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shopReviews, setShopReviews] = useState<ShopReview[]>([]);
  const [stylistReviews, setStylistReviews] = useState<StylistReview[]>([]);

  // 加载真实评价数据
  const fetchReviews = async () => {
    if (!currentShop?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await shopApi.getShopReviews(currentShop.id);
      setRawReviews(data);
    } catch (err: unknown) {
      console.error('加载评价失败:', err);
      setError((err as Error).message || '加载评价失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShop?.id]);

  // 将后端 Review 映射为前端 ShopReview / StylistReview 展示格式
  const mapToShopReview = (r: Review): ShopReview => ({
    id: r.id,
    shopId: r.shopId,
    customerId: r.customerId,
    customerName: r.customerName || '顾客',
    customerAvatar: undefined,
    rating: Math.round(r.overallScore || 5),
    serviceRating: r.serviceScore,
    skillRating: r.stylistScore,
    environmentRating: Math.round(r.overallScore || 5),
    priceRating: r.stylistScore,
    comment: r.comment || '',
    tags: [],
    reply: r.reply,
    replyBy: r.replyBy,
    replyAt: r.replyAt,
    isHidden: r.isHidden || false,
    createdAt: r.createdAt,
  });

  const mapToStylistReview = (r: Review): StylistReview => ({
    id: r.id,
    shopId: r.shopId,
    stylistId: r.stylistId || '',
    stylistName: '技师',
    customerId: r.customerId,
    customerName: r.customerName || '顾客',
    customerAvatar: undefined,
    serviceName: '',
    rating: Math.round(r.overallScore || 5),
    skillRating: r.stylistScore,
    serviceRating: r.serviceScore,
    communicationRating: Math.round(r.overallScore || 5),
    comment: r.comment || '',
    tags: [],
    reply: r.reply,
    replyAt: r.replyAt,
    isHidden: r.isHidden || false,
    createdAt: r.createdAt,
  });

  useEffect(() => {
    const shop = rawReviews
      .filter((r) => !r.isHidden)
      .map(mapToShopReview);
    const stylist = rawReviews
      .filter((r) => r.stylistId && !r.isHidden)
      .map(mapToStylistReview);
    setShopReviews(shop);
    setStylistReviews(stylist);
  }, [rawReviews]);

  const canReplyReview =
    !userRole ||
    userRole === UserRole.CEO ||
    userRole === UserRole.CUSTOMER_SERVICE ||
    userRole === UserRole.SHOP_OWNER ||
    userRole === UserRole.SHOP_MANAGER ||
    userRole === UserRole.STYLIST;

  const canHideReview =
    !userRole ||
    userRole === UserRole.CEO ||
    userRole === UserRole.SHOP_OWNER ||
    userRole === UserRole.SHOP_MANAGER;

  const visibleShopReviews = useMemo(() => {
    let reviews = shopReviews.filter((r) => r.shopId === currentShop.id);
    if (ratingFilter !== 'all') {
      reviews = reviews.filter((r) => r.rating === parseInt(ratingFilter));
    }
    return reviews;
  }, [shopReviews, ratingFilter, currentShop.id]);

  const visibleStylistReviews = useMemo(() => {
    let reviews = stylistReviews.filter((r) => r.shopId === currentShop.id);
    if (ratingFilter !== 'all') {
      reviews = reviews.filter((r) => r.rating === parseInt(ratingFilter));
    }
    return reviews;
  }, [stylistReviews, ratingFilter, currentShop.id]);

  const currentReviews =
    activeTab === 'shop' ? visibleShopReviews : visibleStylistReviews;

  const stats = useMemo(() => {
    const reviews = activeTab === 'shop' ? shopReviews.filter((r) => r.shopId === currentShop.id) : stylistReviews.filter((r) => r.shopId === currentShop.id);
    const total = reviews.length;
    const avgRating =
      total > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1) : '0.0';
    const distribution: Record<string, number> = {
      '5': 0,
      '4': 0,
      '3': 0,
      '2': 0,
      '1': 0,
    };
    reviews.forEach((r) => {
      const key = String(r.rating) as keyof typeof distribution;
      if (distribution[key] !== undefined) {
        distribution[key]++;
      }
    });
    return { total, avgRating, distribution };
  }, [activeTab, shopReviews, stylistReviews, currentShop.id]);

  const handleReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    try {
      await reviewApi.replyReview(reviewId, replyText, currentEmployee?.name || '管理员');
      setRawReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                reply: replyText,
                replyBy: currentEmployee?.name || '管理员',
                replyAt: new Date(),
              }
            : r
        )
      );
      setReplyText('');
      setReplyingTo(null);
    } catch (err: unknown) {
      console.error('回复评价失败:', err);
      alert((err as Error).message || '回复失败，请重试');
    }
  };

  const toggleHideShopReview = async (reviewId: string) => {
    const target = shopReviews.find((r) => r.id === reviewId);
    if (!target) return;
    try {
      await reviewApi.hideReview(reviewId, !target.isHidden);
      setRawReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, isHidden: !target.isHidden } : r))
      );
    } catch (err: unknown) {
      console.error('隐藏评价失败:', err);
      alert((err as Error).message || '操作失败，请重试');
    }
  };

  const toggleHideStylistReview = async (reviewId: string) => {
    const target = stylistReviews.find((r) => r.id === reviewId);
    if (!target) return;
    try {
      await reviewApi.hideReview(reviewId, !target.isHidden);
      setRawReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, isHidden: !target.isHidden } : r))
      );
    } catch (err: unknown) {
      console.error('隐藏评价失败:', err);
      alert((err as Error).message || '操作失败，请重试');
    }
  };

  const ratingFilterOptions: { value: RatingFilter; label: string }[] = [
    { value: 'all', label: '全部评分' },
    { value: '5', label: '5星' },
    { value: '4', label: '4星' },
    { value: '3', label: '3星' },
    { value: '2', label: '2星' },
    { value: '1', label: '1星' },
  ];

  const renderShopReviewCard = (review: ShopReview) => (
    <div
      key={review.id}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 transition-all ${
        review.isHidden ? 'opacity-60 border-dashed' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <img
            src={review.customerAvatar}
            alt={review.customerName}
            className="w-12 h-12 rounded-full object-cover bg-orange-100"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-gray-800">
                {review.customerName}
              </span>
              {review.isHidden && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                  已隐藏
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mb-1">
              {renderStars(review.rating)}
              <span className="text-sm text-gray-500">
                {new Date(review.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canReplyReview && !review.reply && (
            <button
              onClick={() => {
                setReplyingTo(review.id);
                setReplyText('');
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
            >
              <MessageSquare size={16} />
              回复
            </button>
          )}
          {canHideReview && (
            <button
              onClick={() => toggleHideShopReview(review.id)}
              className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
              title={review.isHidden ? '显示' : '隐藏'}
            >
              {review.isHidden ? (
                <EyeOff size={16} className="text-gray-500" />
              ) : (
                <Eye size={16} className="text-gray-500" />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 bg-orange-50 rounded-lg p-3">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">服务态度</div>
          <div className="flex items-center justify-center gap-0.5">
            {renderStars(review.serviceRating, 12)}
            <span className="text-sm font-medium text-orange-600 ml-1">
              {review.serviceRating}
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">技术水平</div>
          <div className="flex items-center justify-center gap-0.5">
            {renderStars(review.skillRating, 12)}
            <span className="text-sm font-medium text-orange-600 ml-1">
              {review.skillRating}
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">环境</div>
          <div className="flex items-center justify-center gap-0.5">
            {renderStars(review.environmentRating, 12)}
            <span className="text-sm font-medium text-orange-600 ml-1">
              {review.environmentRating}
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">性价比</div>
          <div className="flex items-center justify-center gap-0.5">
            {renderStars(review.priceRating, 12)}
            <span className="text-sm font-medium text-orange-600 ml-1">
              {review.priceRating}
            </span>
          </div>
        </div>
      </div>

      <p className="text-gray-700 mb-3 leading-relaxed">{review.comment}</p>

      {review.tags && review.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {review.tags.map((tag, idx) => (
            <span
              key={idx}
              className="px-2 py-1 bg-orange-50 text-orange-600 rounded-full text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {review.reply && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg border-l-4 border-orange-400">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle size={14} className="text-orange-500" />
            <span className="text-sm font-medium text-gray-700">
              {review.replyBy || '店铺回复'}
            </span>
            <span className="text-xs text-gray-400">
              {review.replyAt && new Date(review.replyAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
          <p className="text-sm text-gray-600">{review.reply}</p>
        </div>
      )}

      {replyingTo === review.id && (
        <div className="mt-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="请输入回复内容..."
            className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
            rows={3}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => {
                setReplyingTo(null);
                setReplyText('');
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => handleReply(review.id)}
              disabled={!replyText.trim()}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} />
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderStylistReviewCard = (review: StylistReview) => (
    <div
      key={review.id}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 transition-all ${
        review.isHidden ? 'opacity-60 border-dashed' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <img
            src={review.customerAvatar}
            alt={review.customerName}
            className="w-12 h-12 rounded-full object-cover bg-orange-100"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-gray-800">
                {review.customerName}
              </span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">
                {review.stylistName}
              </span>
              {review.serviceName && (
                <span className="text-xs text-gray-500">
                  · {review.serviceName}
                </span>
              )}
              {review.isHidden && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                  已隐藏
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mb-1">
              {renderStars(review.rating)}
              <span className="text-sm text-gray-500">
                {new Date(review.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canReplyReview && !review.reply && (
            <button
              onClick={() => {
                setReplyingTo(review.id);
                setReplyText('');
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
            >
              <MessageSquare size={16} />
              回复
            </button>
          )}
          {canHideReview && (
            <button
              onClick={() => toggleHideStylistReview(review.id)}
              className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
              title={review.isHidden ? '显示' : '隐藏'}
            >
              {review.isHidden ? (
                <EyeOff size={16} className="text-gray-500" />
              ) : (
                <Eye size={16} className="text-gray-500" />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 bg-orange-50 rounded-lg p-3">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">技术</div>
          <div className="flex items-center justify-center gap-0.5">
            {renderStars(review.skillRating, 12)}
            <span className="text-sm font-medium text-orange-600 ml-1">
              {review.skillRating}
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">态度</div>
          <div className="flex items-center justify-center gap-0.5">
            {renderStars(review.serviceRating, 12)}
            <span className="text-sm font-medium text-orange-600 ml-1">
              {review.serviceRating}
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">沟通</div>
          <div className="flex items-center justify-center gap-0.5">
            {renderStars(review.communicationRating, 12)}
            <span className="text-sm font-medium text-orange-600 ml-1">
              {review.communicationRating}
            </span>
          </div>
        </div>
      </div>

      <p className="text-gray-700 mb-3 leading-relaxed">{review.comment}</p>

      {review.tags && review.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {review.tags.map((tag, idx) => (
            <span
              key={idx}
              className="px-2 py-1 bg-orange-50 text-orange-600 rounded-full text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {review.reply && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg border-l-4 border-orange-400">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle size={14} className="text-orange-500" />
            <span className="text-sm font-medium text-gray-700">
              {review.stylistName}的回复
            </span>
            <span className="text-xs text-gray-400">
              {review.replyAt && new Date(review.replyAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
          <p className="text-sm text-gray-600">{review.reply}</p>
        </div>
      )}

      {replyingTo === review.id && (
        <div className="mt-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="请输入回复内容..."
            className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
            rows={3}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => {
                setReplyingTo(null);
                setReplyText('');
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => handleReply(review.id)}
              disabled={!replyText.trim()}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} />
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ShopLayout title="评价管理">
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <BarChart2 size={20} className="text-orange-500" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800">
                  {stats.total}
                </div>
                <div className="text-sm text-gray-500">总评价数</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                <TrendingUp size={20} className="text-yellow-500" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800">
                  {stats.avgRating}
                </div>
                <div className="text-sm text-gray-500">平均评分</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Star size={20} className="text-green-500 fill-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800">
                  {stats.distribution['5'] + stats.distribution['4']}
                </div>
                <div className="text-sm text-gray-500">好评(4-5星)</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Star size={20} className="text-red-500 fill-red-500" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800">
                  {stats.distribution['1'] + stats.distribution['2'] + stats.distribution['3']}
                </div>
                <div className="text-sm text-gray-500">中差评(1-3星)</div>
              </div>
            </div>
          </div>
        </div>

        {/* 星级分布 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-4">星级分布</h2>
          <div className="grid grid-cols-5 gap-4">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.distribution[String(star)];
              const percent = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={star} className="flex flex-col items-center">
                  <div className="flex items-center gap-1 mb-2">
                    <Star
                      size={14}
                      className="text-yellow-400 fill-yellow-400"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {star}星
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-1 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-orange-400 to-orange-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {count} ({percent.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tab切换和筛选 */}
        <div className="bg-white rounded-2xl shadow-sm p-2 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('shop')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'shop'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Store size={16} />
                店铺评价
              </button>
              <button
                onClick={() => setActiveTab('stylist')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'stylist'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Scissors size={16} />
                技师评价
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                <Filter size={16} />
                <span>
                  {ratingFilterOptions.find((o) => o.value === ratingFilter)?.label}
                </span>
                <ChevronDown size={14} />
              </button>
              {showFilterDropdown && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 py-2 w-32 z-10">
                  {ratingFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setRatingFilter(option.value);
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-orange-50 transition-colors ${
                        ratingFilter === option.value
                          ? 'text-orange-600 bg-orange-50 font-medium'
                          : 'text-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 评价列表 */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <Loader2 size={32} className="mx-auto mb-3 text-orange-500 animate-spin" />
              <p className="text-gray-500">加载评价中...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <p className="text-red-500 mb-3">{error}</p>
              <button
                onClick={() => fetchReviews()}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm"
              >
                重试
              </button>
            </div>
          ) : currentReviews.length > 0 ? (
            currentReviews.map((review) =>
              activeTab === 'shop'
                ? renderShopReviewCard(review as ShopReview)
                : renderStylistReviewCard(review as StylistReview)
            )
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <Star size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">暂无匹配的评价</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </ShopLayout>
  );
};

export default ReviewManagement;
