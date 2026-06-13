import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let client: SupabaseClient | null = null;

export const getDb = (): SupabaseClient | null => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[db] SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未配置，所有查询将返回空数据。请在 .env 文件中填入 Supabase 配置。');
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
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
