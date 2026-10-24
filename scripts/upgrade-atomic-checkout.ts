/** Install only 040; never creates an order or contacts a payment provider. */
import pg from 'pg';
import dotenv from 'dotenv';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {databaseConfig,type SetupConnection} from './setup-db.js';
import {databaseErrorDiagnostic} from './init-legacy-passwords.js';
import {checkPaymentRecoverySchema} from './lib/payment-recovery-schema.js';
import {checkManualPaymentTimeSchema} from './lib/manual-payment-time-schema.js';

export async function upgradeAtomicCheckout(connection:SetupConnection) {
  const sql=await readFile(new URL('../migrations/040_atomic_wechat_checkout.sql',import.meta.url),'utf8');
  try {
    await connection.query('BEGIN');
    await connection.query("SET LOCAL search_path=public; SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='10s'");
    // Keep the existing installer lock key for compatibility with older runners.
    const lock=await connection.query("SELECT pg_try_advisory_xact_lock(hashtext('mbs.setup.025-039')) AS locked");
    if(lock.rows[0]?.locked!==true) throw new Error('已有数据库结构安装任务运行');
    await checkPaymentRecoverySchema(connection);
    await checkManualPaymentTimeSchema(connection);
    const base=await connection.query("SELECT to_regprocedure('public.create_settlement_with_manual_time_atomic(jsonb,text,text,boolean,timestamptz)') IS NOT NULL AND to_regprocedure('public.claim_wechat_recovery(text,text,text)') IS NOT NULL AND to_regprocedure('public.mutate_wechat_recovery(text,text,text,text,jsonb)') IS NOT NULL AND to_regclass('public.wechat_payment_attempts') IS NOT NULL AS ready");
    if(!base.rows[0]?.ready) throw new Error('请先完成025–039迁移');
    await connection.query(sql);
    await connection.query("NOTIFY pgrst,'reload schema'");
    await connection.query('COMMIT');
  } catch(error) {await connection.query('ROLLBACK').catch(()=>{});throw error;}
}

async function main() {
  if(process.argv.includes('--help')) {console.log('用法：npx tsx scripts/upgrade-atomic-checkout.ts\n仅事务安装040微信结算与支付映射原子函数；前提025–039已完成。不修改历史订单、不付款、不清理测试单。');return;}
  if(process.argv.length>2) throw new Error('未知参数');
  dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
  const client=new pg.Client(databaseConfig(process.env));client.on('error',()=>{});
  try {await client.connect();await upgradeAtomicCheckout({query:(sql,values)=>client.query(sql,values)});console.log('[完成] 040已提交，未改客户、余额或历史收款，未请求微信。请运行 npx tsx scripts/verify-release.ts 复核。');}
  catch(error) {console.error('[失败]',JSON.stringify(databaseErrorDiagnostic(error)));process.exitCode=1;}
  finally {await client.end().catch(()=>{});}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) void main().catch(()=>{console.error('[失败] 配置无效，未打印密钥');process.exitCode=1;});
