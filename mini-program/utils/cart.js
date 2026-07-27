/**
 * 小程序购物车本地存储
 * - 与 H5 的 cart 状态对应，结构保持一致
 * - 商品信息随购物车缓存，避免依赖页面间传参
 */

const CART_KEY = 'mbs_mini_cart';

function loadCart() {
  try {
    const raw = wx.getStorageSync(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[cart] 读取购物车失败:', e);
    return [];
  }
}

function saveCart(cart) {
  try {
    wx.setStorageSync(CART_KEY, JSON.stringify(cart || []));
  } catch (e) {
    console.error('[cart] 保存购物车失败:', e);
  }
}

function generateId() {
  return `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getCart() {
  return loadCart();
}

export function getCartCount() {
  return loadCart().reduce((sum, item) => sum + (item.quantity || 0), 0);
}

export function addToCart(product, quantity = 1) {
  const cart = loadCart();
  const maxStock = Number(product.stock) || 0;
  if (maxStock <= 0) return cart;

  const existing = cart.find((item) => item.productId === product.id);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, maxStock);
  } else {
    cart.push({
      id: generateId(),
      productId: product.id,
      product,
      quantity: Math.min(quantity, maxStock),
      selected: true,
    });
  }
  saveCart(cart);
  return cart;
}

export function updateCartItem(itemId, quantity) {
  const cart = loadCart();
  const index = cart.findIndex((item) => item.id === itemId);
  if (index === -1) return cart;
  if (quantity <= 0) {
    cart.splice(index, 1);
  } else {
    const maxStock = Number(cart[index].product?.stock) || 0;
    cart[index].quantity = Math.min(quantity, maxStock);
  }
  saveCart(cart);
  return cart;
}

export function removeFromCart(itemId) {
  const cart = loadCart().filter((item) => item.id !== itemId);
  saveCart(cart);
  return cart;
}

export function toggleCartItemSelection(itemId) {
  const cart = loadCart();
  const item = cart.find((i) => i.id === itemId);
  if (item) {
    item.selected = !item.selected;
    saveCart(cart);
  }
  return cart;
}

export function selectAllCartItems(selected) {
  const cart = loadCart().map((item) => ({ ...item, selected }));
  saveCart(cart);
  return cart;
}

export function clearCart() {
  saveCart([]);
  return [];
}

export function clearSelectedCartItems() {
  const cart = loadCart().filter((item) => !item.selected);
  saveCart(cart);
  return cart;
}
