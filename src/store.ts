import { create } from 'zustand';
import { AppState, UserRole, Customer, Shop, Employee, Product, CartItem } from '../shared/types';
import { mockCustomers, mockShops, shopPasswords, stylistPasswords } from '../shared/mockData';

export const useAppStore = create<AppState>((set, get) => ({
  userRole: null,
  currentCustomer: null,
  currentShop: null,
  currentEmployee: null,
  cart: [],
  setUserRole: (role: UserRole) => set({ userRole: role }),
  setCurrentCustomer: (customer: Customer | null) => 
    set({ currentCustomer: customer, userRole: customer ? UserRole.CUSTOMER : null }),
  setCurrentShop: (shop: Shop | null) => 
    set({ currentShop: shop, userRole: shop ? UserRole.SHOP_OWNER : null }),
  setCurrentEmployee: (employee: Employee | null) => 
    set({ 
      currentEmployee: employee, 
      userRole: employee?.role || null 
    }),
  logout: () => set({ 
    userRole: null, 
    currentCustomer: null, 
    currentShop: null, 
    currentEmployee: null,
    cart: []
  }),
  // 购物车操作
  addToCart: (product: Product, quantity: number = 1) => {
    const { cart } = get();
    const existingItem = cart.find(item => item.productId === product.id);
    
    if (existingItem) {
      set({
        cart: cart.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      });
    } else {
      const newItem: CartItem = {
        id: `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        productId: product.id,
        product,
        quantity,
        selected: true,
      };
      set({ cart: [...cart, newItem] });
    }
  },
  updateCartItem: (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeFromCart(itemId);
      return;
    }
    set({
      cart: get().cart.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      )
    });
  },
  removeFromCart: (itemId: string) => {
    set({
      cart: get().cart.filter(item => item.id !== itemId)
    });
  },
  toggleCartItemSelection: (itemId: string) => {
    set({
      cart: get().cart.map(item =>
        item.id === itemId ? { ...item, selected: !item.selected } : item
      )
    });
  },
  selectAllCartItems: (selected: boolean) => {
    set({
      cart: get().cart.map(item => ({ ...item, selected }))
    });
  },
  clearCart: () => {
    set({ cart: [] });
  },
}));

// 简单的登录函数
export const loginAsCustomer = (phone: string): Customer | null => {
  const customer = mockCustomers.find(c => c.phone === phone);
  if (customer) {
    useAppStore.getState().setCurrentCustomer(customer);
    return customer;
  }
  return null;
};

export const loginAsShop = (shopId: string, password?: string): Shop | null => {
  const shop = mockShops.find(s => s.id === shopId);
  if (shop) {
    // 如果提供了密码，则验证密码
    if (password !== undefined && shopPasswords[shopId] && password !== shopPasswords[shopId]) {
      return null;
    }
    useAppStore.getState().setCurrentShop(shop);
    return shop;
  }
  return null;
};

// 新增：登录为发型师
export const loginAsStylist = (shopId: string, stylistId: string, password?: string): Employee | null => {
  const shop = mockShops.find(s => s.id === shopId);
  const stylist = shop?.employees.find(e => e.id === stylistId);
  if (shop && stylist) {
    // 如果提供了密码，则验证密码
    if (password !== undefined && stylistPasswords[stylistId] && password !== stylistPasswords[stylistId]) {
      return null;
    }
    useAppStore.getState().setCurrentShop(shop);
    useAppStore.getState().setCurrentEmployee({
      ...stylist,
      role: UserRole.STYLIST
    });
    return stylist;
  }
  return null;
};
