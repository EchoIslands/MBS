import { Shop, Booking, Review, Queue, Customer, Employee, UserRole, PurchaseVIPLevel, StoredValueLevel, Settlement, MemberBenefitRecord, FinancialReport, RefundRequest, SatisfactionSurvey, Product, OwnerDashboard, StylistPerformance } from '../shared/types';
import { mockShops, mockBookings, mockReviews, mockQueues, mockCustomers, mockSettlements, mockMemberBenefitRecords } from '../shared/mockData';
import { purchaseVIPPlans, storedValuePlans } from '../shared/membershipPlans';

interface AuthUser extends Employee {
  shopId?: string;
  phone?: string;
  role?: UserRole;
}

// ====== 开关：是否使用真实后端 API ======
// 本地开发默认 false（走 mock + localStorage）
// 生产环境在 Vercel 中设置 VITE_USE_REAL_API=true 即可连接 Supabase
const USE_REAL_API =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_USE_REAL_API === 'true') ||
  false;

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE) || '/api';

// 认证 Token 存储
const AUTH_TOKEN_KEY = 'mbs_auth_token';
const AUTH_USER_KEY = 'mbs_auth_user';
const CUSTOMERS_CACHE_KEY = 'mbs_customers_cache';
const BOOKINGS_CACHE_KEY = 'mbs_bookings_cache';
const SETTLEMENTS_CACHE_KEY = 'mbs_settlements_cache';
const BENEFITS_CACHE_KEY = 'mbs_benefits_cache';
const SHOPS_CACHE_KEY = 'mbs_shops_cache';

// 启动时从 localStorage 恢复客户数据（真实 API 模式下不要覆盖 mock fallback）
if (!USE_REAL_API) {
  try {
    const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        mockCustomers.length = 0;
        mockCustomers.push(...parsed);
        console.log(`[cache] 已从 localStorage 恢复 ${parsed.length} 条客户数据`);
      }
    }
  } catch (e) {
    console.warn('[cache] 恢复客户数据失败:', e);
  }
}

// 启动时从 localStorage 恢复预约数据（真实 API 模式下不要覆盖 mock fallback）
if (!USE_REAL_API) {
  try {
    const cached = localStorage.getItem(BOOKINGS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const bookingsWithDates = parsed.map((b: Record<string, unknown>) => ({
          ...b,
          scheduledTime: new Date(b.scheduledTime as string),
          createdAt: b.createdAt ? new Date(b.createdAt as string) : new Date(),
        })) as unknown as Booking[];
        mockBookings.length = 0;
        mockBookings.push(...bookingsWithDates);
        console.log(`[cache] 已从 localStorage 恢复 ${parsed.length} 条预约数据`);
      }
    }
  } catch (e) {
    console.warn('[cache] 恢复预约数据失败:', e);
  }
}

// 保存预约数据到 localStorage
const saveBookingsToCache = () => {
  try {
    localStorage.setItem(BOOKINGS_CACHE_KEY, JSON.stringify(mockBookings));
  } catch (_e) {
    // ignore
  }
};

// 保存客户数据到 localStorage
const saveCustomersToCache = () => {
  try {
    localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(mockCustomers));
  } catch (_e) {
    // ignore
  }
};

// 启动时从 localStorage 恢复结算数据（真实 API 模式下不要覆盖 mock fallback）
if (!USE_REAL_API) {
  try {
    const cached = localStorage.getItem(SETTLEMENTS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const settlementsWithDates = parsed.map((s: Record<string, unknown>) => ({
          ...s,
          createdAt: s.createdAt ? new Date(s.createdAt as string) : new Date(),
        })) as unknown as Settlement[];
        mockSettlements.length = 0;
        mockSettlements.push(...settlementsWithDates);
        console.log(`[cache] 已从 localStorage 恢复 ${parsed.length} 条结算数据`);
      }
    }
  } catch (e) {
    console.warn('[cache] 恢复结算数据失败:', e);
  }
}

// 保存结算数据到 localStorage
const saveSettlementsToCache = () => {
  try {
    localStorage.setItem(SETTLEMENTS_CACHE_KEY, JSON.stringify(mockSettlements));
  } catch (_e) {
    // ignore
  }
};

// 启动时从 localStorage 恢复会员权益数据（真实 API 模式下不要覆盖 mock fallback）
if (!USE_REAL_API) {
  try {
    const cached = localStorage.getItem(BENEFITS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const benefitsWithDates = parsed.map((b: Record<string, unknown>) => ({
          ...b,
          createdAt: b.createdAt ? new Date(b.createdAt as string) : new Date(),
          expiresAt: b.expiresAt ? new Date(b.expiresAt as string) : undefined,
          usedAt: b.usedAt ? new Date(b.usedAt as string) : undefined,
        })) as unknown as MemberBenefitRecord[];
        mockMemberBenefitRecords.length = 0;
        mockMemberBenefitRecords.push(...benefitsWithDates);
        console.log(`[cache] 已从 localStorage 恢复 ${parsed.length} 条会员权益数据`);
      }
    }
  } catch (e) {
    console.warn('[cache] 恢复会员权益数据失败:', e);
  }
}

// 保存会员权益数据到 localStorage
const saveBenefitsToCache = () => {
  try {
    localStorage.setItem(BENEFITS_CACHE_KEY, JSON.stringify(mockMemberBenefitRecords));
  } catch (_e) {
    // ignore
  }
};

// 启动时从 localStorage 恢复店铺数据（真实 API 模式下不要覆盖 mock fallback）
if (!USE_REAL_API) {
  try {
    const cached = localStorage.getItem(SHOPS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        mockShops.length = 0;
        mockShops.push(...parsed);
        console.log(`[cache] 已从 localStorage 恢复 ${parsed.length} 条店铺数据`);
      }
    }
  } catch (e) {
    console.warn('[cache] 恢复店铺数据失败:', e);
  }
}

// 保存店铺数据到 localStorage
const saveShopsToCache = () => {
  try {
    localStorage.setItem(SHOPS_CACHE_KEY, JSON.stringify(mockShops));
  } catch (_e) {
    // ignore
  }
};

// 队列相关缓存
const QUEUES_CACHE_KEY = 'mbs_queues_cache';

// 启动时从 localStorage 恢复队列数据（真实 API 模式下不要覆盖 mock fallback）
if (!USE_REAL_API) {
  try {
    const cached = localStorage.getItem(QUEUES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        mockQueues.length = 0;
        mockQueues.push(...parsed);
        console.log(`[cache] 已从 localStorage 恢复 ${parsed.length} 条队列数据`);
      }
    }
  } catch (e) {
    console.warn('[cache] 恢复队列数据失败:', e);
  }
}

const saveQueuesToCache = () => {
  try {
    localStorage.setItem(QUEUES_CACHE_KEY, JSON.stringify(mockQueues));
  } catch (_e) {
    // ignore
  }
};

// 评价相关缓存
const REVIEWS_CACHE_KEY = 'mbs_reviews_cache';

// 启动时从 localStorage 恢复评价数据（真实 API 模式下不要覆盖 mock fallback）
if (!USE_REAL_API) {
  try {
    const cached = localStorage.getItem(REVIEWS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const reviewsWithDates = parsed.map((r: Record<string, unknown>) => ({
          ...r,
          createdAt: r.createdAt ? new Date(r.createdAt as string) : new Date(),
        })) as unknown as Review[];
        mockReviews.length = 0;
        mockReviews.push(...reviewsWithDates);
        console.log(`[cache] 已从 localStorage 恢复 ${parsed.length} 条评价数据`);
      }
    }
  } catch (e) {
    console.warn('[cache] 恢复评价数据失败:', e);
  }
}

const saveReviewsToCache = () => {
  try {
    localStorage.setItem(REVIEWS_CACHE_KEY, JSON.stringify(mockReviews));
  } catch (_e) {
    // ignore
  }
};

// 辅助函数：根据客户 ID 获取客户姓名
const getCustomerNameById = (customerId?: string): string => {
  if (!customerId) return '顾客';
  const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
  if (cached) {
    try {
      const list = JSON.parse(cached) as Customer[];
      const found = list.find((c) => c.id === customerId);
      if (found?.name) return found.name;
    } catch (_e) { /* ignore */ }
  }
  const found = mockCustomers.find((c) => c.id === customerId);
  return found?.name || '顾客';
};

// 保存 Token
export const saveAuthToken = (token: string) => {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
};

// 获取 Token
export const getAuthToken = (): string | null => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

// 删除 Token
export const clearAuthToken = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

// 保存用户信息
export const saveAuthUser = (user: unknown) => {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

// 获取用户信息
export const getAuthUser = (): unknown | null => {
  const user = localStorage.getItem(AUTH_USER_KEY);
  return user ? JSON.parse(user) : null;
};

// 认证相关 API
export const authApi = {
  // 登录
  login: async (phone: string, password: string): Promise<{ token: string; user: AuthUser }> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; error?: string; data: { token: string; user: AuthUser } }>(
        `${API_BASE}/auth/login`,
        {
          method: 'POST',
          body: JSON.stringify({ phone, password }),
        }
      );
      if (result?.success && result.data?.token) {
        saveAuthToken(result.data.token);
        saveAuthUser(result.data.user);
        return { token: result.data.token, user: result.data.user };
      }
      // 真实 API 明确返回失败时，直接抛错，不再降级到 mock token
      // 否则 mock token 会和后续真实 API 混用，导致 401
      throw new Error(result?.error || '手机号或密码错误');
    }

    // Mock 兜底
    const allEmployees = mockShops.flatMap((s) =>
      s.employees.map((e) => ({ ...e, shopId: s.id }))
    );
    const employee = allEmployees.find((e) => e.phone === phone);
    
    if (!employee || password !== '123456') {
      throw new Error('手机号或密码错误');
    }
    
    const mockUser = {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      avatar: employee.avatar || '',
      title: employee.title || '',
      role: employee.role || UserRole.STYLIST,
      shopId: employee.shopId,
      specialty: employee.specialty || '',
      rating: employee.rating || 5.0,
      isActive: true,
    };

    const fakeToken = 'mock_' + encodeURIComponent(JSON.stringify(mockUser));
    saveAuthToken(fakeToken);
    saveAuthUser(mockUser);
    return { token: fakeToken, user: mockUser as AuthUser };
  },
  
  // 获取当前用户
  getCurrentUser: async () => {
    const token = getAuthToken();
    if (!token) return null;
    
    // mock token 直接解析
    if (token.startsWith('mock_')) {
      try {
        const user = JSON.parse(decodeURIComponent(token.replace('mock_', '')));
        saveAuthUser(user);
        return user;
      } catch { return null; }
    }
    
    try {
      const result = await http<{ success: boolean; data?: unknown }>(
        `${API_BASE}/auth/me`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.success && result.data) {
        saveAuthUser(result.data);
        return result.data;
      }
      return null;
    } catch {
      return null;
    }
  },
  
  // 登出
  logout: () => {
    clearAuthToken();
  },
  
  // 检查是否已登录
  isAuthenticated: (): boolean => {
    return !!getAuthToken();
  },
  
  // 验证 Token
  verifyToken: async (): Promise<boolean> => {
    const token = getAuthToken();
    if (!token) return false;
    
    try {
      const result = await http<{
        success: boolean;
        valid?: boolean;
      }>(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      return result?.success === true;
    } catch {
      return false;
    }
  },
};

// 带有"失败自动回退 mock"的 HTTP 客户端。
// 当后端没启动、网络超时或任何异常时，不抛错，而是返回 null，
// 让上层调用方判断并自动 fallback 到 mockData。
const http = async <T>(url: string, opts: RequestInit = {}): Promise<T | null> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      // 404 是预期行为（该路由尚未实现），不打印警告
      if (res.status !== 404) {
        console.warn(`[api] ${url} 返回 ${res.status}，将使用 mock 数据`);
      }
      return null;
    }
    return res.json() as T;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[api] ${url} 请求失败（${message}），将使用 mock 数据`);
    return null;
  }
};

// 店铺相关 API
export const shopApi = {
  getNearbyShops: async (lat?: number, lon?: number, level?: string): Promise<Shop[]> => {
    if (USE_REAL_API) {
      const params = new URLSearchParams();
      if (lat !== undefined) params.set('lat', String(lat));
      if (lon !== undefined) params.set('lon', String(lon));
      if (level) params.set('level', level);
      const result = await http<{ success: boolean; data: Shop[] }>(`${API_BASE}/shops?${params.toString()}`);
      if (result?.data && result.data.length > 0) return result.data;
      console.warn('[api] /api/shops 返回空或失败，回退到 mock 数据');
      return mockShops;
    }
    await new Promise((r) => setTimeout(r, 300));
    return mockShops;
  },

  getShop: async (id: string): Promise<Shop> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Shop }>(`${API_BASE}/shops/${id}`);
      if (result?.data) return result.data;
      const fallback = mockShops.find((s) => s.id === id);
      if (fallback) return fallback;
    }
    await new Promise((r) => setTimeout(r, 200));
    const shop = mockShops.find((s) => s.id === id);
    if (!shop) throw new Error('Shop not found');
    return shop;
  },

  getShopBookings: async (id: string): Promise<Booking[]> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Booking[] }>(`${API_BASE}/shops/${id}/bookings`);
      if (result?.data) return result.data;
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockBookings.filter((b) => b.shopId === id);
  },

  getShopReviews: async (id: string): Promise<Review[]> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Review[] }>(`${API_BASE}/reviews/shop/${id}`);
      if (result?.data) return result.data;
      // 真实 API 已启用但未返回数据，说明后端异常，直接抛错避免静默 fallback
      throw new Error('后端评价接口异常，请检查数据库和部署状态');
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockReviews.filter((r) => r.shopId === id);
  },

  updateShop: async (id: string, data: Partial<Shop>): Promise<Shop | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Shop }>(`${API_BASE}/shops/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.data) return result.data;
    }
    const idx = mockShops.findIndex((s) => s.id === id);
    if (idx !== -1) {
      mockShops[idx] = { ...mockShops[idx], ...data } as Shop;
      saveShopsToCache();
      return mockShops[idx];
    }
    return null;
  },

  getShopQueue: async (id: string): Promise<Queue> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Queue }>(`${API_BASE}/shops/${id}/queue`);
      if (result?.data) return result.data;
    }
    await new Promise((r) => setTimeout(r, 200));
    const queue = mockQueues.find((q) => q.shopId === id);
    if (!queue) throw new Error('Queue not found');
    return queue;
  },
};

// 员工相关 API
export const employeeApi = {
  getAll: async (): Promise<Employee[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Employee[] }>(`${API_BASE}/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.data) return result.data;
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockShops[0]?.employees || [];
  },

  create: async (data: Partial<Employee> & { password: string; phone: string }): Promise<Employee | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Employee }>(`${API_BASE}/employees`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.data) return result.data;
    }
    await new Promise((r) => setTimeout(r, 200));
    const newEmployee: Employee = {
      id: `emp_${Date.now()}`,
      name: data.name || '',
      phone: data.phone,
      title: data.title || '',
      role: (data.role || UserRole.STYLIST) as UserRole,
      specialty: data.specialty || '',
      rating: 5,
      avatar: data.avatar || '',
      isActive: true,
    };
    if (mockShops[0]) {
      mockShops[0].employees = mockShops[0].employees || [];
      mockShops[0].employees.push(newEmployee);
      saveShopsToCache();
    }
    return newEmployee;
  },

  update: async (id: string, data: Partial<Employee> & { password?: string }): Promise<Employee | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Employee }>(`${API_BASE}/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.data) return result.data;
    }
    await new Promise((r) => setTimeout(r, 200));
    if (mockShops[0]?.employees) {
      const idx = mockShops[0].employees.findIndex((e) => e.id === id);
      if (idx !== -1) {
        mockShops[0].employees[idx] = { ...mockShops[0].employees[idx], ...data } as Employee;
        saveShopsToCache();
        return mockShops[0].employees[idx];
      }
    }
    return null;
  },

  updateMe: async (data: Partial<Employee> & { password?: string }): Promise<Employee | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Employee }>(`${API_BASE}/employees/me`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.data) return result.data;
    }
    // Mock fallback：更新 mockShops 中当前登录员工的信息
    await new Promise((r) => setTimeout(r, 200));
    const currentUser = getAuthUser() as Employee | null;
    if (!currentUser || !mockShops[0]?.employees) return null;
    const idx = mockShops[0].employees.findIndex((e) => e.id === currentUser.id);
    if (idx !== -1) {
      mockShops[0].employees[idx] = { ...mockShops[0].employees[idx], ...data } as Employee;
      saveShopsToCache();
      return mockShops[0].employees[idx];
    }
    return null;
  },

  delete: async (id: string): Promise<boolean> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean }>(`${API_BASE}/employees/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      return result?.success === true;
    }
    await new Promise((r) => setTimeout(r, 200));
    if (mockShops[0]?.employees) {
      const before = mockShops[0].employees.length;
      mockShops[0].employees = mockShops[0].employees.filter((e) => e.id !== id);
      saveShopsToCache();
      return mockShops[0].employees.length < before;
    }
    return false;
  },
};

// 将后端/模拟数据转换为统一的 Booking 格式
function normalizeBooking(b: unknown): Booking {
  const raw = b as Record<string, unknown>;
  const scheduledTime = raw.scheduledTime instanceof Date
    ? raw.scheduledTime
    : new Date((raw.scheduledTime as string | number | undefined) || (raw.scheduled_time as string | number | undefined));
  return {
    id: raw.id as string,
    shopId: ((raw.shopId || raw.shop_id) as string | undefined),
    customerId: ((raw.customerId || raw.customer_id) as string | undefined),
    serviceId: ((raw.serviceId || raw.service_id) as string | undefined),
    barberId: (raw.barberId || raw.stylistId || raw.barber_id || raw.stylist_id) as string | undefined,
    barberName: (raw.barberName || raw.stylistName || raw.barber_name || raw.stylist_name) as string,
    scheduledTime,
    status: (raw.status || 'confirmed') as Booking['status'],
    queueNumber: (raw.queueNumber || raw.queue_number || 1) as number,
    serviceName: (raw.serviceName || raw.service_name || '服务') as string,
    price: typeof raw.price === 'number' ? raw.price : 0,
    customerName: (raw.customerName || raw.customer_name || '顾客') as string,
    shopName: (raw.shopName || raw.shop_name || '店铺') as string,
    createdAt: raw.createdAt ? (raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt as string | number)) : new Date(),
  };
}

// 预约相关 API
export const bookingApi = {
  createBooking: async (
    data: {
      shopId: string;
      customerId: string;
      serviceId: string;
      scheduledTime: Date | string;
      barberId?: string;
      barberName?: string;
      stylistId?: string;
      stylistName?: string;
      status?: Booking['status'];
      notes?: string;
    },
  ): Promise<Booking> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Booking }>(`${API_BASE}/bookings`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result?.data && result.data.id) {
        console.log('[api] createBooking 返回真实数据:', result.data);
        return normalizeBooking(result.data);
      }
      console.warn('[api] /api/bookings 创建失败，使用本地模拟');
    }
    await new Promise((r) => setTimeout(r, 300));
    const shop = mockShops.find((s) => s.id === data.shopId);
    const service = shop?.services?.find((s) => s.id === data.serviceId);

    const newBooking: Booking = {
      id: Date.now().toString(),
      ...data,
      scheduledTime: data.scheduledTime instanceof Date ? data.scheduledTime : new Date(data.scheduledTime),
      status: data.status || 'pending',
      queueNumber: mockBookings.filter((b) => b.shopId === data.shopId).length + 1,
      serviceName: service?.name || '服务',
      price: service?.price || 0,
      customerName: getCustomerNameById(data.customerId),
      shopName: shop?.name || '店铺',
      createdAt: new Date(),
    };

    mockBookings.push(newBooking);
    saveBookingsToCache();
    // 同时保存队列缓存，确保排队页数据同步
    saveQueuesToCache();
    console.log('[api] createBooking 返回模拟数据:', newBooking);
    return newBooking;
  },

  getBooking: async (id: string): Promise<Booking> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Booking }>(`${API_BASE}/bookings/${id}`);
      if (result?.data && result.data.id) {
        console.log('[api] getBooking 返回真实数据:', result.data);
        return normalizeBooking(result.data);
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    const booking = mockBookings.find((b) => b.id === id);
    if (!booking) throw new Error('Booking not found');
    console.log('[api] getBooking 返回模拟数据:', booking);
    return booking;
  },

  updateBookingStatus: async (id: string, status: Booking['status'], customerId?: string): Promise<Booking> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Booking }>(`${API_BASE}/bookings/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, customerId }),
      });
      if (result?.data && result.data.id) return result.data;
      if (result && !result.success) {
        throw new Error('更新预约状态失败');
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    const idx = mockBookings.findIndex((b) => b.id === id);
    if (idx !== -1) {
      mockBookings[idx] = { ...mockBookings[idx], status };
      saveBookingsToCache();
    }
    const booking = mockBookings.find((b) => b.id === id);
    if (!booking) throw new Error('Booking not found');
    return booking;
  },

  updateBookingBarber: async (id: string, stylistId: string, stylistName: string): Promise<Booking> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Booking }>(`${API_BASE}/bookings/${id}/barber`, {
        method: 'PUT',
        body: JSON.stringify({ stylistId, stylistName }),
      });
      if (result?.data && result.data.id) return result.data;
      if (result && !result.success) {
        throw new Error('调配发型师失败');
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    const idx = mockBookings.findIndex((b) => b.id === id);
    if (idx !== -1) {
      mockBookings[idx] = { ...mockBookings[idx], barberId: stylistId, barberName: stylistName };
      saveBookingsToCache();
    }
    const booking = mockBookings.find((b) => b.id === id);
    if (!booking) throw new Error('Booking not found');
    return booking;
  },

  getCustomerBookings: async (customerId: string): Promise<Booking[]> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Booking[] }>(`${API_BASE}/bookings/customer/${customerId}`);
      if (result?.data) return result.data;
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockBookings.filter((b) => b.customerId === customerId);
  },

  getBookingsByShop: async (shopId: string, dateStart?: string, status?: string): Promise<Booking[]> => {
    if (USE_REAL_API) {
      const params = new URLSearchParams();
      params.set('shopId', shopId);
      if (dateStart) params.set('dateStart', dateStart);
      if (status) params.set('status', status);
      const result = await http<{ success: boolean; data: Booking[] }>(
        `${API_BASE}/bookings?${params.toString()}`
      );
      if (result?.data) return result.data.map(normalizeBooking);
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockBookings.filter((b) => {
      if (b.shopId !== shopId) return false;
      if (dateStart) {
        const bookingDate = new Date(b.scheduledTime).toDateString();
        const filterDate = new Date(dateStart).toDateString();
        if (bookingDate !== filterDate) return false;
      }
      if (status && b.status !== status) return false;
      return true;
    });
  },
};

// 辅助：将客户数据中的日期字符串转换为 Date 对象
const normalizeCustomerDates = (customer: Customer): Customer => {
  const toDate = (v: unknown): Date | undefined => {
    if (!v) return undefined;
    if (v instanceof Date) return v;
    const d = new Date(v as string | number);
    return isNaN(d.getTime()) ? undefined : d;
  };
  return {
    ...customer,
    joinedAt: toDate(customer.joinedAt) || new Date(),
    lastVisitAt: toDate(customer.lastVisitAt),
    birthday: toDate(customer.birthday),
    purchaseVIPExpiresAt: toDate(customer.purchaseVIPExpiresAt),
    storedValueExpiresAt: toDate(customer.storedValueExpiresAt),
    stockholderSince: toDate(customer.stockholderSince),
    profile: customer.profile
      ? {
          ...customer.profile,
          createdAt: toDate(customer.profile.createdAt) || new Date(),
          updatedAt: toDate(customer.profile.updatedAt) || new Date(),
        }
      : customer.profile,
    visitRecords: (customer.visitRecords || []).map((vr) => ({
      ...vr,
      checkInTime: toDate(vr.checkInTime) || new Date(),
      checkOutTime: toDate(vr.checkOutTime),
      createdAt: toDate(vr.createdAt) || new Date(),
    })),
  };
};

// 客户相关 API
export const customerApi = {
  // 按手机号登录（查询真实 API，失败返回 null 由上层 fallback 到 mock）
  login: async (phone: string, name?: string): Promise<Customer | null> => {
    if (!USE_REAL_API) return null;
    const result = await http<{ success: boolean; data: Customer }>(`${API_BASE}/customers/login`, {
      method: 'POST',
      body: JSON.stringify({ phone, ...(name ? { name } : {}) }),
    });
    if (result?.success && result.data) {
      return normalizeCustomerDates(result.data);
    }
    return null;
  },

  // 获取全部客户（带缓存回退）
  getAll: async (): Promise<Customer[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Customer[] }>(
        `${API_BASE}/customers`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.success && Array.isArray(result.data)) {
        // 更新本地缓存
        try { localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(result.data)); } catch (_e) { /* ignore */ }
        return result.data.map(normalizeCustomerDates);
      }
      console.warn('[api] 获取客户列表失败，回退到本地缓存');
    }
    // 回退：先读 localStorage 缓存，再读 mock
    const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
    if (cached) {
      try {
        const list = JSON.parse(cached) as Customer[];
        return list.map(normalizeCustomerDates);
      } catch (_e) { /* ignore */ }
    }
    return [...mockCustomers];
  },

  create: async (data: Partial<Customer>): Promise<Customer> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Customer }>(`${API_BASE}/customers`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success) return result.data;
    }
    // Mock fallback
    const newCustomer = { id: `cust${Date.now()}`, ...data, joinedAt: new Date() } as Customer;
    mockCustomers.push(newCustomer);
    saveCustomersToCache();
    return newCustomer;
  },

  update: async (id: string, data: Partial<Customer>): Promise<Customer | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Customer }>(`${API_BASE}/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success) return result.data;
    }
    const idx = mockCustomers.findIndex((c) => c.id === id);
    if (idx !== -1) {
      mockCustomers[idx] = { ...mockCustomers[idx], ...data };
      saveCustomersToCache();
      return mockCustomers[idx];
    }
    return null;
  },

  delete: async (id: string): Promise<boolean> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean }>(`${API_BASE}/customers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success) return true;
    }
    const idx = mockCustomers.findIndex((c) => c.id === id);
    if (idx !== -1) {
      mockCustomers.splice(idx, 1);
      saveCustomersToCache();
      return true;
    }
    return false;
  },

  getById: async (id: string): Promise<Customer | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Customer }>(`${API_BASE}/customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success && result.data) return result.data;
    }
    const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
    if (cached) {
      try {
        const list = JSON.parse(cached) as Customer[];
        const found = list.find((c) => c.id === id);
        if (found) return found;
      } catch (_e) { /* ignore */ }
    }
    return mockCustomers.find((c) => c.id === id) || null;
  },

  updateProfile: async (id: string, profile: Partial<Customer['profile']>): Promise<Customer | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Customer }>(`${API_BASE}/customers/${id}/profile`, {
        method: 'PUT',
        body: JSON.stringify(profile),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success && result.data) return result.data;
    }
    const idx = mockCustomers.findIndex((c) => c.id === id);
    if (idx !== -1) {
      mockCustomers[idx] = {
        ...mockCustomers[idx],
        profile: { ...(mockCustomers[idx].profile || ({} as Customer['profile'])), ...profile },
      };
      saveCustomersToCache();
      return mockCustomers[idx];
    }
    return null;
  },
};

// 会员升级/储值 API
export const membershipApi = {
  upgrade: async (
    customerId: string,
    payload: {
      purchaseVIPLevel?: string;
      storedValueLevel?: string;
      paymentMethod?: string;
    }
  ): Promise<{ customer: Customer; vipAddAmount?: number; storedAddAmount?: number } | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: { customer: Customer; vipAddAmount?: number; storedAddAmount?: number } }>(
        `${API_BASE}/customers/${customerId}/membership`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (result?.data) return result.data;
    }
    // 本地模拟：直接修改 mockCustomers
    const idx = mockCustomers.findIndex((c) => c.id === customerId);
    if (idx === -1) return null;
    const customer = { ...mockCustomers[idx] };
    let vipAddAmount = 0;
    let storedAddAmount = 0;
    if (payload.purchaseVIPLevel) {
      const vipPrices: Record<string, number> = {
        regular: 0, bronze: 29, silver: 59, gold: 79, diamond: 99,
      };
      const currentPrice = vipPrices[customer.purchaseVIPLevel] || 0;
      const targetPrice = vipPrices[payload.purchaseVIPLevel] || 0;
      vipAddAmount = Math.max(0, targetPrice - currentPrice);
      customer.purchaseVIPLevel = payload.purchaseVIPLevel as PurchaseVIPLevel;
      const currentExpiry = customer.purchaseVIPExpiresAt ? new Date(customer.purchaseVIPExpiresAt).getTime() : 0;
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      customer.purchaseVIPExpiresAt = new Date(baseTime + 365 * 86400000);
    }
    if (payload.storedValueLevel) {
      const planAmounts: Record<string, number> = {
        none: 0, store_500: 500, store_1000: 1000, store_2000: 2000, store_5000: 5000,
      };
      const newAmount = planAmounts[payload.storedValueLevel] || 0;
      storedAddAmount = Math.max(0, newAmount - customer.storedValueBalance);
      customer.storedValueBalance += storedAddAmount;
      customer.balance = customer.storedValueBalance;
      customer.storedValueLevel = payload.storedValueLevel as StoredValueLevel;
      customer.storedValueExpiresAt = new Date(Date.now() + 2 * 365 * 86400000);
      customer.hasRecharged = payload.storedValueLevel !== 'none';
      customer.rechargeLevel = payload.storedValueLevel;
    }
    mockCustomers[idx] = customer;
    saveCustomersToCache();
    return { customer, vipAddAmount, storedAddAmount };
  },
};

// 评价相关 API
export const reviewApi = {
  getReviewByBookingId: async (bookingId: string): Promise<Review | null> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Review | null }>(`${API_BASE}/reviews/booking/${bookingId}`);
      if (result?.success && 'data' in result) return result.data;
      return null;
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockReviews.find((r) => r.bookingId === bookingId) || null;
  },

  getCustomerReviews: async (customerId: string): Promise<Review[]> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Review[] }>(`${API_BASE}/reviews/customer/${customerId}`);
      if (result?.data) return result.data;
      return [];
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockReviews.filter((r) => r.customerId === customerId);
  },

  createReview: async (
    data: Omit<Review, 'id' | 'overallScore' | 'customerName' | 'createdAt'>,
  ): Promise<Review> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Review }>(`${API_BASE}/reviews`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result?.data && result.data.id) return result.data;
      // 真实 API 已启用但未返回数据，说明后端异常，直接抛错避免静默 fallback
      throw new Error('提交评价失败，请检查后端接口和数据库');
    }
    await new Promise((r) => setTimeout(r, 300));
    const overallScore = Math.round(((data.serviceScore + data.stylistScore) / 2) * 10) / 10;
    const newReview: Review = {
      id: Date.now().toString(),
      ...data,
      overallScore,
      customerName: getCustomerNameById(data.customerId as string),
      createdAt: new Date(),
    };
    mockReviews.push(newReview);
    saveReviewsToCache();
    return newReview;
  },

  replyReview: async (id: string, reply: string, replyBy: string): Promise<Review> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Review }>(`${API_BASE}/reviews/${id}/reply`, {
        method: 'PUT',
        body: JSON.stringify({ reply, replyBy }),
      });
      if (result?.data && result.data.id) return result.data;
      throw new Error('回复评价失败，请检查后端接口');
    }
    await new Promise((r) => setTimeout(r, 300));
    const review = mockReviews.find((r) => r.id === id);
    if (!review) throw new Error('评价不存在');
    review.reply = reply;
    review.replyBy = replyBy;
    review.replyAt = new Date();
    saveReviewsToCache();
    return review;
  },

  hideReview: async (id: string, isHidden: boolean): Promise<Review> => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: Review }>(`${API_BASE}/reviews/${id}/hide`, {
        method: 'PUT',
        body: JSON.stringify({ isHidden }),
      });
      if (result?.data && result.data.id) return result.data;
      throw new Error('更新评价显示状态失败');
    }
    await new Promise((r) => setTimeout(r, 300));
    const review = mockReviews.find((r) => r.id === id);
    if (!review) throw new Error('评价不存在');
    review.isHidden = isHidden;
    saveReviewsToCache();
    return review;
  },
};

// 发型师业绩 API
export const stylistApi = {
  getPerformance: async (shopId: string): Promise<StylistPerformance[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: StylistPerformance[] }>(
        `${API_BASE}/stylists/performance?shopId=${shopId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.data) return result.data;
    }
    // Mock fallback
    return [];
  },
};

// 结算相关 API
export const settlementApi = {
  create: async (data: Partial<Settlement>): Promise<Settlement> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Settlement }>(`${API_BASE}/settlements`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success) return result.data;
    }
    // Mock fallback
    const newSettlement = {
      id: `settle_${Date.now()}`,
      ...data,
      paymentStatus: data.paymentStatus || 'completed',
      createdAt: new Date(),
    } as Settlement;
    mockSettlements.push(newSettlement);
    saveSettlementsToCache();

    // 如果有关联预约，更新预约状态为已完成
    if (data.bookingId) {
      const bookingIdx = mockBookings.findIndex((b) => b.id === data.bookingId);
      if (bookingIdx !== -1) {
        mockBookings[bookingIdx] = { ...mockBookings[bookingIdx], status: 'completed' as const };
        saveBookingsToCache();
      }
    }

    // 更新客户消费记录与会员数据
    if (data.customerId && data.total !== undefined) {
      const customerIdx = mockCustomers.findIndex((c) => c.id === data.customerId);
      if (customerIdx !== -1) {
        const customer = { ...mockCustomers[customerIdx] };
        const total = data.total;
        const purchaseLevel = customer.purchaseVIPLevel;
        const storedLevel = customer.storedValueLevel;
        const vipPlan = purchaseVIPPlans.find((p) => p.level === purchaseLevel);
        const storedPlan = storedValuePlans.find((p) => p.level === storedLevel);
        const pointsRate = (vipPlan?.pointsRate || 1) * (storedPlan?.pointsRate || 1);

        customer.totalSpent = Math.round(((customer.totalSpent || 0) + total) * 100) / 100;
        customer.visitCount = (customer.visitCount || 0) + 1;
        customer.points = Math.round(((customer.points || 0) + total * pointsRate) * 100) / 100;
        customer.lastVisitAt = new Date();
        customer.daysSinceLastVisit = 0;
        customer.hasBooking = false;

        // 如果用储值支付，更新客户余额及可提现返现余额
        if (data.paymentMethod === 'balance') {
          const principal = customer.storedValueBalance - (customer.withdrawableReferralAmount || 0);
          const usedPrincipal = Math.min(total, principal);
          const usedReferral = total - usedPrincipal;
          const newBalance = Math.round((customer.storedValueBalance - total) * 100) / 100;
          const newReferral = usedReferral > 0
            ? Math.round(((customer.withdrawableReferralAmount || 0) - usedReferral) * 100) / 100
            : (customer.withdrawableReferralAmount || 0);
          customer.storedValueBalance = newBalance;
          customer.balance = newBalance;
          customer.withdrawableReferralAmount = newReferral;
        }

        // 更新到店记录
        const serviceItems = (data.items || []).filter((i) => i.type === 'service');
        const newVisitRecord = {
          id: `vr_${Date.now()}`,
          customerId: customer.id,
          shopId: data.shopId || 'shop1',
          bookingId: data.bookingId,
          checkInTime: new Date(),
          totalAmount: total,
          stylistId: serviceItems[0]?.employeeId,
          stylistName: serviceItems[0]?.employeeName,
          serviceIds: serviceItems.map((i) => i.id),
          serviceNames: serviceItems.map((i) => i.name),
          products: (data.items || [])
            .filter((i) => i.type === 'product')
            .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })),
          paymentMethod: data.paymentMethod,
          notes: '结算自动生成',
          createdAt: new Date(),
        };
        customer.visitRecords = [newVisitRecord, ...(customer.visitRecords || [])];

        mockCustomers[customerIdx] = customer;
        saveCustomersToCache();
      }
    }

    // 核销已使用的会员权益
    if (data.usedBenefitIds && data.usedBenefitIds.length > 0) {
      data.usedBenefitIds.forEach((benefitId) => {
        const idx = mockMemberBenefitRecords.findIndex((b) => b.id === benefitId);
        if (idx !== -1) {
          mockMemberBenefitRecords[idx] = {
            ...mockMemberBenefitRecords[idx],
            status: 'used',
            usedAt: new Date(),
          };
        }
      });
      saveBenefitsToCache();
    }

    return newSettlement;
  },

  getByShop: async (shopId: string): Promise<Settlement[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Settlement[] }>(`${API_BASE}/settlements?shopId=${shopId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.data) return result.data;
    }
    return mockSettlements.filter((s) => s.shopId === shopId);
  },
};

// 会员权益相关 API
export const memberBenefitApi = {
  getAvailableByCustomer: async (customerId: string): Promise<MemberBenefitRecord[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: MemberBenefitRecord[] }>(
        `${API_BASE}/member-benefits/customer/${customerId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.data) return result.data;
    }
    return mockMemberBenefitRecords.filter(
      (b) => b.customerId === customerId && b.status === 'available'
    );
  },
};

// 财务报表 API
export const financialApi = {
  getReport: async (shopId: string): Promise<FinancialReport | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: FinancialReport }>(
        `${API_BASE}/financial/report?shopId=${shopId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.data) return result.data;
    }
    // Mock fallback：基于 mockSettlements 动态生成财务报表
    const shopSettlements = mockSettlements.filter(
      (s) => s.shopId === shopId && s.paymentStatus === 'completed'
    );
    if (shopSettlements.length === 0) return null;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const isInRange = (createdAt: Date | string | number, start: Date) =>
      new Date(createdAt).getTime() >= start.getTime();

    const todaySettlements = shopSettlements.filter((s) => isInRange(s.createdAt, startOfDay));
    const weekSettlements = shopSettlements.filter((s) => isInRange(s.createdAt, startOfWeek));
    const monthSettlements = shopSettlements.filter((s) => isInRange(s.createdAt, startOfMonth));
    const yearSettlements = shopSettlements.filter((s) => isInRange(s.createdAt, startOfYear));

    const sum = (list: Settlement[]) => list.reduce((acc, s) => acc + s.total, 0);
    const countServices = (list: Settlement[]) =>
      list.reduce((acc, s) => acc + s.items.reduce((iacc, i) => iacc + i.quantity, 0), 0);
    const avgTicket = (list: Settlement[]) => {
      const total = sum(list);
      const count = countServices(list);
      return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
    };

    // 发型师业绩汇总
    const stylistMap = new Map<
      string,
      { id: string; name: string; avatar?: string; revenue: number; services: number; rating: number }
    >();
    shopSettlements.forEach((s) => {
      s.items.forEach((item) => {
        if (item.type === 'service' && item.employeeId) {
          const existing = stylistMap.get(item.employeeId);
          if (existing) {
            existing.revenue += item.total;
            existing.services += item.quantity;
          } else {
            stylistMap.set(item.employeeId, {
              id: item.employeeId,
              name: item.employeeName || '未知发型师',
              avatar: undefined,
              revenue: item.total,
              services: item.quantity,
              rating: 4.8,
            });
          }
        }
      });
    });

    return {
      revenue: {
        today: sum(todaySettlements),
        week: sum(weekSettlements),
        month: sum(monthSettlements),
        year: sum(yearSettlements),
      },
      services: {
        today: countServices(todaySettlements),
        week: countServices(weekSettlements),
        month: countServices(monthSettlements),
        year: countServices(yearSettlements),
      },
      averageTicket: {
        today: avgTicket(todaySettlements),
        week: avgTicket(weekSettlements),
        month: avgTicket(monthSettlements),
        year: avgTicket(yearSettlements),
      },
      topStylists: Array.from(stylistMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    };
  },
};

// 推荐记录 API
export const referralApi = {
  getByShop: async (shopId: string): Promise<unknown[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: unknown[] }>(
        `${API_BASE}/referrals?shopId=${shopId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.data) return result.data;
    }
    return [];
  },
};

// 满意度回访 API
export const surveyApi = {
  getByShop: async (shopId: string): Promise<SatisfactionSurvey[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: SatisfactionSurvey[] }>(
        `${API_BASE}/satisfaction-surveys?shopId=${shopId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.data) return result.data;
    }
    return [];
  },
  create: async (data: Partial<SatisfactionSurvey>): Promise<SatisfactionSurvey | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: SatisfactionSurvey }>(
        `${API_BASE}/satisfaction-surveys`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (result?.data) return result.data;
    }
    return null;
  },
};

// 退款管理 API
export const refundApi = {
  getByShop: async (shopId: string): Promise<RefundRequest[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: RefundRequest[] }>(
        `${API_BASE}/refunds?shopId=${shopId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.data) return result.data;
    }
    return [];
  },
  create: async (data: Partial<RefundRequest>): Promise<RefundRequest | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: RefundRequest }>(
        `${API_BASE}/refunds`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (result?.data) return result.data;
    }
    return null;
  },
  updateStatus: async (id: string, status: string, payload?: { rejectReason?: string; refundMethod?: string }): Promise<RefundRequest | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: RefundRequest }>(
        `${API_BASE}/refunds/${id}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({ status, ...(payload || {}) }),
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (result?.data) return result.data;
    }
    return null;
  },
};

// 老板视图 API
export const ownerApi = {
  getDashboard: async (): Promise<OwnerDashboard | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: OwnerDashboard }>(
        `${API_BASE}/owner/dashboard`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.data) return result.data;
    }
    return null;
  },
};

// 商品管理 API
export const productApi = {
  getByShop: async (shopId: string): Promise<Product[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Product[] }>(
        `${API_BASE}/shops/${shopId}/products`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.data) return result.data;
    }
    return [];
  },
  create: async (shopId: string, data: Partial<Product>): Promise<Product | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Product }>(
        `${API_BASE}/shops/${shopId}/products`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (result?.data) return result.data;
    }
    return null;
  },
  update: async (shopId: string, productId: string, data: Partial<Product>): Promise<Product | null> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: Product }>(
        `${API_BASE}/shops/${shopId}/products/${productId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (result?.data) return result.data;
    }
    return null;
  },
  delete: async (shopId: string, productId: string): Promise<boolean> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean }>(
        `${API_BASE}/shops/${shopId}/products/${productId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return result?.success === true;
    }
    return false;
  },
};

// 队列相关 API
export const queueApi = {
  getQueue: async (shopId: string): Promise<Queue> => {
    if (USE_REAL_API) {
      const result = await http<Queue>(`${API_BASE}/queues/${shopId}`);
      if (result && result.shopId) return result;
    }
    await new Promise((r) => setTimeout(r, 200));
    let queue = mockQueues.find((q) => q.shopId === shopId);
    if (!queue) {
      queue = {
        id: Date.now().toString(),
        shopId,
        currentNumber: 1,
        estimatedWaitTime: 30,
        bookings: mockBookings.filter((b) => b.shopId === shopId).map((b) => ({ ...b })),
      };
      mockQueues.push(queue);
      saveQueuesToCache();
    }
    // 每次获取时重新同步 bookings，避免引用旧数据
    queue.bookings = mockBookings.filter((b) => b.shopId === shopId).map((b) => ({ ...b }));
    return queue;
  },

  updateQueue: async (shopId: string, data: Partial<Queue>): Promise<Queue> => {
    if (USE_REAL_API) {
      const result = await http<Queue>(`${API_BASE}/queues/${shopId}`, {
        method: 'PUT',
        body: JSON.stringify({
          currentNumber: data.currentNumber,
          estimatedWaitTime: data.estimatedWaitTime,
        }),
      });
      if (result && result.shopId) return result;
    }
    await new Promise((r) => setTimeout(r, 200));
    const queue = mockQueues.find((q) => q.shopId === shopId);
    if (queue) {
      Object.assign(queue, data);
      saveQueuesToCache();
    }
    return queue!;
  },
};
