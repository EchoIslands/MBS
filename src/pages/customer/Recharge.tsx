
import { useEffect, useState } from 'react';
import { CustomerHeader } from '../../components/CustomerPage';
import { customerApi } from '../../api';
import { useAppStore } from '../../store';

export default function Recharge() {
  const customer = useAppStore(state => state.currentCustomer);
  const customerId = customer?.id;
  const [balance, setBalance] = useState<{ customerId: string; value: number }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!customerId) return;
    let active = true;
    setFailed(false);
    customerApi.getMyProfile(customerId).then(data => {
      if (active) setBalance({ customerId, value: Number(data.storedValueBalance ?? data.balance) || 0 });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt, customerId]);
  const amount = balance && balance.customerId === customerId ? balance.value.toFixed(2) : '—';

  return <>
    <CustomerHeader title="储值余额" backTo="/customer/profile" />
    <main className="customer-body space-y-3">
      <section className="customer-card customer-invite-entry py-6 text-center"><h2 className="text-sm">当前储值余额</h2><p className="mt-2 text-3xl font-bold text-[#805536]">¥{amount}</p></section>
      {failed && <button type="button" className="customer-secondary w-full" onClick={() => setAttempt(value => value + 1)}>余额读取失败，点击重试</button>}
      <section className="customer-card space-y-2"><h2 className="font-bold">充值办理说明</h2><p className="text-sm">线上自助充值暂未开放，请联系门店办理。</p><p className="text-sm">已有储值余额可正常使用。</p></section>
    </main>
  </>;
}
