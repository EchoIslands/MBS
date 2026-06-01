import { create } from 'zustand';
import { AppState, UserRole, Customer, Shop } from '../shared/types';
import { mockCustomers, mockShops, shopPasswords } from '../shared/mockData';

export const useAppStore = create<AppState>((set) => ({
  userRole: null,
  currentCustomer: null,
  currentShop: null,
  setUserRole: (role: UserRole) => set({ userRole: role }),
  setCurrentCustomer: (customer: Customer | null) => 
    set({ currentCustomer: customer, userRole: customer ? 'customer' : null }),
  setCurrentShop: (shop: Shop | null) => 
    set({ currentShop: shop, userRole: shop ? 'shop' : null }),
  logout: () => set({ userRole: null, currentCustomer: null, currentShop: null }),
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
