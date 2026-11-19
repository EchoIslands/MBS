import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { customerApi } from '../../api';
import { useAppStore, restoreCustomerSession } from '../../store';
import { CustomerHeader } from '../../components/CustomerPage';
import { customerLoginRedirect } from '../../lib/customerLoginRedirect';

const fields = {
  currentPassword: '原六位数字密码',
  newPassword: '新六位数字密码',
  confirmPassword: '再次输入新密码',
} as const;
const empty = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function ChangePassword() {
  const customer = useAppStore(state => state.currentCustomer);
  const logout = useAppStore(state => state.logout);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [values, setValues] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!customer) return <Navigate to="/customer/login" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const { currentPassword, newPassword, confirmPassword } = values;
    if (!/^[0-9]{6}$/.test(currentPassword) || !/^[0-9]{6}$/.test(newPassword) || newPassword !== confirmPassword || newPassword === '123456' || newPassword === currentPassword) {
      setError('请填写原密码，并设置不同于原密码及 123456 的六位数字密码，两次输入须一致');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await customerApi.changePassword(customer.id, currentPassword, newPassword, confirmPassword);
      setValues(empty);
      await restoreCustomerSession();
      navigate(customerLoginRedirect(params.get('redirect')) || '/customer/shop/' + (customer.shopId || 'shop1'), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <CustomerHeader title="修改密码" />
    <main className="customer-login flex items-center justify-center px-4 py-6">
      <form onSubmit={submit} className="customer-card w-full max-w-md space-y-4">
        <h2 className="text-xl font-bold">为了账户安全，请修改密码</h2>
        <p className="text-sm text-[#71665d]">请先修改初始密码，再使用其他功能。修改密码后，线上支付仍需门店确认顾客本人。</p>
        {(Object.keys(fields) as (keyof typeof fields)[]).map(field => <input
          key={field}
          aria-label={fields[field]}
          placeholder={fields[field]}
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoComplete={field === 'currentPassword' ? 'current-password' : 'new-password'}
          value={values[field]}
          onChange={event => setValues({ ...values, [field]: event.target.value.replace(/[^0-9]/g, '') })}
          className="block w-full rounded-xl border border-[#ecdccd] bg-[#fffaf4] p-3"
        />)}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={saving} className="customer-primary w-full">{saving ? '保存中…' : '保存新密码'}</button>
        <p className="text-sm text-[#71665d]">忘记密码？请联系门店重置。</p>
        <button type="button" disabled={saving} className="customer-secondary w-full" onClick={() => { logout(); navigate('/customer/login', { replace: true }); }}>退出登录</button>
      </form>
    </main>
  </>;
}
