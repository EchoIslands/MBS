import { getShopProducts } from '../../api/product';
import { getCustomerPublic } from '../../api/customer';
import { addToCart, getCartCount } from '../../utils/cart';
import { getCustomerId } from '../../utils/storage';
import { calcDiscountedItemPrice } from '../../utils/membership';

Page({
  data: {
    shopId: 'shop1',
    productId: '',
    customer: null,
    product: null,
    quantity: 1,
    loading: true,
    cartCount: 0,
  },

  async onLoad(options) {
    const shopId = options.shopId || 'shop1';
    const productId = options.productId || '';
    this.setData({ shopId, productId });
    await this.loadCustomer();
    await this.loadProduct();
    this.refreshCartCount();
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
    } catch (err) {
      console.error('[product-detail] 加载顾客信息失败:', err);
      this.setData({ customer: null });
    }
  },

  getMemberPrice(product) {
    const { customer } = this.data;
    return calcDiscountedItemPrice(product.price, customer, product.category);
  },

  onShow() {
    this.refreshCartCount();
  },

  async loadProduct() {
    this.setData({ loading: true });
    try {
      const products = await getShopProducts(this.data.shopId);
      const product = (products || []).find((p) => p.id === this.data.productId);
      if (product) {
        product.memberPrice = this.getMemberPrice(product);
        product.ratingText = product.rating ? product.rating.toFixed(1) : '暂无';
        product.stockText = product.stock > 0 ? `${product.stock} 件` : '暂时缺货';
      }
      this.setData({ product: product || null, loading: false });
    } catch (err) {
      console.error('[product-detail] 加载商品失败:', err);
      wx.showToast({ title: '商品加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  refreshCartCount() {
    this.setData({ cartCount: getCartCount() });
  },

  onQuantityMinus() {
    this.setData({ quantity: Math.max(1, this.data.quantity - 1) });
  },

  onQuantityPlus() {
    const { product, quantity } = this.data;
    if (product && quantity >= product.stock) {
      wx.showToast({ title: '库存不足', icon: 'none' });
      return;
    }
    this.setData({ quantity: quantity + 1 });
  },

  onAddToCart() {
    const { product, quantity } = this.data;
    if (!product) return;
    if (product.stock <= 0) {
      wx.showToast({ title: '暂时缺货', icon: 'none' });
      return;
    }
    if (quantity > product.stock) {
      wx.showToast({ title: '库存不足', icon: 'none' });
      return;
    }
    addToCart(product, quantity);
    this.refreshCartCount();
    wx.showToast({ title: `已加入 ${quantity} 件`, icon: 'success' });
    this.setData({ quantity: 1 });
  },

  goToCart() {
    wx.navigateTo({
      url: `/pages/cart/cart?shopId=${this.data.shopId}`,
    });
  },

  goBack() {
    wx.navigateBack();
  },
});
