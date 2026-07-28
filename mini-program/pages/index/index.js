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
      const rawShop = await getShop('shop1');
      if (!rawShop) {
        this.setData({ error: '店铺信息加载失败', loading: false });
        return;
      }

      // 精简店铺数据，避免 setData 传输过大
      const shop = {
        id: rawShop.id,
        name: rawShop.name || '皓诗形象设计',
        address: rawShop.address || '',
        phone: rawShop.phone || '',
        rating: rawShop.rating || 4.8,
        reviewCount: rawShop.reviewCount || 0,
        services: Array.isArray(rawShop.services) ? rawShop.services : [],
        images: Array.isArray(rawShop.images) ? rawShop.images.slice(0, 3) : [],
      };
      const stylists = (rawShop.employees || [])
        .filter((e) => this.isStylist(e) && e.isActive !== false)
        .slice(0, 8)
        .map((e) => ({ id: e.id, name: e.name, title: e.title || '', rating: e.rating || 5 }));
      const displayTags = shop.services.slice(0, 3).map((s) => ({ id: s.id, name: s.name }));
      const products = (Array.isArray(rawShop.products) ? rawShop.products : [])
        .filter((p) => p && p.isActive !== false)
        .slice(0, 4)
        .map((p) => ({ id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice, images: Array.isArray(p.images) ? p.images.slice(0, 1) : [] }));
      const reviews = (await this.loadReviews(shop.id)).slice(0, 3).map((r) => ({
        id: r.id,
        customerName: r.customerName || '匿名用户',
        comment: r.comment || '',
        createdAt: r.createdAt,
        reply: r.reply,
        replyBy: r.replyBy,
        replyAt: r.replyAt,
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
    } catch (err) {
      console.error('加载店铺失败:', err);
      this.setData({ error: '网络错误，请稍后重试', loading: false });
    }
  },

  async loadReviews(shopId) {
    try {
      if (typeof getShopReviews !== 'function') {
        console.warn('[index] getShopReviews 未定义，跳过评价加载');
        return [];
      }
      const reviews = await getShopReviews(shopId);
      return Array.isArray(reviews) ? reviews : [];
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
