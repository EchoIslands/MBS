import { getCustomerCoupons } from '../../api/product';
import { getCustomerId } from '../../utils/storage';

Page({
  data: {
    customerId: '',
    shopId: 'shop1',
    coupons: [],
    activeTab: 'all',
    loading: true,
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'unused', label: '未使用' },
      { key: 'used', label: '已使用' },
      { key: 'expired', label: '已过期' },
    ],
    activeTabLabel: '全部',
  },

  onLoad(options) {
    this.setData({ shopId: options.shopId || 'shop1' });
  },

  onShow() {
    const customerId = getCustomerId();
    if (!customerId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    this.setData({ customerId });
    this.loadCoupons();
  },

  async loadCoupons() {
    const { customerId, shopId, activeTab } = this.data;
    this.setData({ loading: true });
    try {
      const status = activeTab === 'all' ? undefined : activeTab;
      const coupons = await getCustomerCoupons(customerId, shopId, status);
      const now = new Date();
      const list = (coupons || []).map((cc) => {
        const coupon = cc.coupon || {};
        const isExpired = cc.status === 'expired' || new Date(coupon.endAt) < now;
        return {
          ...cc,
          isExpired,
          isUsable: cc.status === 'unused' && !isExpired,
          valueText: this.formatValue(coupon),
          scopeText: this.formatScope(coupon),
          statusText: this.formatStatus(cc, isExpired),
          statusClass: this.formatStatusClass(cc, isExpired),
        };
      });
      this.setData({ coupons: list });
    } catch (err) {
      console.error('[my-coupons] 加载优惠券失败:', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ coupons: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatValue(coupon) {
    if (coupon.type === 'fixed_amount') return `¥${Math.floor(coupon.value)}`;
    if (coupon.type === 'percentage') return `${coupon.value}折`;
    return '买赠';
  },

  formatScope(coupon) {
    if (coupon.applicableScope === 'all') return '全场通用';
    if (coupon.applicableScope === 'product') return '限定商品';
    if (coupon.applicableScope === 'service') return '仅限服务';
    return '';
  },

  formatStatus(cc, isExpired) {
    if (cc.status === 'used') return '已使用';
    if (cc.status === 'expired' || isExpired) return '已过期';
    if (cc.status === 'cancelled') return '已作废';
    return '未使用';
  },

  formatStatusClass(cc, isExpired) {
    if (cc.status === 'used') return 'status-used';
    if (cc.status === 'expired' || isExpired) return 'status-expired';
    if (cc.status === 'cancelled') return 'status-cancelled';
    return 'status-unused';
  },

  onTabTap(e) {
    const { tab } = e.currentTarget.dataset;
    const tabItem = this.data.tabs.find((item) => item.key === tab);
    this.setData({ activeTab: tab, activeTabLabel: tabItem ? tabItem.label : '' });
    this.loadCoupons();
  },

  onUseTap(e) {
    const { coupon } = e.currentTarget.dataset;
    if (!coupon) return;
    const { shopId } = this.data;
    if (coupon.applicableScope === 'service') {
      wx.switchTab({ url: `/pages/index/index?shopId=${shopId}` });
    } else {
      wx.navigateTo({ url: `/pages/products/products?shopId=${shopId}` });
    }
  },

  goToClaim() {
    const { shopId } = this.data;
    wx.navigateTo({ url: `/pages/products/products?shopId=${shopId}` });
  },

  goBack() {
    wx.navigateBack();
  },
});
