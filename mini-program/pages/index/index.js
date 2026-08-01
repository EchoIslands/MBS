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

function truncate(str, maxLen = 80) {
  if (!str || typeof str !== 'string') return str;
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function limitImageList(images, maxCount = 1) {
  if (!Array.isArray(images)) return [];
  return images.slice(0, maxCount).map((url) => {
    if (typeof url !== 'string') return '';
    // base64 图片可能非常长，只保留前 200 个字符作为标识；小程序首页展示用不到完整 base64
    if (url.startsWith('data:')) return url.slice(0, 200);
    return url;
  });
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
    const startTime = Date.now();
    try {
      console.log('[index] 开始加载店铺 shop1');
      const rawShop = await getShop('shop1');
      console.log(`[index] 店铺加载完成，耗时 ${Date.now() - startTime}ms`);
      if (!rawShop) {
        this.setData({ error: '店铺信息加载失败', loading: false });
        return;
      }

      // 精简店铺数据，避免 setData 传输过大
      const services = (Array.isArray(rawShop.services) ? rawShop.services : [])
        .filter((s) => s && s.id)
        .slice(0, 20)
        .map((s) => ({
          id: s.id,
          name: truncate(s.name, 40),
          description: truncate(s.description, 120),
          duration: s.duration,
          price: s.price,
        }));
      const shop = {
        id: rawShop.id,
        name: rawShop.name || '皓诗形象设计',
        address: rawShop.address || '',
        phone: rawShop.phone || '',
        rating: rawShop.rating || 4.8,
        reviewCount: rawShop.reviewCount || 0,
        services,
        images: limitImageList(rawShop.images, 3),
      };
      const stylists = (rawShop.employees || [])
        .filter((e) => this.isStylist(e) && e.isActive !== false)
        .slice(0, 8)
        .map((e) => ({ id: e.id, name: truncate(e.name, 20), title: truncate(e.title, 30), rating: e.rating || 5 }));
      const displayTags = services.slice(0, 3).map((s) => ({ id: s.id, name: s.name }));
      const products = (Array.isArray(rawShop.products) ? rawShop.products : [])
        .filter((p) => p && p.isActive !== false)
        .slice(0, 4)
        .map((p) => ({
          id: p.id,
          name: truncate(p.name, 40),
          price: p.price,
          originalPrice: p.originalPrice,
          images: limitImageList(p.images, 1),
        }));
      const reviews = (await this.loadReviews(shop.id)).slice(0, 3).map((r) => ({
        id: r.id,
        customerName: truncate(r.customerName, 20) || '匿名用户',
        comment: truncate(r.comment, 200),
        createdAt: r.createdAt,
        reply: truncate(r.reply, 200),
        replyBy: truncate(r.replyBy, 20),
        replyAt: r.replyAt,
        starList: buildStarList(r.overallScore || r.rating || 0),
      }));
      const payload = {
        shop,
        stylists,
        displayTags,
        products,
        reviews,
        reviewCount: reviews.length,
        ratingStars: this.buildStars(shop.rating || 4.8),
        loading: false,
      };
      const sizeKB = Math.round(JSON.stringify(payload).length / 1024);
      if (sizeKB > 500) {
        console.warn(`[index] setData 数据量仍偏大: ${sizeKB} KB，请检查店铺/商品/服务数据`);
      }
      this.setData(payload);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const isTimeout = err && (err.isTimeout || /timeout|超时/i.test(err.message));
      console.error(`[index] 加载店铺失败 (耗时 ${elapsed}ms):`, err);
      const errorMsg = isTimeout
        ? '连接服务器超时，请检查网络后点击重试'
        : (err && err.message) || '网络错误，请稍后重试';
      this.setData({ error: errorMsg, loading: false });
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
