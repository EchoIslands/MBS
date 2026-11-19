
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getApiBase, http } from '../../../shared/api-base';
import type { CustomerWechatPaymentOrder } from '../../../shared/types';
import { CustomerHeader } from '../../components/CustomerPage';
import { useAppStore } from '../../store';

const statuses = { paid: '微信已收款', pending: '尚未核实收款', closed: '此支付单已关闭', review: '收款待门店核对' };
const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' });
const formatTime = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? clock.format(new Date(value)) : '未记录';
const money = (amount: number) => '¥' + Number(amount).toFixed(2);

export default function PaymentOrder() {
  const [params] = useSearchParams();
  const orderNo = params.get('outTradeNo') || '';
  const id = useAppStore(state => state.currentCustomer?.id);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; order?: CustomerWechatPaymentOrder; error?: string }>();
  const valid = /^[A-Za-z0-9_-]{6,32}$/.test(orderNo);
  const key = id + '/' + orderNo + '/' + attempt;
  useEffect(() => {
    if (!valid || !id) return;
    let active = true;
    http<{ data: CustomerWechatPaymentOrder }>(getApiBase() + '/customer-payment-orders/' + encodeURIComponent(orderNo)).then(response => {
      const data = response?.data;
      if (data?.outTradeNo !== orderNo || !Array.isArray(data.items)) throw new Error('订单信息不完整，请重试');
      if (active) setResult({ key, order: data });
    }).catch(error => { if (active) setResult({ key, error: error instanceof Error ? error.message : '订单加载失败，请重试' }); });
    return () => { active = false; };
  }, [id, key, orderNo, valid]);
  const current = result?.key === key ? result : undefined;
  const order = current?.order;
  const error = valid ? current?.error : '订单链接无效，请从微信订单入口重新打开';

  return <>
    <CustomerHeader title="微信订单详情" backTo="/customer/profile" />
    <main className="customer-body space-y-3">
      {error && <section className="customer-card space-y-2"><p role="alert">{error}</p>{valid && <button type="button" className="customer-secondary" onClick={() => setAttempt(value => value + 1)}>重新读取</button>}</section>}
      {!order && !error && <p className="customer-card" role="status">正在读取订单…</p>}
      {order && <>
        <section className="customer-card space-y-2"><h2 className="font-bold">{statuses[order.status] || '状态待核对'}</h2>
          <p className="text-2xl font-bold text-[#805536]">{money(order.amount)}</p><p className="text-sm text-gray-600">订单金额（元），收款结果以微信核实记录为准</p></section>
        <section className="customer-card space-y-2"><h2 className="font-bold">商品／服务明细</h2>
          {order.items.map((item, index) => <div className="flex justify-between gap-3 text-sm" key={index}><span>{item.name} ×{item.quantity}</span><span>{money(item.total)}</span></div>)}
          {!order.items.length && <p className="text-sm text-gray-600">历史明细未记录，请联系门店核对</p>}</section>
        <section className="customer-card"><dl className="customer-details">
          <dt>结算单号</dt><dd>{order.settlementId}</dd><dt>商户支付单号</dt><dd>{order.outTradeNo}</dd>
          {order.transactionId && <><dt>微信交易号</dt><dd>{order.transactionId}</dd></>}
          <dt>订单创建时间</dt><dd>{formatTime(order.createdAt)}</dd><dt>支付单创建时间</dt><dd>{formatTime(order.paymentCreatedAt)}</dd>
          <dt>微信支付成功时间</dt><dd>{order.paidAt ? formatTime(order.paidAt) : '尚无微信核实成功时间'}</dd>
        </dl><p className="mt-3 text-xs text-gray-600">以上时间均为北京时间。退款申请及进度请查看退款管理。</p></section>
        <Link className="customer-primary block text-center" to="/customer/refund" state={{ customerBack: true }}>退款管理</Link>
      </>}
    </main>
  </>;
}
