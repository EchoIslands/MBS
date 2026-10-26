/** 只读汇总验收；不执行业务 RPC，不读取客户明细，不修改数据库。 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseConfig, SETUP_MIGRATIONS, type SetupConnection } from './setup-db.js';
import { databaseErrorDiagnostic } from './init-legacy-passwords.js';

export type ReleaseCheckOptions = { expectedPendingPasswords?: number };

function validateExpectedPendingPasswords(value: number | undefined) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error('待首次设密确认数量必须为非负安全整数');
  }
}

export function parseReleaseArgs(args: string[]): ReleaseCheckOptions & { help?: boolean } {
  if (args.length === 0) return {};
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.length !== 2 || args[0] !== '--expected-pending-passwords' || !/^(0|[1-9]\d*)$/.test(args[1])) {
    throw new Error('请使用 --help；--expected-pending-passwords 后须填写非负安全整数');
  }
  const expectedPendingPasswords = Number(args[1]);
  validateExpectedPendingPasswords(expectedPendingPasswords);
  return { expectedPendingPasswords };
}

export async function verifyRelease(connection: SetupConnection, options: ReleaseCheckOptions = {}) {
  validateExpectedPendingPasswords(options.expectedPendingPasswords);
  const issues: string[] = [];
  const warnings: string[] = [];
  const fields = ['password_hash', 'is_weak_password', 'password_reset_at', 'identity_verified', 'identity_verified_at', 'identity_verified_by'];
  const protectedTables = ['customer_auth_limits', 'settlement_package_reservations', 'customer_password_initialization_runs','wechat_payment_attempts'];
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
    const manualPaymentColumns = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements' AND column_name IN ('manual_paid_at','manual_paid_recorded_at','manual_paid_recorded_by')");
    if (manualPaymentColumns.rows.length !== 3) issues.push('缺少039非微信收款时间字段');
    const manualPaymentTypes = await connection.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements' AND column_name IN ('manual_paid_at','manual_paid_recorded_at','manual_paid_recorded_by')");
    const expectedManualTypes={manual_paid_at:'timestamp with time zone',manual_paid_recorded_at:'timestamp with time zone',manual_paid_recorded_by:'text'};
    for(const [name,type] of Object.entries(expectedManualTypes)) if(!manualPaymentTypes.rows.some(row=>row.column_name===name && row.data_type===type)) issues.push('039非微信收款时间字段类型不兼容：'+name);
    const manualPaymentTrigger = await connection.query("SELECT tgname FROM pg_trigger WHERE tgrelid='public.settlements'::regclass AND NOT tgisinternal AND tgenabled='O' AND tgname='capture_manual_settlement_payment_time'");
    if (!manualPaymentTrigger.rows.length) issues.push('缺少039收款时间不可变/记录触发器');
    const manualFunctions = [
      'public.create_settlement_with_manual_time_atomic(jsonb,text,text,boolean,timestamp with time zone)',
      'public.finalize_settlement_with_manual_time_atomic(text,text,text,text,text,text,text,timestamp with time zone)',
    ];
    for(const signature of manualFunctions) {
      const found=await connection.query('SELECT to_regprocedure($1)::text AS name',[signature]);
      if(!found.rows[0]?.name) {issues.push('缺少039安全结算函数 '+signature);continue;}
      for(const role of ['service_role','anon','authenticated']) {
        const result=await connection.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[role,signature]);
        if(result.rows[0]?.allowed !== (role==='service_role')) issues.push('039函数权限不合格 '+signature+' / '+role);
      }
    }
    const paymentColumns = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name IN ('code_url','paid_at_source')");
    if (!paymentColumns.rows.some(row=>row.column_name==='code_url')) issues.push('缺少 031 原支付二维码恢复字段');
    if (!paymentColumns.rows.some(row=>row.column_name==='paid_at_source')) issues.push('缺少 037 微信支付来源字段');
    const refundColumns = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='refund_requests' AND column_name IN ('refund_receipt_ref','refund_receipt_amount','refund_receipt_at','refund_receipt_recorded_by','refund_receipt_recorded_by_name')");
    if (refundColumns.rows.length !== 5) issues.push('缺少041退款回执字段');
    for (const signature of [
      'public.adjust_customer_balance_atomic(text,text,numeric,numeric,text,text,text)',
      'public.complete_service_refund_atomic(text,text,text,text,text,text,numeric,timestamp with time zone)',
    ]) {
      const found=await connection.query('SELECT to_regprocedure($1)::text AS name',[signature]);
      if(!found.rows[0]?.name) {issues.push('缺少041安全函数 '+signature);continue;}
      for(const role of ['service_role','anon','authenticated']) {
        const result=await connection.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[role,signature]);
        if(result.rows[0]?.allowed !== (role==='service_role')) issues.push('041函数权限不合格 '+signature+' / '+role);
      }
    }
    const attempts=await connection.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='wechat_payment_attempts'");
    const attemptTypes={gateway_order_no:'text',payment_id:'text',state:'text',request_body:'jsonb',qr_updated_at:'timestamp with time zone',closed_at:'timestamp with time zone',recovery_token:'text',recovery_started_at:'timestamp with time zone',created_at:'timestamp with time zone'};
    for(const [name,type] of Object.entries(attemptTypes)) if(!attempts.rows.some(r=>r.column_name===name && r.data_type===type)) issues.push('缺少或不兼容038支付尝试字段：'+name);
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
      'stockholder_benefit_records','stored_value_configs','stored_value_transactions','withdrawal_requests','wechat_payment_attempts'
    ]]);
    for(const table of tableAccess.rows) {
      if(!table.rls) issues.push('业务表未启用RLS：'+table.table_name);
      if(table.anon_access || table.authenticated_access) issues.push('业务表存在直接客户端授权：'+table.table_name+' / '+[table.anon_access?'anon':'',table.authenticated_access?'authenticated':''].filter(Boolean).join(', ')+'；请核对034迁移');
    }
    let counts: Record<string, string> | null = null;
    if (fields.every(field => present.has(field))) {
      const result = await connection.query(`WITH password_states AS (
        SELECT password_hash,is_weak_password,identity_verified,
          (password_hash IS NULL AND is_weak_password IS NOT TRUE
            AND password_reset_at IS NULL AND identity_verified IS NOT TRUE
            AND identity_verified_at IS NULL AND identity_verified_by IS NULL) AS pending_setup
        FROM public.customers
      ) SELECT COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE password_hash IS NULL OR password_hash='')::text AS empty_password,
        COUNT(*) FILTER (WHERE pending_setup)::text AS pending_password_setup,
        COUNT(*) FILTER (WHERE (password_hash IS NULL OR password_hash='') AND NOT pending_setup)::text AS empty_password_requires_review,
        COUNT(*) FILTER (WHERE password_hash IS NOT NULL AND password_hash<>'' AND btrim(password_hash)='')::text AS whitespace_password,
        COUNT(*) FILTER (WHERE is_weak_password IS TRUE)::text AS must_change_password,
        COUNT(*) FILTER (WHERE identity_verified IS NOT TRUE)::text AS unverified
        FROM password_states`);
      counts = result.rows[0];
      if (counts.empty_password !== '0' && options.expectedPendingPasswords === undefined) {
        issues.push('仍有空密码记录；须核对新增来源，确认待首次设密数量后使用 --expected-pending-passwords；不自动初始化');
      }
      if (counts.empty_password_requires_review !== '0') {
        issues.push('空密码记录存在空字符串、弱密码、重置或身份核实痕迹；不能按待首次设密放行，须单独核对');
      }
      if (options.expectedPendingPasswords !== undefined && counts.pending_password_setup !== String(options.expectedPendingPasswords)) {
        issues.push('待首次设密数量不符：本次确认 ' + options.expectedPendingPasswords + ' 条，数据库为 ' + counts.pending_password_setup + ' 条；不自动调整确认数量');
      }
      if (counts.pending_password_setup !== '0') {
        warnings.push('待首次设密候选 ' + counts.pending_password_setup + ' 条；状态符合未设密档案，具体新建来源须由项目主人确认；不证明这些记录的身份或首次设密安全性');
      }
      if (counts.whitespace_password !== '0') issues.push('存在空白字符密码；须单独核对，不自动覆盖');
    }
    return { passed: issues.length === 0, issues, warnings, counts, expectedPendingPasswords: options.expectedPendingPasswords ?? null, checkedFunctions: signatures.size, checkedTables: tableAccess.rows.length,
      scope: '仅字段存在性、函数签名/执行权限、业务表及列授权、RLS与客户数量汇总；不证明函数定义版本、密码正确性或交易验收通过' };
  } finally { await connection.query('ROLLBACK'); }
}

async function main() {
  let options: ReturnType<typeof parseReleaseArgs>;
  try { options = parseReleaseArgs(process.argv.slice(2)); } catch {
    console.error('[参数错误] 请使用 --help；--expected-pending-passwords 后须填写非负安全整数。未连接数据库。');
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    console.log('用法：npx tsx scripts/verify-release.ts [--expected-pending-passwords 数量]\n读取 .env SUPABASE_DB_URL，READ ONLY 事务核查结构/权限/密码数量汇总；不修改客户，不执行业务函数。检查不通过退出码 2。\n默认空密码阻断；仅在项目主人已确认待首次设密档案的来源和数量后，提供本次预期数量。异常空密码和数量不符仍阻断，告警保留；不能证明新老客户身份或替代交易验收。');
    return;
  }
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const config = databaseConfig(process.env);
  config.application_name = 'mbs-readonly-release-check';
  const secrets = [process.env.SUPABASE_DB_URL || '', decodeURIComponent(new URL(config.connectionString!).password)];
  const client = new pg.Client(config);
  client.on('error', () => {});
  try {
    await client.connect();
    const report = await verifyRelease(client, options);
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
