import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, MessageSquare, Mail, CheckCircle } from 'lucide-react';

const Feedback: React.FC = () => {
  const navigate = useNavigate();
  const [type, setType] = useState<'suggestion' | 'complaint' | 'other'>('suggestion');
  const [contact, setContact] = useState('');
  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('请填写反馈内容');
      return;
    }

    setSubmitting(true);
    // 这里可以接入真实的反馈提交 API
    // 目前先模拟提交成功
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="sticky top-0 bg-white shadow-sm z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/customer/profile')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-semibold text-gray-800">意见反馈</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {submitted ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">提交成功</h2>
            <p className="text-sm text-gray-500 mb-6">感谢您的反馈，我们会尽快处理并回复您。</p>
            <button
              onClick={() => navigate('/customer/profile')}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-medium transition-colors"
            >
              返回个人中心
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
            {/* 反馈类型 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">反馈类型</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'suggestion', label: '建议' },
                  { key: 'complaint', label: '投诉' },
                  { key: 'other', label: '其他' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setType(item.key as typeof type)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      type === item.key
                        ? 'bg-orange-50 border-orange-500 text-orange-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 联系方式 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">联系方式（选填）</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="手机号或邮箱，方便我们回复您"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                />
              </div>
            </div>

            {/* 反馈内容 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">反馈内容</label>
              <div className="relative">
                <MessageSquare size={18} className="absolute left-3 top-3 text-gray-400" />
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="请详细描述您遇到的问题或建议..."
                  rows={5}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none text-sm"
                />
              </div>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-3.5 rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Send size={18} />
              {submitting ? '提交中...' : '提交反馈'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Feedback;
