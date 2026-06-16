import { create } from 'zustand';
import { AppState, UserRole, Customer, Shop, Employee, Product, CartItem } from '../shared/types';
import { mockCustomers, mockShops, shopPasswords, stylistPasswords, ceoPasswords, csPasswords, managerPasswords } from '../shared/mockData';

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
  updateShop: (shopData: Partial<Shop>) =>
    set((state) => state.currentShop ? { currentShop: { ...state.currentShop, ...shopData } } : state),
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
      role: UserRole.STYLIST,
    });
    return stylist;
  }
  return null;
};

// 新增：通用员工登录（支持 CEO / 客服专员 / 店长 等所有角色）
export const loginAsEmployee = (
  shopId: string,
  employeeId: string,
  password?: string
): Employee | null => {
  const shop = mockShops.find((s) => s.id === shopId);
  const employee = shop?.employees.find((e) => e.id === employeeId);
  if (shop && employee) {
    // 验证密码（根据角色选择对应的密码映射表）
    if (password !== undefined) {
      let expected: string | undefined;
      if (employee.role === UserRole.CEO) expected = ceoPasswords[employeeId];
      else if (employee.role === UserRole.CUSTOMER_SERVICE) expected = csPasswords[employeeId];
      else if (employee.role === UserRole.SHOP_MANAGER) expected = managerPasswords[employeeId];
      else expected = stylistPasswords[employeeId] || shopPasswords[shopId];

      if (expected && password !== expected) {
        return null;
      }
    }
    useAppStore.getState().setCurrentShop(shop);
    useAppStore.getState().setCurrentEmployee({
      ...employee,
      role: employee.role || UserRole.STYLIST,
    });
    return employee;
  }
  return null;
};
