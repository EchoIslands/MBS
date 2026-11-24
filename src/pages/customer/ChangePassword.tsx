import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { customerApi } from '../../api';
import { useAppStore } from '../../store';
import { CustomerHeader } from '../../components/CustomerPage';
import { customerLoginRedirect } from '../../lib/customerLoginRedirect';

const fields = {
  phone: '本人手机号',
  code: '六位短信验证码',
  newPassword: '新六位数字密码',
  confirmPassword: '再次输入新密码',
} as const;

export default function ChangePassword() {
  const customer = useAppStore(state => state.currentCustomer);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [values, setValues] = useState(() => ({ phone: customer?.phone || '', code: '', newPassword: '', confirmPassword: '' }));
  const [busy, setBusy] = useState<'send' | 'save' | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const returnTo = customerLoginRedirect(params.get('redirect'));
  const loginPath = '/customer/login?mode=sms' + (returnTo ? '&redirect=' + encodeURIComponent(returnTo) : '');

  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(values.phone)) { setError('请输入正确的手机号'); return; }
    if (Date.now() < retryAt) { setError('验证码已发送，请稍后重试'); return; }
    setBusy('send'); setError(''); setNotice('');
    try {
      await customerApi.sendSmsCode(values.phone);
      setRetryAt(Date.now() + 60000);
      setNotice('验证码已发送，请查看短信');
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败');
    } finally { setBusy(null); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const { phone, code, newPassword, confirmPassword } = values;
    if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code) || !/^\d{6}$/.test(newPassword) || newPassword !== confirmPassword || newPassword === '123456' || newPassword === phone.slice(-6)) {
      setError('请填写手机号、验证码及两次相同的六位新密码。请避开 123456 和手机号后六位');
      return;
    }
    setBusy('save'); setError(''); setNotice('');
    try {
      const updated = await customerApi.changePasswordWithSms(phone, code, newPassword, confirmPassword);
      useAppStore.getState().setCurrentCustomer(updated);
      navigate(returnTo || '/customer/shop/' + (updated.shopId || 'shop1'), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    } finally { setBusy(null); }
  };

  return <>
    <CustomerHeader title="设置或修改密码" />
    <main className="customer-login flex items-center justify-center px-4 py-6">
      <form onSubmit={submit} className="customer-card w-full max-w-md space-y-4">
        <p className="text-sm text-[#71665d]">验证手机号后可设置新密码。也可以直接用验证码登录。</p>
        {(Object.keys(fields) as (keyof typeof fields)[]).map(field => <div key={field} className="flex gap-2">
          <input aria-label={fields[field]} placeholder={fields[field]} disabled={!!busy}
            type={field === 'phone' ? 'tel' : field === 'code' ? 'text' : 'password'} inputMode="numeric"
            maxLength={field === 'phone' ? 11 : 6}
            autoComplete={field === 'phone' ? 'tel' : field === 'code' ? 'one-time-code' : 'new-password'}
            value={values[field]}
            onChange={event => setValues({ ...values, ...(field === 'phone' ? { code: '' } : {}), [field]: event.target.value.replace(/[^0-9]/g, '') })}
            className="min-w-0 flex-1 rounded-xl border border-[#ecdccd] bg-[#fffaf4] p-3" />
          {field === 'code' && <button type="button" disabled={!!busy} className="customer-secondary shrink-0" onClick={() => void sendCode()}>{busy === 'send' ? '发送中…' : '获取验证码'}</button>}
        </div>)}
        {notice && <p role="status" className="text-sm text-[#71665d]">{notice}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={!!busy} className="customer-primary w-full">{busy === 'save' ? '保存中…' : '保存新密码并登录'}</button>
        <button type="button" disabled={!!busy} className="customer-secondary w-full" onClick={() => {
          if (customer?.mustChangePassword) useAppStore.getState().logout();
          navigate(loginPath, { replace: true });
        }}>返回验证码登录</button>
      </form>
    </main>
  </>;
}
