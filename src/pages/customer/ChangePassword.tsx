import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { customerApi } from '../../api';
import { useAppStore, restoreCustomerSession } from '../../store';

export default function ChangePassword() {
  const customer = useAppStore(state => state.currentCustomer);
  const navigate = useNavigate();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!customer) return <Navigate to="/customer/login" replace />;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const { currentPassword, newPassword, confirmPassword } = values;
    if (!/^[0-9]{6}$/.test(currentPassword) || !/^[0-9]{6}$/.test(newPassword) || newPassword !== confirmPassword || newPassword === '123456' || newPassword === currentPassword) {
      setError('请填写原密码，并设置不同于原密码及 123456 的六位数字密码，两次输入须一致'); return;
    }
    setSaving(true); setError('');
    try {
      await customerApi.changePassword(customer.id, currentPassword, newPassword, confirmPassword);
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await restoreCustomerSession();
      navigate('/customer/shop/' + (customer.shopId || 'shop1'), { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : '修改失败'); }
    finally { setSaving(false); }
  };
  return <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4"><form onSubmit={submit} className="bg-white rounded-2xl p-6 max-w-md w-full space-y-5">
    <h1 className="text-2xl font-bold text-gray-800">为了账户安全，请修改密码</h1>
    <p className="text-sm text-gray-500">请先修改初始密码，再使用其他功能。修改密码后，线上支付仍需门店确认顾客本人。</p>
    {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((field, index) => <label key={field} className="block text-sm text-gray-700">{['原六位数字密码', '新六位数字密码', '再次输入新密码'][index]}<input aria-label={['原六位数字密码', '新六位数字密码', '再次输入新密码'][index]} type="password" inputMode="numeric" maxLength={6} autoComplete={index === 0 ? 'current-password' : 'new-password'} value={values[field]} onChange={event => setValues({ ...values, [field]: event.target.value.replace(/[^0-9]/g, '').slice(0, 6) })} className="block w-full border rounded-xl p-3 mt-2" /></label>)}
    {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
    <button disabled={saving} className="w-full bg-blue-600 text-white rounded-xl py-3 disabled:opacity-60">{saving ? '保存中...' : '保存新密码'}</button>
    <p className="text-xs text-gray-500">忘记密码？请联系门店重置。</p>
  </form></div>;
}
