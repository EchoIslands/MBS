import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppState, UserRole, Customer, Shop, Employee, Product, CartItem } from '../shared/types';
import { mockCustomers, mockShops, shopPasswords, stylistPasswords, ceoPasswords, csPasswords, managerPasswords } from '../shared/mockData';

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      userRole: null,
      currentCustomer: null,
      currentShop: null,
      currentEmployee: null,
      cart: [],
      hasHydrated: false,
      setUserRole: (role: UserRole) => set({ userRole: role }),
      setCurrentCustomer: (customer: Customer | null) => {
        set({ currentCustomer: customer, userRole: customer ? UserRole.CUSTOMER : null });
        saveCustomerSession(customer);
      },
      setCurrentShop: (shop: Shop | null) => 
        set({ currentShop: shop, userRole: shop ? UserRole.SHOP_OWNER : null }),
      updateShop: (shopData: Partial<Shop>) =>
        set((state) => state.currentShop ? { currentShop: { ...state.currentShop, ...shopData } } : state),
      setCurrentEmployee: (employee: Employee | null) => {
        set((state) => {
          const next = { 
            currentEmployee: employee, 
            userRole: employee?.role || null 
          };
          saveEmployeeSession({
            currentShop: state.currentShop,
            currentEmployee: employee,
            userRole: employee?.role || null,
          });
          return next;
        });
      },
      updateCurrentEmployee: (employeeData: Partial<Employee>) => {
        set((state) => {
          if (!state.currentEmployee) return state;
          const updated = { ...state.currentEmployee, ...employeeData };
          const next = { currentEmployee: updated };
          saveEmployeeSession({
            currentShop: state.currentShop,
            currentEmployee: updated,
            userRole: updated.role || state.userRole,
          });
          return next;
        });
      },
      logout: () => {
        saveCustomerSession(null);
        saveEmployeeSession({ currentShop: null, currentEmployee: null, userRole: null });
        set({ 
          userRole: null, 
          currentCustomer: null, 
          currentShop: null, 
          currentEmployee: null,
          cart: []
        });
      },
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
      setHasHydrated: (value: boolean) => set({ hasHydrated: value }),
    }),
    {
      name: 'mbs_app_store',
      // 购物车可持久化，但登录会话按角色单独存储，避免多标签页互相覆盖
      partialize: (state) => ({ cart: state.cart }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);

// 会话持久化 key
const CUSTOMER_SESSION_KEY = 'mbs_customer_session';
const EMPLOYEE_SESSION_KEY = 'mbs_employee_session';

// 保存/读取顾客会话
const saveCustomerSession = (customer: Customer | null) => {
  try {
    if (customer) {
      localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(customer));
    } else {
      localStorage.removeItem(CUSTOMER_SESSION_KEY);
    }
  } catch (_e) { /* ignore */ }
};

const loadCustomerSession = (): Customer | null => {
  try {
    const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Customer;
  } catch (_e) { return null; }
};

// 保存/读取员工会话
const saveEmployeeSession = (state: { currentShop: Shop | null; currentEmployee: Employee | null; userRole: UserRole | null }) => {
  try {
    if (state.currentEmployee) {
      localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(EMPLOYEE_SESSION_KEY);
    }
  } catch (_e) { /* ignore */ }
};

const loadEmployeeSession = (): { currentShop: Shop | null; currentEmployee: Employee | null; userRole: UserRole | null } | null => {
  try {
    const raw = localStorage.getItem(EMPLOYEE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { currentShop: Shop | null; currentEmployee: Employee | null; userRole: UserRole | null };
  } catch (_e) { return null; }
};

// 应用启动时恢复员工会话
export const restoreEmployeeSession = () => {
  const session = loadEmployeeSession();
  if (session?.currentEmployee) {
    useAppStore.setState({
      currentShop: session.currentShop,
      currentEmployee: session.currentEmployee,
      userRole: session.userRole,
    });
  }
};

// 应用启动时恢复顾客会话
export const restoreCustomerSession = () => {
  const customer = loadCustomerSession();
  if (customer) {
    useAppStore.setState({
      currentCustomer: customer,
      userRole: UserRole.CUSTOMER,
    });
  }
};

// 简单的登录函数
export const loginAsCustomer = (phone: string): Customer | null => {
  const customer = mockCustomers.find(c => c.phone === phone);
  if (customer) {
    useAppStore.getState().setCurrentCustomer(customer);
    saveCustomerSession(customer);
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
    const employee: Employee = { ...stylist, role: UserRole.STYLIST };
    useAppStore.setState({ currentShop: shop, currentEmployee: employee, userRole: employee.role });
    saveEmployeeSession({ currentShop: shop, currentEmployee: employee, userRole: employee.role });
    return employee;
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
    const loggedInEmployee: Employee = {
      ...employee,
      role: employee.role || UserRole.STYLIST,
    };
    useAppStore.setState({
      currentShop: shop,
      currentEmployee: loggedInEmployee,
      userRole: loggedInEmployee.role,
    });
    saveEmployeeSession({
      currentShop: shop,
      currentEmployee: loggedInEmployee,
      userRole: loggedInEmployee.role,
    });
    return loggedInEmployee;
  }
  return null;
};
