/**
 * 小程序购物车本地存储
 * - 与 H5 的 cart 状态对应，结构保持一致
 * - 商品信息随购物车缓存，避免依赖页面间传参
 */

import { getCustomerId } from './storage';

function cartKey(shopId = 'shop1') { return 'mbs_mini_cart_v2:' + (getCustomerId() || 'guest') + ':' + shopId; }

function loadCart(shopId) {
  try {
    const raw = wx.getStorageSync(cartKey(shopId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[cart] 读取购物车失败:', e);
    return [];
  }
}

function saveCart(cart, shopId) {
  try {
    wx.setStorageSync(cartKey(shopId), JSON.stringify(cart || []));
  } catch (e) {
    console.error('[cart] 保存购物车失败:', e);
  }
}

function generateId() {
  return `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getCart(shopId) {
  return loadCart(shopId);
}

export function getCartCount(shopId) {
  return loadCart(shopId).reduce((sum, item) => sum + (item.quantity || 0), 0);
}

export function addToCart(product, quantity = 1) {
  const shopId = product.shopId || 'shop1';
  const previous = loadCart(shopId);
  const cart = previous.filter(item => (item.product?.shopId || 'shop1') === (product.shopId || 'shop1'));
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
  saveCart(cart, shopId);
  return cart;
}

export function updateCartItem(itemId, quantity, shopId) {
  const cart = loadCart(shopId);
  const index = cart.findIndex((item) => item.id === itemId);
  if (index === -1) return cart;
  if (quantity <= 0) {
    cart.splice(index, 1);
  } else {
    const maxStock = Number(cart[index].product?.stock) || 0;
    cart[index].quantity = Math.min(quantity, maxStock);
  }
  saveCart(cart, shopId);
  return cart;
}

export function removeFromCart(itemId, shopId) {
  const cart = loadCart(shopId).filter((item) => item.id !== itemId);
  saveCart(cart, shopId);
  return cart;
}

export function toggleCartItemSelection(itemId, shopId) {
  const cart = loadCart(shopId);
  const item = cart.find((i) => i.id === itemId);
  if (item) {
    item.selected = !item.selected;
    saveCart(cart, shopId);
  }
  return cart;
}

export function selectAllCartItems(selected, shopId) {
  const cart = loadCart(shopId).map((item) => ({ ...item, selected }));
  saveCart(cart, shopId);
  return cart;
}

export function clearCart(shopId) {
  saveCart([], shopId);
  return [];
}

export function clearSelectedCartItems(shopId) {
  const cart = loadCart(shopId).filter((item) => !item.selected);
  saveCart(cart, shopId);
  return cart;
}
