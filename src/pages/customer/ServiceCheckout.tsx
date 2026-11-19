
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bookingApi, shopApi } from '../../api';
import { useAppStore } from '../../store';
import { CustomerHeader } from '../../components/CustomerPage';
import { calcDiscountedItemPriceForCustomer, calcStockholderDiscountedPrice, getEffectivePurchaseVIPLevel, getEffectiveStoredValueLevel, getPurchaseVIPLabel, getStoredValueLabel } from '../../lib/membership';
import { StoredValueLevel, type Booking, type Shop } from '../../../shared/types';

const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' });
const labels = { pending: '待确认', confirmed: '已确认', completed: '已完成', cancelled: '已取消' };
const money = (amount: number) => '¥' + amount.toFixed(2);

export default function ServiceCheckout() {
  const { bookingId = '' } = useParams();
  const customer = useAppStore(state => state.currentCustomer);
  const customerId = customer?.id;
  const [attempt, setAttempt] = useState(0);
  const key = customerId + '/' + bookingId + '/' + attempt;
  const [result, setResult] = useState<{ key: string; booking?: Booking; shop?: Shop; error?: string }>();
  useEffect(() => {
    if (!bookingId || !customerId) return;
    let active = true;
    bookingApi.getBooking(bookingId).then(async booking => {
      if (!booking || booking.customerId !== customerId) throw new Error('预约不存在或不属于当前账号');
      if (!active) return;
      setResult({ key, booking });
      if (booking.shopId) {
        const shop = await shopApi.getPublicShop(booking.shopId).catch(() => undefined);
        if (active && shop) setResult({ key, booking, shop });
      }
    }).catch(error => { if (active) setResult({ key, error: error instanceof Error ? error.message : '预约信息读取失败' }); });
    return () => { active = false; };
  }, [key, bookingId, customerId]);
  const current = result?.key === key ? result : undefined;
  const booking = current?.booking;
  const original = booking?.price == null ? null : Number(booking.price);
  const validPrice = original !== null && Number.isFinite(original) && original >= 0;
  const memberPrice = validPrice ? calcDiscountedItemPriceForCustomer(original, customer, 'service') : 0;
  const vipPrice = validPrice ? calcDiscountedItemPriceForCustomer(original, customer && { ...customer, storedValueLevel: StoredValueLevel.NONE }, 'service') : 0;
  const shareholder = validPrice && current?.shop ? calcStockholderDiscountedPrice(original, customer, current.shop, 'service') : null;
  const shareholderApplied = !!shareholder?.hasDiscount && shareholder.price <= memberPrice;
  const finalPrice = shareholderApplied ? shareholder.price : memberPrice;
  const vip = getEffectivePurchaseVIPLevel(customer || undefined);
  const stored = getEffectiveStoredValueLevel(customer || undefined);
  const balance = Number(customer?.storedValueBalance ?? customer?.balance ?? 0);
  const rate = validPrice && original > 0 ? (finalPrice / original * 10).toFixed(2) : '10.00';
  return <>
    <CustomerHeader title="结算" backTo="/customer/profile" />
    <main className="customer-body space-y-3 pb-24">
      <section className="customer-card customer-invite-entry"><h2 className="text-lg font-bold">支付结算</h2><p className="mt-1 text-sm">到店服务完成后由店员确认收款</p></section>
      {!current && <p className="customer-card" role="status">预约信息加载中…</p>}
      {current?.error && <section className="customer-card space-y-3"><p role="alert">{current.error}</p><button type="button" className="customer-secondary" onClick={() => setAttempt(value => value + 1)}>重新加载</button></section>}
      {booking && <>
        <section className="customer-card"><h2 className="mb-3 font-bold">预约信息 <small className="text-[#805536]">{labels[booking.status]}</small></h2>
          <dl className="customer-details"><dt>服务项目</dt><dd>{booking.serviceName || '预约服务'}</dd>
            <dt>预约时间</dt><dd>{Number.isFinite(+new Date(booking.scheduledTime)) ? formatter.format(new Date(booking.scheduledTime)) : '待核对'}</dd>
            <dt>发型师</dt><dd>{booking.stylistName || booking.barberName || '待安排'}</dd><dt>店铺</dt><dd>{booking.shopName || '门店'}</dd>
            {!!booking.queueNumber && <><dt>排队号</dt><dd>#{booking.queueNumber}</dd></>}
          </dl></section>
        {customer && <section className="customer-card customer-invite-entry space-y-2"><h2 className="font-bold">{customer.name || '尊贵的顾客'}</h2>
          <p className="text-sm">{getPurchaseVIPLabel(vip)} {stored !== StoredValueLevel.NONE && '· ' + getStoredValueLabel(stored)}</p>
          <dl className="customer-details"><dt>当前折扣</dt><dd>{rate} 折</dd><dt>储值余额</dt><dd>{money(balance)}</dd></dl></section>}
        {validPrice && <section className="customer-card space-y-3"><h2 className="font-bold">价格明细</h2>
          <dl className="customer-details"><dt>服务原价</dt><dd>{money(original)}</dd>
            {shareholderApplied ? <><dt>股东折扣</dt><dd>已享股东价</dd></> : <>
              {vipPrice < original && <><dt>{getPurchaseVIPLabel(vip)}</dt><dd>-{money(original - vipPrice)}</dd></>}
              {memberPrice < vipPrice && <><dt>{getStoredValueLabel(stored)} 折上折</dt><dd>-{money(vipPrice - memberPrice)}</dd></>}
            </>}
            <dt>预计实付</dt><dd><strong>{money(finalPrice)}</strong></dd>
          </dl></section>}
        <section className="customer-card space-y-2"><h2 className="font-bold">支付方式</h2>
          <p className="text-sm">储值余额支付 · {balance > 0 ? '可用余额 ' + money(balance) : '当前无储值余额'}</p><p className="text-sm">到店支付 · 由店员在收银台完成结算</p></section>
        <section className="customer-card"><h2 className="font-bold">温馨提示</h2><p className="mt-2 text-sm">这里可查看预约与预估金额。服务完成后，由门店店员确认实际金额并收款。</p></section>
        <section className="booking-submit fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t px-4 pt-2 !pb-[calc(8px+env(safe-area-inset-bottom))]"><span>预计实付 <strong className="text-[#805536]">{validPrice ? money(finalPrice) : '由门店确认'}</strong></span>
          <Link to={'/customer/queue/' + encodeURIComponent(booking.id)} state={{ customerBack: true }} className="customer-primary">查看排队</Link></section>
      </>}
    </main>
  </>;
}
