import { createServer } from 'node:http';
// 在导入数据库模块之前指定合成配置；测试不读取生产数据，也不允许任何外网请求。
process.env.SUPABASE_URL = 'https://synthetic.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-key';
process.env.JWT_SECRET = 'synthetic-test-secret-only-01234567890123456789';
process.env.NODE_ENV = 'test';
const { supabase } = await import('../../backend/db/index.js');
const { hashPassword, verifyPassword, isPasswordHash } = await import('../../backend/lib/password.js');
const { getJwtSecret } = await import('../../backend/lib/tokens.js');
const { default: jwt } = await import('jsonwebtoken');
const realFetch = globalThis.fetch;
let base = '';
globalThis.fetch = ((input: any, init: any) => {
  if (!String(input).startsWith(base + '/api/') || !base) throw new Error('测试禁止外网访问');
  return realFetch(input, init);
}) as typeof fetch;
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
 employees: [
  {id:'ceo',shop_id:'s1',name:'Synthetic CEO',role:'ceo',phone:'synthetic-ceo',is_active:true,password_hash:'old-password'},
  {id:'cs',shop_id:'s1',name:'Synthetic CS',role:'customer_service',phone:'synthetic-cs',is_active:true,password_hash:'old-password'},
  {id:'stylist',shop_id:'s1',name:'Synthetic stylist',role:'stylist',phone:'synthetic-stylist',is_active:true,password_hash:'old-password'},
  {id:'manager',shop_id:'s1',name:'Synthetic manager',role:'shop_manager',phone:'synthetic-manager',is_active:true,password_hash:'old-password'},
 ],
 customers: [
  {id:'c1',shop_id:'s1',name:'Synthetic one',phone:'13800000001',password_hash:null,served_by_stylist_ids:['stylist'],stored_value_balance:123,id_card_number:'PRIVATE',openid_mini:'PRIVATE'},
  {id:'c2',shop_id:'s1',name:'Synthetic two',phone:'13800000002',password_hash:null,served_by_stylist_ids:[],stored_value_balance:456},
  {id:'c3',shop_id:'s2',name:'Synthetic other shop',phone:'13800000003',password_hash:null,served_by_stylist_ids:['stylist']},
 ],
 customer_profiles: [], customer_visit_records: [], customer_packages: [], shops:[{id:'s1',name:'Synthetic shop'}], settlements:[],settlement_items:[],
};
let calls = 0;
let failMigration = false;
let failAuthentication = false;
let failPaymentQuery = false;
class Query {
 filters: ((r:Row)=>boolean)[]=[]; operation='select'; payload: any; columns='*'; singleRow=false;
 constructor(public table:string) { calls++; }
 select(columns='*') {this.columns=columns;return this;}
 eq(k:string,v:any) {this.filters.push(r=>r[k]===v);return this;}
 is(k:string,v:any) {this.filters.push(r=>r[k]===v || (v===null && r[k]===undefined));return this;}
 contains(k:string,v:any[]) {this.filters.push(r=>v.every(x=>Array.isArray(r[k])&&r[k].includes(x)));return this;}
 in(k:string,v:any[]) {this.filters.push(r=>v.includes(r[k]));return this;}
 gte(){return this;} lt(){return this;} order(){return this;} range(){return this;} limit(n:number){this.maxRows=n;return this;} maxRows?:number;
 update(v:any){this.operation='update';this.payload=v;return this;}
 insert(v:any){this.operation='insert';this.payload=v;return this;}
 delete(){this.operation='delete';return this;}
 single(){this.singleRow=true;return this;} maybeSingle(){this.singleRow=true;return this;}
 then(resolve:any,reject:any){try{
  if(failPaymentQuery && this.table==='payments') return Promise.resolve({data:null,error:{message:'synthetic query failure'}}).then(resolve,reject);
  if(failAuthentication && this.table==='employees') return Promise.resolve({data:null,error:{message:'synthetic unavailable'}}).then(resolve,reject);
  let rows=(tables[this.table]||[]).filter(r=>this.filters.every(f=>f(r))).slice(0,this.maxRows);
  if(failMigration && this.table==='employees' && this.operation==='update') return Promise.resolve({data:null,error:{message:'synthetic migration failure'}}).then(resolve,reject);
  if(this.operation==='update')rows.forEach(r=>Object.assign(r,this.payload));
  if(this.operation==='insert'){rows=Array.isArray(this.payload)?this.payload:[this.payload];(tables[this.table]??=[]).push(...structuredClone(rows));}
  if(this.operation==='delete')tables[this.table]=(tables[this.table]||[]).filter(r=>!rows.includes(r));
  const data=rows.map(r=>this.columns==='*'?structuredClone(r):Object.fromEntries(this.columns.split(',').map(k=>[k.trim(),r[k.trim()]])));
  return Promise.resolve({data:this.singleRow?(data[0]||null):data,error:null}).then(resolve,reject);
 }catch(e){return Promise.reject(e).then(resolve,reject);}}
}
(supabase as any).from=(table:string)=>new Query(table);
let rpcFailures = 0;
let failRpc = false;
let draftDeleteError: any = null;
let completeCheckout = false;
let checkoutRpcCalls = 0;
(supabase as any).rpc = async (name: string, args: any) => {
 if (name==='confirm_product_receipt_atomic') {
  const row=(tables.product_orders||[]).find(r=>r.id===args.p_order_id&&r.customer_id===args.p_customer_id&&r.shop_id===args.p_shop_id);
  if(!row) return {data:null,error:{message:'ORDER_NOT_FOUND'}};
  row.status='completed';return {data:[row],error:null};
 }
 if (name === 'delete_settlement_draft_atomic') return { data: null, error: draftDeleteError };
 if (name === 'release_stale_settlement_payment_claim') {
  const s=tables.settlements.find(row=>row.id===args.p_settlement_id && row.shop_id===args.p_shop_id);
  if(!s || !['pending','failed'].includes(s.payment_status)) return {data:null,error:{message:'SETTLEMENT_NOT_RECOVERABLE'}};
  if((tables.payments||[]).some(p=>p.settlement_id===s.id)) return {data:null,error:{message:'PAYMENT_RECORD_EXISTS'}};
  if(!s.checkout_payment_started) return {data:true,error:null};
  if(s.checkout_payment_started_at || !s.created_at || Date.now()-new Date(s.created_at).getTime()<5*60_000) return {data:false,error:null};
  s.checkout_payment_started=false;s.checkout_request_key=null;return {data:true,error:null};
 }
 if (name === 'create_settlement_atomic') checkoutRpcCalls++;
 if (name === 'create_settlement_atomic' && completeCheckout) {
  const row={...args.p_settlement,payment_status:'completed'};
  tables.settlements.push(row);
  return {data:[row],error:null};
 }
 if (failRpc) return { data: null, error: { code: 'PGRST202', message: 'synthetic migration missing' } };
 if (name === 'begin_customer_auth_attempt') return { data: [{allowed: rpcFailures < 5}], error: null };
 if (name === 'finish_customer_auth_attempt') { rpcFailures = args.p_succeeded ? 0 : rpcFailures+1; return {data:null,error:null}; }
 return { data: null, error: { code: 'PGRST202', message: 'synthetic migration missing' } };
};


tables.shops[0]={id:'shop1',name:'本地合成测试门店',phone:'13800000000',services:[{id:'svc',name:'设计师洗剪吹',price:58,duration:30}],is_active:true};
tables.customers[0]={...tables.customers[0],shop_id:'shop1',name:'合成顾客',tags:[],is_weak_password:true,identity_verified:false,balance:100,stored_value_balance:100,purchase_vip_level:'regular',stored_value_level:'none',password_hash:await hashPassword('123456')};
tables.employees[0]={...tables.employees[0],shop_id:'shop1',phone:'13800000009'};
// 本次支付追溯页面验收只使用合成订单；日期/金额用于覆盖旧单新付和历史缺失时间。
tables.settlements=[
 {id:'synthetic-old-paid',shop_id:'shop1',customer_id:'c1',customer_name:'合成顾客',items:[{id:'svc',type:'service',name:'设计师洗剪吹',quantity:1,originalPrice:58,discountedPrice:33.64,total:33.64}],subtotal:58,discount:24.36,total:33.64,payment_method:'wechat',payment_status:'completed',created_at:'2026-08-01T08:00:00Z'},
 {id:'synthetic-newer-created',shop_id:'shop1',customer_id:'c1',customer_name:'合成顾客',items:[],subtotal:58,discount:0,total:58,payment_method:'wechat',payment_status:'completed',created_at:'2026-10-01T08:00:00Z'},
 {id:'synthetic-legacy-unknown',shop_id:'shop1',customer_id:'c1',customer_name:'合成历史订单',items:[],subtotal:23.55,discount:0,total:23.55,payment_method:'wechat',payment_status:'completed',created_at:'2026-10-20T08:00:00Z'},
];
tables.payments=[
 {id:'synthetic_old_payment',settlement_id:'synthetic-old-paid',shop_id:'shop1',customer_id:'c1',amount:33.64,status:'paid',transaction_id:'4200000000000000000000000001',paid_at:'2026-10-22T14:56:01+08:00',paid_at_source:'wechat_success_time',created_at:'2026-10-22T06:55:20Z'},
 {id:'synthetic_new_payment',settlement_id:'synthetic-newer-created',shop_id:'shop1',customer_id:'c1',amount:58,status:'paid',transaction_id:'4200000000000000000000000002',paid_at:'2026-10-01T08:02:00Z',paid_at_source:'wechat_success_time',created_at:'2026-10-01T08:01:00Z'},
 {id:'synthetic_legacy_payment',settlement_id:'synthetic-legacy-unknown',shop_id:'shop1',customer_id:'c1',amount:23.55,status:'paid',paid_at:'2026-10-20T08:01:00Z',created_at:'2026-10-20T08:00:30Z'},
];
const {default:handler}=await import('../../api/index.js');
const server=createServer((req,res)=>{
 res.once('finish',()=>console.log('[合成HTTP]',req.method,req.url?.split('?')[0],res.statusCode));
 void handler(req as any,res as any);
});
server.listen(31371,'127.0.0.1',()=>{base='http://127.0.0.1:31371';console.log('合成界面测试 API: '+base+'；禁止外网请求，无生产数据库连接');});
