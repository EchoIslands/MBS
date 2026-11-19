import { getShopProducts, getShopCoupons, getCustomerCoupons, claimCoupon } from '../../api/product';
import { getCustomerPublic } from '../../api/customer';
import { addToCart, getCartCount } from '../../utils/cart';
import { getCustomerId, setRouteParams, takeRouteParams } from '../../utils/storage';
import { ensureLogin } from '../../utils/auth';
import { calcDiscountedItemPrice } from '../../utils/membership';
import { createTabSwipeHandlers, syncTabBarSelected } from '../../utils/tab-swipe';

const categories = [
  { key: 'all', name: '全部' },
  { key: 'wig', name: '假发' },
  { key: 'hair_care', name: '洗护用品' },
  { key: 'styling', name: '造型产品' },
  { key: 'tools', name: '美发工具' },
  { key: 'accessory', name: '配饰' },
  { key: 'other', name: '其他' },
];

Page({
  ...createTabSwipeHandlers(1),
  data: {
    shopId: 'shop1',
    customer: null,
    products: [],
    filteredProducts: [],
    categories,
    selectedCategory: 'all',
    searchQuery: '',
    sortBy: 'recommended',
    loading: true,
    productsError: '',
    cartCount: 0,
    coupons: [],
    myCoupons: [],
    claimedMap: {},
    showCoupons: false,
    claimingId: '',
  },

  onLoad(options) {
    const routeParams = takeRouteParams();
    const shopId = options.shopId || routeParams?.shopId || 'shop1';
    this.setData({ shopId });
    this.loadProducts();
    this.loadCustomer();
    this.loadCoupons();
  },

  onShow() {
    syncTabBarSelected(this, 1);
    const routeParams = takeRouteParams();
    const shopChanged = routeParams?.shopId && routeParams.shopId !== this.data.shopId;
    if (shopChanged) {
      this._loadedCatalogShopId = null;
      this.setData({ shopId: routeParams.shopId, products: [], filteredProducts: [], coupons: [], myCoupons: [], claimedMap: {}, showCoupons: false });
    }
    if (shopChanged || this._productsShown) {
      this.loadProducts();
      this.loadCustomer();
      this.loadCoupons();
    }
    this._productsShown = true;
    this.refreshCartCount();
  },

  async loadCustomer() {
    const customerId = getCustomerId();
    const requestId = this._customerRequestId = (this._customerRequestId || 0) + 1;
    const isCurrent = () => this._customerRequestId === requestId && getCustomerId() === customerId;
    if (this.data.customer && this.data.customer.id !== customerId) {
      this.setData({ customer: null });
      this.applyFilter();
    }
    if (!customerId) {
      this.setData({ customer: null });
      this.applyFilter();
      return;
    }
    try {
      const customer = await getCustomerPublic(customerId);
      if (!isCurrent()) return;
      this.setData({ customer });
      this.applyFilter();
    } catch (err) {
      if (!isCurrent()) return;
      console.error('[products] 加载顾客信息失败:', err);
      this.setData({ customer: null });
      this.applyFilter();
    }
  },

  getMemberPrice(product) {
    const { customer } = this.data;
    return calcDiscountedItemPrice(product.price, customer, product.category);
  },

  async loadProducts() {
    const shopId = this.data.shopId;
    const requestId = this._productsRequestId = (this._productsRequestId || 0) + 1;
    const isCurrent = () => requestId === this._productsRequestId && shopId === this.data.shopId;
    const hasLoaded = this._loadedCatalogShopId === shopId;
    this.setData({ loading: !hasLoaded, productsError: '' });
    try {
      const products = await getShopProducts(shopId);
      if (!isCurrent()) return;
      this._loadedCatalogShopId = shopId;
      this.setData({ products: products || [] });
      this.applyFilter();
    } catch (err) {
      if (!isCurrent()) return;
      console.error('[products] 加载商品失败:', err);
      this.setData({ productsError: hasLoaded ? '商品更新失败，点击重试' : '商品加载失败，点击重试' });
    } finally {
      if (isCurrent()) this.setData({ loading: false });
    }
  },

  async loadCoupons() {
    const shopId = this.data.shopId;
    const customerId = getCustomerId();
    const requestId = this._couponsRequestId = (this._couponsRequestId || 0) + 1;
    try {
      const [coupons, myCoupons] = await Promise.all([
        getShopCoupons(shopId),
        customerId ? getCustomerCoupons(customerId, shopId, 'unused') : [],
      ]);
      if (requestId !== this._couponsRequestId || shopId !== this.data.shopId || customerId !== getCustomerId()) return;
      const claimedMap = {};
      (Array.isArray(myCoupons) ? myCoupons : []).forEach((mc) => {
        if (mc.couponId) claimedMap[mc.couponId] = true;
      });
      this.setData({ coupons: coupons || [], myCoupons: Array.isArray(myCoupons) ? myCoupons : [], claimedMap });
    } catch (err) {
      console.error('[products] 加载优惠券失败:', err);
    }
  },

  toggleCouponModal() {
    this.setData({ showCoupons: !this.data.showCoupons });
  },

  async onClaimCoupon(e) {
    const { couponId } = e.currentTarget.dataset;
    const customerId = getCustomerId();
    const requestId = this._customerRequestId = (this._customerRequestId || 0) + 1;
    const isCurrent = () => this._customerRequestId === requestId && getCustomerId() === customerId;
    if (!customerId) {
      ensureLogin({ content: '登录后即可领取优惠券' });
      return;
    }
    this.setData({ claimingId: couponId });
    try {
      const { customer } = this.data;
      await claimCoupon(couponId, customerId, customer?.name || '', customer?.phone || '');
      wx.showToast({ title: '领取成功', icon: 'success' });
      await this.loadCoupons();
    } catch (err) {
      wx.showToast({ title: err.message || '领取失败', icon: 'none' });
    } finally {
      this.setData({ claimingId: '' });
    }
  },

  hasClaimed(couponId) {
    return this.data.myCoupons.some((mc) => mc.couponId === couponId);
  },

  refreshCartCount() {
    this.setData({ cartCount: getCartCount(this.data.shopId) });
  },

  applyFilter() {
    const { products, searchQuery, selectedCategory, sortBy } = this.data;
    let result = (products || []).filter((p) => p.isActive !== false);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.category === selectedCategory);
    }

    switch (sortBy) {
      case 'recommended':
        result.sort((a, b) => {
          const aRec = a.isRecommended ? 1 : 0;
          const bRec = b.isRecommended ? 1 : 0;
          if (aRec !== bRec) return bRec - aRec;
          if ((b.sortOrder || 0) !== (a.sortOrder || 0)) return (b.sortOrder || 0) - (a.sortOrder || 0);
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
        break;
      case 'sales':
        result.sort((a, b) => (b.sales || 0) - (a.sales || 0));
        break;
      case 'price':
        result.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'rating':
        result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
    }

    // 计算会员价与展示字段，保持与购物车/结算价格一致；WXML 不直接调用方法，提前预计算
    result = result.map((p) => ({
      ...p,
      memberPrice: this.getMemberPrice(p),
      displayTags: (p.tags || []).slice(0, 2),
      ratingText: p.rating ? p.rating.toFixed(1) : '暂无',
    }));

    this.setData({ filteredProducts: result });
  },

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value }, () => this.applyFilter());
  },

  onCategoryTap(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ selectedCategory: key }, () => this.applyFilter());
  },

  onSortTap(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ sortBy: key }, () => this.applyFilter());
  },

  goToDetail(e) {
    const { productId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/product-detail/product-detail?shopId=${this.data.shopId}&productId=${productId}`,
    });
  },

  onProductImageError(e) {
    const id = e.currentTarget.dataset.id;
    const products = this.data.products.map(product => {
      if (product.id !== id) return product;
      const imageIndex = (product.imageIndex || 0) + 1;
      return { ...product, imageIndex, imageFailed: imageIndex >= (product.images || []).length };
    });
    this.setData({ products });
    this.applyFilter();
  },

  onAddToCart(e) {
    const { product } = e.currentTarget.dataset;
    if (!product || product.stock <= 0) {
      wx.showToast({ title: '库存不足', icon: 'none' });
      return;
    }
    addToCart(product, 1);
    this.refreshCartCount();
    wx.showToast({ title: '已加入购物车', icon: 'success' });
  },

  goToCart() {
    wx.navigateTo({
      url: `/pages/cart/cart?shopId=${this.data.shopId}`,
    });
  },

  goBack() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  preventBubble() {
    // 阻止优惠券弹窗内容区点击事件冒泡关闭弹窗
  },

  onShareAppMessage() {
    return {
      title: 'MBS 商城 · 美发好物',
      path: '/pages/products/products',
    };
  },

  onShareTimeline() {
    return {
      title: 'MBS 商城 · 美发好物',
      query: `shopId=${this.data.shopId || 'shop1'}`,
    };
  },
});
