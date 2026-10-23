/** Read-only database + optional WeChat order query. Never calls a payment or completion RPC. */
import pg from 'pg';
import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {databaseConfig,type SetupConnection} from './setup-db.js';
import {databaseErrorDiagnostic} from './init-legacy-passwords.js';
import {checkPaymentSchema} from './lib/payment-schema.js';

export async function readReceiptCandidates(connection:SetupConnection, amount:number, shopId?:string, settlementId?:string) {
  if(!Number.isFinite(amount) || amount<=0 || Math.abs(Math.round(amount*100)-amount*100)>1e-8) throw new Error('金额须为正数且最多两位小数');
  await connection.query('BEGIN READ ONLY');
  try {
    await connection.query("SET LOCAL statement_timeout='20s'");
    await checkPaymentSchema(connection);
    const result=await connection.query(`SELECT s.id AS settlement_id,s.shop_id,s.total,s.payment_status,s.created_at AS settlement_created_at,
      p.id AS payment_id,p.amount AS payment_amount,p.status AS payment_status_record,p.created_at AS payment_created_at,
      p.paid_at AS recorded_paid_at,to_jsonb(p)->>'paid_at_source' AS paid_at_source,p.transaction_id
      FROM public.settlements s LEFT JOIN public.payments p ON p.settlement_id=s.id AND p.shop_id=s.shop_id AND p.customer_id=s.customer_id
      WHERE s.total=$1 AND s.payment_method='wechat' AND ($2::text IS NULL OR s.shop_id=$2) AND ($3::text IS NULL OR s.id=$3)
      ORDER BY p.created_at DESC NULLS LAST,s.created_at DESC,s.id LIMIT 51`,[amount,shopId || null,settlementId || null]);
    if(result.rows.length>50) throw new Error('候选超过50条，请加 --shop-id 或 --settlement-id 缩小范围');
    return result.rows;
  } finally {await connection.query('ROLLBACK');}
}

async function main() {
  const args=process.argv.slice(2);
  if(args.includes('--help')) {console.log('用法：npx tsx scripts/audit-wechat-receipts.ts --amount 33.64 [--shop-id 店铺ID] [--settlement-id 结算ID] [--query-wechat]\n只读数据库；--query-wechat逐笔查询原微信支付订单，不补记、不重新收款、不打印顾客姓名/手机号。');return;}
  const options:Record<string,string>={};let queryWechat=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--query-wechat') {queryWechat=true;continue;}
    if(!['--amount','--shop-id','--settlement-id'].includes(args[i]) || !args[i+1] || args[i+1].startsWith('--')) throw new Error('参数无效，使用--help');
    options[args[i]]=args[++i];
  }
  const amount=Number(options['--amount']);
  if(!options['--amount']) throw new Error('必须指定--amount');
  dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
  const client=new pg.Client(databaseConfig(process.env));client.on('error',()=>{});
  let candidates:any[]=[];
  try {await client.connect();candidates=await readReceiptCandidates({query:(sql,values)=>client.query(sql,values)},amount,options['--shop-id'],options['--settlement-id']);}
  finally {await client.end().catch(()=>{});}
  process.env.WECHAT_PAY_MOCK='false';
  const query=queryWechat ? (await import('../backend/services/paymentService.js')).queryPaymentStatus : null;
  const results=[];
  for(const row of candidates) {
    const gateway=query && row.payment_id ? await query(String(row.payment_id)) : null;
    results.push({...row,...(gateway ? {gateway_status:gateway.status,gateway_amount:gateway.amount,gateway_transaction_id:gateway.transactionId,gateway_success_time:gateway.paidAt,
      matched:gateway.status==='paid' && gateway.amount===Number(row.total) && gateway.amount===Number(row.payment_amount),query_message:gateway.message} : {})});
  }
  console.log(JSON.stringify({readOnly:true,count:results.length,candidates:results,note:'金额不是订单唯一标识。仅查询，不补写；缺失success_time不能猜填；提现净额不等于订单金额。'},null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) void main().catch(error=>{console.error('[只读核对失败]',JSON.stringify(databaseErrorDiagnostic(error)));process.exitCode=1;});
