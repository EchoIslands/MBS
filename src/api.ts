import { Shop, Booking, Review, Queue } from '../shared/types';
import { mockShops, mockBookings, mockReviews, mockQueues, mockCustomers } from '../shared/mockData';

// ====== 开关：是否使用真实后端 API ======
// 方式 1：通过环境变量配置  VITE_USE_REAL_API=true
// 方式 2：直接把下面这行改为 true
const USE_REAL_API = true;

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) || '/api';

// 认证 Token 存储
const AUTH_TOKEN_KEY = 'mbs_auth_token';
const AUTH_USER_KEY = 'mbs_auth_user';
const CUSTOMERS_CACHE_KEY = 'mbs_customers_cache';

// 启动时从 localStorage 恢复客户数据
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
export const saveAuthUser = (user: any) => {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

// 获取用户信息
export const getAuthUser = (): any | null => {
  const user = localStorage.getItem(AUTH_USER_KEY);
  return user ? JSON.parse(user) : null;
};

// 认证相关 API
export const authApi = {
  // 登录
  login: async (phone: string, password: string) => {
    if (USE_REAL_API) {
      const result = await http<{ success: boolean; data: { token: string; user: any } }>(
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
      console.warn('[api] 真实 API 登录失败，回退到 mock');
    }

    // Mock 兜底
    const allEmployees = mockShops.flatMap((s: any) => 
      s.employees.map((e: any) => ({ ...e, shopId: s.id }))
    );
    const employee = allEmployees.find((e: any) => e.phone === phone);
    
    if (!employee || password !== '123456') {
      throw new Error('手机号或密码错误');
    }
    
    const mockUser = {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      avatar: employee.avatar || '',
      title: employee.title || '',
      role: employee.role || 'stylist',
      shopId: employee.shopId,
      specialty: employee.specialty || '',
      rating: employee.rating || 5.0,
    };
    
    const fakeToken = 'mock_' + encodeURIComponent(JSON.stringify(mockUser));
    saveAuthToken(fakeToken);
    saveAuthUser(mockUser);
    return { token: fakeToken, user: mockUser };
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
      const result = await http<{ success: boolean; data?: any }>(
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
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      signal: controller.signal,
      ...opts,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.warn(`[api] ${url} 返回 ${res.status}，将使用 mock 数据`);
      return null;
    }
    return res.json() as T;
  } catch (err: any) {
    console.warn(`[api] ${url} 请求失败（${err?.message || err}），将使用 mock 数据`);
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
      const result = await http<Shop[]>(`${API_BASE}/shops?${params.toString()}`);
      if (result && result.length > 0) return result;
      console.warn('[api] /api/shops 返回空或失败，回退到 mock 数据');
      return mockShops;
    }
    await new Promise((r) => setTimeout(r, 300));
    return mockShops;
  },

  getShop: async (id: string): Promise<Shop> => {
    if (USE_REAL_API) {
      const result = await http<Shop>(`${API_BASE}/shops/${id}`);
      if (result) return result;
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
      const result = await http<Booking[]>(`${API_BASE}/shops/${id}/bookings`);
      if (result) return result;
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockBookings.filter((b) => b.shopId === id);
  },

  getShopReviews: async (id: string): Promise<Review[]> => {
    if (USE_REAL_API) {
      const result = await http<Review[]>(`${API_BASE}/shops/${id}/reviews`);
      if (result) return result;
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockReviews.filter((r) => r.shopId === id);
  },

  getShopQueue: async (id: string): Promise<Queue> => {
    if (USE_REAL_API) {
      const result = await http<Queue>(`${API_BASE}/shops/${id}/queue`);
      if (result) return result;
    }
    await new Promise((r) => setTimeout(r, 200));
    const queue = mockQueues.find((q) => q.shopId === id);
    if (!queue) throw new Error('Queue not found');
    return queue;
  },
};

// 将后端/模拟数据转换为统一的 Booking 格式
function normalizeBooking(b: any): Booking {
  const scheduledTime = b.scheduledTime instanceof Date
    ? b.scheduledTime
    : new Date(b.scheduledTime || b.scheduled_time);
  return {
    id: b.id,
    shopId: b.shopId || b.shop_id,
    customerId: b.customerId || b.customer_id,
    serviceId: b.serviceId || b.service_id,
    barberId: b.barberId || b.stylistId || b.barber_id || b.stylist_id,
    barberName: b.barberName || b.stylistName || b.barber_name || b.stylist_name,
    scheduledTime: scheduledTime,
    status: b.status || 'confirmed',
    queueNumber: b.queueNumber || b.queue_number || 1,
    serviceName: b.serviceName || b.service_name || '服务',
    price: typeof b.price === 'number' ? b.price : 0,
    customerName: b.customerName || b.customer_name || '顾客',
    shopName: b.shopName || b.shop_name || '店铺',
    createdAt: b.createdAt ? (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)) : new Date(),
  };
}

// 预约相关 API
export const bookingApi = {
  createBooking: async (
    data: Omit<Booking, 'id' | 'queueNumber' | 'serviceName' | 'price' | 'customerName' | 'shopName'>,
  ): Promise<Booking> => {
    if (USE_REAL_API) {
      const result = await http<Booking>(`${API_BASE}/bookings`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result && result.id) {
        console.log('[api] createBooking 返回真实数据:', result);
        return normalizeBooking(result);
      }
      console.warn('[api] /api/bookings 创建失败，使用本地模拟');
    }
    await new Promise((r) => setTimeout(r, 300));
    const shop = mockShops.find((s) => s.id === data.shopId);
    const service = shop?.services?.find((s) => s.id === data.serviceId);

    const newBooking: Booking = {
      id: Date.now().toString(),
      ...data,
      queueNumber: mockBookings.filter((b) => b.shopId === data.shopId).length + 1,
      serviceName: service?.name || '服务',
      price: service?.price || 0,
      customerName: '顾客',
      shopName: shop?.name || '店铺',
      createdAt: new Date(),
    };

    mockBookings.push(newBooking);
    console.log('[api] createBooking 返回模拟数据:', newBooking);
    return newBooking;
  },

  getBooking: async (id: string): Promise<Booking> => {
    if (USE_REAL_API) {
      const result = await http<Booking>(`${API_BASE}/bookings/${id}`);
      if (result && result.id) {
        console.log('[api] getBooking 返回真实数据:', result);
        return normalizeBooking(result);
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    const booking = mockBookings.find((b) => b.id === id);
    if (!booking) throw new Error('Booking not found');
    console.log('[api] getBooking 返回模拟数据:', booking);
    return booking;
  },

  updateBookingStatus: async (id: string, status: Booking['status']): Promise<Booking> => {
    if (USE_REAL_API) {
      const result = await http<Booking>(`${API_BASE}/bookings/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      if (result && result.id) return result;
    }
    await new Promise((r) => setTimeout(r, 200));
    const idx = mockBookings.findIndex((b) => b.id === id);
    if (idx !== -1) {
      mockBookings[idx] = { ...mockBookings[idx], status };
    }
    const booking = mockBookings.find((b) => b.id === id);
    if (!booking) throw new Error('Booking not found');
    return booking;
  },

  getCustomerBookings: async (customerId: string): Promise<Booking[]> => {
    if (USE_REAL_API) {
      const result = await http<Booking[]>(`${API_BASE}/bookings/customer/${customerId}`);
      if (result) return result;
    }
    await new Promise((r) => setTimeout(r, 200));
    return mockBookings.filter((b) => b.customerId === customerId);
  },
};

// 客户相关 API
export const customerApi = {
  // 获取全部客户（带缓存回退）
  getAll: async (): Promise<any[]> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<{ success: boolean; data: any[] }>(
        `${API_BASE}/customers`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result?.success && Array.isArray(result.data)) {
        // 更新本地缓存
        try { localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(result.data)); } catch(e) {}
        return result.data;
      }
      console.warn('[api] 获取客户列表失败，回退到本地缓存');
    }
    // 回退：先读 localStorage 缓存，再读 mock
    const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
    if (cached) {
      try { return JSON.parse(cached); } catch(e) {}
    }
    return [...mockCustomers];
  },

  create: async (data: any): Promise<any> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<any>(`${API_BASE}/customers`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success) return result.data;
    }
    // Mock fallback
    const newCustomer = { id: `cust${Date.now()}`, ...data, joinedAt: new Date() };
    mockCustomers.push(newCustomer);
    try { localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(mockCustomers)); } catch(e) {}
    return newCustomer;
  },

  update: async (id: string, data: any): Promise<any> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<any>(`${API_BASE}/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success) return result.data;
    }
    const idx = mockCustomers.findIndex((c: any) => c.id === id);
    if (idx !== -1) {
      mockCustomers[idx] = { ...mockCustomers[idx], ...data };
      try { localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(mockCustomers)); } catch(e) {}
      return mockCustomers[idx];
    }
    return null;
  },

  delete: async (id: string): Promise<boolean> => {
    if (USE_REAL_API) {
      const token = getAuthToken();
      const result = await http<any>(`${API_BASE}/customers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result?.success) return true;
    }
    const idx = mockCustomers.findIndex((c: any) => c.id === id);
    if (idx !== -1) {
      mockCustomers.splice(idx, 1);
      try { localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(mockCustomers)); } catch(e) {}
      return true;
    }
    return false;
  },
};

// 评价相关 API
export const reviewApi = {
  createReview: async (
    data: Omit<Review, 'id' | 'overallScore' | 'customerName' | 'createdAt'>,
  ): Promise<Review> => {
    if (USE_REAL_API) {
      const result = await http<Review>(`${API_BASE}/reviews`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result && result.id) return result;
    }
    await new Promise((r) => setTimeout(r, 300));
    const overallScore = Math.round(((data.serviceScore + data.priceScore + data.skillScore) / 3) * 10) / 10;
    const newReview: Review = {
      id: Date.now().toString(),
      ...data,
      overallScore,
      customerName: '顾客',
      createdAt: new Date(),
    };
    mockReviews.push(newReview);
    return newReview;
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
        bookings: mockBookings.filter((b) => b.shopId === shopId),
      };
      mockQueues.push(queue);
    }
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
    let queue = mockQueues.find((q) => q.shopId === shopId);
    if (queue) {
      Object.assign(queue, data);
    }
    return queue!;
  },
};
