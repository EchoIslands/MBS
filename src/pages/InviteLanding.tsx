
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CustomerHeader } from '../components/CustomerPage';
import { useAppStore } from '../store';
import { getApiBase, http } from '../../shared/api-base';

interface InviteInfo {
  referrerName: string;
  shopId: string;
  coupon: { name: string; value: number; minOrderAmount: number; validDays: number } | null;
  alreadyClaimed: boolean;
}

interface ClaimedCoupon {
  couponName: string;
  value: number;
  minOrderAmount: number;
  validEnd: string;
}

export default function InviteLanding() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ref = params.get('ref') || '';
  const customer = useAppStore(state => state.currentCustomer);
  const valid = /^ref_[A-Za-z0-9_]{1,28}$/.test(ref);
  const [attempt, setAttempt] = useState(0);
  const key = ref + '/' + attempt;
  const [result, setResult] = useState<{ key: string; info?: InviteInfo; error?: string }>();
  const [claimed, setClaimed] = useState<{ ref: string; customerId: string; coupon: ClaimedCoupon }>();
  const [submitting, setSubmitting] = useState(false);
  const [claimError, setClaimError] = useState('');
  const claimLock = useRef(false);

  useEffect(() => {
    if (!valid) return;
    let active = true;
    http<{ data: InviteInfo }>(getApiBase() + '/referrals/check-code?ref=' + encodeURIComponent(ref), { credentials: 'omit' })
      .then(response => {
        if (!response?.data) throw new Error('邀请信息加载失败');
        if (active) setResult({ key, info: response.data });
      }).catch(error => { if (active) setResult({ key, error: error instanceof Error ? error.message : '邀请信息加载失败' }); });
    return () => { active = false; };
  }, [key, ref, valid]);

  function goLogin() {
    navigate('/customer/login?mode=sms&returnTo=' + encodeURIComponent('/invite?ref=' + ref), { state: { customerBack: true } });
  }

  async function claim() {
    if (!valid || claimLock.current) return;
    if (!customer) { goLogin(); return; }
    claimLock.current = true;
    setSubmitting(true);
    setClaimError('');
    try {
      const response = await http<{ data: ClaimedCoupon }>(getApiBase() + '/referrals/claim', { method: 'POST', body: JSON.stringify({ ref }) });
      if (!response?.data) throw new Error('领取状态暂不可用，请重试');
      setClaimed({ ref, customerId: customer.id, coupon: response.data });
    } catch (error) {
      if ((error as { status?: number }).status === 401) { useAppStore.getState().setCurrentCustomer(null); goLogin(); return; }
      setClaimError(error instanceof Error ? error.message : '领取失败，请稍后重试');
    } finally {
      claimLock.current = false;
      setSubmitting(false);
    }
  }

  const current = result?.key === key ? result : undefined;
  const error = valid ? current?.error : '无效的邀请链接';
  const coupon = claimed?.ref === ref && claimed.customerId === customer?.id ? claimed.coupon : undefined;
  const info = current?.info;
  return <>
    <CustomerHeader title="领取新人礼" backTo="/customer" />
    <main className="customer-body">
      {error && <section className="customer-card space-y-3 text-center"><p role="alert">{error}</p>{valid &&
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="customer-primary">重试</button>}</section>}
      {!error && !info && <p className="customer-card text-center" role="status">加载中…</p>}
      {info && <section className="customer-card space-y-4 text-center">
        <div><p className="text-sm text-[#805536]">{coupon ? '🎉' : info.referrerName || '会员'}</p>
          <h2 className="mt-1 text-xl font-bold">{coupon ? '领取成功' : '送你一份新人礼'}</h2></div>
        {(coupon || info.coupon) && <div className="customer-card customer-invite-entry space-y-1">
          <p className="text-3xl font-bold text-[#805536]">¥{coupon?.value ?? info.coupon?.value}</p>
          <p className="font-semibold">{coupon?.couponName || info.coupon?.name}</p>
          <p className="text-sm">满 {coupon?.minOrderAmount ?? info.coupon?.minOrderAmount} 元可用</p>
          <p className="text-xs text-gray-600">{coupon ? '有效期至 ' + (coupon.validEnd || '以我的优惠券为准').slice(0, 10) : '领取后 ' + info.coupon?.validDays + ' 天内有效'}</p>
        </div>}
        {coupon ? <Link to={'/customer/booking/' + encodeURIComponent(info.shopId)} className="customer-primary block">去预约体验</Link>
          : info.alreadyClaimed ? <p>该优惠券已被领取</p>
            : <>
              <p className="text-sm text-gray-600">使用本人手机号验证码登录后领取，新顾客无需提前到店建档。</p>
              {claimError && <p role="alert" className="text-sm text-red-800">{claimError}</p>}
              <button type="button" className="customer-primary w-full" disabled={submitting} onClick={() => void claim()}>
                {submitting ? '领取中…' : customer ? '立即领取' : '验证码登录领取'}
              </button>
            </>}
        <p className="text-xs text-gray-600"><Link to="/customer/agreement" state={{ customerBack: true }}>用户协议</Link> · <Link to="/customer/privacy" state={{ customerBack: true }}>隐私政策</Link></p>
      </section>}
    </main>
  </>;
}
