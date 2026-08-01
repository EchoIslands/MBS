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

  async onRecharge() {
    const { customerId, shopId, selectedLevel, selectedAmount, balance } = this.data;
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
      await rechargeCustomer(customerId, shopId, selectedLevel);
      wx.showToast({ title: '充值成功', icon: 'success' });
      await this.loadCustomer();
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: err.message || '充值失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goBack() {
    wx.navigateBack();
  },
});
