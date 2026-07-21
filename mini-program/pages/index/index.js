import { getShop } from '../../api/shop';
import { getCustomerId, setRouteParams } from '../../utils/storage';

Page({
  data: {
    shop: null,
    stylists: [],
    displayTags: [],
    loading: true,
    error: '',
    showLogin: false,
    pendingServiceId: '',
  },

  async onLoad() {
    await this.loadShop();
  },

  isStylist(e) {
    if (e.role) return e.role === 'stylist';
    const title = e.title || '';
    return /发型师|造型师|总监|设计师|老师|剪发|烫染|护理/.test(title);
  },

  async loadShop() {
    this.setData({ loading: true, error: '' });
    try {
      const shop = await getShop('shop1');
      if (shop) {
        const stylists = (shop.employees || []).filter((e) => this.isStylist(e) && e.isActive !== false);
        const displayTags = (shop.services || []).slice(0, 3).map((s) => ({ id: s.id, name: s.name }));
        this.setData({
          shop,
          stylists,
          displayTags,
          loading: false,
        });
      } else {
        this.setData({ error: '店铺信息加载失败', loading: false });
      }
    } catch (err) {
      console.error('加载店铺失败:', err);
      this.setData({ error: '网络错误，请稍后重试', loading: false });
    }
  },

  goToProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  goToProducts() {
    wx.showToast({ title: '商品商城开发中', icon: 'none' });
  },

  goToBooking() {
    if (!getCustomerId()) {
      this.setData({ showLogin: true });
      return;
    }
    wx.navigateTo({ url: '/pages/booking/booking' });
  },

  onServiceTap(e) {
    const serviceId = e.currentTarget.dataset.id;
    if (!getCustomerId()) {
      this.setData({ showLogin: true, pendingServiceId: serviceId });
      return;
    }
    this.goToBookingWithService(serviceId);
  },

  goToBookingWithService(serviceId) {
    setRouteParams({ serviceId });
    wx.navigateTo({
      url: '/pages/booking/booking',
    });
  },

  onLoginClose() {
    this.setData({ showLogin: false, pendingServiceId: '' });
  },

  onLoginSuccess() {
    const { pendingServiceId } = this.data;
    this.setData({ showLogin: false });
    if (pendingServiceId) {
      this.goToBookingWithService(pendingServiceId);
      this.setData({ pendingServiceId: '' });
    } else {
      wx.navigateTo({ url: '/pages/booking/booking' });
    }
  },
});
