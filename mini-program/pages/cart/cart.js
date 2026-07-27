import { getCustomerPublic } from '../../api/customer';
import { createProductOrder } from '../../api/product';
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
    this.setData({
      cart,
      displayCart,
      selectedItems,
      totalPrice: totalPrice.toFixed(2),
      allSelected,
    });
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
    const { shopId, selectedItems, customer, paymentMethod } = this.data;
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
      console.error('[cart] 结算失败:', err);
      wx.showToast({ title: err.message || '结算失败，请重试', icon: 'none' });
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
});
