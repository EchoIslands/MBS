// 内存数据库实现 - 使用全局存储
// 用于存储预约等数据

// 预约数据结构
interface BookingRow {
  id: string;
  shop_id: string;
  customer_id: string;
  customer_name: string;
  stylist_id: string;
  stylist_name: string;
  service_id: string;
  service_name: string;
  price: number;
  scheduled_time: string;
  queue_number: number;
  status: string;
  created_at: string;
  updated_at: string;
}

// 使用全局变量确保单例
declare global {
  var __bookings: Map<string, BookingRow> | undefined;
}

// 初始化全局存储
if (!global.__bookings) {
  global.__bookings = new Map();
}

export const bookingQueries = {
  // 创建预约
  async create(data: Partial<BookingRow>): Promise<BookingRow | null> {
    try {
      const row: BookingRow = {
        id: data.id || '',
        shop_id: data.shop_id || '',
        customer_id: data.customer_id || '',
        customer_name: data.customer_name || '',
        stylist_id: data.stylist_id || '',
        stylist_name: data.stylist_name || '',
        service_id: data.service_id || '',
        service_name: data.service_name || '',
        price: data.price || 0,
        scheduled_time: data.scheduled_time || new Date().toISOString(),
        queue_number: data.queue_number || 0,
        status: data.status || 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      global.__bookings!.set(row.id, row);
      console.log('bookingQueries.create:', row.id, 'total:', global.__bookings!.size);
      return row;
    } catch (error) {
      console.error('bookingQueries.create error:', error);
      return null;
    }
  },

  // 根据ID获取预约
  async get(id: string): Promise<BookingRow | null> {
    try {
      console.log('=== bookingQueries.get called ===');
      console.log('id:', id, 'type:', typeof id);
      console.log('global.__bookings:', global.__bookings);
      console.log('global.__bookings.size:', global.__bookings?.size);
      if (global.__bookings) {
        console.log('keys in global.__bookings:', Array.from(global.__bookings.keys()));
      }
      const result = global.__bookings!.get(id) || null;
      console.log('result:', result);
      return result;
    } catch (error) {
      console.error('bookingQueries.get error:', error);
      return null;
    }
  },

  // 根据店铺获取预约列表
  async listByShop(shopId: string): Promise<BookingRow[]> {
    try {
      return Array.from(global.__bookings!.values()).filter(b => b.shop_id === shopId);
    } catch (error) {
      console.error('bookingQueries.listByShop error:', error);
      return [];
    }
  },

  // 根据客户获取预约列表
  async listByCustomer(customerId: string): Promise<BookingRow[]> {
    try {
      return Array.from(global.__bookings!.values()).filter(b => b.customer_id === customerId);
    } catch (error) {
      console.error('bookingQueries.listByCustomer error:', error);
      return [];
    }
  },

  // 更新预约
  async update(id: string, data: Partial<BookingRow>): Promise<BookingRow | null> {
    try {
      const existing = global.__bookings!.get(id);
      if (!existing) return null;
      
      const updated: BookingRow = {
        ...existing,
        ...data,
        updated_at: new Date().toISOString(),
      };
      global.__bookings!.set(id, updated);
      return updated;
    } catch (error) {
      console.error('bookingQueries.update error:', error);
      return null;
    }
  },

  // 删除预约
  async delete(id: string): Promise<boolean> {
    try {
      return global.__bookings!.delete(id);
    } catch (error) {
      console.error('bookingQueries.delete error:', error);
      return false;
    }
  },
};

// 店铺数据结构
interface ShopRow {
  id: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  level: string;
  is_active: boolean;
  avatar: string;
  images: string[];
  services: any[];
  created_at: string;
  updated_at: string;
}

// 使用全局变量确保单例
declare global {
  var __shops: Map<string, ShopRow> | undefined;
  var __reviews: Map<string, any> | undefined;
  var __queues: Map<string, any> | undefined;
  var __employees: Map<string, any> | undefined;
}

if (!global.__shops) {
  global.__shops = new Map();
}
if (!global.__reviews) {
  global.__reviews = new Map();
}
if (!global.__queues) {
  global.__queues = new Map();
}
if (!global.__employees) {
  global.__employees = new Map();
}

export const shopQueries = {
  async list(): Promise<ShopRow[]> {
    return Array.from(global.__shops!.values());
  },

  async get(id: string): Promise<ShopRow | null> {
    return global.__shops!.get(id) || null;
  },

  async update(id: string, data: Partial<ShopRow>): Promise<ShopRow | null> {
    const existing = global.__shops!.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    global.__shops!.set(id, updated);
    return updated;
  },

  async create(data: ShopRow): Promise<ShopRow | null> {
    global.__shops!.set(data.id, data);
    return data;
  },
};

export const reviewQueries = {
  async listByShop(shopId: string): Promise<any[]> {
    return Array.from(global.__reviews!.values()).filter((r: any) => r.shop_id === shopId);
  },

  async listByStylist(stylistId: string): Promise<any[]> {
    return Array.from(global.__reviews!.values()).filter((r: any) => r.stylist_id === stylistId);
  },

  async create(data: any): Promise<any> {
    global.__reviews!.set(data.id, data);
    return data;
  },
};

export const queueQueries = {
  async getByShop(shopId: string): Promise<any | null> {
    return global.__queues!.get(shopId) || null;
  },

  async createOrUpdate(shopId: string, data: any): Promise<any> {
    global.__queues!.set(shopId, data);
    return data;
  },

  async upsert(data: any): Promise<any> {
    if (data.shop_id) {
      global.__queues!.set(data.shop_id, data);
    }
    return data;
  },
};

export const employeeQueries = {
  async getByPhone(phone: string): Promise<any | null> {
    for (const [, emp] of global.__employees!) {
      if (emp.phone === phone) return emp;
    }
    return null;
  },

  async listByShop(shopId: string): Promise<any[]> {
    return Array.from(global.__employees!.values()).filter(
      (e: any) => e.shop_id === shopId
    );
  },
};

export default { bookingQueries, shopQueries, reviewQueries, queueQueries, employeeQueries };
