import { getShopProducts } from '../../api/product';
import { getCustomerPublic } from '../../api/customer';
import { addToCart, getCartCount } from '../../utils/cart';
import { getCustomerId } from '../../utils/storage';
import { calcDiscountedItemPrice } from '../../utils/membership';

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
  data: {
    shopId: 'shop1',
    customer: null,
    products: [],
    filteredProducts: [],
    categories,
    selectedCategory: 'all',
    searchQuery: '',
    sortBy: 'sales',
    loading: true,
    cartCount: 0,
  },

  onLoad(options) {
    const shopId = options.shopId || 'shop1';
    this.setData({ shopId });
    this.loadCustomer();
    this.loadProducts();
  },

  onShow() {
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
      this.applyFilter();
    } catch (err) {
      console.error('[products] 加载顾客信息失败:', err);
      this.setData({ customer: null });
    }
  },

  getMemberPrice(product) {
    const { customer } = this.data;
    return calcDiscountedItemPrice(product.price, customer, product.category);
  },

  async loadProducts() {
    this.setData({ loading: true });
    try {
      const products = await getShopProducts(this.data.shopId);
      this.setData({ products: products || [] }, () => {
        this.applyFilter();
      });
    } catch (err) {
      console.error('[products] 加载商品失败:', err);
      wx.showToast({ title: '商品加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  refreshCartCount() {
    this.setData({ cartCount: getCartCount() });
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
    wx.navigateBack();
  },
});
