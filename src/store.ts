import { isRealApi, getApiBase } from '../shared/api-base';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppState, UserRole, Customer, Shop, Employee, Product, CartItem } from '../shared/types';
import { mockCustomers, mockShops, shopPasswords, stylistPasswords, ceoPasswords, csPasswords, managerPasswords } from '../shared/mockData';
import { customerApi, clearAuthToken, authApi, shopApi } from './api';

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
        clearAuthToken();
        if (isRealApi()) void fetch(getApiBase() + '/customers/logout', { method: 'POST', credentials: 'include' }).catch(() => {
          console.warn('[logout] 顾客会话注销请求未完成，请关闭共享设备上的浏览器');
        });
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

// 员工自定义密码持久化（自助修改密码）
import { getEmployeePassword, setEmployeePassword } from './lib/employeePassword';
export { getEmployeePassword, setEmployeePassword };

// 应用启动时恢复员工会话
let restoringEmployee: Promise<void> | null=null;
export const restoreEmployeeSession = (): Promise<void> => {
  if(restoringEmployee) return restoringEmployee;
  restoringEmployee=(async()=>{
    const session=loadEmployeeSession();
    if(!session?.currentEmployee) return;
    if(isRealApi()) {for(const key of Object.keys(localStorage)) if(key.startsWith('mbs_employee_password_')) localStorage.removeItem(key);}
    if(!isRealApi()) {useAppStore.setState({...session});return;}
    const user=await authApi.getCurrentUser() as (Employee & {shopId:string}) | null;
    if(!user?.id || !user.shopId) {
      clearAuthToken();saveEmployeeSession({currentShop:null,currentEmployee:null,userRole:null});
      useAppStore.setState({currentShop:null,currentEmployee:null,userRole:null});return;
    }
    const shop=await shopApi.getShop(user.shopId);
    if(!shop) throw new Error('门店信息不可用');
    useAppStore.setState({currentShop:shop,currentEmployee:user,userRole:user.role});
    saveEmployeeSession({currentShop:shop,currentEmployee:user,userRole:user.role});
  })().catch(()=>{
    // 恢复失败不能信任缓存身份；保留登录入口供重试。
    useAppStore.setState({currentShop:null,currentEmployee:null,userRole:null});
  }).finally(()=>{restoringEmployee=null;});
  return restoringEmployee;
};

// 应用启动时恢复顾客会话
export const restoreCustomerSession = async () => {
  const customer = loadCustomerSession();
  if (!customer) return;
  if (isRealApi()) {
    try {
      const response = await fetch(getApiBase() + '/customers/' + encodeURIComponent(customer.id) + '/public', { credentials: 'include' });
      if (!response.ok) throw new Error('会话失效');
      const result = await response.json();
      if (!result.success || !result.data) throw new Error('会话失效');
      useAppStore.getState().setCurrentCustomer(result.data);
    } catch {
      saveCustomerSession(null);
      useAppStore.setState({ currentCustomer: null });
    }
    return;
  }
  useAppStore.setState({ currentCustomer: customer, userRole: UserRole.CUSTOMER });
};

// 顾客登录：真实模式必须通过身份验证，失败不能回退演示数据
export const loginAsCustomer = async (
  phone: string,
  password?: string,
  setupPassword = false
): Promise<{ setupRequired: boolean; customer?: Customer }> => {
  const trimmedPhone = phone.trim();

  // 1. 尝试真实 API 登录
  try {
    const result = await customerApi.login(trimmedPhone, password, setupPassword);
    if (result?.setupRequired) return result;
    if (result) {
      if (result.customer) useAppStore.getState().setCurrentCustomer(result.customer);
      return result;
    }
  } catch (err) {
    if (isRealApi()) throw err;
    console.error('[loginAsCustomer] 登录失败');
  }

  if (isRealApi()) return { setupRequired: false };
  // 2. 仅演示模式使用 mock 数据
  const customer = mockCustomers.find(c => c.phone === trimmedPhone);
  if (customer) {
    useAppStore.getState().setCurrentCustomer(customer);
    return { setupRequired: false, customer };
  }
  return { setupRequired: false };
};

export const loginAsShop = (shopId: string, password?: string): Shop | null => {
  if(isRealApi()) return null;
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
  if(isRealApi()) return null;
  const shop = mockShops.find(s => s.id === shopId);
  const stylist = shop?.employees.find(e => e.id === stylistId);
  if (shop && stylist) {
    // 如果提供了密码，则验证密码（优先使用员工自定义密码）
    if (password !== undefined) {
      const customPassword = getEmployeePassword(stylistId);
      const expected = customPassword ?? stylistPasswords[stylistId];
      if (expected && password !== expected) {
        return null;
      }
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
    // 验证密码（优先使用员工自定义密码，回退到默认映射表）
    if (password !== undefined) {
      const customPassword = getEmployeePassword(employeeId);
      let defaultPassword: string | undefined;
      if (employee.role === UserRole.CEO) defaultPassword = ceoPasswords[employeeId];
      else if (employee.role === UserRole.CUSTOMER_SERVICE) defaultPassword = csPasswords[employeeId];
      else if (employee.role === UserRole.SHOP_MANAGER) defaultPassword = managerPasswords[employeeId];
      else defaultPassword = stylistPasswords[employeeId] || shopPasswords[shopId];

      const expected = customPassword ?? defaultPassword;
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
