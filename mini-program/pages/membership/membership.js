import { getMembershipPlans, createMembershipOrder, checkMembershipOrder } from '../../api/membership';

function wxLoginCode() {
  return new Promise((resolve, reject) => wx.login({
    success: (result) => result.code ? resolve(result.code) : reject(new Error('微信登录凭证获取失败')),
    fail: () => reject(new Error('微信登录凭证获取失败')),
  }));
}

function wxPay(params) {
  return new Promise((resolve) => wx.requestPayment({
    timeStamp: params.timeStamp, nonceStr: params.nonceStr, package: params.package,
    signType: params.signType, paySign: params.paySign,
    success: () => resolve(), fail: () => resolve(),
  }));
}

Page({
  data: { vip: [], stored: [], currentVip: null, currentStored: null, activeOrder: null,
    busy: false, checking: false, error: '', notice: '' },
  onLoad() { this.loadPlans(); },
  onShow() { if (this.data.activeOrder?.status === 'pending') this.checkActive(); },
  async loadPlans() {
    try {
      const data = await getMembershipPlans();
      this.setData({ vip: data.vip.map((p) => ({ ...p, benefitText: p.benefits.join(' · ') })),
        stored: data.stored.map((p) => ({ ...p, benefitText: p.benefits.join(' · ') })), currentVip: data.currentVip,
        currentStored: data.currentStored, activeOrder: data.activeOrder, error: '' });
      if (data.activeOrder?.status === 'pending') await this.checkActive();
    } catch (err) { this.setData({ error: err.message || '会员方案加载失败' }); }
  },
  async checkActive() {
    const order = this.data.activeOrder;
    if (!order?.id || this.data.checking) return;
    this.setData({ checking: true });
    try {
      const updated = await checkMembershipOrder(order.id);
      this.setData({ error: '', activeOrder: updated.status === 'paid' || updated.status === 'closed' ? null : updated,
        notice: updated.status === 'paid' ? '支付已确认，会员权益已生效'
          : updated.status === 'review' ? '微信已收款，会员资料有变动，请联系门店核对，勿重复支付'
          : updated.status === 'closed' ? '原订单已关闭，可以重新选择方案' : '尚未查到支付成功，请稍后重试' });
      if (updated.status === 'paid' || updated.status === 'closed') await this.loadPlans();
    } catch (err) { this.setData({ error: err.message || '查单暂不可用，请勿重复支付' }); }
    finally { this.setData({ checking: false }); }
  },
  async resumeActive() {
    const existing = this.data.activeOrder;
    if (!existing || existing.status !== 'pending' || this.data.busy) return;
    if (existing.channel !== 'wechat_mini') { this.setData({ error: '原订单在 H5 创建，请回到原手机浏览器继续支付' }); return; }
    this.setData({ busy: true, error: '' });
    try {
      const code = await wxLoginCode();
      const order = await createMembershipOrder(existing.kind, existing.level, code);
      this.setData({ activeOrder: order });
      if (order.status !== 'pending') { await this.checkActive(); return; }
      if (!order.payParams) throw new Error('原单暂无法继续支付，请联系门店核对');
      await wxPay(order.payParams);
      await this.checkActive();
    } catch (err) { this.setData({ error: err.message || '原单暂无法继续支付' }); }
    finally { this.setData({ busy: false }); }
  },
  async choosePlan(e) {
    if (this.data.busy) return;
    const { kind, level } = e.currentTarget.dataset;
    const current = kind === 'vip' ? this.data.currentVip : this.data.currentStored;
    if (current?.active && current.level !== level) {
      wx.showModal({ title: '暂不能自助改档', content: '有效期内可原档续费，调整档位请联系门店确认价格和权益。', showCancel: false });
      return;
    }
    if (this.data.activeOrder?.status === 'review') {
      wx.showModal({ title: '请先核对已付款订单', content: '已有订单收款待核对，暂不能再次付款。', showCancel: false });
      return;
    }
    const plan = (kind === 'vip' ? this.data.vip : this.data.stored).find((p) => p.level === level);
    const price = kind === 'vip' ? plan?.price : plan?.amount;
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: kind === 'vip' ? '确认办理 / 续费 VIP' : '确认储值办理 / 续费',
      content: '微信支付 ¥' + price + '；付款成功并经微信核验后自动生效。原档续费自原到期日顺延，储值金额全额到账。',
      confirmText: '确认支付', success: (r) => resolve(r.confirm), fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ busy: true, error: '', notice: '' });
    try {
      const code = await wxLoginCode();
      const order = await createMembershipOrder(kind, level, code);
      this.setData({ activeOrder: order });
      if (order.status === 'paid' || order.status === 'review') { await this.checkActive(); return; }
      if (!order.payParams) throw new Error('微信支付参数暂不可用，请核对原订单，勿重复付款');
      await wxPay(order.payParams);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await this.checkActive();
        if (this.data.activeOrder?.status !== 'pending') break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (err) { this.setData({ error: err.message || '支付暂未完成，请核对原订单' }); }
    finally { this.setData({ busy: false }); }
  },
});
