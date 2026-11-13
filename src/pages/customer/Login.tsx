import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Phone, UserRound } from 'lucide-react';
import { loginAsCustomer, useAppStore } from '../../store';
import { customerApi } from '../../api';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'password' | 'sms'>('password');
  const [smsCode, setSmsCode] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsUntil, setSmsUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);
  const smsRequest = useRef({ phone: '', at: 0 });
  const current = useRef({ phone, smsCode, loginMode });
  current.current = { phone, smsCode, loginMode };
  const smsSeconds = Math.max(0, Math.ceil((smsUntil - now) / 1000));
  useEffect(() => {
    if (!smsUntil) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now(); setNow(timestamp);
      if (timestamp >= smsUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsUntil]);

  const pasteSmsCode = async (manual = false) => {
    const snapshot = current.current;
    const request = smsRequest.current;
    if (snapshot.loginMode !== 'sms' || busy.current) return;
    if (!manual && (snapshot.smsCode || request.phone !== snapshot.phone.trim() || Date.now() - request.at > 300000)) return;
    try {
      const code = (await navigator.clipboard.readText()).trim();
      const latest = current.current;
      if (latest.phone !== snapshot.phone || latest.smsCode !== snapshot.smsCode || latest.loginMode !== snapshot.loginMode || smsRequest.current !== request || busy.current) return;
      if (/^\d{6}$/.test(code)) { setSmsCode(code); setError(''); }
      else if (manual) setError('请先复制六位短信验证码');
    } catch { if (manual) setError('浏览器未允许读取剪贴板，请长按输入框粘贴'); }
  };
  const pasteRef = useRef(pasteSmsCode);
  pasteRef.current = pasteSmsCode;
  useEffect(() => {
    const fill = () => { if (document.visibilityState === 'visible') void pasteRef.current(); };
    window.addEventListener('focus', fill);
    document.addEventListener('visibilitychange', fill);
    return () => { window.removeEventListener('focus', fill); document.removeEventListener('visibilitychange', fill); };
  }, []);

  const sendSmsCode = async () => {
    if (busy.current || smsSeconds > 0) return;
    const value = phone.trim();
    if (!/^1[3-9]\d{9}$/.test(value)) { setError('请输入正确的 11 位手机号'); return; }
    busy.current = true; setSmsSending(true); setError('');
    try {
      await customerApi.sendSmsCode(value);
      smsRequest.current = { phone: value, at: Date.now() };
      setNow(Date.now()); setSmsUntil(Date.now() + 60000);
    } catch (err) { setError(err instanceof Error ? err.message : '发送失败，请稍后重试'); }
    finally { busy.current = false; setSmsSending(false); }
  };
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = params.get('returnTo');
  const returnTo = customerLoginRedirect(params.get('redirect')) || (back?.startsWith('/invite?ref=') ? back : null);

  useEffect(() => {
    setShowPassword(false); setShowConfirmPassword(false);
  }, [loginMode]);
  useEffect(() => {
    const hide = () => { setShowPassword(false); setShowConfirmPassword(false); };
    window.addEventListener('blur', hide);
    return () => window.removeEventListener('blur', hide);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    setError('');

    const trimmedPhone = phone.trim();
    if (!/^1[3-9]\d{9}$/.test(trimmedPhone)) {
      setError('请输入正确的 11 位手机号');
      return;
    }

    busy.current = true;
    setLoading(true);

    try {
      if (loginMode === 'sms' && !/^\d{6}$/.test(smsCode)) throw new Error('请输入六位短信验证码');
      if (loginMode === 'password' && password && !/^\d{6}$/.test(password)) throw new Error('密码必须为六位数字');
      if (setupRequired && password !== confirmPassword) throw new Error('两次输入的密码不一致');
      const result = loginMode === 'sms'
        ? { setupRequired: false, customer: await customerApi.loginWithSms(trimmedPhone, smsCode) }
        : await loginAsCustomer(trimmedPhone, password || undefined, setupRequired);
      if (loginMode === 'sms' && result.customer) useAppStore.getState().setCurrentCustomer(result.customer);
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
      busy.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fff8f0] via-[#fff1df] to-[#fff9f2] flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="max-w-md w-full bg-white rounded-[28px] border border-[#f3e5d8] shadow-[0_18px_48px_rgba(120,75,45,0.10)] p-6 sm:p-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-[#66574e] hover:text-[#3d332d] mb-5 text-sm"
        >
          <ArrowLeft size={18} className="mr-1.5" />
          返回
        </button>
        
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#ffecd6] to-[#ffd9b6] text-[#8a4c29]"><UserRound size={31} strokeWidth={1.8} /></div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#302923] mb-2">顾客登录</h1>
          <p className="text-[#71665d] text-sm">登录后可预约服务、查看会员权益</p>
        </div>
        
        <form onSubmit={handleLogin} autoComplete="on" className="space-y-5 sm:space-y-6">
          <div className="flex gap-2">
            {(['password', 'sms'] as const).map(mode => <button key={mode} type="button" disabled={loading || smsSending} aria-pressed={loginMode === mode} onClick={() => { setLoginMode(mode); setSetupRequired(false); setPassword(''); setConfirmPassword(''); setSmsCode(''); setError(''); }} className={`flex-1 rounded-xl border p-3 text-sm font-semibold transition-colors ${loginMode === mode ? 'border-[#e5ab7a] bg-[#fff0df] text-[#75411f]' : 'border-[#eee6df] bg-[#faf8f5] text-[#665b52]'}`}>{mode === 'sms' ? '短信验证码登录' : '密码登录'}</button>)}
          </div>
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
                disabled={loading || smsSending}
                onChange={(e) => { setPhone(e.target.value); setSmsCode(''); smsRequest.current = { phone: '', at: 0 }; setSetupRequired(false); setPassword(''); setConfirmPassword(''); setError(''); }}
                placeholder="请输入手机号"
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 border border-[#e8dfd6] bg-[#faf8f6] rounded-xl focus:ring-2 focus:ring-[#e5ab7a] focus:border-transparent outline-none transition-all text-sm sm:text-base"
              />
            </div>
          </div>
          
          {loginMode === 'password' ? <>
          {setupRequired && <p className="text-sm text-gray-600">首次使用，请设置六位数字密码。</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{setupRequired ? '设置六位数字密码' : '六位数字密码'}</label>
            <div className="relative">
              <input name="password" type={showPassword ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={6} value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete={setupRequired ? 'new-password' : 'current-password'} placeholder="请输入六位数字密码" className="w-full p-3 pr-12 border border-gray-300 rounded-xl" />
              <button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(!showPassword)} className="absolute right-0 inset-y-0 px-3 text-gray-500">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
            </div>
          </div>
          {setupRequired && <div><label className="block text-sm font-medium text-gray-700 mb-2">确认密码</label><div className="relative"><input type={showConfirmPassword ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="new-password" placeholder="再次输入密码" className="w-full p-3 pr-12 border border-gray-300 rounded-xl" /><button type="button" aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'} onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-0 inset-y-0 px-3 text-gray-500">{showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></div>}
          <p className="text-xs text-gray-500">忘记密码？请联系门店重置，重置密码为手机号后六位。</p>
          </> : <div className="space-y-3">
            <label htmlFor="customer-sms-code" className="block text-sm font-medium text-gray-700">短信验证码</label>
            <div className="flex gap-2">
              <input id="customer-sms-code" name="sms-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={smsCode} onFocus={() => void pasteSmsCode()} onChange={e => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="请输入六位短信验证码" className="min-w-0 flex-1 p-3 border border-gray-300 rounded-xl" />
              <button type="button" disabled={loading} onClick={() => void pasteSmsCode(true)} className="px-3 rounded-xl border border-[#ecd5c0] text-[#75411f] bg-[#fff2e5]">粘贴</button>
            </div>
            <button type="button" disabled={smsSending || loading || smsSeconds > 0} onClick={() => void sendSmsCode()} className="w-full p-3 rounded-xl border border-[#ecd5c0] text-[#75411f] bg-[#fff2e5] disabled:opacity-50">{smsSending ? '发送中...' : smsSeconds > 0 ? `${smsSeconds} 秒后重发` : '获取验证码'}</button>
            <p className="text-xs text-gray-500">新用户验证手机号后自动注册，老用户直接登录。</p>
          </div>}
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={rememberPhone} onChange={e => { setRememberPhone(e.target.checked); if (!e.target.checked) { try { localStorage.removeItem(REMEMBERED_PHONE_KEY); } catch {} } }} />记住手机号（不保存密码）</label>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 sm:p-4 rounded-xl text-xs sm:text-sm">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading || smsSending}
            className="w-full bg-gradient-to-r from-[#ffc18c] to-[#ffb276] hover:from-[#ffb276] hover:to-[#ffa765] disabled:opacity-60 disabled:cursor-not-allowed text-[#302923] py-3 sm:py-3.5 px-4 sm:px-6 rounded-xl font-bold shadow-[0_8px_20px_rgba(170,101,54,0.18)] transition-all text-sm sm:text-base min-h-[52px]"
          >
            {loading ? '处理中...' : setupRequired ? '设置密码并登录' : '立即登录'}
          </button>
          
        </form>
      </div>
    </div>
  );
};

export default CustomerLogin;
