import { getCustomerPublic } from '../../api/customer';
import { getCustomerProductOrders } from '../../api/product';
import { getCustomerId } from '../../utils/storage';

const statusLabels = {
  pending: '待支付',
  paid: '已支付',
  preparing: '备货中',
  ready: '待提货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

Page({
  data: {
    shopId: 'shop1',
    customer: null,
    orders: [],
    loading: true,
    showLogin: false,
    statusLabels,
  },

  onLoad(options) {
    this.setData({ shopId: options.shopId || 'shop1' });
  },

  async onShow() {
    await this.loadCustomer();
  },

  async loadCustomer() {
    const customerId = getCustomerId();
    if (!customerId) {
      this.setData({ customer: null, loading: false, showLogin: true });
      return;
    }
    this.setData({ loading: true, showLogin: false });
    try {
      const customer = await getCustomerPublic(customerId);
      this.setData({ customer });
      await this.loadOrders(customer.id);
    } catch (err) {
      console.error('[product-orders] 加载顾客信息失败:', err);
      this.setData({ customer: null, loading: false, showLogin: true });
    }
  },

  async loadOrders(customerId) {
    try {
      const orders = await getCustomerProductOrders(customerId, this.data.shopId);
      this.setData({ orders: orders || [], loading: false });
    } catch (err) {
      console.error('[product-orders] 加载订单失败:', err);
      wx.showToast({ title: '订单加载失败', icon: 'none' });
      this.setData({ orders: [], loading: false });
    }
  },

  onLoginClose() {
    this.setData({ showLogin: false });
  },

  async onLoginSuccess(e) {
    this.setData({ showLogin: false });
    await this.loadCustomer();
  },

  goToProducts() {
    wx.navigateTo({
      url: `/pages/products/products?shopId=${this.data.shopId}`,
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onRefresh() {
    this.loadCustomer();
  },
});
