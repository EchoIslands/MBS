/** 只读汇总验收；不执行业务 RPC，不读取客户明细，不修改数据库。 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseConfig, SETUP_MIGRATIONS, type SetupConnection } from './setup-db.js';
import { databaseErrorDiagnostic } from './init-legacy-passwords.js';

export async function verifyRelease(connection: SetupConnection) {
  const issues: string[] = [];
  const fields = ['password_hash', 'is_weak_password', 'password_reset_at', 'identity_verified', 'identity_verified_at', 'identity_verified_by'];
  const protectedTables = ['customer_auth_limits', 'settlement_package_reservations', 'customer_password_initialization_runs'];
  const signatures = new Set<string>();
  for (const file of SETUP_MIGRATIONS) {
    const sql = await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
    for (const match of sql.matchAll(/REVOKE ALL ON FUNCTION\s+((?:public\.)?[\w]+\([^)]*\))\s+FROM PUBLIC/gi)) {
      signatures.add('public.' + match[1].replace(/^public\./i,'').replace(/\s/g, '').toLowerCase());
    }
  }
  await connection.query('BEGIN READ ONLY');
  try {
    await connection.query("SET LOCAL statement_timeout = '30s'");
    const actual = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='customers'");
    const present = new Set(actual.rows.map(row => row.column_name));
    const checkoutColumns = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements' AND column_name IN ('checkout_request_key','checkout_payment_started')");
    if (checkoutColumns.rows.length !== 2) issues.push('缺少 031 预约结算闭环迁移字段');
    const recoveryColumn = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements' AND column_name='checkout_payment_started_at'");
    if (!recoveryColumn.rows.length) issues.push('缺少 032 支付认领时间字段');
    const checkoutTriggers = await connection.query("SELECT tgname FROM pg_trigger WHERE tgrelid='public.bookings'::regclass AND NOT tgisinternal AND tgenabled='O' AND tgname IN ('booking_slot_guard','booking_checkout_state_guard')");
    if (checkoutTriggers.rows.length !== 2) issues.push('缺少或禁用 031 预约档期/结算状态触发器');
    const paymentColumns = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name IN ('code_url','paid_at_source')");
    if (!paymentColumns.rows.some(row=>row.column_name==='code_url')) issues.push('缺少 031 原支付二维码恢复字段');
    if (!paymentColumns.rows.some(row=>row.column_name==='paid_at_source')) issues.push('缺少 037 微信支付来源字段');
    for (const field of fields) if (!present.has(field)) issues.push('缺少 customers.' + field);
    const roles = await connection.query("SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])", [['service_role', 'anon', 'authenticated']]);
    const roleNames = new Set(roles.rows.map(row => row.rolname));
    for (const role of ['service_role', 'anon', 'authenticated']) if (!roleNames.has(role)) issues.push('缺少数据库角色 ' + role);
    for (const signature of signatures) {
      const found = await connection.query('SELECT to_regprocedure($1)::text AS name', [signature]);
      if (!found.rows[0]?.name) { issues.push('缺少函数 ' + signature); continue; }
      for (const role of roleNames) {
        const result = await connection.query('SELECT has_function_privilege($1, $2, \'EXECUTE\') AS allowed', [role, signature]);
        if (result.rows[0]?.allowed !== (role === 'service_role')) issues.push('函数权限不合格 ' + signature + ' / ' + role);
      }
    }
    for (const table of protectedTables) {
      const found = await connection.query("SELECT c.relrowsecurity AS enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1", [table]);
      if (found.rows[0]?.enabled !== true) issues.push('保护表缺失或未启用 RLS：' + table);
    }
    const tableAccess=await connection.query(`SELECT c.relname AS table_name,c.relrowsecurity AS rls,
      (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE')) AS anon_access,
      (has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE')) AS authenticated_access
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`, [[
      'bookings','coupons','customer_auth_limits','customer_coupons','customer_events','customer_packages','customer_password_initialization_runs',
      'customer_profiles','customer_visit_records','customers','employees','group_buy_batches','group_buy_vouchers','member_benefit_records',
      'member_benefits','membership_enrollments','package_usage_logs','payments','product_inventory_logs','product_order_items','product_order_refunds',
      'product_orders','products','purchase_vip_configs','queues','referral_records','refund_requests','reviews','satisfaction_surveys','services',
      'settlement_items','settlement_package_reservations','settlements','shipment_tracking','shop_vip_configs','shops','special_vip_configs',
      'stockholder_benefit_records','stored_value_configs','stored_value_transactions','withdrawal_requests'
    ]]);
    for(const table of tableAccess.rows) {
      if(!table.rls) issues.push('业务表未启用RLS：'+table.table_name);
      if(table.anon_access || table.authenticated_access) issues.push('业务表存在直接客户端授权：'+table.table_name+' / '+[table.anon_access?'anon':'',table.authenticated_access?'authenticated':''].filter(Boolean).join(', ')+'；请核对034迁移');
    }
    let counts: Record<string, string> | null = null;
    if (fields.every(field => present.has(field))) {
      const result = await connection.query(`SELECT COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE password_hash IS NULL OR password_hash='')::text AS empty_password,
        COUNT(*) FILTER (WHERE password_hash IS NOT NULL AND password_hash<>'' AND btrim(password_hash)='')::text AS whitespace_password,
        COUNT(*) FILTER (WHERE is_weak_password IS TRUE)::text AS must_change_password,
        COUNT(*) FILTER (WHERE identity_verified IS NOT TRUE)::text AS unverified
        FROM public.customers`);
      counts = result.rows[0];
      if (counts.empty_password !== '0') issues.push('仍有空密码记录；仅报告，不自动初始化');
      if (counts.whitespace_password !== '0') issues.push('存在空白字符密码；须单独核对，不自动覆盖');
    }
    return { passed: issues.length === 0, issues, counts, checkedFunctions: signatures.size, checkedTables: tableAccess.rows.length,
      scope: '仅字段存在性、函数签名/执行权限、业务表及列授权、RLS与客户数量汇总；不证明函数定义版本、密码正确性或交易验收通过' };
  } finally { await connection.query('ROLLBACK'); }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('用法：npx tsx scripts/verify-release.ts\n读取 .env SUPABASE_DB_URL，READ ONLY 事务核查结构/权限/密码数量汇总；不修改客户，不执行业务函数。检查不通过退出码 2。');
    return;
  }
  if (process.argv.length > 2) throw new Error('未知参数，请使用 --help');
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const config = databaseConfig(process.env);
  config.application_name = 'mbs-readonly-release-check';
  const secrets = [process.env.SUPABASE_DB_URL || '', decodeURIComponent(new URL(config.connectionString!).password)];
  const client = new pg.Client(config);
  client.on('error', () => {});
  try {
    await client.connect();
    const report = await verifyRelease(client);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 2;
  } catch (error) {
    console.error('[检查失败] ' + databaseErrorDiagnostic(error, secrets));
    process.exitCode = 1;
  } finally { await client.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('[检查失败] 请核对本地配置，未执行数据库写入。'); process.exitCode = 1; });
}
