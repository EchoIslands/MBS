import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Search, Share2, Sparkles, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { Booking, Review } from '../../../shared/types';
import { bookingApi, reviewApi } from '../../api';
import { CustomerHeader } from '../../components/CustomerPage';
import { useAppStore } from '../../store';

const stars = [1, 2, 3, 4, 5];
const profile = '/customer/profile';

function Score({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <fieldset>
    <legend className="font-semibold">{label} <span className="ml-2 text-[#a8582f]">{value}</span></legend>
    <div className="mt-2 flex justify-between gap-1 rounded-xl bg-[#fff8f0] p-2">
      {stars.map(star => <div key={star} className="relative h-11 w-11 text-center text-3xl leading-[44px]">
        <span aria-hidden="true" className="text-[#dfd5cc]">★</span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 text-[#a8582f]"
          style={{ clipPath: 'inset(0 ' + (Math.max(0, Math.min(1, star - value)) * 100) + '% 0 0)' }}>★</span>
        {[star - 0.5, star].map((score, index) => <button key={score} type="button"
          aria-label={label + ' ' + score + ' 星'} aria-pressed={score === value}
          className={'absolute inset-y-0 w-1/2 rounded ' + (index ? 'right-0' : 'left-0')}
          onClick={() => onChange(score)} />)}
      </div>)}
    </div>
  </fieldset>;
}

function ScoreSummary({ value }: { value: number }) {
  return <p className="my-2 flex flex-wrap justify-center gap-1">
    {stars.map(star => <span key={star} aria-hidden="true" className={star <= value ? 'text-[#a8582f]' : 'text-[#dfd5cc]'}>★</span>)}
    <strong className="ml-1">综合评分 {value.toFixed(1)} 分</strong>
  </p>;
}

export default function ReviewPage() {
  const { bookingId = '' } = useParams();
  const customerId = useAppStore(state => state.currentCustomer?.id);
  const [result, setResult] = useState<{ key: string; booking?: Booking; review?: Review | null; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  const [serviceScore, setServiceScore] = useState(5);
  const [stylistScore, setStylistScore] = useState(5);
  const [serviceComment, setServiceComment] = useState('');
  const [stylistComment, setStylistComment] = useState('');
  const [aware, setAware] = useState<boolean>();
  const [comment, setComment] = useState('');
  const [submittedKey, setSubmittedKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const pending = useRef(false);
  const key = [customerId, bookingId, attempt].join('/');
  const current = result?.key === key ? result : undefined;
  const booking = current?.booking;
  const review = current?.review;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const booking = await bookingApi.getBooking(bookingId);
        if (!booking || booking.customerId !== customerId) throw new Error('找不到此预约');
        const review = booking.status === 'completed' ? await reviewApi.getReviewByBookingId(bookingId) : null;
        if (active) setResult({ key, booking, review });
      } catch (err) {
        if (active) setResult({ key, error: err instanceof Error ? err.message : '评价信息加载失败' });
      }
    })();
    return () => { active = false; };
  }, [bookingId, customerId, key]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!booking || booking.status !== 'completed' || !customerId || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await reviewApi.createReview({
        shopId: booking.shopId, customerId, bookingId: booking.id, stylistId: booking.barberId || booking.stylistId,
        serviceScore, stylistScore, serviceComment, stylistComment, isAwareOfMembershipBenefits: aware ?? true, comment,
      });
      setSubmittedKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!booking) return;
    const shareUrl = new URL('/s/' + encodeURIComponent(booking.shopId), window.location.origin).href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus('链接已复制');
    } catch {
      setCopyStatus(shareUrl);
    }
  };

  return <>
    <CustomerHeader title="发表评价" backTo={profile} />
    <main className="customer-body space-y-3">
      {!current && <section className="customer-card flex items-center gap-2" role="status"><Search size={20} />评价信息加载中…</section>}
      {current?.error && <section className="customer-card space-y-3"><p role="alert">{current.error}</p><button type="button" className="customer-secondary" onClick={() => setAttempt(value => value + 1)}>重新加载</button></section>}
      {booking && booking.status !== 'completed' && <section className="customer-card space-y-3 text-center">
        <AlertCircle className="mx-auto text-[#a8582f]" /><h2 className="font-bold">服务完成后才能进行评价</h2>
        <p className="text-sm">完成到店服务后，欢迎回来分享您的体验</p><Link className="customer-primary" to={profile}>返回个人中心</Link>
      </section>}
      {review && <section className="customer-card space-y-3 text-center">
        <CheckCircle className="mx-auto text-green-700" /><h2 className="font-bold">您已经评价过这次服务了</h2>
        <ScoreSummary value={Number(review.overallScore ?? 0)} />
        {review.comment && <p className="whitespace-pre-wrap break-words rounded-xl bg-[#fff8f0] p-3 text-sm">{review.comment}</p>}
        <Link className="customer-primary" to={profile}>返回个人中心</Link>
      </section>}
      {booking?.status === 'completed' && !review && submittedKey !== key && <>
        <section className="customer-card space-y-3">
          <div className="flex gap-3"><UserRound className="shrink-0 text-[#a8582f]" /><div>
            <h2 className="font-bold">{booking.barberName || booking.stylistName || '发型师'} · {booking.shopName || '店铺'}</h2>
            <p className="text-sm">{booking.serviceName || '服务'} · ¥{booking.price ?? 0}</p>
          </div></div>
          <p className="flex items-center gap-2 rounded-xl bg-[#fff4df] p-2 text-sm"><Sparkles size={16} />您的评价将帮助其他顾客做出更好的选择</p>
        </section>
        <form onSubmit={submit} className="customer-card space-y-4">
          <Score label="本次店铺服务评价" value={serviceScore} onChange={setServiceScore} />
          <textarea aria-label="店铺服务评价" placeholder="对本次店铺服务进行补充描述（可选）" rows={2} maxLength={300}
            className="w-full rounded-xl border border-[#ecdccd] bg-[#fffaf4] p-3 text-sm" value={serviceComment} onChange={event => setServiceComment(event.target.value)} />
          <Score label="本次发型师服务评价" value={stylistScore} onChange={setStylistScore} />
          <textarea aria-label="发型师服务评价" placeholder="对本次发型师服务进行补充描述（可选）" rows={2} maxLength={300}
            className="w-full rounded-xl border border-[#ecdccd] bg-[#fffaf4] p-3 text-sm" value={stylistComment} onChange={event => setStylistComment(event.target.value)} />
          <fieldset>
            <legend className="mb-2 font-semibold">您是否知晓店铺会员制度、近期优惠活动？</legend>
            <div className="flex gap-2">
              <button type="button" className={aware !== false ? 'customer-primary' : 'customer-secondary'} aria-pressed={aware !== false} onClick={() => setAware(true)}>是，了解</button>
              <button type="button" className={aware === false ? 'customer-primary' : 'customer-secondary'} aria-pressed={aware === false} onClick={() => setAware(false)}>否，不清楚</button>
            </div>
            {aware === undefined && <p className="mt-2 text-sm text-[#71665d]">未选择时默认按“是，了解”提交</p>}
          </fieldset>
          <label className="block font-semibold">说点什么（可选）
            <textarea placeholder="分享您的服务体验、发型建议等…" rows={3} maxLength={500}
              className="mt-2 w-full rounded-xl border border-[#ecdccd] bg-[#fffaf4] p-3 text-sm font-normal" value={comment} onChange={event => setComment(event.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={saving} className="customer-primary w-full">{saving ? '提交中…' : '提交评价'}</button>
        </form>
      </>}
      {submittedKey === key && <>
        <section className="customer-card text-center"><CheckCircle size={32} className="mx-auto mb-3 text-green-700" />
          <h2 className="font-bold">评价提交成功，感谢您的反馈！</h2><ScoreSummary value={(serviceScore + stylistScore) / 2} />
          {[serviceComment, stylistComment, comment].some(text => text.trim()) && <p className="text-sm text-gray-600">文字内容将在门店审核后公开。</p>}
        </section>
        <section className="customer-card space-y-3"><h2 className="flex items-center gap-2 font-bold"><Share2 size={18} />分享您的体验给好友</h2>
          <button type="button" className="customer-primary w-full" onClick={() => void copy()}>复制店铺链接</button>
          {copyStatus && <p role="status" className="break-all text-sm">{copyStatus}</p>}
        </section>
        <Link className="customer-secondary w-full" to={profile}>返回个人中心</Link>
      </>}
    </main>
  </>;
}
