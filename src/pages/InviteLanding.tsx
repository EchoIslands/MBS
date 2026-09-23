import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Gift, User, Phone } from 'lucide-react';
import { getApiBase } from '../../shared/api-base';

const API_BASE_URL = getApiBase();

interface CouponInfo {
  id: string;
  name: string;
  type: string;
  value: number;
  minOrderAmount: number;
  validDays: number;
}

interface InviteInfo {
  referralId: string;
  referrerName: string;
  shopId: string;
  coupon: CouponInfo | null;
  alreadyClaimed: boolean;
}

interface ClaimedCoupon {
  couponName?: string;
  value?: number;
  minOrderAmount?: number;
  validEnd?: string;
}

export default function InviteLanding() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ref = searchParams.get('ref');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimedCoupon, setClaimedCoupon] = useState<ClaimedCoupon | null>(null);

  useEffect(() => {
    if (!ref) {
      setLoading(false);
      setError('无效的邀请链接');
      return;
    }
    loadInviteInfo();
  }, [ref]);

  const loadInviteInfo = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_BASE_URL}/referrals/check-code?ref=${encodeURIComponent(ref || '')}`);
      const data = await res.json();
      if (data.success) {
        setInfo(data.data);
      } else {
        setError(data.error || '邀请信息加载失败');
      }
    } catch (err) {
      setError('邀请信息加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone.trim())) {
      alert('请输入正确的手机号');
      return;
    }
    try {
      setClaiming(true);
      const res = await fetch(`${API_BASE_URL}/referrals/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, phone: phone.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('mbs_customer_id', data.data.customerId);
        setClaimed(true);
        setClaimedCoupon(data.data as ClaimedCoupon);
      } else {
        alert(data.error || '领取失败');
      }
    } catch (err) {
      alert('领取失败');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 text-center text-red-500">
          {error}
        </div>
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl text-center overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800">领取成功</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="text-5xl">🎉</div>
            <p className="text-gray-600">恭喜你获得 {claimedCoupon?.couponName || '新人优惠券'}</p>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-indigo-600">¥{claimedCoupon?.value || 0}</div>
              <div className="text-sm text-gray-500">满 {claimedCoupon?.minOrderAmount || 0} 元可用</div>
            </div>
            <button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors"
              onClick={() => navigate(`/customer/shop/${info?.shopId || 'shop1'}`)}
            >
              去预约体验
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 text-center border-b border-gray-100">
          <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
            <Gift className="h-8 w-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">{info?.referrerName || '会员'} 送你一份新人礼</h2>
        </div>
        <div className="p-6 space-y-6">
          {info?.coupon && (
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white text-center">
              <div className="text-4xl font-bold">¥{info.coupon.value}</div>
              <div className="text-lg font-medium mt-2">{info.coupon.name}</div>
              <div className="text-sm opacity-90 mt-1">满 {info.coupon.minOrderAmount} 元可用</div>
              <div className="text-xs opacity-80 mt-1">领取后 {info.coupon.validDays} 天内有效</div>
            </div>
          )}

          {info?.alreadyClaimed ? (
            <div className="text-center text-red-500 py-4">该优惠券已被领取</div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm sm:text-base"
                    type="tel"
                    placeholder="请输入手机号"
                    maxLength={11}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm sm:text-base"
                    placeholder="称呼（选填）"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
              <button
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center"
                onClick={handleClaim}
                disabled={claiming}
              >
                {claiming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {claiming ? '领取中...' : '立即领取'}
              </button>
            </>
          )}

          <div className="text-xs text-gray-400 text-center">
            领取即表示同意《用户协议》和《隐私政策》
          </div>
        </div>
      </div>
    </div>
  );
}
