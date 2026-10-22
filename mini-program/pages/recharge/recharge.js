import { getCustomerPublic } from '../../api/customer';
import { getCustomerId } from '../../utils/storage';
import { ensureLogin } from '../../utils/auth';

Page({
  data: { balanceText: '0.00' },
  async onShow() {
    const customerId = getCustomerId();
    if (!customerId) {
      ensureLogin({ content: '登录后即可查看储值余额' });
      return;
    }
    try {
      const customer = await getCustomerPublic(customerId);
      this.setData({ balanceText: Number(customer?.storedValueBalance || 0).toFixed(2) });
    } catch (_err) {
      wx.showToast({ title: '余额加载失败，请重试', icon: 'none' });
    }
  },
  goBack() { wx.navigateBack(); },
});
