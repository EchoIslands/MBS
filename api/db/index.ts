import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createRequire } from 'module';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[db] 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量');
  throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量');
}

// Node.js 20 没有原生 WebSocket，需要手动注入 ws 作为 realtime 传输层
const require = createRequire(import.meta.url);
let wsTransport: typeof import('ws') | undefined;
try {
  wsTransport = require('ws') as typeof import('ws');
} catch {
  wsTransport = undefined;
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: wsTransport ? { transport: wsTransport } : undefined,
});