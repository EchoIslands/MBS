import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Send, CheckCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { reviewApi } from '../../api';

const ReviewPage: React.FC = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [serviceScore, setServiceScore] = useState(5);
  const [priceScore, setPriceScore] = useState(5);
  const [skillScore, setSkillScore] = useState(5);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const { currentCustomer } = useAppStore();

  if (!currentCustomer) {
    navigate('/customer/login');
    return null;
  }

  const renderStarSelector = (
    score: number,
    setScore: (s: number) => void,
    label: string
  ) => (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-3">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setScore(star)}
            className="p-1"
          >
            <Star
              size={32}
              className={
                star <= score
                  ? 'text-yellow-500 fill-yellow-500'
                  : 'text-gray-300'
              }
            />
          </button>
        ))}
        <span className="ml-2 text-lg font-bold text-gray-700">{score} 分</span>
      </div>
    </div>
  );

  const handleSubmit = async () => {
    try {
      await reviewApi.createReview({
        shopId: 'shop1', // 模拟shopId
        customerId: currentCustomer.id,
        bookingId: bookingId || '',
        serviceScore,
        priceScore,
        skillScore,
        comment,
      });
      setSubmitted(true);
    } catch (error) {
      alert('提交失败，请重试');
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={48} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            评价提交成功！
          </h2>
          <p className="text-gray-500 mb-6">
            感谢您的评价，您的反馈对我们很重要
          </p>
          <button
            onClick={() => navigate('/customer')}
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-medium transition-all"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

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

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">
            请对本次服务进行评价
          </h2>

          {renderStarSelector(serviceScore, setServiceScore, '服务态度')}
          {renderStarSelector(priceScore, setPriceScore, '价格合理性')}
          {renderStarSelector(skillScore, setSkillScore, '技术水平')}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              评价内容（可选）
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="分享您的体验..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
            <Send size={20} />
            提交评价
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewPage;
