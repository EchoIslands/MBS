import { getCustomerPublic, rechargeCustomer } from '../../api/customer';
import { getCustomerId } from '../../utils/storage';

const PLANS = [
  { level: 'store_500', amount: 500, discount: '9' },
  { level: 'store_1000', amount: 1000, discount: '8.5' },
  { level: 'store_2000', amount: 2000, discount: '8' },
  { level: 'store_5000', amount: 5000, discount: '7' },
];

const LEVEL_LABELS = {
  none: '非储值会员',
  store_500: '银卡储值会员',
  store_1000: '金卡储值会员',
  store_2000: '铂金储值会员',
  store_5000: '钻石储值会员',
};

const PAY_METHODS = [
  { key: 'wechat', label: '微信支付', desc: '使用微信余额或银行卡', icon: 'wallet', color: '#22c55e' },
  { key: 'store', label: '到店支付', desc: '到店后现金/转账', icon: 'mapPin', color: '#3b82f6' },
];

Page({
  data: {
    shopId: 'shop1',
    customerId: '',
    balance: 0,
    currentLevel: 'none',
    levelLabel: '',
    plans: PLANS,
    selectedLevel: 'store_500',
    selectedAmount: 500,
    payMethods: PAY_METHODS,
    payMethod: 'wechat',
    submitting: false,
  },

  onLoad(options) {
    this.setData({ shopId: options.shopId || 'shop1' });
  },

  onShow() {
    const customerId = getCustomerId();
    if (!customerId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    this.setData({ customerId });
    this.loadCustomer();
  },

  async loadCustomer() {
    const { customerId } = this.data;
    try {
      const customer = await getCustomerPublic(customerId);
      if (!customer) return;
      const currentLevel = customer.storedValueLevel || 'none';
      this.setData({
        balance: Number(customer.storedValueBalance || 0),
        currentLevel,
        levelLabel: LEVEL_LABELS[currentLevel] || '',
      });
    } catch (err) {
      console.error('[recharge] 加载顾客信息失败:', err);
    }
  },

  onSelectPlan(e) {
    const { level } = e.currentTarget.dataset;
    const plan = PLANS.find((p) => p.level === level);
    if (!plan) return;
    this.setData({ selectedLevel: level, selectedAmount: plan.amount });
  },

  onSelectPayMethod(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ payMethod: key });
  },

  // 预留微信支付：调用后端下单 -> 返回 prepay_id -> wx.requestPayment
  // 目前商户号/小程序绑定未就绪，使用 mock 支付
  async mockWechatPay(amount, customerId, storedValueLevel) {
    return new Promise((resolve) => {
      // 这里预留：真实环境需要调用后端下单接口，返回 prepay 参数
      // const prepay = await request('/api/pay/wechat', { amount, ... });
      // await wx.requestPayment({ timeStamp, nonceStr, package, signType, paySign });
      console.log(`[recharge] mock 微信支付: amount=${amount}`);
      setTimeout(resolve, 800);
    });
  },

  async onRecharge() {
    const { customerId, shopId, selectedLevel, selectedAmount, balance, payMethod } = this.data;
    if (!customerId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const plan = PLANS.find((p) => p.level === selectedLevel);
    const needPay = Math.max(0, plan.amount - balance);
    const content = needPay < plan.amount
      ? `当前余额 ¥${balance.toFixed(2)}，充值至 ¥${plan.amount} 需支付 ¥${needPay.toFixed(2)}，确认充值？`
      : `确认充值 ¥${selectedAmount}？`;

    const { confirm } = await wx.showModal({ title: '确认充值', content });
    if (!confirm) return;

    this.setData({ submitting: true });
    try {
      // 1. 支付流程（预留微信支付接口，当前为 mock）
      if (payMethod === 'wechat') {
        await this.mockWechatPay(needPay, customerId, selectedLevel);
      } else if (payMethod === 'store') {
        // 到店支付：记录待确认状态，到店后完成充值
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      // 2. 支付完成后调用后端写余额
      await rechargeCustomer(customerId, shopId, selectedLevel);

      wx.showToast({ title: '充值成功', icon: 'success' });
      await this.loadCustomer();
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      const message = err.response?.details || err.message || '充值失败';
      console.error('[recharge] 充值失败:', message, err);
      wx.showToast({ title: message.length > 20 ? message.slice(0, 20) + '...' : message, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goBack() {
    wx.navigateBack();
  },
});
