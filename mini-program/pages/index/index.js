import { getShop } from '../../api/shop';

Page({
  data: {
    shop: null,
    loading: true,
    error: '',
  },

  async onLoad() {
    await this.loadShop();
  },

  async loadShop() {
    this.setData({ loading: true, error: '' });
    try {
      const shop = await getShop('shop1');
      if (shop) {
        this.setData({ shop, loading: false });
      } else {
        this.setData({ error: '店铺信息加载失败', loading: false });
      }
    } catch (err) {
      console.error('加载店铺失败:', err);
      this.setData({ error: '网络错误，请稍后重试', loading: false });
    }
  },

  goToBooking() {
    wx.switchTab({ url: '/pages/booking/booking' });
  },

  onServiceTap(e) {
    const serviceId = e.currentTarget.dataset.id;
    wx.switchTab({
      url: `/pages/booking/booking?serviceId=${serviceId}`,
    });
  },
});
