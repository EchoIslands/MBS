import { useEffect, useRef, useState } from 'react';
import { Clock, MessageSquare, Scissors, Share2, ShoppingBag, Star, UserRound, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { bookingApi, shopApi } from '../../api';
import { useAppStore } from '../../store';
import { sortStylistsByRank } from '../../../shared/lib/stylistOrder';
import type { Booking, Employee, Review, Shop } from '../../../shared/types';
import CustomerMembershipBenefits from '../../components/CustomerMembershipBenefits';
import CustomerImage from '../../components/CustomerImage';
import { getEffectivePurchaseVIPLevel, getEffectiveStoredValueLevel } from '../../lib/membership';
import storefront from '../../../mini-program/assets/shop/storefront.jpg';
import servicePhoto from '../../../mini-program/assets/shop/service.jpg';

const photos = [{ src: storefront, alt: '皓诗形象门头实景' }, { src: servicePhoto, alt: '皓诗形象店内服务实景' }];
const money = (value: number) => Number(value).toFixed(2);
const date = (value: string | Date) => Number.isFinite(+new Date(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai' }).format(new Date(value)) : '';

function StylistBadges({ stylist }: { stylist: Employee }) {
  const manager = stylist.role === 'shop_manager';
  return <>{(stylist.isGoldStylist || manager) && <small className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">金牌</small>}
    {manager && <small className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-800">店长</small>}</>;
}

export default function ShopDetail() {
  const { id = 'shop1' } = useParams();
  const navigate = useNavigate();
  const customer = useAppStore(state => state.currentCustomer);
  const gallery = useRef<HTMLDivElement>(null);
  const customerId = customer?.id;
  const [activeQueue, setActiveQueue] = useState<{ customerId: string; booking: Booking }>();
  const [activeImage, setActiveImage] = useState(0);
  const [shop, setShop] = useState<Shop | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stylist, setStylist] = useState<Employee | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError('');
    setShop(null);
    setReviews([]);
    shopApi.getPublicShop(id).then(value => {
      if (live) setShop(value);
    }).catch(() => { if (live) setError('门店资料读取失败，点击重试'); });
    shopApi.getShopReviews(id).then(value => { if (live) setReviews(value.slice(0, 3)); }).catch(() => {});
    return () => { live = false; };
  }, [id, attempt]);

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    const beijingDay = (value: number) => Math.floor((value + 8 * 3600000) / 86400000);
    bookingApi.getCustomerBookings(customerId, { active: true }).then(rows => {
      const entry = rows.filter(row => row.shopId === id && row.status === 'confirmed' &&
        beijingDay(+new Date(row.scheduledTime)) === beijingDay(Date.now()))
        .sort((left, right) => +new Date(left.scheduledTime) - +new Date(right.scheduledTime))[0];
      if (active) setActiveQueue(entry ? { customerId, booking: entry } : undefined);
    }).catch(() => { if (active) setActiveQueue(undefined); });
    return () => { active = false; };
  }, [customerId, id]);
  const today = activeQueue?.customerId === customerId && activeQueue?.booking.shopId === id ? activeQueue.booking : undefined;

  const stylists = sortStylistsByRank((shop?.employees ?? []).filter(item => item.isActive !== false &&
    (item.role === 'shop_manager' || item.role === 'stylist' || (!item.role && /发型师|造型师|总监|设计师|老师|剪发|烫染|护理/.test(item.title || ''))))).slice(0, 8);
  const products = (shop?.products ?? []).filter(item => item.isActive !== false).slice(0, 4);
  const member = customer && (getEffectivePurchaseVIPLevel(customer) !== 'regular' ||
    getEffectiveStoredValueLevel(customer) !== 'none' || customer.isStockholder);
  const bookingPath = '/customer/booking/' + id;
  const productsPath = '/customer/products/' + id;

  return <>
    <header className="customer-header !place-items-start !px-4"><h1>{shop?.name || '皓诗形象设计'}</h1></header>
    <main className="customer-body space-y-3">
      {today && <button type="button" className="customer-card customer-invite-entry flex w-full items-center justify-between gap-2 text-left"
        onClick={() => navigate('/customer/queue/' + encodeURIComponent(today.id), { state: { customerBack: true } })}>
        <span><strong className="block">今日预约 · 查看排队</strong><small>{today.serviceName || '今日预约'}</small></span><span aria-hidden="true">›</span>
      </button>}
      <section className="customer-card !p-0 overflow-hidden" aria-label="门店介绍">
        <div className="customer-home-gallery" data-no-tab-swipe>
          <div ref={gallery} className="flex h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
            onScroll={event => setActiveImage(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}>
            {photos.map(photo => <img key={photo.src} className="snap-start shrink-0" src={photo.src} alt={photo.alt} />)}
          </div>
          <div className="absolute inset-x-0 bottom-1 flex justify-center" aria-label="选择门店实景">
            {photos.map((photo, index) => <button type="button" key={photo.src} className="grid h-8 w-8 place-items-center"
              aria-label={photo.alt} aria-pressed={activeImage === index} onClick={() => {
                const el = gallery.current;
                if (el) el.scrollTo({ left: el.clientWidth * index, behavior: 'smooth' });
              }}><span className={'h-2 w-2 rounded-full ' + (activeImage === index ? 'bg-stone-900' : 'bg-white/70')} /></button>)}
          </div>
        </div>
        {shop ? <div className="p-4 text-sm text-gray-600">
          {shop.description && <p className="mb-3 border-b border-[#ecdfd1] pb-3 leading-6 text-gray-800">{shop.description}</p>}
          <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-y-2">
            <dt>评分</dt><dd><strong className="text-[#805536]">{shop.rating || 4.8} 分</strong> · {shop.reviewCount || reviews.length} 条评价</dd>
            <dt>地址</dt><dd>{shop.address || '暂无地址'}</dd>
            {shop.phone && <><dt>电话</dt><dd><a className="text-[#805536]" href={'tel:' + shop.phone}>{shop.phone} · 联系门店 ›</a></dd></>}
            <dt>营业时间</dt><dd>09:00–21:00</dd>
          </dl>
        </div> : error ? <button className="p-4 text-sm" type="button" onClick={() => setAttempt(value => value + 1)}>{error}</button>
          : <p className="p-4 text-sm text-gray-600" role="status">正在更新门店资料…</p>}
      </section>

      {shop && <CustomerMembershipBenefits />}
      {shop && member && <button className="customer-card customer-invite-entry flex w-full items-center gap-3 text-left" type="button"
        onClick={() => navigate('/customer/invite', { state: { customerBack: true } })}>
        <Share2 className="shrink-0 text-[#805536]" size={23} />
        <span className="min-w-0 flex-1"><strong className="block">邀请新顾客 · 一起变美</strong>
          <span className="text-xs text-stone-700">好友消费后，你可获得 {(customer.referralBonusRate || .1) * 100}% 奖励金，可用于店内消费</span></span>
        <span className="shrink-0 text-xs font-bold text-[#805536]">立即邀请 ›</span>
      </button>}

      {!!stylists.length && <section className="customer-card space-y-2">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><UserRound size={17} />发型师团队</h2>
        {stylists.map(item => <button type="button" key={item.id} onClick={() => setStylist(item)}
          className="flex w-full items-center gap-3 rounded-xl border border-[#ecdfd1] bg-[#fffaf4] p-3 text-left">
          <CustomerImage images={[item.avatar || '']} alt={item.name} className="h-12 w-12 shrink-0 rounded-full object-cover" fallback={<UserRound size={23} />} />
          <span className="min-w-0"><span className="flex flex-wrap items-center gap-1.5"><strong>{item.name}</strong><StylistBadges stylist={item} /></span>
            <span className="block text-xs text-[#805536]">☆ {item.rating || 5} 分</span>
            {item.specialty && <span className="block text-xs text-gray-600">{item.specialty}</span>}</span>
        </button>)}
      </section>}

      {!!shop?.services?.length && <section className="customer-card">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Scissors size={17} />服务项目 <span className="ml-auto text-xs font-normal text-gray-500">滑动查看更多</span></h2>
        <div className="max-h-72 space-y-2 overflow-y-auto overscroll-y-contain pr-1" data-no-tab-swipe>
          {shop.services.slice(0, 20).map(item => <button type="button" key={item.id}
            onClick={() => navigate(bookingPath + '?serviceId=' + encodeURIComponent(item.id))}
            className="flex w-full items-start gap-2 rounded-xl border border-[#ecdfd1] bg-[#fffaf4] p-3 text-left">
            <Scissors size={19} className="mt-0.5 shrink-0 text-[#99613f]" />
            <span className="flex-1"><strong className="block text-sm">{item.name}</strong>
              {item.description && <span className="block text-xs leading-5 text-gray-600">{item.description.slice(0, 120)}</span>}
              {!!item.duration && <span className="mt-1 flex items-center gap-1 text-xs text-[#805536]"><Clock size={11} />约 {item.duration} 分钟</span>}</span>
            <strong className="shrink-0 text-sm text-[#99613f]">¥{money(item.price)}</strong>
          </button>)}
        </div>
      </section>}

      {!!reviews.length && <section className="customer-card">
        <h2 className="flex items-center gap-2 font-bold"><MessageSquare size={17} />顾客评价 <span className="ml-auto text-xs font-normal text-gray-500">{reviews.length} 条</span></h2>
        {reviews.map(item => <article className="mt-3 rounded-xl bg-[#fffaf4] p-3 text-sm" key={item.id}>
          <div className="flex items-center gap-2"><strong>{item.customerName || '匿名用户'}</strong><span className="text-xs text-gray-500">{date(item.createdAt)}</span><Star size={15} className="ml-auto text-amber-600" /></div>
          <p className="mt-2">{item.comment || '用户未填写文字评价'}</p>
          {item.reply && <p className="mt-2 rounded-lg bg-[#f7eee4] p-2 text-xs">{item.replyBy || '店铺回复'} · {item.reply}</p>}
        </article>)}
      </section>}

      {!!products.length && <section className="customer-card">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><ShoppingBag size={17} />商品商城
          <button type="button" className="ml-auto text-xs font-semibold text-[#805536]" onClick={() => navigate(productsPath)}>查看全部 →</button></h2>
        <div className="grid grid-cols-2 gap-3">{products.map(item => <button type="button" key={item.id} className="min-w-0 rounded-xl bg-[#fffaf4] text-left"
          onClick={() => navigate(productsPath)}>
          <CustomerImage images={item.images} alt={item.name} className="aspect-square w-full rounded-t-xl object-cover" />
          <span className="block p-2 text-sm"><span className="block truncate">{item.name}</span><strong className="text-[#99613f]">¥{money(item.price)}</strong>
            {!!item.originalPrice && item.originalPrice > item.price && <del className="ml-1 text-xs text-gray-500">¥{money(item.originalPrice)}</del>}</span>
        </button>)}</div>
      </section>}
    </main>
    {stylist && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="发型师资料" onClick={() => setStylist(null)}>
      <section className="customer-card w-full max-w-xs text-center" role="dialog" aria-modal="true" aria-label="发型师资料" onClick={event => event.stopPropagation()}>
        <button className="ml-auto block p-1" type="button" aria-label="关闭" onClick={() => setStylist(null)}><X size={20} /></button>
        <CustomerImage images={[stylist.avatar || '']} alt={stylist.name} className="mx-auto h-24 w-24 rounded-full object-cover" fallback={<UserRound size={36} />} />
        <h2 className="mt-3 flex justify-center gap-2 font-bold">{stylist.name}<StylistBadges stylist={stylist} /></h2>
        <p className="mt-2 text-sm text-gray-600">{stylist.title}</p>
        <p className="mt-2 text-sm text-[#805536]">☆ {stylist.rating || 5} 分</p>
        {stylist.specialty && <p className="mt-3 rounded-xl bg-[#fffaf4] p-3 text-sm">擅长专长 · {stylist.specialty}</p>}
      </section>
    </div>}
  </>;
}
