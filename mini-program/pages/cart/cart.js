import { getCustomerPublic } from '../../api/customer';
import { createProductOrder, getCustomerCoupons } from '../../api/product';
import {
  getCart,
  updateCartItem,
  removeFromCart,
  toggleCartItemSelection,
  selectAllCartItems,
  clearSelectedCartItems,
  clearCart,
} from '../../utils/cart';
import { getCustomerId } from '../../utils/storage';
import { calcDiscountedItemPrice } from '../../utils/membership';

Page({
  data: {
    shopId: 'shop1',
    cart: [],
    selectedItems: [],
    totalPrice: 0,
    allSelected: false,
    submitting: false,
    showLogin: false,
    pendingCheckout: false,
    customer: null,
    paymentMethod: 'balance',
    customerCoupons: [],
    selectedCouponId: null,
    showCouponModal: false,
    couponDiscount: 0,
    payablePrice: 0,
  },

  onLoad(options) {
    this.setData({ shopId: options.shopId || 'shop1' });
  },

  async onShow() {
    this.refreshCart();
    await this.loadCustomer();
  },

  refreshCart() {
    const cart = getCart();
    const customer = this.data.customer;
    const displayCart = cart.map((item) => {
      const memberPrice = calcDiscountedItemPrice(
        item.product.price,
        customer,
        item.product.category
      );
      return {
        ...item,
        memberPrice: Number(memberPrice.toFixed(2)),
        subtotal: Math.round(memberPrice * item.quantity * 100) / 100,
      };
    });
    const selectedItems = cart.filter((item) => item.selected);
    const totalPrice = selectedItems.reduce((sum, item) => {
      const price = calcDiscountedItemPrice(
        item.product.price,
        customer,
        item.product.category
      );
      const itemTotal = Math.round(price * item.quantity * 100) / 100;
      return sum + itemTotal;
    }, 0);
    const allSelected = cart.length > 0 && cart.every((item) => item.selected);
    const couponDiscount = this.calcCouponDiscount(totalPrice, selectedItems);
    const payablePrice = Math.round((totalPrice - couponDiscount) * 100) / 100;
    const selectedCouponName = this.data.selectedCouponId
      ? (this.data.customerCoupons.find((item) => item.id === this.data.selectedCouponId)?.coupon?.name || '')
      : '';
    this.setData({
      cart,
      displayCart,
      selectedItems,
      totalPrice: totalPrice.toFixed(2),
      allSelected,
      couponDiscount: couponDiscount.toFixed(2),
      payablePrice: payablePrice.toFixed(2),
      selectedCouponName,
    });
  },

  calcCouponDiscount(totalPrice, selectedItems) {
    const { selectedCouponId, customerCoupons } = this.data;
    if (!selectedCouponId || totalPrice <= 0) return 0;
    const cc = customerCoupons.find((item) => item.id === selectedCouponId);
    if (!cc || !cc.coupon) return 0;
    const coupon = cc.coupon;
    if (coupon.type === 'buy_x_get_y') return 0;
    if (coupon.applicableScope === 'service') return 0;
    if (totalPrice < (coupon.minOrderAmount || 0)) return 0;

    let discountBase = totalPrice;
    if (coupon.applicableScope === 'product') {
      const applicableIds = coupon.applicableProductIds || [];
      const applicableTotal = selectedItems.reduce((sum, item) => {
        if (applicableIds.includes(item.productId)) {
          const price = calcDiscountedItemPrice(
            item.product.price,
            this.data.customer,
            item.product.category
          );
          return sum + Math.round(price * item.quantity * 100) / 100;
        }
        return sum;
      }, 0);
      if (applicableTotal <= 0) return 0;
      discountBase = applicableTotal;
    }

    let discount = 0;
    if (coupon.type === 'fixed_amount') {
      discount = Math.min(coupon.value, discountBase);
    } else if (coupon.type === 'percentage') {
      const ratio = Math.max(0, Math.min(10, coupon.value / 10));
      discount = discountBase * (1 - ratio);
    }
    if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
      discount = Math.min(discount, coupon.maxDiscountAmount);
    }
    return Math.round(discount * 100) / 100;
  },

  async loadCustomerCoupons() {
    const { customer, shopId } = this.data;
    if (!customer || !customer.id) return;
    try {
      const coupons = await getCustomerCoupons(customer.id, shopId, 'unused');
      this.setData({ customerCoupons: coupons || [] });
    } catch (err) {
      console.error('[cart] 加载优惠券失败:', err);
    }
  },

  async loadCustomer() {
    const customerId = getCustomerId();
    if (!customerId) {
      this.setData({ customer: null });
      return;
    }
    try {
      const customer = await getCustomerPublic(customerId);
      this.setData({ customer });
      await this.loadCustomerCoupons();
      this.refreshCart();
    } catch (err) {
      console.error('[cart] 加载顾客信息失败:', err);
      this.setData({ customer: null });
    }
  },

  onToggleSelect(e) {
    const { itemId } = e.currentTarget.dataset;
    toggleCartItemSelection(itemId);
    this.refreshCart();
  },

  onSelectAllTap() {
    const next = !this.data.allSelected;
    selectAllCartItems(next);
    this.refreshCart();
  },

  onQuantityMinus(e) {
    const { item } = e.currentTarget.dataset;
    updateCartItem(item.id, item.quantity - 1);
    this.refreshCart();
  },

  onQuantityPlus(e) {
    const { item } = e.currentTarget.dataset;
    if (item.quantity >= item.product.stock) {
      wx.showToast({ title: '库存不足', icon: 'none' });
      return;
    }
    updateCartItem(item.id, item.quantity + 1);
    this.refreshCart();
  },

  onRemove(e) {
    const { itemId } = e.currentTarget.dataset;
    removeFromCart(itemId);
    this.refreshCart();
  },

  onClearCart() {
    wx.showModal({
      title: '清空购物车',
      content: '确定要清空购物车吗？',
      success: (res) => {
        if (res.confirm) {
          clearCart();
          this.refreshCart();
        }
      },
    });
  },

  onCheckout() {
    const { selectedItems, customer, submitting } = this.data;
    if (selectedItems.length === 0) {
      wx.showToast({ title: '请选择要购买的商品', icon: 'none' });
      return;
    }
    if (!customer || !customer.id) {
      this.setData({ showLogin: true, pendingCheckout: true });
      return;
    }
    if (submitting) return;
    this.doCheckout();
  },

  onPaymentChange(e) {
    this.setData({ paymentMethod: e.detail.value });
  },

  async doCheckout() {
    const { shopId, selectedItems, customer, paymentMethod, selectedCouponId } = this.data;
    this.setData({ submitting: true });
    try {
      const order = await createProductOrder({
        shopId,
        customerId: customer.id,
        items: selectedItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        paymentMethod,
        pickupName: customer.name,
        pickupPhone: customer.phone,
        customerCouponId: selectedCouponId || undefined,
      });

      if (order) {
        clearSelectedCartItems();
        this.refreshCart();
        wx.showToast({ title: '订单提交成功', icon: 'success' });
        wx.navigateTo({
          url: `/pages/product-orders/product-orders?shopId=${shopId}`,
        });
      } else {
        wx.showToast({ title: '结算失败，请重试', icon: 'none' });
      }
    } catch (err) {
      if (err.message && err.message.includes('余额不足')) {
        wx.showActionSheet({
          itemList: ['切换为到店自提付款', '去储值页面充值'],
          success: (res) => {
            if (res.tapIndex === 0) {
              this.setData({ paymentMethod: 'store_pickup' });
              this.doCheckout();
            } else if (res.tapIndex === 1) {
              wx.navigateTo({ url: `/pages/profile/profile?shopId=${shopId}` });
            }
          },
        });
      } else {
        console.error('[cart] 结算失败:', err);
        wx.showToast({ title: err.message || '结算失败，请重试', icon: 'none' });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  onLoginClose() {
    this.setData({ showLogin: false, pendingCheckout: false });
  },

  async onLoginSuccess(e) {
    const customer = e.detail && e.detail.customer;
    this.setData({ showLogin: false, customer });
    await this.loadCustomer();
    if (this.data.pendingCheckout) {
      this.setData({ pendingCheckout: false });
      this.onCheckout();
    }
  },

  goToProducts() {
    wx.navigateTo({
      url: `/pages/products/products?shopId=${this.data.shopId}`,
    });
  },

  goBack() {
    wx.navigateBack();
  },

  toggleCouponModal() {
    this.setData({ showCouponModal: !this.data.showCouponModal });
  },

  onSelectCoupon(e) {
    const { couponId } = e.currentTarget.dataset;
    this.setData({ selectedCouponId: couponId, showCouponModal: false });
    this.refreshCart();
  },

  onClearCoupon() {
    this.setData({ selectedCouponId: null, showCouponModal: false });
    this.refreshCart();
  },

  isCouponApplicable(coupon) {
    const { selectedItems, totalPrice } = this.data;
    const price = parseFloat(totalPrice) || 0;
    if (!coupon) return false;
    if (coupon.type === 'buy_x_get_y') return false;
    if (coupon.applicableScope === 'service') return false;
    if (price < (coupon.minOrderAmount || 0)) return false;
    if (coupon.applicableScope === 'product') {
      const applicableIds = coupon.applicableProductIds || [];
      return selectedItems.some((item) => applicableIds.includes(item.productId));
    }
    return true;
  },

  noop() {},
});
