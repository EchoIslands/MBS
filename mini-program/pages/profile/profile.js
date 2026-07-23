import { getCustomerPublic, getCustomerBookings } from '../../api/customer';
import { getShop } from '../../api/shop';
import { cancelBooking } from '../../api/booking';
import { getCustomerId, clearCustomerId, setRouteParams } from '../../utils/storage';
import {
  PurchaseVIPLevel,
  StoredValueLevel,
  BenefitType,
  purchaseVIPPlans,
  storedValuePlans,
  vipBenefits,
  storedBenefits,
  getPurchaseVIPLabel,
  getStoredValueLabel,
  getCustomerEffectiveDiscount,
  isVIPExpiringSoon,
  isStoredValueExpiringSoon,
  generateBenefits,
  getStockholderBenefitSummary,
} from '../../utils/membership';

function toTwoDigits(n) {
  return String(n).padStart(2, '0');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}-${toTwoDigits(d.getMonth() + 1)}-${toTwoDigits(d.getDate())}`;
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

Page({
  data: {
    customer: null,
    bookings: [],
    filteredBookings: [],
    hasFilteredBookings: false,
    loading: true,
    error: '',
    showLogin: false,
    loginPrompted: false,
    activeTab: 'current',
    purchaseVIPPlans,
    storedValuePlans,
    vipBenefits,
    storedBenefits,
    PurchaseVIPLevel,
    StoredValueLevel,
    BenefitType,
    // 计算字段
    purchaseLevel: PurchaseVIPLevel.REGULAR,
    storedLevel: StoredValueLevel.NONE,
    effectiveDiscount: 1,
    expiringSoon: false,
    storedExpiringSoon: false,
    purchasePlan: null,
    storedPlan: null,
    balance: 0,
    withdrawable: 0,
    points: 0,
    totalSpent: 0,
    myBenefits: [],
    // 预约详情弹窗
    viewingBooking: null,
    cancelling: false,
  },

  async onLoad() {
    await this.loadProfile({ autoShowLogin: true });
  },

  async onShow() {
    await this.loadProfile({ autoShowLogin: true });
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
      await this.loadProfile({ autoShowLogin: false, prefetchedCustomer: loggedInCustomer });
    } catch (err) {
      console.error('[profile] 登录成功后加载资料失败:', err);
      wx.showToast({ title: '登录成功但加载资料失败，请下拉刷新', icon: 'none' });
    }
  },

  async loadProfile({ autoShowLogin = false, prefetchedCustomer = null } = {}) {
    const customerId = getCustomerId();
    if (!customerId) {
      const shouldPrompt = autoShowLogin && !this.data.loginPrompted;
      this.setData({
        loading: false,
        error: '',
        customer: null,
        bookings: [],
        myBenefits: [],
        showLogin: shouldPrompt,
        loginPrompted: true,
      });
      return;
    }

    this.setData({ loading: true, error: '', showLogin: false });
    try {
      // 登录接口已返回完整顾客信息，优先直接使用，避免生产环境 /customers/:id/public 偶发 401 阻塞登录流程
      const customer = prefetchedCustomer || await getCustomerPublic(customerId);
      const bookings = await getCustomerBookings(customerId);

      const purchaseLevel = customer?.purchaseVIPLevel ?? PurchaseVIPLevel.REGULAR;
      const storedLevel = customer?.storedValueLevel ?? StoredValueLevel.NONE;
      const effectiveDiscount = customer ? getCustomerEffectiveDiscount(customer) : 1;
      const expiringSoon = isVIPExpiringSoon(customer);
      const storedExpiringSoon = isStoredValueExpiringSoon(customer);
      const purchasePlan = purchaseVIPPlans.find((p) => p.level === purchaseLevel);
      const storedPlan = storedValuePlans.find((p) => p.level === storedLevel);

      const allBookings = bookings || [];
      // 三方协同：优先从最近预约获取店铺配置，与 H5 保持一致
      const recentShopId = allBookings[0]?.shopId;
      const shop = recentShopId ? await getShop(recentShopId) : null;
      const stockholderSummary = getStockholderBenefitSummary(customer, shop);
      this.setData({
        customer,
        bookings: allBookings,
        loading: false,
        purchaseLevel,
        storedLevel,
        effectiveDiscount,
        expiringSoon,
        storedExpiringSoon,
        purchasePlan,
        storedPlan,
        balance: customer?.storedValueBalance ?? customer?.balance ?? 0,
        withdrawable: customer?.withdrawableReferralAmount ?? 0,
        points: customer?.points ?? 0,
        totalSpent: customer?.totalSpent ?? 0,
        myBenefits: this.computeMyBenefits(customer),
        stockholderSummary,
      });
      this.refreshFilteredBookings();
    } catch (err) {
      console.error('[profile] 加载个人信息失败:', err);
      if (err.statusCode === 401 || /未登录|请先登录|unauthorized/i.test(err.message)) {
        clearCustomerId();
        this.setData({ customer: null, bookings: [], myBenefits: [], loading: false, error: '' });
        if (autoShowLogin) {
          this.setData({ showLogin: true });
        }
        return;
      }
      this.setData({ error: '个人信息加载失败', loading: false });
    }
  },

  refreshFilteredBookings() {
    const { bookings, activeTab } = this.data;
    const filtered = bookings.filter((b) =>
      activeTab === 'current'
        ? b.status === 'pending' || b.status === 'confirmed'
        : b.status === 'completed' || b.status === 'cancelled'
    );
    this.setData({ filteredBookings: filtered, hasFilteredBookings: filtered.length > 0 });
  },

  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    this.setData({ activeTab: tab });
    this.refreshFilteredBookings();
  },

  onRefresh() {
    this.loadProfile();
  },

  onBookingTap(e) {
    const { id } = e.currentTarget.dataset;
    const booking = this.data.bookings.find((b) => b.id === id);
    if (booking) {
      this.setData({ viewingBooking: booking });
    }
  },

  closeBookingModal() {
    this.setData({ viewingBooking: null });
  },

  stopPropagation() {},

  async handleCancelBooking() {
    const { viewingBooking, customer } = this.data;
    if (!viewingBooking || !customer) return;

    const res = await wx.showModal({
      title: '取消预约',
      content: '确定要取消这次预约吗？取消后无法恢复。',
    });
    if (!res.confirm) return;

    this.setData({ cancelling: true });
    try {
      await cancelBooking(viewingBooking.id, customer.id);
      wx.showToast({ title: '已取消预约', icon: 'success' });
      this.setData({ viewingBooking: null, cancelling: false });
      await this.loadProfile({ autoShowLogin: false });
    } catch (err) {
      console.error('[profile] 取消预约失败:', err);
      wx.showToast({ title: err.message || '取消失败，请重试', icon: 'none' });
      this.setData({ cancelling: false });
    }
  },

  goToQueue() {
    const { viewingBooking } = this.data;
    if (!viewingBooking) return;
    this.setData({ viewingBooking: null });
    setRouteParams({ bookingId: viewingBooking.id });
    wx.navigateTo({ url: '/pages/queue/queue' });
  },

  goToReview() {
    this.setData({ viewingBooking: null });
    wx.showToast({ title: '评价功能开发中', icon: 'none' });
  },

  goToBooking() {
    wx.navigateTo({ url: '/pages/booking/booking' });
  },

  goToFeedback() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  goToRefund() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  goToShop() {
    wx.navigateTo({ url: '/pages/index/index' });
  },

  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          clearCustomerId();
          this.setData({
            customer: null,
            bookings: [],
            myBenefits: [],
            activeTab: 'current',
            viewingBooking: null,
          });
        }
      },
    });
  },

  formatDate,
  formatDateTime,
  formatShortDate,
  getPurchaseVIPLabel,
  getStoredValueLabel,

  formatDiscount(discount) {
    return (discount * 10).toFixed(2);
  },

  benefitIconColor(type) {
    const map = {
      [BenefitType.SHAMPOO]: 'var(--blue-500)',
      [BenefitType.CONDITIONER]: 'var(--pink-500)',
      [BenefitType.FREE_HAIRCUT]: 'var(--purple-500)',
      [BenefitType.DRINK]: 'var(--accent)',
      [BenefitType.REDO]: 'var(--danger)',
    };
    return map[type] || 'var(--text-tertiary)';
  },

  computeMyBenefits(customer) {
    if (!customer) return [];
    // 优先与 H5 保持一致：使用后端返回的可用权益记录
    const records = customer.memberBenefitRecords || customer.benefits;
    if (Array.isArray(records) && records.length > 0) {
      return records
        .filter((b) => b.status === 'available')
        .map((b) => ({
          type: b.type || BenefitType.SHAMPOO,
          name: b.name || '会员权益',
          description: b.expiresAt
            ? `有效期至 ${formatShortDate(b.expiresAt)}`
            : '无固定期限',
          expiresAt: b.expiresAt,
        }));
    }
    // 兜底：根据购买 VIP 等级生成权益
    return generateBenefits(customer).map((b) => ({
      ...b,
      description: '无固定期限',
    }));
  },

  benefitIconName(type) {
    const map = {
      [BenefitType.SHAMPOO]: 'sparkles',
      [BenefitType.CONDITIONER]: 'sparkles',
      [BenefitType.FREE_HAIRCUT]: 'scissors',
      [BenefitType.DRINK]: 'star',
      [BenefitType.REDO]: 'alertCircle',
    };
    return map[type] || 'gift';
  },
});
