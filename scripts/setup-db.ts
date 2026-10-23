import {checkOperationsSchema} from './lib/operations-schema.js';
import {checkPaymentSchema} from './lib/payment-schema.js';
/** 仅补齐 025–037 结构，不初始化密码、不执行结算函数。 */
import pg, { type ClientConfig } from 'pg';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const SETUP_MIGRATIONS = [
  '025_add_customer_password_hash.sql',
  '026_customer_identity_and_auth_limits.sql',
  '027_atomic_settlement_and_package_redemption.sql',
  '028_atomic_product_order_payments.sql',
  '029_customer_password_change_required.sql',
  '030_restrict_sensitive_rpc_execution.sql',
  '031_booking_checkout_consistency.sql',
  '032_recover_unstarted_settlement_payment.sql',
  '033_atomic_customer_operations.sql',
  '034_restrict_business_table_access.sql',
  '035_membership_and_shipping_atomic.sql',
  '036_settlement_rewards_and_package_integrity.sql',
  '037_verified_wechat_payment_receipts.sql',
] as const;

const BASE_TABLES = [
  'customers', 'customer_packages', 'settlements', 'member_benefit_records',
  'payments', 'stored_value_transactions', 'package_usage_logs', 'customer_visit_records',
  'group_buy_vouchers', 'products', 'product_orders', 'product_order_items',
  'product_inventory_logs', 'product_order_refunds', 'customer_coupons',
];
const EXPECTED_COLUMNS: Record<string, string> = {
  password_hash: 'text', is_weak_password: 'boolean', password_reset_at: 'timestamp with time zone',
  identity_verified: 'boolean', identity_verified_at: 'timestamp with time zone', identity_verified_by: 'text',
};

// pg 与隔离引擎共用相同 runner，测试不创建真实数据库连接。
export type SetupConnection = { query: (sql: string, values?: any[]) => Promise<{ rows: any[] }> };

export async function setupDatabase(connection: SetupConnection, log = console.log) {
  // 先加载全部文件；029 自带事务边界，由 runner 统一管理全部文件的事务。
  const migrations = await Promise.all(SETUP_MIGRATIONS.map(async file => {
    let sql = (await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (file.startsWith('029_') || file.startsWith('030_')) sql = sql.replace(/^BEGIN;[ \t]*$/m, '').replace(/^COMMIT;[ \t]*$/m, '');
    return { file, sql };
  }));
  let active = false;
  let stage = '开始事务';
  try {
    await connection.query('BEGIN');
    active = true;
    await connection.query("SET LOCAL statement_timeout = '10min'; SET LOCAL lock_timeout = '15s'; SET LOCAL search_path = public;");
    const lock = await connection.query("SELECT pg_try_advisory_xact_lock(hashtext('mbs.setup.025-036')) AS locked");
    if (lock.rows[0]?.locked !== true) throw new Error('已有结构安装任务运行，请待其结束后重跑。');
    stage = '历史基础结构检查';
    const columns = await connection.query('SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[])', ['public', BASE_TABLES]);
    const tables = new Set(columns.rows.map(row => row.table_name));
    const missing = BASE_TABLES.filter(table => !tables.has(table));
    if (missing.length) throw new Error('缺少 001–024 历史基础表：' + missing.join(', ') + '；请先核对历史迁移，本脚本不重建业务表。');
    log('[预检] 已核对 public 历史基础表与实际列结构。');
    for (const { file, sql } of migrations) {
      stage = file;
      log(`[建库] 正在执行 ${file}…`);
      if(file.startsWith('035_')) await checkOperationsSchema(connection);
      if(file.startsWith('037_')) await checkPaymentSchema(connection);
      await connection.query(sql);
      log(`[建库] ${file} 执行通过（等待统一提交）。`);
    }
    stage = '最终字段检查';
    const fields = await connection.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='customers'");
    for (const [name, type] of Object.entries(EXPECTED_COLUMNS)) {
      if (!fields.rows.some(row => row.column_name === name && row.data_type === type)) throw new Error('客户字段缺失或类型不兼容：' + name + '；停止而不自动改写已有列。');
    }
    stage = '结构缓存刷新与提交';
    await connection.query("NOTIFY pgrst, 'reload schema'");
    await connection.query('COMMIT');
    active = false;
    log('[完成] 025–037 已全部提交，已通知 API 重载结构；未初始化密码、未执行消费或扣款。');
  } catch (error) {
    if (active) { try { await connection.query('ROLLBACK'); } catch { /* 断连时数据库自行回滚未提交事务 */ } }
    if (error instanceof Error && (error.message.startsWith('缺少 001–024') || error.message.startsWith('客户字段') || error.message.startsWith('已有结构安装'))) throw error;
    const code = (error as { code?: string })?.code || '';
    const safeCode = /^[A-Z0-9_]{1,30}$/i.test(code) ? `，错误代码 ${code}` : '';
    throw new Error(`${stage}失败${safeCode}；未确认提交，已请求回滚。请检查网络、DDL 权限和历史结构后重跑。`);
  }
}

export function databaseConfig(env: NodeJS.ProcessEnv): ClientConfig {
  const value = env.SUPABASE_DB_URL?.trim();
  if (!value) throw new Error('请在项目根目录 .env 配置 SUPABASE_DB_URL（PostgreSQL 连接串，需数据库密码；不是 service-role key）。');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('SUPABASE_DB_URL 格式无效。'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password) throw new Error('SUPABASE_DB_URL 须为含用户名和数据库密码的 PostgreSQL URI。');
  if (url.port === '6543') throw new Error('请使用 Direct connection 或 Session pooler 的 5432 连接串，不使用 6543 事务池。');
  // 仅本地一次性脚本按用户要求跳过证书验证；剥离 URI 参数，避免 pg 覆盖 SSL 对象。
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl', 'uselibpqcompat']) {
    url.searchParams.delete(key);
  }
  const project = env.SUPABASE_URL?.trim();
  if (project) {
    let host: string;
    try { host = new URL(project).hostname; } catch { throw new Error('SUPABASE_URL 格式无效。'); }
    const ref = host.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1];
    if (ref && !(url.hostname === `db.${ref}.supabase.co` || (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`))) {
      throw new Error('SUPABASE_DB_URL 与 SUPABASE_URL 的项目不一致，请核对连接串。');
    }
  }
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000, application_name: 'mbs-setup-025-036' };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('用法：npx tsx scripts/setup-db.ts\n读取根目录 .env 的 SUPABASE_DB_URL，事务执行 025–037；不初始化密码。');
    return;
  }
  if (process.argv.length > 2) throw new Error('未知参数；使用 --help 查看用法。');
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const config = databaseConfig(process.env);
  const client = new pg.Client(config);
  client.on('error', () => { /* 不打印含主机/连接上下文的驱动原始对象 */ });
  try {
    console.log('[连接] 正在建立 PostgreSQL TLS 连接…');
    try { await client.connect(); }
    catch (error) {
      const code = String((error as { code?: string })?.code || '');
      const safeCode = /^[A-Z0-9_]{1,30}$/i.test(code) ? `（${code}）` : '';
      throw new Error(`数据库连接失败${safeCode}；请检查数据库密码及 5432 网络连通性。连接串和密钥未打印。`);
    }
    await setupDatabase({ query: (sql, values) => client.query(sql, values) });
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('[失败] ' + (error instanceof Error ? error.message : '建库脚本异常；未打印原始连接信息。'));
    process.exitCode = 1;
  });
}
