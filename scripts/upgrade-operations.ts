import {checkOperationsSchema} from './lib/operations-schema.js';
/** 由业主手动执行：仅安装033–036，不调用领券/库存/退款业务函数。 */
import pg from 'pg';
import dotenv from 'dotenv';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {databaseConfig,type SetupConnection} from './setup-db.js';
import {databaseErrorDiagnostic} from './init-legacy-passwords.js';

export async function upgradeOperations(connection: SetupConnection) {
  const files=['033_atomic_customer_operations.sql','034_restrict_business_table_access.sql','035_membership_and_shipping_atomic.sql','036_settlement_rewards_and_package_integrity.sql'];
  const statements=await Promise.all(files.map(file=>readFile(new URL('../migrations/'+file,import.meta.url),'utf8')));
  try {
    await connection.query('BEGIN');
    await connection.query("SET LOCAL search_path=public; SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='10s'");
    const lock=await connection.query("SELECT pg_try_advisory_xact_lock(hashtext('mbs.operations.033')) AS locked");
    if(lock.rows[0]?.locked!==true) throw new Error('已有033升级任务运行');
    const base=await connection.query("SELECT to_regprocedure('public.create_settlement_atomic(jsonb,text,text,boolean)') AS checkout,to_regprocedure('public.release_stale_settlement_payment_claim(text,text)') AS recovery");
    if(!base.rows[0]?.checkout || !base.rows[0]?.recovery) throw new Error('缺少031–032结算基础迁移，请先核对并运行 upgrade-checkout.ts；本轮已回滚');
    await checkOperationsSchema(connection);
    for(const sql of statements) await connection.query(sql);
    await connection.query("NOTIFY pgrst,'reload schema'");
    await connection.query('COMMIT');
  } catch(error) {await connection.query('ROLLBACK').catch(()=>{});throw error;}
}

async function main() {
  if(process.argv.includes('--help')) {console.log('用法：npx tsx scripts/upgrade-operations.ts\n仅事务安装033–036：领券/退款/库存原子操作、业务表权限、会员/发货事务、结算奖励及次卡完整性；不修改顾客、余额或历史订单。完成后运行 npx tsx scripts/verify-release.ts');return;}
  if(process.argv.length>2) throw new Error('未知参数');
  dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
  const client=new pg.Client(databaseConfig(process.env));
  client.on('error',()=>{});
  try {
    await client.connect();
    await upgradeOperations({query:(sql,values)=>client.query(sql,values)});
    console.log('[完成] 033–036已提交；未调用业务函数，未修改顾客、余额和历史订单。请运行 verify-release.ts。');
  } catch(error) {console.error('[失败]',JSON.stringify(databaseErrorDiagnostic(error)));process.exitCode=1;}
  finally {await client.end().catch(()=>{});}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) void main().catch(()=>{console.error('[失败] 配置无效；未打印密钥');process.exitCode=1;});
