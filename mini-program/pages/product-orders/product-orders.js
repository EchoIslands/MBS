import { getCustomerPublic } from '../../api/customer';
import { getCustomerProductOrders, requestProductOrderRefund } from '../../api/product';
import { getCustomerId } from '../../utils/storage';

const statusLabels = {
  pending: '待支付',
  paid: '已支付',
  preparing: '备货中',
  ready: '待提货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  refunding: '退款中',
};

Page({
  data: {
    shopId: 'shop1',
    customer: null,
    orders: [],
    loading: true,
    showLogin: false,
    statusLabels,
    detailOrder: null,
    showRefundModal: false,
    refundReason: '',
    submittingRefund: false,
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

  showDetail(e) {
    const index = e.currentTarget.dataset.index;
    const order = this.data.orders[index];
    if (!order) return;
    this.setData({ detailOrder: order });
  },

  closeDetail() {
    this.setData({ detailOrder: null });
  },

  onDetailTap() {
    // 阻止点击弹窗内容时关闭
  },

  canRequestRefund(order) {
    return order && order.paymentMethod === 'balance' && ['paid', 'preparing', 'ready'].includes(order.status);
  },

  openRefundModal() {
    if (!this.canRequestRefund(this.data.detailOrder)) {
      wx.showToast({ title: '当前订单不可申请退款', icon: 'none' });
      return;
    }
    this.setData({ showRefundModal: true, refundReason: '' });
  },

  closeRefundModal() {
    this.setData({ showRefundModal: false });
  },

  onRefundReasonInput(e) {
    this.setData({ refundReason: e.detail.value || '' });
  },

  onRefundModalTap() {
    // 阻止点击弹窗内容时关闭
  },

  async requestRefund() {
    const reason = this.data.refundReason.trim();
    if (!reason) {
      wx.showToast({ title: '请填写退款原因', icon: 'none' });
      return;
    }
    const order = this.data.detailOrder;
    if (!order) return;
    this.setData({ submittingRefund: true });
    try {
      await requestProductOrderRefund(order.id, reason);
      wx.showToast({ title: '退款申请提交成功' });
      this.setData({ showRefundModal: false, detailOrder: null, refundReason: '' });
      this.onRefresh();
    } catch (err) {
      wx.showToast({ title: err.message || '申请退款失败', icon: 'none' });
    } finally {
      this.setData({ submittingRefund: false });
    }
  },
});
