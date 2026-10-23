/** User-run installer only. No payment RPC or historical backfill is executed. */
import pg from 'pg';
import dotenv from 'dotenv';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {databaseConfig,type SetupConnection} from './setup-db.js';
import {databaseErrorDiagnostic} from './init-legacy-passwords.js';
import {checkPaymentSchema} from './lib/payment-schema.js';

export async function upgradePaymentAudit(connection:SetupConnection) {
  const sql=await readFile(new URL('../migrations/037_verified_wechat_payment_receipts.sql',import.meta.url),'utf8');
  try {
    await connection.query('BEGIN');
    await connection.query("SET LOCAL search_path=public; SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='10s'");
    const lock=await connection.query("SELECT pg_try_advisory_xact_lock(hashtext('mbs.payment.037')) AS locked");
    if(lock.rows[0]?.locked!==true) throw new Error('已有037升级任务运行');
    await checkPaymentSchema(connection);
    await connection.query(sql);
    await connection.query("NOTIFY pgrst,'reload schema'");
    await connection.query('COMMIT');
  } catch(error) {await connection.query('ROLLBACK').catch(()=>{});throw error;}
}

async function main() {
  if(process.argv.includes('--help')) {console.log('用法：npx tsx scripts/upgrade-payment-audit.ts\n事务安装037：微信成功时间来源及原子登记函数，不补记历史订单、不发起支付。');return;}
  if(process.argv.length>2) throw new Error('未知参数');
  dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
  const client=new pg.Client(databaseConfig(process.env));client.on('error',()=>{});
  try {await client.connect();await upgradePaymentAudit({query:(sql,values)=>client.query(sql,values)});console.log('[完成] 037已提交，未改历史收款、客户或余额。请运行 verify-release.ts。');}
  catch(error) {console.error('[失败]',JSON.stringify(databaseErrorDiagnostic(error)));process.exitCode=1;}
  finally {await client.end().catch(()=>{});}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) void main().catch(()=>{console.error('[失败] 配置无效，未打印密钥');process.exitCode=1;});
