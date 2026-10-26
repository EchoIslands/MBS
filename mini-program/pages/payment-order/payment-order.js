import { get } from '../../utils/api';
import { getCustomerId, getToken } from '../../utils/storage';
import { paymentOrderNumber } from '../../utils/payment-order-link';

function beijingTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '未记录';
  const d = new Date(timestamp + 8 * 3600000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

Page({
  data: { loading: false, error: '', order: null, hasPreviousPage: true },
  onLoad(options = {}) {
    this.orderNo = paymentOrderNumber({ outTradeNo: options.outTradeNo });
    this.setData({ hasPreviousPage: getCurrentPages().length > 1 });
  },
  onShow() { return this.loadOrder(); },
  onHide() { this.loadSequence = (this.loadSequence || 0) + 1; },
  onUnload() { this.onHide(); },
  async loadOrder() {
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    this.setData({ order: null, loading: false, error: '' });
    if (!this.orderNo) { this.setData({ error: '订单链接无效，请从微信订单入口重新打开' }); return; }
    if (!getCustomerId() || !getToken()) { this.goLogin(); return; }
    const customerId = getCustomerId(), token = getToken();
    this.setData({ loading: true });
    const current = () => this.loadSequence === sequence && getCustomerId() === customerId && getToken() === token;
    try {
      const result = await get('/customer-payment-orders/' + encodeURIComponent(this.orderNo));
      if (!current()) return;
      const order = result?.data;
      if (!order || order.outTradeNo !== this.orderNo || !Array.isArray(order.items)) throw new Error('订单信息不完整，请重试');
      const statusText = { paid: '微信已收款', pending: '尚未核实收款', closed: '此支付单已关闭', review: '收款待门店核对' }[order.status] || '状态待核对';
      this.setData({ loading: false, order: {
        ...order, statusText, amountText: Number(order.amount).toFixed(2),
        createdAtText: beijingTime(order.createdAt), paymentCreatedAtText: beijingTime(order.paymentCreatedAt),
        paidAtText: order.paidAt ? beijingTime(order.paidAt) : '尚无微信核实成功时间',
        items: order.items.map((item, index) => ({ ...item, rowKey: String(index), totalText: Number(item.total).toFixed(2) })),
      } });
    } catch (err) {
      if (current()) this.setData({ loading: false, error: err.message || '订单加载失败，请重试' });
    }
  },
  goLogin() { wx.reLaunch({ url: '/pages/login/login?returnOrderNo=' + this.orderNo }); },
  goRefund() { wx.navigateTo({ url: '/pages/refund/refund' }); },
  goBack() {
    const fallback = () => wx.reLaunch({ url: '/pages/profile/profile' });
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1, fail: fallback }); else fallback();
  },
});
