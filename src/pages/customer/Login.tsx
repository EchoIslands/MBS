import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Phone } from 'lucide-react';
import { loginAsCustomer } from '../../store';
import { customerLoginRedirect } from '../../lib/customerLoginRedirect';

const DEFAULT_SHOP_ID = "shop1";
const REMEMBERED_PHONE_KEY = 'mbs_customer_login_phone';
const rememberedPhone = () => {
  try {
    const value = localStorage.getItem(REMEMBERED_PHONE_KEY) || '';
    return /^1[3-9]\d{9}$/.test(value) ? value : '';
  } catch { return ''; }
};

const CustomerLogin: React.FC = () => {
  const [phone, setPhone] = useState(rememberedPhone);
  const [rememberPhone, setRememberPhone] = useState(() => !!rememberedPhone());
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = params.get('returnTo');
  const returnTo = customerLoginRedirect(params.get('redirect')) || (back?.startsWith('/invite?ref=') ? back : null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedPhone = phone.trim();
    if (!/^1[3-9]\d{9}$/.test(trimmedPhone)) {
      setError('请输入正确的 11 位手机号');
      return;
    }

    setLoading(true);

    try {
      if (password && !/^\d{6}$/.test(password)) throw new Error('密码必须为六位数字');
      if (setupRequired && password !== confirmPassword) throw new Error('两次输入的密码不一致');
      const result = await loginAsCustomer(trimmedPhone, password || undefined, setupRequired);
      if (result.setupRequired) {
        setSetupRequired(true);
        setPassword(''); setConfirmPassword('');
        return;
      }
      if (result.customer) {
        try {
          if (rememberPhone) localStorage.setItem(REMEMBERED_PHONE_KEY, trimmedPhone);
          else localStorage.removeItem(REMEMBERED_PHONE_KEY);
        } catch { /* Storage may be disabled in private browsing. */ }
        navigate(result.customer.mustChangePassword ? '/customer/change-password' : (returnTo || `/customer/shop/${DEFAULT_SHOP_ID}`), { replace: true });
      } else {
        setError('暂时无法登录，请检查手机号或联系门店');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试');
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
        
        <form onSubmit={handleLogin} autoComplete="on" className="space-y-5 sm:space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              手机号
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                id="customer-login-phone"
                name="username"
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setSetupRequired(false); setPassword(''); setConfirmPassword(''); setError(''); }}
                placeholder="请输入手机号"
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 sm:py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm sm:text-base"
              />
            </div>
          </div>
          
          {setupRequired && <p className="text-sm text-gray-600">首次使用，请设置六位数字密码。</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{setupRequired ? '设置六位数字密码' : '六位数字密码'}</label>
            <input name="password" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete={setupRequired ? 'new-password' : 'current-password'} placeholder="请输入六位数字密码" className="w-full p-3 border border-gray-300 rounded-xl" />
          </div>
          {setupRequired && <div><label className="block text-sm font-medium text-gray-700 mb-2">确认密码</label><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="new-password" placeholder="再次输入密码" className="w-full p-3 border border-gray-300 rounded-xl" /></div>}
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={rememberPhone} onChange={e => { setRememberPhone(e.target.checked); if (!e.target.checked) { try { localStorage.removeItem(REMEMBERED_PHONE_KEY); } catch {} } }} />记住手机号（不保存密码）</label>
          <p className="text-xs text-gray-500">忘记密码？请联系门店重置，重置密码为手机号后六位。</p>

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
            {loading ? '处理中...' : setupRequired ? '设置密码并登录' : '登录'}
          </button>
          
        </form>
      </div>
    </div>
  );
};

export default CustomerLogin;
