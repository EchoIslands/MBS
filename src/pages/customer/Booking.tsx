
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clock, Scissors, Sparkles, UserRound } from 'lucide-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { bookingApi, shopApi } from '../../api';
import { useAppStore } from '../../store';
import { CustomerHeader } from '../../components/CustomerPage';
import CustomerImage from '../../components/CustomerImage';
import { calcDiscountedItemPriceForCustomer, calcStockholderDiscountedPrice, getStockholderBenefitSummary } from '../../lib/membership';
import { bookingSlots } from '../../../shared/lib/bookingHours';
import { sortStylistsByRank, stylistRank } from '../../../shared/lib/stylistOrder';
import type { Booking, Employee, Shop } from '../../../shared/types';

const DAY = 86400000;
const BEIJING = 8 * 3600000;
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const bookingInstant = (day: string, time: string) => new Date(day + 'T' + time + ':00+08:00');

function bookingDays(now: number) {
  return Array.from({ length: 15 }, (_, index) => {
    const day = new Date(now + BEIJING + index * DAY);
    return { day: day.toISOString().slice(0, 10), label: (day.getUTCMonth() + 1) + '月' + day.getUTCDate() + '日', weekday: weekdays[day.getUTCDay()] };
  });
}

function stylistBooked(stylist: Employee, start: number, duration: number, rows: Booking[]) {
  return rows.some(row => {
    if (!['confirmed', 'pending'].includes(row.status) || (row.stylistId !== stylist.id && row.barberId !== stylist.id)) return false;
    const begin = new Date(row.scheduledTime).getTime();
    const end = row.scheduledEndTime ? new Date(row.scheduledEndTime).getTime() : begin + (row.plannedDurationMinutes || 30) * 60000;
    return begin < start + duration * 60000 && end > start;
  });
}

type Availability = { key: string; rows?: Booking[]; error?: boolean };
const EMPTY_ROWS: Booking[] = [];

export default function BookingPage() {
  const { shopId = 'shop1' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const customer = useAppStore(state => state.currentCustomer);
  const [now, setNow] = useState(Date.now);
  const dates = bookingDays(now);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopError, setShopError] = useState(false);
  const [shopRetry, setShopRetry] = useState(0);
  const [availability, setAvailability] = useState<Availability>();
  const [retry, setRetry] = useState(0);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(() => params.get('date') || '');
  const day = dates.some(item => item.day === date) ? date : dates[0].day;
  const [timeChoice, setTimeChoice] = useState(() => params.get('time') || '');
  const [stylistId, setStylistId] = useState(() => params.get('stylistId') || '');
  const [stylistProfile, setStylistProfile] = useState<Employee | null>(null);
  const [notes, setNotes] = useState(() => typeof location.state?.hairstyle === 'string' ? '试发型偏好：' + location.state.hairstyle.slice(0, 30) : '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const busy = useRef(false);
  const dateStrip = useRef<HTMLDivElement>(null);
  const lookupKey = shopId + '/' + day + '/' + retry;
  const result = lookupKey === availability?.key ? availability : undefined;
  const rows = result?.rows ?? EMPTY_ROWS;

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);

  useEffect(() => {
    let active = true;
    setShopError(false);
    shopApi.getPublicShop(shopId).then(data => {
      if (active) setShop(data);
    }).catch(() => { if (active) setShopError(true); });
    return () => { active = false; };
  }, [shopId, shopRetry]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    bookingApi.getPublicAvailability(shopId, day, controller.signal).then(data => {
      if (active) setAvailability({ key: lookupKey, rows: data });
    }).catch(() => { if (active) setAvailability({ key: lookupKey, error: true }); });
    return () => { active = false; controller.abort(); };
  }, [shopId, day, lookupKey]);

  const activeShop = shop?.id === shopId ? shop : null;
  const service = activeShop?.services.find(item => item.id === serviceId) ??
    activeShop?.services.find(item => item.id === params.get('serviceId')) ?? activeShop?.services[0];
  const stylists = sortStylistsByRank((activeShop?.employees ?? []).filter(item => item.isActive !== false &&
    (item.role === 'shop_manager' || item.role === 'stylist' || (!item.role && /发型师|造型师|总监|设计师|老师|剪发|烫染|护理/.test(item.title || '')))));
  const eligible = (item: Employee) => {
    const manager = item.role === 'shop_manager';
    if (service?.requiresShopManager) return manager;
    if (service?.requiresGoldStylist) return manager || item.isGoldStylist === true;
    return true;
  };
  const duration = service?.duration || 30;
  const eligibleStylists = stylists.filter(eligible);
  const slots = result?.rows && activeShop ? bookingSlots(day, activeShop.openingHours)
    .filter(time => +bookingInstant(day, time) > now)
    .map(time => ({ time, full: eligibleStylists.every(person => stylistBooked(person, +bookingInstant(day, time), duration, rows)) })) : [];
  const time = slots.find(slot => slot.time === timeChoice && !slot.full)?.time ?? slots.find(slot => !slot.full)?.time ?? '';
  const available = (item: Employee) => !!time && eligible(item) && !stylistBooked(item, +bookingInstant(day, time), duration, rows);
  const bookingCount = (item: Employee) => rows.filter(row => row.status !== 'cancelled' && (row.stylistId === item.id || row.barberId === item.id)).length;
  const fastest = stylists.filter(available).sort((left, right) => bookingCount(left) - bookingCount(right))[0];
  const selectedStylist = stylists.find(item => item.id === stylistId && available(item));
  const stockholder = getStockholderBenefitSummary(customer, activeShop);

  function priceFor(price: number) {
    return Math.min(calcDiscountedItemPriceForCustomer(price, customer, 'service'), calcStockholderDiscountedPrice(price, customer, activeShop).price);
  }

  function chooseDay(value: string, reveal = false) {
    if (!dates.some(item => item.day === value)) return;
    setDate(value);
    setTimeChoice('');
    setFormError('');
    if (reveal) {
      const chip = dateStrip.current?.querySelector<HTMLButtonElement>('[data-day="' + value + '"]');
      if (chip && dateStrip.current) dateStrip.current.scrollTo({ left: Math.max(0, chip.offsetLeft - 12), behavior: 'smooth' });
    }
  }

  async function submit() {
    if (busy.current || !result?.rows) return;
    const target = selectedStylist ?? fastest;
    if (!service || !time || !target || +bookingInstant(day, time) <= Date.now()) {
      setFormError('请重新选择可预约的服务、时间和发型师');
      setNow(Date.now());
      return;
    }
    if (!customer) {
      const redirect = location.pathname + '?' + new URLSearchParams({ serviceId: service.id, date: day, time, stylistId: selectedStylist?.id || '' });
      navigate('/customer/login?redirect=' + encodeURIComponent(redirect), { state: { customerBack: true } });
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setFormError('');
    try {
      const booking = await bookingApi.createBooking({
        shopId, customerId: customer.id, serviceId: service.id, scheduledTime: bookingInstant(day, time).toISOString(),
        barberId: target.id, barberName: target.name, stylistId: target.id, stylistName: target.name, notes: notes.trim(),
      });
      navigate('/customer/queue/' + booking.id, { state: { customerBack: true } });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '预约失败，请稍后重试');
      setRetry(value => value + 1);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return <>
    <CustomerHeader title="预约服务" />
    <main className="customer-body space-y-3" style={activeShop ? { paddingBottom: 82 } : undefined}>
      {shopError && <section className="customer-card space-y-2"><p>店铺加载失败，请重试</p><button className="customer-secondary" onClick={() => setShopRetry(value => value + 1)}>重新加载</button></section>}
      {!activeShop && !shopError && <p className="customer-card text-center text-sm" role="status">店铺加载中…</p>}
      {activeShop && <>
        {stockholder.enabled && stockholder.isStockholder && <section className="customer-card"><h2 className="font-bold">股东专属权益</h2><p className="mt-2 text-sm">{stockholder.benefits.join(' · ')}</p></section>}
        <section className="customer-card booking-panel">
          <h2><Scissors size={17} />选择服务</h2>
          <div className="max-h-64 space-y-2 overflow-y-auto px-4 py-3" data-no-tab-swipe>
            {activeShop.services.map(item => {
              const price = priceFor(item.price);
              const stockPrice = calcStockholderDiscountedPrice(item.price, customer, activeShop);
              return <button type="button" className="booking-choice flex w-full items-start gap-2 text-left" key={item.id} disabled={submitting}
                aria-pressed={service?.id === item.id} onClick={() => { setServiceId(item.id); setFormError(''); }}>
                <span className="booking-radio" /><span className="booking-service-icon"><Scissors size={17} /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm">{item.name}</strong>
                  {item.duration > 0 && <span className="mt-1 block text-xs text-stone-600">约 {item.duration} 分钟</span>}
                  {item.description && <span className="mt-1 block text-xs text-gray-600">{item.description}</span>}</span>
                <span className="shrink-0 text-right text-[#805536]">
                  {price < item.price && <del className="block text-xs text-gray-500">¥{item.price.toFixed(2)}</del>}
                  {price < item.price && <span className="mr-1 text-[11px]">{stockPrice.hasDiscount && stockPrice.price === price ? '股东价' : '会员价'}</span>}
                  <strong className="text-sm">¥{price.toFixed(2)}</strong></span>
              </button>;
            })}
            {!activeShop.services.length && <p className="py-2 text-sm text-gray-600">暂无可用服务</p>}
          </div>
        </section>

        <section className="customer-card booking-panel">
          <h2><CalendarDays size={17} />选择日期
            <label className="booking-calendar ml-auto" data-no-tab-swipe>日历选择 ▾
              <input type="date" aria-label="日历选择" min={dates[0].day} max={dates[14].day} value={day} disabled={submitting}
                onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* The native input still handles the click. */ } }}
                onChange={event => chooseDay(event.target.value, true)} />
            </label>
          </h2>
          <p className="px-4 pt-2 text-xs leading-5 text-gray-600">已选 {day} · 可预约今天起未来14天，日期条可左右滑动</p>
          <div ref={dateStrip} className="relative flex gap-2 overflow-x-auto px-4 pb-3 pt-2" data-no-tab-swipe>
            {dates.map(item => <button type="button" key={item.day} data-day={item.day} disabled={submitting}
              className="booking-choice shrink-0 text-center text-sm" aria-pressed={day === item.day} onClick={() => chooseDay(item.day)}>
              <strong className="block">{item.label}</strong><small>{item.weekday}</small></button>)}
          </div>
        </section>

        <section className="customer-card booking-panel">
          <h2><Clock size={17} />选择到店时间</h2>
          {!result ? <p className="p-4 text-sm text-gray-600" role="status">正在读取档期…</p>
            : result.error ? <button type="button" className="m-3 customer-secondary" onClick={() => setRetry(value => value + 1)}>档期读取失败，点击重试</button>
              : !slots.length ? <p className="p-4 text-sm text-gray-600">当天已无可选时段，请选择其他日期</p>
                : <div className="grid grid-cols-4 gap-2 p-4">{slots.map(slot => <button type="button" key={slot.time} disabled={submitting || slot.full}
                  className="booking-choice !px-1 text-sm" aria-pressed={time === slot.time} onClick={() => { setTimeChoice(slot.time); setFormError(''); }}>
                  {slot.time}{slot.full && <small className="block">已满</small>}</button>)}</div>}
        </section>

        <section className="customer-card booking-panel">
          <h2><UserRound size={17} />选择发型师</h2>
          <div className="space-y-2 px-4 py-3">
            <button type="button" disabled={submitting} className="booking-choice booking-recommended flex w-full items-center gap-2 text-left"
              aria-pressed={!selectedStylist} onClick={() => setStylistId('')}>
              <span className="booking-radio" /><span className="booking-service-icon"><Sparkles size={18} /></span>
              <span><strong className="block text-sm">智能匹配 · 推荐发型师</strong>
                <span className="block text-xs leading-5 text-gray-600">按所选服务和时段推荐发型师，等待以到店现场为准</span>
                <span className="block text-xs text-[#526641]">{fastest ? fastest.name + ' · 到店后动态更新等待' : time ? '暂无可推荐发型师' : '选择可用时段后查看推荐'}</span></span>
            </button>
            <p className="py-2 text-center text-xs text-gray-600">或选择指定发型师</p>
            {stylists.map(item => <div key={item.id} className="booking-choice flex items-center gap-2" data-selected={selectedStylist?.id === item.id}>
              <button type="button" aria-label={'查看' + item.name + '资料'} className="shrink-0" onClick={() => setStylistProfile(item)}>
                <CustomerImage images={[item.avatar || '']} alt="" className="h-10 w-10 rounded-full object-cover" fallback={<UserRound size={19} />} />
              </button>
              <button type="button" aria-pressed={selectedStylist?.id === item.id} disabled={!available(item) || submitting}
                onClick={() => setStylistId(item.id)} className="min-w-0 flex-1 text-left text-sm disabled:opacity-60">
                <span className="flex flex-wrap items-center gap-2"><strong>{item.name}</strong>
                  {stylistRank(item) < 2 && <small className="rounded-full bg-amber-100 px-1.5 text-amber-900">金牌</small>}
                  {stylistRank(item) === 0 && <small className="rounded-full bg-purple-100 px-1.5 text-purple-800">店长</small>}</span>
                <span className="block text-xs text-gray-600">{item.rating || 5} 分{item.specialty ? ' · ' + item.specialty : ''}</span>
                <span className="block text-xs text-[#805536]">{!eligible(item) ? service?.requiresShopManager ? '该服务需店长' : '该服务需金牌发型师' : available(item) ? '此时段可预约，到店后确认等待' : time ? '当前时段已满' : '请先选择到店时间'}</span>
              </button>
            </div>)}
          </div>
        </section>

        <p className="px-2 text-xs leading-5 text-gray-600">每人最多保留2个未完成预约，同一天1个。提前2小时可正常取消或改期；临时变更单独记录，不直接算爽约。未到店由门店联系核实后确认，多次爽约将限制自助预约；会员与余额不受影响。</p>
        <section className="customer-card booking-panel">
          <h2><label htmlFor="booking-notes">备注（可选）</label></h2>
          <div className="p-4"><textarea id="booking-notes" maxLength={200} value={notes} onChange={event => setNotes(event.target.value)}
            placeholder="请输入您的需求或备注..." className="booking-choice min-h-20 w-full text-sm" /></div>
        </section>
        <p className="px-2 text-xs leading-5 text-gray-600">预约时间为到店时间段。到店请前台确认；暂离请登记，叫号后保留10分钟。实际等待以排队页和现场确认动态更新。</p>
      </>}
    </main>
    {activeShop && <div className="customer-fixed-above-tabs booking-submit fixed inset-x-0 z-30 border-t px-4 py-2">
      {formError && <p role="alert" className="pb-2 text-sm text-red-800">{formError}</p>}
      <div className="flex items-center justify-between gap-3">
        <span><span className="block text-xs text-gray-600">合计</span><strong className="text-xl text-[#805536]">{service ? '¥' + priceFor(service.price).toFixed(2) : '请选择服务'}</strong></span>
        <button type="button" className="customer-primary" disabled={submitting || !result?.rows || !time || !fastest} onClick={() => void submit()}>{submitting ? '正在提交…' : '确认预约'}</button>
      </div>
    </div>}
    {stylistProfile && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5" role="dialog" aria-modal="true" aria-label="发型师资料" onClick={() => setStylistProfile(null)}>
      <article className="customer-card w-full max-w-xs space-y-3 text-center" onClick={event => event.stopPropagation()}>
        <CustomerImage images={[stylistProfile.avatar || '']} alt={stylistProfile.name} className="mx-auto h-20 w-20 rounded-full object-cover" fallback={<UserRound size={32} />} />
        <h2 className="font-bold">{stylistProfile.name}</h2><p className="text-sm">{stylistProfile.title}</p><p className="text-sm">{stylistProfile.specialty}</p>
        <button type="button" className="customer-secondary w-full" onClick={() => setStylistProfile(null)}>关闭</button>
      </article>
    </div>}
  </>;
}
