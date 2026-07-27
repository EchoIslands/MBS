import { getShop, getShopReviews } from '../../api/shop';
import { getCustomerId, setRouteParams, clearCustomerId } from '../../utils/storage';

function toTwoDigits(n) {
  return String(n).padStart(2, '0');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}-${toTwoDigits(d.getMonth() + 1)}-${toTwoDigits(d.getDate())}`;
}

function buildStarList(score) {
  const rounded = Math.round(score || 0);
  return [1, 2, 3, 4, 5].map((i) => ({ key: i, filled: i <= rounded }));
}

Page({
  data: {
    shop: null,
    stylists: [],
    displayTags: [],
    products: [],
    reviews: [],
    reviewCount: 0,
    ratingStars: [],
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
        const products = (shop.products || []).filter((p) => p.isActive).slice(0, 4);
        const reviews = (await this.loadReviews(shop.id)).map((r) => ({
          ...r,
          starList: buildStarList(r.overallScore || r.rating || 0),
        }));
        this.setData({
          shop,
          stylists,
          displayTags,
          products,
          reviews,
          reviewCount: reviews.length,
          ratingStars: this.buildStars(shop.rating || 4.8),
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

  async loadReviews(shopId) {
    try {
      return await getShopReviews(shopId);
    } catch (err) {
      console.warn('[index] 加载评价失败:', err);
      return [];
    }
  },

  buildStars(rating) {
    const rounded = Math.round(rating || 0);
    return [1, 2, 3, 4, 5].map((i) => ({ key: i, filled: i <= rounded }));
  },

  goToProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          clearCustomerId();
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      },
    });
  },

  formatDate,

  goToProducts() {
    const shopId = (this.data.shop && this.data.shop.id) || 'shop1';
    wx.navigateTo({
      url: `/pages/products/products?shopId=${shopId}`,
    });
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
