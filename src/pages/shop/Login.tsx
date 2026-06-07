import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, Lock, Eye, EyeOff, User, Phone } from 'lucide-react';
import { loginAsShop, loginAsStylist } from '../../store';
import { mockShops } from '../../../shared/mockData';

const DEFAULT_SHOP_ID = 'shop1';

const ShopLogin: React.FC = () => {
  const [loginMode, setLoginMode] = useState<'shop' | 'stylist'>('shop');
  const [selectedStylist, setSelectedStylist] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const currentShop = mockShops.find(s => s.id === DEFAULT_SHOP_ID);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (loginMode === 'shop') {
      const shop = loginAsShop(DEFAULT_SHOP_ID, password);
      if (shop) {
        navigate('/shop');
      } else {
        setError('密码错误，请重新输入');
      }
    } else {
      // 根据手机号查找发型师
      const stylist = currentShop?.employees.find(e => e.phone === phone);
      if (!stylist) {
        setError('手机号不存在，请重新输入');
        return;
      }
      const loggedIn = loginAsStylist(DEFAULT_SHOP_ID, stylist.id, password);
      if (loggedIn) {
        navigate('/shop/stylist');
      } else {
        setError('密码错误，请重新输入');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft size={20} className="mr-2" />
          返回
        </button>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-2">皓诗造型设计登录</h1>
        <p className="text-gray-600 mb-6">选择登录身份</p>
        
        {/* 登录模式切换 */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => setLoginMode('shop')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
              loginMode === 'shop'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Store size={18} />
              老板/店长
            </div>
          </button>
          <button
            onClick={() => setLoginMode('stylist')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
              loginMode === 'stylist'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <User size={18} />
              发型师
            </div>
          </button>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-6">
          {loginMode === 'stylist' && (
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
                  placeholder="请输入手机号 (演示: 13900000011)"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              登录密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码 (演示密码: 123456)"
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-3 px-6 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {loginMode === 'shop' ? '登录管理后台看板' : '登录发型师看板'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ShopLogin;
