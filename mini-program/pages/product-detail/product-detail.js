import { getShopProducts } from '../../api/product';
import { getCustomerPublic } from '../../api/customer';
import { addToCart, getCartCount } from '../../utils/cart';
import { getCustomerId } from '../../utils/storage';
import { calcDiscountedItemPrice } from '../../utils/membership';
import { trackPageView, trackAddToCart } from '../../utils/tracking';

Page({
  data: {
    shopId: 'shop1',
    productId: '',
    customer: null,
    product: null,
    quantity: 1,
    loading: true,
    customerLoading: true,
    imageIndex: 0,
    imageFailed: false,
    cartCount: 0,
  },

  async onLoad(options) {
    const shopId = options.shopId || 'shop1';
    const productId = options.productId || '';
    this.setData({ shopId, productId });
    await Promise.all([this.loadCustomer(), this.loadProduct()]);
    if (this.data.product) this.setData({ 'product.memberPrice': this.getMemberPrice(this.data.product) });
    this.refreshCartCount();
  },

  async loadCustomer() {
    const customerId = getCustomerId();
    this.setData({ customerLoading: true });
    const requestId = this._customerRequestId = (this._customerRequestId || 0) + 1;
    const isCurrent = () => requestId === this._customerRequestId && customerId === getCustomerId();
    if (!customerId) {
      this.setData({ customer: null, customerLoading: false });
      return;
    }
    try {
      const customer = await getCustomerPublic(customerId);
      if (!isCurrent()) return;
      this.setData({ customer });
    } catch (err) {
      if (!isCurrent()) return;
      console.error('[product-detail] 加载顾客信息失败:', err);
      this.setData({ customer: null });
    } finally {
      if (!isCurrent()) return;
      this.setData({ customerLoading: false });
      if (this.data.product) this.setData({ 'product.memberPrice': this.getMemberPrice(this.data.product) });
    }
  },

  getMemberPrice(product) {
    const { customer } = this.data;
    return calcDiscountedItemPrice(product.price, customer, product.category);
  },

  onShow() {
    if (this._shown) { this.loadProduct(); this.loadCustomer(); }
    this._shown = true;
    this.refreshCartCount();
    trackPageView('pages/product-detail/product-detail', {
      shop_id: this.data.shopId,
      product_id: this.data.productId,
    });
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
    this.setData({ cartCount: getCartCount(this.data.shopId) });
  },

  onProductImageError() {
    const imageIndex = this.data.imageIndex + 1;
    this.setData({ imageIndex, imageFailed: imageIndex >= (this.data.product?.images || []).length });
  },

  retryProductImage() {
    this.setData({ imageIndex: 0, imageFailed: false });
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
    if (this.data.customerLoading) {
      wx.showToast({ title: '正在核对会员价格，请稍候', icon: 'none' });
      return;
    }
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
    trackAddToCart(
      product.id,
      product.name,
      quantity,
      (product.memberPrice ?? product.price) * quantity,
      { shop_id: this.data.shopId, category: product.category }
    );
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

  onShareAppMessage() {
    const name = (this.data.product && this.data.product.name) || '好物推荐';
    return {
      title: name,
      path: `/pages/product-detail/product-detail?shopId=${this.data.shopId || 'shop1'}&productId=${this.data.productId || ''}`,
    };
  },

  onShareTimeline() {
    const name = (this.data.product && this.data.product.name) || '好物推荐';
    return {
      title: name,
      query: `shopId=${this.data.shopId || 'shop1'}&productId=${this.data.productId || ''}`,
    };
  },
});
