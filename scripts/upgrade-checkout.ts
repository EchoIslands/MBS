/** 只安装 031–032，不调用结算、不读取顾客明细；由用户手动运行。 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseConfig, type SetupConnection } from './setup-db.js';
import { databaseErrorDiagnostic } from './init-legacy-passwords.js';

export async function upgradeCheckout(connection: SetupConnection) {
  const migrations = await Promise.all(['031_booking_checkout_consistency.sql','032_recover_unstarted_settlement_payment.sql'].map(file => readFile(new URL('../migrations/' + file, import.meta.url), 'utf8')));
  try {
    await connection.query('BEGIN');
    await connection.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'; SET LOCAL search_path=public");
    const lock = await connection.query("SELECT pg_try_advisory_xact_lock(hashtext('mbs.checkout.031')) AS locked");
    if (lock.rows[0]?.locked !== true) throw new Error('已有预约结算升级任务运行，请稍后重试');
    const prerequisites = await connection.query("SELECT to_regprocedure('public.create_settlement_atomic(jsonb,text,text,boolean)') AS create_rpc,to_regprocedure('public.finalize_settlement_atomic(text,text,text,text,text,text,text)') AS finalize_rpc");
    if (!prerequisites.rows[0]?.create_rpc || !prerequisites.rows[0]?.finalize_rpc) throw new Error('缺少 027 基础函数，请先核对 025–030 迁移');
    for (const sql of migrations) await connection.query(sql);
    await connection.query("NOTIFY pgrst,'reload schema'");
    await connection.query('COMMIT');
  } catch (error) { await connection.query('ROLLBACK').catch(() => {}); throw error; }
}

export async function checkCheckoutSchema(connection: SetupConnection) {
  await connection.query('BEGIN READ ONLY');
  try {
    await connection.query("SET LOCAL statement_timeout='15s'");
    const result = await connection.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",[['shops','customers','bookings','employees','settlements','payments','customer_packages','member_benefit_records','settlement_package_reservations','package_usage_logs','stored_value_transactions','customer_visit_records','group_buy_vouchers']]);
    return result.rows;
  } finally { await connection.query('ROLLBACK'); }
}

async function main() {
  if (process.argv.includes('--help')) { console.log('用法：npx tsx scripts/upgrade-checkout.ts [--check]\n--check：只读列出相关表的字段名及类型，不读取客户记录。\n无参数：仅事务安装 031–032 结构、函数和触发器；不扣款、不核销、不回填历史预约。成功后运行 verify-release.ts。'); return; }
  if (process.argv.length > 2 && !(process.argv.length===3 && process.argv[2]==='--check')) throw new Error('未知参数，请使用 --help');
  dotenv.config({path:fileURLToPath(new URL('../.env', import.meta.url)),quiet:true});
  const config=databaseConfig(process.env);
  config.application_name='mbs-upgrade-checkout-031-032';
  const secrets=[process.env.SUPABASE_DB_URL || '',decodeURIComponent(new URL(config.connectionString!).password)];
  const client=new pg.Client(config);
  client.on('error',()=>{});
  try {
    await client.connect();
    if (process.argv.includes('--check')) { console.log(JSON.stringify(await checkCheckoutSchema(client),null,2)); return; }
    await upgradeCheckout(client);
    console.log('[完成] 031–032 结构事务已提交；未执行消费、核销或修改历史客户/结算。请运行 npx tsx scripts/verify-release.ts。');
  } catch(error) {
    console.error('[失败] '+databaseErrorDiagnostic(error,secrets));
    process.exitCode=1;
  } finally { await client.end().catch(()=>{}); }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) void main().catch(()=>{console.error('[失败] 本地配置无效，未打印密钥');process.exitCode=1;});
