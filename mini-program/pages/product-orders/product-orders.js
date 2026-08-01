import { getCustomerPublic } from '../../api/customer';
import { getCustomerProductOrders, requestProductOrderRefund, cancelProductOrder, getProductOrderTracking, confirmProductOrderReceipt, payProductOrder } from '../../api/product';
import { getCustomerId } from '../../utils/storage';

const statusLabels = {
  pending: '待支付',
  paid: '已支付',
  preparing: '备货中',
  ready: '待提货',
  shipped: '已发货',
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
    filteredOrders: [],
    filterStatus: 'all',
    loading: true,
    showLogin: false,
    statusLabels,
    detailOrder: null,
    showRefundModal: false,
    refundReason: '',
    submittingRefund: false,
    // 物流轨迹弹窗
    showTrackingModal: false,
    trackingList: [],
    trackingLoading: false,
    // 确认收货
    confirmingReceipt: false,
    // 详情页按钮显示控制
    canConfirmReceipt: false,
    canViewTracking: false,
    canCancel: false,
    canRequestRefund: false,
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
      this.applyFilter();
    } catch (err) {
      console.error('[product-orders] 加载订单失败:', err);
      wx.showToast({ title: '订单加载失败', icon: 'none' });
      this.setData({ orders: [], loading: false });
    }
  },

  applyFilter() {
    const { orders, filterStatus } = this.data;
    let filtered = orders;
    if (filterStatus === 'pending') {
      filtered = orders.filter(o => o.status === 'pending');
    } else if (filterStatus === 'completed') {
      filtered = orders.filter(o => ['completed', 'paid'].includes(o.status));
    } else if (filterStatus === 'shipped') {
      filtered = orders.filter(o => o.status === 'shipped');
    } else if (filterStatus === 'cancelled') {
      filtered = orders.filter(o => ['cancelled', 'refunded', 'refunding'].includes(o.status));
    }
    this.setData({ filteredOrders: filtered });
  },

  onFilterChange(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ filterStatus: status });
    this.applyFilter();
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
    const order = this.data.filteredOrders[index];
    if (!order) return;
    const canConfirmReceipt = order.status === 'shipped';
    const canViewTracking = (order.status === 'shipped' || order.status === 'completed') && order.shippingCompany;
    const canCancel = order.status === 'pending';
    const canRequestRefund = order.paymentMethod === 'balance' && ['paid', 'preparing', 'ready'].includes(order.status);
    this.setData({ detailOrder: order, canConfirmReceipt, canViewTracking, canCancel, canRequestRefund });
  },

  handlePay(e) {
    const index = e.currentTarget.dataset.index;
    const order = this.data.filteredOrders[index];
    if (!order) return;
    const amountText = `¥${(order.payableAmount / 100).toFixed(2)}`;
    const customerId = getCustomerId();
    if (!customerId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const actions = ['余额支付', '到店自提付款', '取消'];
    wx.showActionSheet({
      itemList: actions,
      success: async (res) => {
        const method = actions[res.tapIndex];
        if (method === '取消') return;
        const paymentMethod = method === '余额支付' ? 'balance' : 'store_pickup';

        if (paymentMethod === 'balance') {
          const balance = (this.data.customer?.storedValueBalance || 0);
          if (balance < order.payableAmount / 100) {
            wx.showModal({
              title: '余额不足',
              content: `订单金额 ${amountText}，当前余额 ¥${balance.toFixed(2)}，是否前往充值？`,
              confirmText: '去充值',
              cancelText: '到店自提付款',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.navigateTo({ url: `/pages/recharge/recharge?shopId=${this.data.shopId}` });
                } else {
                  this.doPay(order.id, customerId, 'store_pickup');
                }
              },
            });
            return;
          }
        }

        this.doPay(order.id, customerId, paymentMethod);
      },
    });
  },

  async doPay(orderId, customerId, paymentMethod) {
    wx.showLoading({ title: paymentMethod === 'balance' ? '支付中' : '处理中' });
    try {
      await payProductOrder(orderId, customerId, paymentMethod);
      wx.hideLoading();
      wx.showToast({ title: paymentMethod === 'balance' ? '支付成功' : '已切换为到店自提付款' });
      this.onRefresh();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '支付失败', icon: 'none' });
    }
  },

  handleReorder(e) {
    const index = e.currentTarget.dataset.index;
    const order = this.data.filteredOrders[index];
    if (!order) return;
    wx.navigateTo({
      url: `/pages/products/products?shopId=${this.data.shopId}`,
    });
  },

  closeDetail() {
    this.setData({
      detailOrder: null,
      canConfirmReceipt: false,
      canViewTracking: false,
      canCancel: false,
      canRequestRefund: false
    });
  },

  onDetailTap() {
    // 阻止点击弹窗内容时关闭
  },

  canRequestRefund(order) {
    return order && order.paymentMethod === 'balance' && ['paid', 'preparing', 'ready'].includes(order.status);
  },

  canCancel(order) {
    return order && order.status === 'pending';
  },

  canConfirmReceipt(order) {
    return order && order.status === 'shipped';
  },

  canViewTracking(order) {
    return order && (order.status === 'shipped' || order.status === 'completed') && order.shippingCompany;
  },

  async handleCancel() {
    const order = this.data.detailOrder;
    const customerId = getCustomerId();
    if (!order || !customerId) return;
    if (!this.canCancel(order)) {
      wx.showToast({ title: '当前订单不可取消', icon: 'none' });
      return;
    }
    const res = await wx.showModal({
      title: '取消订单',
      content: '确定要取消该订单吗？取消后库存将自动回滚。',
      confirmText: '确定',
      cancelText: '再想想',
    });
    if (!res.confirm) return;
    wx.showLoading({ title: '取消中' });
    try {
      await cancelProductOrder(order.id, customerId, '用户主动取消');
      wx.hideLoading();
      wx.showToast({ title: '订单已取消' });
      this.setData({ detailOrder: null });
      this.onRefresh();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '取消订单失败', icon: 'none' });
    }
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

  // 查看物流轨迹
  async openTrackingModal() {
    const order = this.data.detailOrder;
    if (!order) return;
    this.setData({ showTrackingModal: true, trackingList: [], trackingLoading: true });
    try {
      const trackingList = await getProductOrderTracking(order.id);
      this.setData({ trackingList: trackingList || [], trackingLoading: false });
    } catch (err) {
      console.error('[product-orders] 获取物流失败:', err);
      wx.showToast({ title: err.message || '获取物流信息失败', icon: 'none' });
      this.setData({ showTrackingModal: false, trackingLoading: false });
    }
  },

  closeTrackingModal() {
    this.setData({ showTrackingModal: false, trackingList: [] });
  },

  onTrackingModalTap() {
    // 阻止点击弹窗内容时关闭
  },

  // 确认收货
  async handleConfirmReceipt() {
    const order = this.data.detailOrder;
    const customerId = getCustomerId();
    if (!order || !customerId) return;
    if (!this.canConfirmReceipt(order)) {
      wx.showToast({ title: '当前订单不可确认收货', icon: 'none' });
      return;
    }
    const res = await wx.showModal({
      title: '确认收货',
      content: '请确认已收到商品，确认后订单将标记为已完成。',
      confirmText: '确认收货',
      cancelText: '再想想',
    });
    if (!res.confirm) return;
    this.setData({ confirmingReceipt: true });
    wx.showLoading({ title: '确认中' });
    try {
      const updated = await confirmProductOrderReceipt(order.id, customerId);
      wx.hideLoading();
      if (updated) {
        wx.showToast({ title: '已确认收货' });
        // 更新本地订单数据
        this.setData({
          detailOrder: { ...order, status: 'completed', confirmedAt: updated.confirmedAt, completedAt: updated.completedAt }
        });
        // 更新订单列表
        this.setData({
          orders: this.data.orders.map(o => o.id === order.id ? { ...o, status: 'completed', confirmedAt: updated.confirmedAt } : o)
        });
        this.applyFilter();
      } else {
        wx.showToast({ title: '确认收货失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '确认收货失败', icon: 'none' });
    } finally {
      this.setData({ confirmingReceipt: false });
    }
  },
});
