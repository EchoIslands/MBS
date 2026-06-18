import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Node.js 20 以下没有原生 WebSocket，需要通过 ws 包提供。
// 如果 ws 没装（比如用户只跑了一次 npm install 后才新增这个依赖），要优雅降级。
let wsTransport: any = undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ws = require('ws');
  wsTransport = ws as any;
} catch (e) {
  // 没装 ws 也不要紧，Supabase 在新一点版本里会用内置实现。
  // 仅当真正需要 realtime 订阅时才会报错，我们当前没用到。
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let client: SupabaseClient | null = null;
let initFailed = false;

export const getDb = (): SupabaseClient | null => {
  if (initFailed) return null;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  if (!client) {
    try {
      const opts: any = {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      };
      if (wsTransport) {
        opts.realtime = { transport: wsTransport };
      }
      client = createClient(SUPABASE_URL, SUPABASE_KEY, opts);
      console.log(`[db] Supabase 已连接：${SUPABASE_URL}`);
    } catch (err: any) {
      console.error('[db] Supabase 初始化失败，将降级使用本地模拟数据：', err?.message || err);
      initFailed = true;
      client = null;
    }
  }
  return client;
};

export const isDbReady = (): boolean => getDb() !== null;

const generateId = () =>
  Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

const safeResult = <T>(result: { data: T | null; error: any }): T[] => {
  if (result.error) {
    console.error('[db] Supabase 查询失败:', result.error.message);
    return [];
  }
  return (result.data || []) as T[];
};

const safeSingle = <T>(result: { data: T | null; error: any }): T | null => {
  if (result.error) {
    console.error('[db] Supabase 查询失败:', result.error.message);
    return null;
  }
  return (result.data || null) as T | null;
};

// ---------- 店铺 ----------
export const shopQueries = {
  list: async () => {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db.from('shops').select('*').order('created_at', { ascending: false });
    if (error) { console.error('[db]', error.message); return []; }
    return data || [];
  },
  get: async (id: string) => {
    const db = getDb();
    if (!db) return null;
    const { data, error } = await db.from('shops').select('*').eq('id', id).single();
    if (error) { console.error('[db]', error.message); return null; }
    return data;
  },
};

// ---------- 预约 ----------
export const bookingQueries = {
  listByShop: async (shopId: string) => {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db.from('bookings').select('*').eq('shop_id', shopId).order('scheduled_time', { ascending: false });
    if (error) { console.error('[db]', error.message); return []; }
    return data || [];
  },
  listByCustomer: async (customerId: string) => {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db.from('bookings').select('*').eq('customer_id', customerId).order('scheduled_time', { ascending: false });
    if (error) { console.error('[db]', error.message); return []; }
    return data || [];
  },
  get: async (id: string) => {
    const db = getDb();
    if (!db) return null;
    const { data, error } = await db.from('bookings').select('*').eq('id', id).single();
    if (error) { console.error('[db]', error.message); return null; }
    return data;
  },
  create: async (data: any) => {
    const db = getDb();
    if (!db) return { id: generateId(), ...data };
    const insertData = { id: generateId(), ...data, created_at: new Date().toISOString() };
    const { data: result, error } = await db.from('bookings').insert(insertData).select().single();
    if (error) { console.error('[db]', error.message); return insertData; }
    return result;
  },
  update: async (id: string, data: any) => {
    const db = getDb();
    if (!db) return null;
    const { data: result, error } = await db.from('bookings').update(data).eq('id', id).select().single();
    if (error) { console.error('[db]', error.message); return null; }
    return result;
  },
};

// ---------- 评价 ----------
export const reviewQueries = {
  listByShop: async (shopId: string) => {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db.from('reviews').select('*').eq('shop_id', shopId).order('created_at', { ascending: false });
    if (error) { console.error('[db]', error.message); return []; }
    return data || [];
  },
  create: async (data: any) => {
    const db = getDb();
    if (!db) return { id: generateId(), ...data };
    const insertData = { id: generateId(), ...data, created_at: new Date().toISOString() };
    const { data: result, error } = await db.from('reviews').insert(insertData).select().single();
    if (error) { console.error('[db]', error.message); return insertData; }
    return result;
  },
};

// ---------- 队列 ----------
export const queueQueries = {
  getByShop: async (shopId: string) => {
    const db = getDb();
    if (!db) return null;
    const { data, error } = await db.from('queues').select('*').eq('shop_id', shopId).single();
    if (error) { console.error('[db]', error.message); return null; }
    return data;
  },
  upsert: async (data: any) => {
    const db = getDb();
    if (!db) return data;
    const { data: result, error } = await db.from('queues').upsert(data, { onConflict: 'shop_id' }).select().single();
    if (error) { console.error('[db]', error.message); return data; }
    return result;
  },
};

// ---------- 员工 ----------
export const employeeQueries = {
  listByShop: async (shopId: string) => {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db.from('employees').select('*').eq('shop_id', shopId).order('created_at', { ascending: false });
    if (error) { console.error('[db]', error.message); return []; }
    return data || [];
  },
  getByPhone: async (phone: string) => {
    const db = getDb();
    if (!db) return null;
    const { data, error } = await db.from('employees').select('*').eq('phone', phone).single();
    if (error) { return null; }
    return data;
  },
};

// ---------- 客户 ----------
export const customerQueries = {
  listByShop: async (shopId: string) => {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db.from('customers').select('*, customer_profiles(*)').eq('shop_id', shopId).order('created_at', { ascending: false });
    if (error) { console.error('[db]', error.message); return []; }
    return data || [];
  },
  get: async (id: string) => {
    const db = getDb();
    if (!db) return null;
    const { data, error } = await db.from('customers').select('*, customer_profiles(*)').eq('id', id).single();
    if (error) { console.error('[db]', error.message); return null; }
    return data;
  },
  create: async (data: any) => {
    const db = getDb();
    if (!db) return { id: generateId(), ...data };
    const insertData = { id: generateId(), ...data, created_at: new Date().toISOString() };
    const { data: result, error } = await db.from('customers').insert(insertData).select().single();
    if (error) { console.error('[db]', error.message); return insertData; }
    return result;
  },
};

export default getDb;
