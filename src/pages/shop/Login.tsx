import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, Lock, Eye, EyeOff, User, Phone, Crown, Headphones, UserCheck } from 'lucide-react';
import { loginAsShop, loginAsStylist, loginAsEmployee } from '../../store';
import { mockShops, UserRole } from '../../../shared/types';

const DEFAULT_SHOP_ID = 'shop1';

type LoginMode = 'shop' | 'stylist' | 'ceo' | 'cs' | 'manager';

const ShopLogin: React.FC = () => {
  const [loginMode, setLoginMode] = useState<LoginMode>('shop');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const currentShop = mockShops.find((s) => s.id === DEFAULT_SHOP_ID);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (loginMode === 'shop') {
      // 老板/店长：用店铺密码登录
      const shop = loginAsShop(DEFAULT_SHOP_ID, password);
      if (shop) {
        navigate('/shop');
      } else {
        setError('密码错误，请重新输入');
      }
      return;
    }

    // 角色登录：根据手机号查找员工
    const employee = currentShop?.employees.find((emp) => emp.phone === phone);
    if (!employee) {
      setError('手机号不存在，请重新输入');
      return;
    }

    const loggedIn = loginAsEmployee(DEFAULT_SHOP_ID, employee.id, password);
    if (loggedIn) {
      navigate('/shop');
    } else {
      setError('密码错误，请重新输入');
    }
  };

  const modeConfig: Record<
    LoginMode,
    { title: string; subtitle: string; phoneRequired: boolean; placeholder: string; icon: React.ReactNode }
  > = {
    shop: {
      title: '老板/店长',
      subtitle: '使用店铺密码登录',
      phoneRequired: false,
      placeholder: '请输入店铺密码',
      icon: <Store size={18} />,
    },
    ceo: {
      title: 'CEO/老板',
      subtitle: '拥有最高管理权限',
      phoneRequired: true,
      placeholder: 'CEO手机号（演示：13900000100）',
      icon: <Crown size={18} />,
    },
    cs: {
      title: '客服专员',
      subtitle: '客户回访/维护',
      phoneRequired: true,
      placeholder: '客服手机号（演示：13900000101）',
      icon: <Headphones size={18} />,
    },
    manager: {
      title: '店长',
      subtitle: '店铺运营管理',
      phoneRequired: true,
      placeholder: '店长手机号（演示：13900000102）',
      icon: <UserCheck size={18} />,
    },
    stylist: {
      title: '发型师',
      subtitle: '查看个人业绩和预约',
      phoneRequired: true,
      placeholder: '发型师手机号（演示：13900000011）',
      icon: <User size={18} />,
    },
  };

  const current = modeConfig[loginMode];

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

        <h1 className="text-2xl font-bold text-gray-800 mb-1">皓诗形象设计</h1>
        <p className="text-gray-500 mb-6">选择登录身份</p>

        {/* 登录模式切换 */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {(Object.keys(modeConfig) as LoginMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setLoginMode(mode);
                setError('');
                setPhone('');
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                loginMode === mode
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {modeConfig[mode].icon}
              {modeConfig[mode].title}
            </button>
          ))}
        </div>

        <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-6 text-xs text-orange-700">
          {current.subtitle}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {current.phoneRequired && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">手机号</label>
              <div className="relative">
                <Phone
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={current.placeholder}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">登录密码</label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码（演示密码：123456）"
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
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm">{error}</div>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-3 px-6 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
          >
            登录后台
          </button>
        </form>
      </div>
    </div>
  );
};

export default ShopLogin;

