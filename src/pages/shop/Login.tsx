import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Eye, EyeOff, Phone, Crown, Headphones, UserCheck, User } from 'lucide-react';
import { loginAsShop, loginAsEmployee, useAppStore } from '../../store';
import { mockShops } from '../../../shared/mockData';
import { UserRole } from '../../../shared/types';
import { authApi } from '../../api';

const DEFAULT_SHOP_ID = 'shop1';

// 只保留 4 个登录模式：CEO、客服专员、店长、发型师
type LoginMode = 'ceo' | 'cs' | 'manager' | 'stylist';

const modeToRole: Record<LoginMode, UserRole> = {
  ceo: UserRole.CEO,
  cs: UserRole.CUSTOMER_SERVICE,
  manager: UserRole.SHOP_MANAGER,
  stylist: UserRole.STYLIST,
};

const ShopLogin: React.FC = () => {
  // 从 mockData 中读取各角色首个员工的手机号作为默认
  const shopEmployees = mockShops.find((s) => s.id === DEFAULT_SHOP_ID)?.employees || [];
  const ceoEmp = shopEmployees.find((e) => e.role === UserRole.CEO);
  const csEmp = shopEmployees.find((e) => e.role === UserRole.CUSTOMER_SERVICE);
  const mgrEmp = shopEmployees.find((e) => e.role === UserRole.SHOP_MANAGER);
  const stlEmp = shopEmployees.find((e) => e.role === UserRole.STYLIST);

  const modeDefaultPhone: Record<LoginMode, string> = {
    ceo: ceoEmp?.phone || '13900000100',
    cs: csEmp?.phone || '13900000101',
    manager: mgrEmp?.phone || '13900000102',
    stylist: stlEmp?.phone || '13900000011',
  };

  const [loginMode, setLoginMode] = useState<LoginMode>('manager');
  const [phone, setPhone] = useState<string>(modeDefaultPhone.manager);
  const [password, setPassword] = useState<string>('123456');
  const [showPassword, setShowPassword] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  const currentShop = mockShops.find((s) => s.id === DEFAULT_SHOP_ID);

  const handleModeChange = (mode: LoginMode) => {
    setLoginMode(mode);
    setError('');
    setPhone(modeDefaultPhone[mode]);
    setPassword('123456');
    setShowPassword(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 优先使用真实 API 登录
      const result = await authApi.login(phone, password);
      
      if (result?.user) {
        // 登录成功，需要把用户同步设置到 zustand store
        console.log('[Login] API 登录成功:', result.user);
        
        const { setCurrentShop, setCurrentEmployee } = useAppStore.getState();
        const shop = mockShops.find((s) => s.id === DEFAULT_SHOP_ID);
        if (shop) setCurrentShop(shop);
        setCurrentEmployee({
          ...result.user,
          role: result.user.role || UserRole.STYLIST,
        });
        
        navigate('/shop');
        return;
      }
    } catch (apiError: any) {
      console.log('[Login] API 登录失败，尝试 mock 登录:', apiError.message);
      
      // API 失败时降级到 mock 登录
      const employee = currentShop?.employees.find((emp) => emp.phone === phone);

      if (!employee) {
        setError('手机号不存在，请重新输入');
        setLoading(false);
        return;
      }

      const loggedIn = loginAsEmployee(DEFAULT_SHOP_ID, employee.id, password);
      if (loggedIn) {
        navigate('/shop');
      } else {
        setError('密码错误，请重新输入');
      }
    } finally {
      setLoading(false);
    }
  };

  const modeConfig: Record<
    LoginMode,
    {
      title: string;
      subtitle: string;
      placeholder: string;
      icon: React.ReactNode;
    }
  > = {
    ceo: {
      title: 'CEO',
      subtitle: '最高权限，可查看所有数据',
      placeholder: `CEO 手机号（演示：${modeDefaultPhone.ceo}）`,
      icon: <Crown size={22} />,
    },
    cs: {
      title: '客服专员',
      subtitle: '客户管理 / 评价回复 / 回访',
      placeholder: `客服手机号（演示：${modeDefaultPhone.cs}）`,
      icon: <Headphones size={22} />,
    },
    manager: {
      title: '店长',
      subtitle: '店铺运营 / 预约管理 / 员工管理',
      placeholder: `店长手机号（演示：${modeDefaultPhone.manager}）`,
      icon: <UserCheck size={22} />,
    },
    stylist: {
      title: '发型师',
      subtitle: '个人业绩 / 客户服务 / 排队状态',
      placeholder: `发型师手机号（演示：${modeDefaultPhone.stylist}）`,
      icon: <User size={22} />,
    },
  };

  const current = modeConfig[loginMode];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft size={20} className="mr-2" />
          返回首页
        </button>

        <h1 className="text-2xl font-bold text-gray-800 mb-1">皓诗形象设计</h1>
        <p className="text-gray-500 mb-6">选择登录身份</p>

        {/* 登录模式切换 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {(Object.keys(modeConfig) as LoginMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`flex flex-col items-center gap-2 py-5 px-4 rounded-2xl text-sm font-medium transition-all ${
                loginMode === mode
                  ? 'bg-orange-500 text-white shadow-md ring-2 ring-orange-300'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {modeConfig[mode].icon}
              <div className="font-semibold">{modeConfig[mode].title}</div>
            </button>
          ))}
        </div>

        <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-6 text-sm text-orange-700">
          {current.subtitle}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100"
              />
            </div>
          </div>

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
                disabled={loading}
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100"
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
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-3 px-6 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>登录中...</span>
              </>
            ) : (
              '登录后台'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ShopLogin;
