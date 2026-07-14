import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, User } from 'lucide-react';
import { loginAsCustomer } from '../../store';

const DEFAULT_SHOP_ID = "shop1";

const CustomerLogin: React.FC = () => {
  const [phone, setPhone] = useState('13900000001');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const trimmedName = name.trim();
      const customer = await loginAsCustomer(phone.trim(), trimmedName || undefined);
      if (customer) {
        navigate(`/customer/shop/${DEFAULT_SHOP_ID}`);
      } else {
        setError('手机号不存在，试用账号：13900000001');
      }
    } catch (err) {
      setError('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-3 sm:p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-5 sm:p-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-5 sm:mb-6 text-sm"
        >
          <ArrowLeft size={18} className="mr-1.5" />
          返回
        </button>
        
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">顾客登录</h1>
        <p className="text-gray-600 mb-6 sm:mb-8 text-sm sm:text-base">登录后可预约服务</p>
        
        <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              称呼 <span className="text-gray-400 font-normal">（选填）</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入称呼"
                className="w-full pl-10 pr-4 py-3 sm:py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm sm:text-base"
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              称呼只需填写一次，之后登录仅需手机号即可
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              手机号
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入手机号"
                className="w-full pl-10 pr-4 py-3 sm:py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm sm:text-base"
              />
            </div>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 sm:p-4 rounded-xl text-xs sm:text-sm">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 sm:py-3.5 px-4 sm:px-6 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-sm sm:text-base min-h-[52px]"
          >
            {loading ? '登录中...' : '登录'}
          </button>
          
          <div className="text-center text-xs sm:text-sm text-gray-500">
            试用账号：13900000001
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerLogin;
