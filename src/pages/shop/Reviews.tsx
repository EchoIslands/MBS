import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, User } from 'lucide-react';
import { Review } from '../../../shared/types';
import { useAppStore } from '../../store';
import { shopApi } from '../../api';
import ShopLayout from './ShopLayout';

const ReviewsManagement: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentShop } = useAppStore();

  const fetchReviews = async () => {
    if (!currentShop?.id) return;
    setLoading(true);
    try {
      setError(null);
      const data = await shopApi.getShopReviews(currentShop.id);
      setReviews(data);
    } catch (err: any) {
      console.error('加载评价失败:', err);
      setReviews([]);
      setError(err?.message || '加载评价失败，请检查网络或后端服务');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [currentShop?.id]);

  const renderStars = (count: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={14}
            className={
              star <= count
                ? 'text-yellow-500 fill-yellow-500'
                : 'text-gray-300'
            }
          />
        ))}
      </div>
    );
  };

  const getLevelLabel = () => {
    const levelMap: Record<string, string> = {
      excellent: '优',
      good: '良',
      average: '中',
      poor: '差',
    };
    return levelMap[currentShop?.level || ''] || '-';
  };

  const getLevelColor = () => {
    const colorMap: Record<string, string> = {
      excellent: 'bg-green-100 text-green-700',
      good: 'bg-blue-100 text-blue-700',
      average: 'bg-yellow-100 text-yellow-700',
      poor: 'bg-red-100 text-red-700',
    };
    return colorMap[currentShop?.level || ''] || 'bg-gray-100 text-gray-500';
  };

  return (
    <ShopLayout title="评价管理">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 店铺评分概览 */}
        {currentShop && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-5xl font-bold text-orange-600 mb-1">
                  {(currentShop.rating || 0).toFixed(1)}
                </div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  {renderStars(Math.round(currentShop.rating || 0))}
                </div>
                <div className="text-sm text-gray-500">
                  {currentShop.reviewCount || 0} 条评价
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-gray-700">店铺等级</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getLevelColor()}`}>
                    {getLevelLabel()}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-gray-500 mb-1">服务评分</div>
                    <div className="text-lg font-bold text-gray-800">
                      {reviews.length > 0
                        ? (
                            reviews.reduce((sum, r) => sum + r.serviceScore, 0) /
                            reviews.length
                          ).toFixed(1)
                        : '-'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 mb-1">价格评分</div>
                    <div className="text-lg font-bold text-gray-800">
                      {reviews.length > 0
                        ? (
                            reviews.reduce((sum, r) => sum + r.priceScore, 0) /
                            reviews.length
                          ).toFixed(1)
                        : '-'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 mb-1">技术评分</div>
                    <div className="text-lg font-bold text-gray-800">
                      {reviews.length > 0
                        ? (
                            reviews.reduce((sum, r) => sum + r.skillScore, 0) /
                            reviews.length
                          ).toFixed(1)
                        : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 评价列表 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <MessageSquare size={20} className="text-orange-500" />
            顾客评价
          </h2>

          {loading ? (
            <div className="text-center text-gray-500 py-12">
              <p>加载中...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 text-sm mb-2">{error}</div>
              <button
                onClick={() => fetchReviews()}
                className="text-orange-500 text-sm font-medium hover:text-orange-600"
              >
                重试
              </button>
            </div>
          ) : reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <User size={20} className="text-gray-400" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">
                          {review.customerName}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    {renderStars(Math.round(review.overallScore))}
                  </div>

                  <div className="flex gap-6 text-sm text-gray-500 mb-3">
                    <span>服务 {review.serviceScore} 分</span>
                    <span>价格 {review.priceScore} 分</span>
                    <span>技术 {review.skillScore} 分</span>
                  </div>

                  <p className="text-gray-700">{review.comment}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12">
              <MessageSquare size={48} className="mx-auto mb-2 opacity-50" />
              <p>暂无评价</p>
            </div>
          )}
        </div>
      </div>
    </ShopLayout>
  );
};

export default ReviewsManagement;
