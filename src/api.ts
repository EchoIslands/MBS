import { Shop, Booking, Review, Queue } from '../shared/types';
import { mockShops, mockBookings, mockReviews, mockQueues } from '../shared/mockData';

// ====== 开关：是否使用真实后端 API ======
// 方式 1：通过环境变量配置  VITE_USE_REAL_API=true
// 方式 2：直接把下面这行改为 true
const USE_REAL_API = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_USE_REAL_API === 'true') || false;

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) || '/api';

// 认证 Token 存储
const AUTH_TOKEN_KEY = 'mbs_auth_token';
const AUTH_USER_KEY = 'mbs_auth_user';

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
    const result = await http<{
      success: boolean;
      data?: {
        token: string;
        user: any;
      };
      error?: string;
    }>(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    
    if (result?.success && result.data) {
      saveAuthToken(result.data.token);
      saveAuthUser(result.data.user);
      return result.data;
    }
    
    throw new Error(result?.error || '登录失败');
  },
  
  // 获取当前用户
  getCurrentUser: async () => {
    const token = getAuthToken();
    if (!token) return null;
    
    try {
      const result = await http<{
        success: boolean;
        data?: any;
        error?: string;
      }>(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
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
      if (result && result.id) return result;
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
    return newBooking;
  },

  getBooking: async (id: string): Promise<Booking> => {
    if (USE_REAL_API) {
      const result = await http<Booking>(`${API_BASE}/bookings/${id}`);
      if (result) return result;
    }
    await new Promise((r) => setTimeout(r, 200));
    const booking = mockBookings.find((b) => b.id === id);
    if (!booking) throw new Error('Booking not found');
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
