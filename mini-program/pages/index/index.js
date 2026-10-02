import { getShop, getShopReviews } from '../../api/shop';
import { getCustomerPublic } from '../../api/customer';
import { getCustomerId, setRouteParams, clearCustomerId } from '../../utils/storage';
import { trackPageView, trackServiceDetailView } from '../../utils/tracking';
import {
  PurchaseVIPLevel,
  StoredValueLevel,
  purchaseVIPPlans,
  storedValuePlans,
  getPurchaseVIPLabel,
  getStoredValueLabel,
  getCustomerEffectiveDiscount,
} from '../../utils/membership';

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
    // 顾客会员信息
    customer: null,
    purchaseLevel: PurchaseVIPLevel.REGULAR,
    storedLevel: StoredValueLevel.NONE,
    effectiveDiscount: 1,
    purchasePlan: null,
    storedPlan: null,
    isMember: false,
    memberHeaderClass: 'member-header gradient-member-regular',
    StoredValueLevel,
  },

  async onLoad() {
    if (!getCustomerId()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    await this.loadShop();
    this.loadCustomer();
  },

  onShow() {
    if (!getCustomerId()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    trackPageView('pages/index/index', { shop_id: 'shop1' });
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
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },

  slimCustomer(raw) {
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name || '顾客',
      phone: raw.phone || '',
      purchaseVIPLevel: raw.purchaseVIPLevel ?? raw.purchase_vip_level ?? PurchaseVIPLevel.REGULAR,
      storedValueLevel: raw.storedValueLevel ?? raw.stored_value_level ?? StoredValueLevel.NONE,
      storedValueBalance: raw.storedValueBalance ?? raw.stored_value_balance ?? raw.balance ?? 0,
      withdrawableReferralAmount: raw.withdrawableReferralAmount ?? raw.withdrawable_referral_amount ?? 0,
      points: raw.points ?? 0,
      totalSpent: raw.totalSpent ?? raw.total_spent ?? 0,
      isStockholder: !!raw.isStockholder || !!raw.is_stockholder,
      purchaseVIPExpiresAt: raw.purchaseVIPExpiresAt || raw.purchase_vip_expires_at,
      storedValueExpiresAt: raw.storedValueExpiresAt || raw.stored_value_expires_at,
    };
  },

  computeMemberHeaderClass(purchaseLevel) {
    const map = {
      [PurchaseVIPLevel.REGULAR]: 'gradient-member-regular',
      [PurchaseVIPLevel.BRONZE]: 'gradient-member-bronze',
      [PurchaseVIPLevel.SILVER]: 'gradient-member-silver',
      [PurchaseVIPLevel.GOLD]: 'gradient-member-gold',
      [PurchaseVIPLevel.DIAMOND]: 'gradient-member-diamond',
    };
    return `member-header ${map[purchaseLevel] || 'gradient-member-regular'}`;
  },

  async loadCustomer() {
    const customerId = getCustomerId();
    if (!customerId) return;
    try {
      const raw = await getCustomerPublic(customerId);
      const customer = this.slimCustomer(raw);
      const purchaseLevel = customer.purchaseVIPLevel;
      const storedLevel = customer.storedValueLevel;
      const effectiveDiscount = getCustomerEffectiveDiscount(customer);
      const purchasePlan = purchaseVIPPlans.find((p) => p.level === purchaseLevel) || null;
      const storedPlan = storedValuePlans.find((p) => p.level === storedLevel) || null;
      const isMember = purchaseLevel !== PurchaseVIPLevel.REGULAR
                    || storedLevel !== StoredValueLevel.NONE
                    || customer.isStockholder;

      this.setData({
        customer,
        purchaseLevel,
        storedLevel,
        effectiveDiscount,
        purchasePlan,
        storedPlan,
        isMember,
        memberHeaderClass: this.computeMemberHeaderClass(purchaseLevel),
      });
    } catch (err) {
      console.error('[index] 加载顾客信息失败:', err);
    }
  },

  goToInvite() {
    const { customer, isMember } = this.data;
    if (!customer || !isMember) {
      wx.showToast({ title: '成为会员后即可邀请好友', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/invite/invite?customerId=${customer.id}` });
  },

  formatDate,

  goToProducts() {
    const shopId = (this.data.shop && this.data.shop.id) || 'shop1';
    wx.navigateTo({
      url: `/pages/products/products?shopId=${shopId}`,
    });
  },

  goToBooking() {
    wx.navigateTo({ url: '/pages/booking/booking' });
  },

  onServiceTap(e) {
    const serviceId = e.currentTarget.dataset.id;
    const service = (this.data.shop?.services || []).find((s) => s.id === serviceId);
    trackServiceDetailView(serviceId, service?.name || '', { shop_id: 'shop1' });
    this.goToBookingWithService(serviceId);
  },

  goToBookingWithService(serviceId) {
    setRouteParams({ serviceId });
    wx.navigateTo({
      url: '/pages/booking/booking',
    });
  },

  onPrivacyAccept() {
    // 用户同意协议，正常展示首页
  },

  onPrivacyDecline() {
    // 用户不同意协议，友好提示并退出小程序
    wx.showModal({
      title: '需要同意协议',
      content: '您需要同意《用户协议》和《隐私政策》才能继续使用本小程序。',
      showCancel: false,
      confirmText: '我知道了',
      success: () => {
        if (typeof wx.exitMiniProgram === 'function') {
          wx.exitMiniProgram();
        }
      },
    });
  },
});
