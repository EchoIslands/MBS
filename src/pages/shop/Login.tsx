import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, Lock, Eye, EyeOff } from 'lucide-react';
import { loginAsShop } from '../../store';
import { mockShops } from '../../../shared/mockData';

const ShopLogin: React.FC = () => {
  const [selectedShop, setSelectedShop] = useState('shop1');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const shop = loginAsShop(selectedShop, password);
    if (shop) {
      navigate('/shop');
    } else {
      setError('密码错误，请重新输入');
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
        
        <h1 className="text-3xl font-bold text-gray-800 mb-2">理发店登录</h1>
        <p className="text-gray-600 mb-8">选择您的店铺并输入密码登录</p>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择店铺
            </label>
            <div className="space-y-3">
              {mockShops.map((shop) => (
                <label
                  key={shop.id}
                  className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    selectedShop === shop.id
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-orange-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="shop"
                    value={shop.id}
                    checked={selectedShop === shop.id}
                    onChange={(e) => setSelectedShop(e.target.value)}
                    className="mr-3"
                  />
                  <div className="flex items-center gap-3">
                    <Store size={24} className="text-orange-500" />
                    <div>
                      <div className="font-medium text-gray-800">{shop.name}</div>
                      <div className="text-sm text-gray-500">{shop.address}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          
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
            登录管理后台
          </button>
        </form>
      </div>
    </div>
  );
};

export default ShopLogin;
