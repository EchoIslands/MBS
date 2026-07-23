import { getBooking } from '../../api/booking';
import { getCustomerPublic } from '../../api/customer';
import { getShop } from '../../api/shop';
import { getCustomerId, setRouteParams, takeRouteParams } from '../../utils/storage';
import {
  PurchaseVIPLevel,
  StoredValueLevel,
  purchaseVIPPlans,
  storedValuePlans,
  getPurchaseVIPLabel,
  getStoredValueLabel,
  getEffectivePurchaseVIPLevel,
  getEffectiveStoredValueLevel,
  getCustomerEffectiveDiscount,
  calcDiscountedItemPrice,
  calcStockholderDiscountedPrice,
  isVIPExpiringSoon,
  isStoredValueExpiringSoon,
} from '../../utils/membership';

function toTwoDigits(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]} ${toTwoDigits(d.getHours())}:${toTwoDigits(d.getMinutes())}`;
}

function formatShortDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}/${toTwoDigits(d.getMonth() + 1)}/${toTwoDigits(d.getDate())}`;
}

function formatDiscount(discount) {
  return (discount * 10).toFixed(2);
}

Page({
  data: {
    bookingId: '',
    booking: null,
    customer: null,
    loading: true,
    error: '',
    showLogin: false,
    loginPrompted: false,
    // 会员相关（预计算后绑定）
    PurchaseVIPLevel,
    StoredValueLevel,
    purchaseVIPPlans,
    storedValuePlans,
    purchaseLevel: PurchaseVIPLevel.REGULAR,
    storedLevel: StoredValueLevel.NONE,
    effectiveDiscount: 1,
    purchaseVIPDiscount: 1,
    storedValueDiscount: 1,
    expiringSoon: false,
    storedExpiringSoon: false,
    purchasePlan: null,
    storedPlan: null,
    balance: 0,
    balanceStr: '0.00',
    withdrawable: 0,
    withdrawableStr: '0.00',
    // 价格相关
    originalPrice: 0,
    memberPrice: 0,
    discountAmount: 0,
    hasDiscount: false,
    hasPurchaseDiscount: false,
    hasStoredDiscount: false,
    vipDiscountAmount: 0,
    storedDiscountAmount: 0,
    originalPriceStr: '0.00',
    memberPriceStr: '0.00',
    vipDiscountAmountStr: '0.00',
    storedDiscountAmountStr: '0.00',
    purchaseVIPDiscountStr: '10.00',
    storedValueDiscountStr: '10.00',
    effectiveDiscountStr: '10.00',
  },

  async onLoad(options) {
    const routeParams = takeRouteParams();
    const bookingId = options.bookingId || (routeParams && routeParams.bookingId);

    this.setData({ bookingId });

    if (!bookingId) {
      this.setData({ loading: false, error: '缺少预约信息' });
      return;
    }

    await this.loadCustomer({ autoShowLogin: true });
    await this.loadBooking(bookingId);
  },

  async onShow() {
    const routeParams = takeRouteParams();
    const bookingId = (routeParams && routeParams.bookingId) || this.data.bookingId;
    if (bookingId && (!this.data.booking || this.data.booking.id !== bookingId)) {
      this.setData({ bookingId });
      await this.loadBooking(bookingId);
    }
  },

  openLogin() {
    this.setData({ showLogin: true });
  },

  onLoginClose() {
    this.setData({ showLogin: false });
  },

  async onLoginSuccess(e) {
    const loggedInCustomer = e.detail && e.detail.customer;
    this.setData({ showLogin: false });
    wx.showToast({ title: '登录成功', icon: 'success' });
    try {
      await this.loadCustomer({ autoShowLogin: false, prefetchedCustomer: loggedInCustomer });
      if (this.data.bookingId) {
        await this.loadBooking(this.data.bookingId);
      }
    } catch (err) {
      console.error('[checkout] 登录成功后加载失败:', err);
      wx.showToast({ title: '登录成功但加载失败，请重试', icon: 'none' });
    }
  },

  async loadCustomer({ autoShowLogin = false, prefetchedCustomer = null } = {}) {
    const customerId = getCustomerId();
    if (!customerId) {
      const shouldPrompt = autoShowLogin && !this.data.loginPrompted;
      this.setData({
        customer: null,
        showLogin: shouldPrompt,
        loginPrompted: true,
      });
      return;
    }

    try {
      // 登录接口已返回完整顾客信息，优先直接使用，避免生产环境 /customers/:id/public 偶发 401 阻塞登录流程
      const customer = prefetchedCustomer || await getCustomerPublic(customerId);
      const purchaseLevel = customer?.purchaseVIPLevel ?? PurchaseVIPLevel.REGULAR;
      const storedLevel = customer?.storedValueLevel ?? StoredValueLevel.NONE;
      const effectiveDiscount = customer ? getCustomerEffectiveDiscount(customer) : 1;
      const purchaseVIPDiscount = getEffectivePurchaseVIPLevel(customer) === PurchaseVIPLevel.REGULAR
        ? 1
        : getCustomerEffectiveDiscount({ ...customer, storedValueLevel: StoredValueLevel.NONE });
      const storedValueDiscount = getEffectiveStoredValueLevel(customer) === StoredValueLevel.NONE
        ? 1
        : getCustomerEffectiveDiscount({ ...customer, purchaseVIPLevel: PurchaseVIPLevel.REGULAR });

      this.setData({
        customer,
        showLogin: false,
        purchaseLevel,
        storedLevel,
        effectiveDiscount,
        purchaseVIPDiscount,
        storedValueDiscount,
        expiringSoon: isVIPExpiringSoon(customer),
        storedExpiringSoon: isStoredValueExpiringSoon(customer),
        purchasePlan: purchaseVIPPlans.find((p) => p.level === purchaseLevel),
        storedPlan: storedValuePlans.find((p) => p.level === storedLevel),
        balance: customer?.storedValueBalance ?? customer?.balance ?? 0,
        balanceStr: Number(customer?.storedValueBalance ?? customer?.balance ?? 0).toFixed(2),
        withdrawable: customer?.withdrawableReferralAmount ?? 0,
        withdrawableStr: Number(customer?.withdrawableReferralAmount ?? 0).toFixed(2),
      });
      this.refreshPrice();
    } catch (err) {
      console.error('[checkout] 加载顾客信息失败:', err);
      if (err.statusCode === 401 || /未登录|请先登录|unauthorized/i.test(err.message)) {
        this.setData({ customer: null });
        if (autoShowLogin) {
          this.setData({ showLogin: true });
        }
      }
    }
  },

  async loadBooking(id) {
    this.setData({ loading: true, error: '' });
    try {
      const booking = await getBooking(id);
      let shop = null;
      if (booking && booking.shopId) {
        try {
          shop = await getShop(booking.shopId);
        } catch (e) {
          console.warn('[checkout] 获取店铺信息失败:', e);
        }
      }
      this.setData({ booking, shop, loading: false });
      this.refreshPrice();
    } catch (err) {
      console.error('[checkout] 加载预约失败:', err);
      this.setData({ error: '预约信息加载失败', loading: false });
    }
  },

  refreshPrice() {
    const { booking, customer, shop, purchaseVIPDiscount } = this.data;
    if (!booking) return;

    const originalPrice = Number(booking.price) || 0;
    const memberPrice = calcDiscountedItemPrice(originalPrice, customer, 'service');
    // 三方协同：同时计算股东折扣价，取最优惠价格
    const stockholderPrice = calcStockholderDiscountedPrice(originalPrice, customer, shop, 'service');
    const finalPrice = Math.min(memberPrice, stockholderPrice.price);
    const discountAmount = Math.round((originalPrice - finalPrice) * 100) / 100;
    const hasDiscount = discountAmount > 0;
    const isStockholderDiscount = stockholderPrice.hasDiscount && stockholderPrice.price <= memberPrice;

    const vipDiscountAmount = Math.round((originalPrice - originalPrice * purchaseVIPDiscount) * 100) / 100;
    const storedDiscountAmount = Math.round((originalPrice * purchaseVIPDiscount - memberPrice) * 100) / 100;

    this.setData({
      originalPrice,
      memberPrice: finalPrice,
      discountAmount,
      hasDiscount,
      hasPurchaseDiscount: vipDiscountAmount > 0,
      hasStoredDiscount: storedDiscountAmount > 0,
      isStockholderDiscount,
      vipDiscountAmount,
      storedDiscountAmount,
      originalPriceStr: originalPrice.toFixed(2),
      memberPriceStr: finalPrice.toFixed(2),
      vipDiscountAmountStr: vipDiscountAmount.toFixed(2),
      storedDiscountAmountStr: storedDiscountAmount.toFixed(2),
      purchaseVIPDiscountStr: formatDiscount(purchaseVIPDiscount),
      storedValueDiscountStr: formatDiscount(this.data.storedValueDiscount),
      effectiveDiscountStr: formatDiscount(this.data.effectiveDiscount),
    });
  },

  onViewQueue() {
    if (!this.data.booking) return;
    setRouteParams({ bookingId: this.data.booking.id });
    wx.navigateTo({ url: '/pages/queue/queue' });
  },

  onViewProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  formatDateTime,
  formatShortDate,
  formatDiscount,
  getPurchaseVIPLabel,
  getStoredValueLabel,
});
