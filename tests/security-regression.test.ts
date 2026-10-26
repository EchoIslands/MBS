import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import {generateKeyPairSync,createCipheriv,createSign} from 'node:crypto';
// 在导入数据库模块之前指定合成配置；测试不读取生产数据，也不允许任何外网请求。
process.env.SUPABASE_URL = 'https://synthetic.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-key';
process.env.JWT_SECRET = 'synthetic-test-secret-only-01234567890123456789';
process.env.NODE_ENV = 'test';
const { supabase } = await import('../backend/db/index.js');
const { hashPassword, verifyPassword, isPasswordHash } = await import('../backend/lib/password.js');
const { getJwtSecret } = await import('../backend/lib/tokens.js');
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
let failDashboardTable = '';
class Query {
 filters: ((r:Row)=>boolean)[]=[]; operation='select'; payload: any; columns='*'; singleRow=false;
 rowStart=0;rowEnd:number|undefined;
 constructor(public table:string) { calls++; }
 select(columns='*') {this.columns=columns;return this;}
 eq(k:string,v:any) {this.filters.push(r=>r[k]===v);return this;}
 is(k:string,v:any) {this.filters.push(r=>r[k]===v || (v===null && r[k]===undefined));return this;}
 contains(k:string,v:any[]) {this.filters.push(r=>v.every(x=>Array.isArray(r[k])&&r[k].includes(x)));return this;}
 in(k:string,v:any[]) {this.filters.push(r=>v.includes(r[k]));return this;}
 gte(){return this;} lt(){return this;} order(){return this;} range(start:number,end:number){this.rowStart=start;this.rowEnd=end+1;return this;} limit(n:number){this.maxRows=n;return this;} maxRows?:number;
 update(v:any){this.operation='update';this.payload=v;return this;}
 insert(v:any){this.operation='insert';this.payload=v;return this;}
 delete(){this.operation='delete';return this;}
 single(){this.singleRow=true;return this;} maybeSingle(){this.singleRow=true;return this;}
 then(resolve:any,reject:any){try{
  if(failDashboardTable === this.table) return Promise.resolve({data:null,error:{message:'synthetic dashboard unavailable'}}).then(resolve,reject);
  if(failPaymentQuery && this.table==='payments') return Promise.resolve({data:null,error:{message:'synthetic query failure'}}).then(resolve,reject);
  if(failAuthentication && this.table==='employees') return Promise.resolve({data:null,error:{message:'synthetic unavailable'}}).then(resolve,reject);
  let rows=(tables[this.table]||[]).filter(r=>this.filters.every(f=>f(r))).slice(this.rowStart,this.rowEnd).slice(0,this.maxRows);
  if(failMigration && this.table==='employees' && this.operation==='update') return Promise.resolve({data:null,error:{message:'synthetic migration failure'}}).then(resolve,reject);
  if(this.operation==='update')rows.forEach(r=>Object.assign(r,this.payload));
  if(this.operation==='insert'){rows=Array.isArray(this.payload)?this.payload:[this.payload];(tables[this.table]??=[]).push(...structuredClone(rows));}
  if(this.operation==='delete')tables[this.table]=(tables[this.table]||[]).filter(r=>!rows.includes(r));
  const data=rows.map(r=>this.columns.includes('group_buy_batches(*)')?{...structuredClone(r),group_buy_batches:tables.group_buy_batches.find(b=>b.id===r.batch_id)}:this.columns==='*'?structuredClone(r):Object.fromEntries(this.columns.split(',').map(k=>[k.trim(),r[k.trim()]])));
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
 if(name==='finalize_wechat_attempt') {
  if(failRpc) return {data:null,error:{code:'PGRST202'}};
  const p=(tables.payments || []).find(p=>p.id===args.p_order_no && p.shop_id===args.p_shop_id);
  const s=(tables.settlements || []).find(s=>s.id===p?.settlement_id && s.shop_id===args.p_shop_id);
  if(!p || !s || Number(s.total)!==args.p_amount || Number(p.amount)!==args.p_amount || s.customer_id!==p.customer_id) return {data:null,error:{code:'P0001'}};
  Object.assign(p,{status:'paid',paid_at:args.p_paid_at,paid_at_source:'wechat_success_time',transaction_id:args.p_transaction_id});
  s.payment_status='completed';return {data:[s],error:null};
 }
 if (name === 'create_settlement_with_manual_time_atomic' || name === 'create_wechat_settlement_atomic') checkoutRpcCalls++;
 if (name === 'create_settlement_with_manual_time_atomic' && completeCheckout) {
  const row={...args.p_settlement,payment_status:'completed'};
  tables.settlements.push(row);
  return {data:[row],error:null};
 }
 if (name === 'adjust_customer_balance_atomic') {
  const row=(tables.customers||[]).find(r=>r.id===args.p_customer_id&&r.shop_id===args.p_shop_id);
  if (!row) return {data:null,error:{message:'CUSTOMER_NOT_FOUND'}};
  if (Number(row.stored_value_balance)!==Number(args.p_expected_balance)) return {data:null,error:{message:'BALANCE_CONFLICT'}};
  const next=Number(args.p_new_balance);
  if (!Number.isFinite(next) || next<0 || !String(args.p_note||'').trim()) return {data:null,error:{message:'INVALID_BALANCE_ADJUSTMENT'}};
  row.stored_value_balance=next; row.balance=next;
  return {data:[structuredClone(row)],error:null};
 }
 if (name === 'complete_service_refund_atomic') {
  const row=(tables.refund_requests||[]).find(r=>r.id===args.p_refund_id&&r.shop_id===args.p_shop_id);
  if (!row) return {data:null,error:{message:'REFUND_NOT_FOUND'}};
  if (row.status==='completed') return {data:[structuredClone(row)],error:null};
  if (row.status!=='approved') return {data:null,error:{message:'REFUND_NOT_APPROVED'}};
  if (!args.p_receipt_ref || Number(args.p_receipt_amount)!==Number(row.amount)) return {data:null,error:{message:'REFUND_RECEIPT_AMOUNT_MISMATCH'}};
  Object.assign(row,{status:'completed',refund_method:args.p_refund_method,refund_receipt_ref:args.p_receipt_ref,refund_receipt_amount:args.p_receipt_amount,refund_receipt_at:args.p_receipt_at});
  return {data:[structuredClone(row)],error:null};
 }
 if (failRpc) return { data: null, error: { code: 'PGRST202', message: 'synthetic migration missing' } };
 if (name === 'begin_customer_auth_attempt') return { data: [{allowed: rpcFailures < 5}], error: null };
 if (name === 'finish_customer_auth_attempt') { rpcFailures = args.p_succeeded ? 0 : rpcFailures+1; return {data:null,error:null}; }
 return { data: null, error: { code: 'PGRST202', message: 'synthetic migration missing' } };
};

// 直接通过生产部署入口执行全部 HTTP 回归，覆盖移动后的动态导入链。
const {default:handler}=await import('../api/index.js');
const server=createServer((req,res)=>{ void handler(req as any,res as any); });
server.listen(0,'127.0.0.1');
await new Promise<void>(r=>server.once('listening',()=>r()));
base='http://127.0.0.1:'+(server.address() as any).port;
async function request(path:string, token='', method='GET', body?:unknown, cookie?:string){
 const response=await fetch(base+'/api'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
}
const login=async(id:string)=>{const r=await request('/auth/login','','POST',{phone:'synthetic-'+id,password:'old-password'});assert.equal(r.status,200);return r.body.data.token;};

test('本地安全整改回归：隔离内存数据库与真实 HTTP 路由',async(t)=>{
 try {
  await t.test('结算草稿删除：具体原因保留，已付款或跨店不放行',async()=>{
   const token=await login('ceo');
   tables.settlements.push({id:'synthetic-draft',shop_id:'s1',payment_status:'pending'});
   for(const [error,status,code] of [
    [{code:'P0001',message:'PAYMENT_ORDER_EXISTS'},409,'DRAFT_HAS_PAYMENT'],
    [{code:'P0001',message:'NOT_A_DELETABLE_DRAFT'},409,'DRAFT_STATE_CHANGED'],
    [{code:'PGRST202',message:'missing'},503,'DRAFT_RPC_MISSING'],
    [{code:'42501',message:'denied'},503,'DRAFT_PERMISSION_DENIED'],
    [{code:'23503',message:'reference'},409,'DRAFT_HAS_REFERENCES'],
    [{code:'XX000',message:'internal customer data'},409,'DRAFT_DELETE_FAILED'],
   ] as const){
    draftDeleteError=error;
    const r=await request('/settlements/synthetic-draft',token,'DELETE');
    assert.equal(r.status,status);assert.equal(r.body.code,code);
    assert.ok(!JSON.stringify(r.body).includes('internal customer data'));
   }
   draftDeleteError=null;
   assert.equal((await request('/settlements/synthetic-draft',token,'DELETE')).status,200);
   tables.settlements[0].payment_status='completed';
   assert.equal((await request('/settlements/synthetic-draft',token,'DELETE')).status,400);
   tables.settlements.length=0;
  });
  await t.test('历史支付恢复区分草稿、原二维码、缺二维码及初始化认领，跨店拒绝',async()=>{
   const token=await login('ceo');
   const row:Row={id:'recover',shop_id:'s1',payment_status:'pending',total:58,checkout_payment_started:false,created_at:new Date(Date.now()-24*3600_000).toISOString()};
   tables.settlements.push(row);tables.payments=[];
   const state=async()=> (await request('/settlements/recover/payment-status',token)).body.data.recoveryState;
   try {
    assert.equal(await state(),'editable');
    failPaymentQuery=true;
    const unavailable=await request('/settlements/recover/payment-status',token);
    assert.equal(unavailable.status,503);assert.equal(unavailable.body.data,undefined);
    failPaymentQuery=false;
    row.checkout_payment_started=true;assert.equal(await state(),'initialization_started');
    const released=await request('/settlements/recover/release-unstarted-payment',token,'POST',{});
    assert.equal(released.status,200);assert.equal(released.body.data.released,true);assert.equal(await state(),'editable');
    row.checkout_payment_started=true;row.checkout_payment_started_at=new Date().toISOString();
    const tooRecent=await request('/settlements/recover/release-unstarted-payment',token,'POST',{});
    assert.equal(tooRecent.status,200);assert.equal(tooRecent.body.data.released,false);
    row.checkout_payment_started_at=new Date(Date.now()-3600_000).toISOString();
    tables.payments.push({id:'pay',settlement_id:'recover',status:'pending',amount:58,code_url:null});
    const protectedPayment=await request('/settlements/recover/release-unstarted-payment',token,'POST',{});
    assert.equal(protectedPayment.status,409);
    assert.equal(await state(),'payment_needs_review');
    tables.payments[0].code_url='synthetic:original';assert.equal(await state(),'payment_needs_review');
    tables.payments[0].amount=59;assert.equal(await state(),'payment_needs_review');
    tables.payments[0].amount=58;tables.payments[0].status='paid';assert.equal(await state(),'payment_needs_review');
    row.payment_status='completed';assert.equal(await state(),'completed');
    row.shop_id='s2';assert.equal((await request('/settlements/recover/payment-status',token)).status,404);
   } finally {failPaymentQuery=false;tables.settlements=[];tables.payments=[];}
  });
  await t.test('旧明文首次登录迁移，之后哈希登录，错误密码不迁移',async()=>{
   const before=tables.employees[0].password_hash;
   assert.equal((await request('/auth/login','','POST',{phone:'synthetic-ceo',password:'wrong'})).status,401);
   assert.equal(tables.employees[0].password_hash,before);
   await login('ceo');assert.ok(isPasswordHash(tables.employees[0].password_hash));
   const migrated=tables.employees[0].password_hash;await login('ceo');assert.equal(tables.employees[0].password_hash,migrated);
  });
  const ceo=await login('ceo'),cs=await login('cs'),stylist=await login('stylist'),manager=await login('manager');
  await t.test('预约本人凭证、跨店隔离、人工确认、真实信息和公开档期脱敏',async()=>{
   tables.bookings=[];
   tables.shops[0].services=[{id:'svc',name:'Actual service',price:0,duration:30}];
   tables.shops[0].booking_confirm_mode='manual';
   const body={shopId:'s1',customerId:'c1',serviceId:'svc',stylistId:'stylist',scheduledTime:'2029-01-01T10:00:00+08:00',customerName:'Forged',stylistName:'Forged',serviceName:'Forged',price:99};
   assert.equal((await request('/bookings','','POST',body)).status,401);
   assert.equal((await request('/bookings',ceo,'POST',{...body,shopId:'s2'})).status,403);
   const created=await request('/bookings',ceo,'POST',body);
   assert.equal(created.status,201);
   assert.equal(created.body.data.status,'pending');
   assert.equal(created.body.data.customerName,'Synthetic one');
   assert.equal(created.body.data.stylistName,'Synthetic stylist');
   assert.equal(created.body.data.price,0);
   const id=created.body.data.id;
   const slots=await request('/bookings?shopId=s1');
   assert.equal(slots.status,200);
   for(const key of ['id','customerId','customerName','customerPhone','notes']) assert.equal(slots.body.data[0][key],undefined);
   assert.equal((await request('/bookings/'+id)).status,401);
   assert.equal((await request('/bookings/'+id+'/cancel','','PUT',{customerId:'c1'})).status,401);
   const oldHash=tables.customers[0].password_hash;
   tables.customers[0].password_hash=await hashPassword('123456');
   const {signCustomerToken}=await import('../backend/lib/tokens.js');
   const customer=signCustomerToken('c1','s1',tables.customers[0].password_hash);
   assert.equal((await request('/bookings/'+id,customer)).status,200);
   assert.equal((await request('/bookings',customer,'POST',{...body,customerId:'c2'})).status,403);
   const visits=tables.customers[0].visit_count,spent=tables.customers[0].total_spent;
   assert.equal((await request('/bookings/'+id,ceo,'PUT',{status:'completed'})).status,200);
   assert.equal(tables.customers[0].visit_count,visits);assert.equal(tables.customers[0].total_spent,spent);
   assert.equal(tables.customer_visit_records.length,0);
   tables.bookings.push({...tables.bookings[0],id:'foreign',shop_id:'s2'});
   assert.equal((await request('/bookings/foreign',ceo,'PUT',{status:'confirmed'})).status,404);
   tables.customers[0].password_hash=oldHash;
   tables.bookings=[];
  });
  await t.test('无登录与低权限被拒；发型师列表仅返回本人服务且同店客户',async()=>{
   assert.equal((await request('/customers')).status,401);
   const own=await request('/customers',stylist);assert.equal(own.status,200);assert.deepEqual(own.body.data.map((r:any)=>r.id),['c1']);
   assert.equal((await request('/customers/c2',stylist)).status,404);
   assert.equal((await request('/customers/c2/profile',stylist)).status,404);
   assert.equal((await request('/customers/c3',ceo)).status,404);
   assert.equal((await request('/customers',ceo)).body.data.length,2);assert.ok((await request('/customers',ceo)).body.data.every((r:any)=>r.passwordHash===undefined));
   for(const token of [stylist,manager]){
    assert.equal((await request('/customers',token,'POST',{name:'Synthetic',phone:'13800000000'})).status,403);
    assert.equal((await request('/customers/c2',token,'DELETE')).status,403);
    assert.equal((await request('/financial/report',token)).status,403);
   }
   assert.equal((await request('/financial/report',cs)).status,403);
   assert.equal((await request('/financial/report',ceo)).status,200);
  });
  await t.test('CEO/客服可新增删除；无权限修改和跨店设置被拒',async()=>{
   for(const token of [ceo,cs]){
    assert.equal((await request('/customers',token,'POST',{id:'new',name:'Synthetic',phone:'13800000000'})).status,200);
    assert.equal((await request('/customers/new',token,'DELETE')).status,200);
   }
   assert.equal((await request('/shops/s1','','PUT',{name:'x'})).status,401);
   assert.equal((await request('/shops/s1',stylist,'PUT',{name:'x'})).status,403);
   assert.equal((await request('/shops/s2',manager,'PUT',{name:'x'})).status,403);
   assert.equal((await request('/shops/s1',manager,'PUT',{name:'Synthetic updated'})).status,200);
  });
  await t.test('顾客手机号设密、哈希登录、身份隔离和员工重置',async()=>{
   const before=calls;
   const setup=await request('/customers/login','','POST',{phone:'13800000001'});
   assert.equal(setup.status,200);assert.equal(setup.body.setupRequired,true);
   assert.equal((await request('/customers/login','','POST',{phone:'13800000001',password:'12345',setupPassword:true})).status,400);
   const set=await request('/customers/login','','POST',{phone:'13800000001',password:'123456',setupPassword:true,client:'mini'});
   assert.equal(set.status,200);assert.ok(isPasswordHash(tables.customers[0].password_hash));assert.notEqual(tables.customers[0].password_hash,'123456');
   assert.equal(set.body.data.passwordHash,undefined);assert.ok(set.body.token);assert.match(set.cookie!,/HttpOnly/);
   const r=set;
   assert.equal((await request('/customers/login','','POST',{phone:'13800000001',password:'000000',client:'mini'})).status,401);
   const h5=await request('/customers/login','','POST',{phone:'13800000001',password:'123456'});
   assert.equal(h5.status,200);assert.equal(h5.body.token,undefined);assert.match(h5.cookie!,/HttpOnly/);
   assert.equal((await request('/customers/c1/public')).status,401);
   assert.equal((await request('/customers/c1/public',ceo)).status,401);
   assert.equal(r.body.data.idCardNumber,undefined);assert.equal(r.body.data.openidMini,undefined);
   assert.equal((await request('/customers/c1/public',r.body.token)).status,200);
   assert.equal((await request('/customers/c1/public','','GET',undefined,r.cookie!.split(';')[0])).status,200);
   assert.equal((await request('/customers/c2/public',r.body.token)).status,403);
   assert.equal((await request('/customers/c1/packages',r.body.token)).status,200);
   for (const path of ['/bookings/customer/c1','/reviews/customer/c1','/coupons/customer/c1','/product-orders/customer/c1']) {
    assert.equal((await request(path)).status,401,`${path} requires customer authentication`);
    assert.equal((await request(path,r.body.token)).status,200,`${path} accepts own session`);
   }
   for (const path of ['/bookings/customer/c2','/reviews/customer/c2','/coupons/customer/c2','/product-orders/customer/c2']) assert.equal((await request(path,r.body.token)).status,403);
   assert.equal((await request('/customers',r.body.token)).status,401);
   assert.equal((await request('/customers/c1/password/reset',stylist,'POST')).status,403);
   assert.equal((await request('/customers/c1/password/reset',cs,'POST')).status,200);
   assert.ok(isPasswordHash(tables.customers[0].password_hash));
   assert.equal((await request('/customers/c1/public',r.body.token)).status,401);
   assert.equal((await request('/customers/login','','POST',{phone:'13800000001',password:'000001'})).status,200);
   const resetLogin=await request('/customers/login','','POST',{phone:'13800000001',password:'000001',client:'mini'});assert.equal(resetLogin.status,200);
   assert.equal(resetLogin.body.data.mustChangePassword,true);
   assert.equal((await request('/customers/c1/packages',resetLogin.body.token)).status,403);
   assert.equal((await request('/customers/c1/login-credential',cs,'POST',{identityVerified:true})).status,404);
    const legacyCredential=jwt.sign({id:'c1',shopId:'s1',kind:'customer-login'},getJwtSecret(),{algorithm:'HS256',audience:'customer-login',issuer:'mbs',expiresIn:900});
    assert.equal((await request('/customers/c1/public',legacyCredential)).status,401);
    rpcFailures=0;
    assert.equal((await request('/customers/login','','POST',{phone:'13800000002'})).body.setupRequired,true);
    assert.equal((await request('/customers/login','','POST',{phone:'13800000002',password:'123456',setupPassword:true})).status,200);
    for (let i=0;i<5;i++) assert.equal((await request('/customers/login','','POST',{phone:'13800000002',password:'999999'})).status,401);
   assert.equal((await request('/customers/login','','POST',{phone:'13800000002',password:'999999'})).status,429);
  });

  await t.test('未迁移受控拒绝、员工核实必须同店与归属、匿名商城付款被拒',async()=>{
   failRpc=true;
   assert.equal((await request('/customers/login','','POST',{phone:'13800000001',password:'000001'})).status,503);
   failRpc=false;
   assert.equal((await request('/customers/c2/identity/verify',stylist,'POST')).status,404);
   assert.equal((await request('/customers/c3/identity/verify',cs,'POST')).status,404);
   assert.equal((await request('/customers/c1/identity/verify',stylist,'POST')).status,200);
   assert.equal(tables.customers[0].identity_verified,true);
   assert.equal((await request('/product-orders','','POST',{shopId:'s1',customerId:'c1',items:[],paymentMethod:'balance'})).status,401);
   assert.equal((await request('/product-orders/any/pay','','POST',{customerId:'c1',paymentMethod:'balance'})).status,401);
  });

  await t.test('服务端目录重算：拒绝金额、数量、税费和越店商品篡改',async()=>{
   tables.shops[0].services=[{id:'svc',name:'Synthetic service',price:58}];
   tables.products=[{id:'product',shop_id:'s1',name:'Synthetic product',price:20,category:'hair_care',is_active:true}];
   tables.member_benefit_records=[];
   const {priceSettlement}=await import('../backend/lib/settlementPricing.js');
   const body={customerId:'c1',items:[{type:'service',id:'svc',quantity:1,originalPrice:0.01,discountedPrice:0.01}],total:58};
   assert.equal((await priceSettlement('s1',body)).total,58);
   for (const employeeLevel of ['gold','director']) {
    const legacyBody={...body,items:[{...body.items[0],employeeLevel}]};
    const priced=await priceSettlement('s1',legacyBody);
    assert.equal(priced.total,58,'历史等级字段不能改变门店目录价');
    assert.equal(priced.items[0].originalPrice,58);
    assert.equal(priced.items[0].employeeLevel,undefined);
    await assert.rejects(priceSettlement('s1',{...legacyBody,total:employeeLevel==='gold'?78:98}),/金额/);
   }
   await assert.rejects(priceSettlement('s1',{...body,total:0.01}),/金额/);
   await assert.rejects(priceSettlement('s1',{...body,tax:1}),/金额/);
   await assert.rejects(priceSettlement('s1',{...body,items:[{type:'service',id:'svc',quantity:-1}]}),/数量/);
   await assert.rejects(priceSettlement('s1',{...body,items:[{type:'service',id:'svc',quantity:1,priceOverride:1}]}),/改价/);
   await assert.rejects(priceSettlement('s2',body),/不存在/);
   failRpc=true;
   const r=await request('/settlements',cs,'POST',{...body,paymentMethod:'cash'});
   assert.equal(r.status,503);assert.equal(tables.settlements.length,0);
   failRpc=false;
  });
  await t.test('员工收银不以顾客核实和改密为前提，顾客凭证不能冒用员工结算',async()=>{
   const c=tables.customers[0];
   const saved={identity_verified:c.identity_verified,is_weak_password:c.is_weak_password};
   Object.assign(c,{identity_verified:false,is_weak_password:true});
   tables.shops[0].services=[{id:'svc',name:'Synthetic service',price:58}];
   const body={customerId:'c1',items:[{type:'service',id:'svc',quantity:1}],total:58};
   failRpc=true;
   try {
    for(const paymentMethod of ['cash','card','balance','wechat']) {
     const before=checkoutRpcCalls;
     const r=await request('/settlements',ceo,'POST',{...body,paymentMethod});
     // 注入RPC缺失，证明已越过身份限制抵达事务入口；绝不实际发起网关收款。
     assert.equal(r.status,503,paymentMethod);
     assert.equal(checkoutRpcCalls,before+1,paymentMethod);
     assert.notEqual(r.body.code,'CUSTOMER_IDENTITY_UNVERIFIED');
    }
    const customerToken=jwt.sign({id:'c1',shopId:'s1',kind:'customer'},getJwtSecret(),{algorithm:'HS256',audience:'customer',issuer:'mbs',expiresIn:900});
    const before=checkoutRpcCalls;
    assert.equal((await request('/settlements','','POST',{...body,paymentMethod:'wechat'})).status,401);
    assert.equal((await request('/settlements',customerToken,'POST',{...body,paymentMethod:'wechat'})).status,401);
    assert.equal((await request('/customer-packages/any/consume',customerToken,'POST',{})).status,401);
    assert.equal(checkoutRpcCalls,before);
    assert.equal(c.identity_verified,false);assert.equal(c.is_weak_password,true);
   } finally {failRpc=false;Object.assign(c,saved);}
  });
  await t.test('零元微信纯核销直接完成；HTTP 重试不重复提交，改动后重试拒绝',async()=>{
   tables.shops[0].services=[{id:'zero',name:'Synthetic zero service',price:0}];
   const body={id:'same-request',customerId:'c1',items:[{type:'service',id:'zero',quantity:1}],total:0,paymentMethod:'wechat'};
   completeCheckout=true;
   checkoutRpcCalls=0;
   try {
    const first=await request('/settlements',ceo,'POST',body);
    assert.equal(first.status,201);assert.equal(first.body.data.paymentStatus,'completed');assert.equal(first.body.data.payment,undefined);
    const repeat=await request('/settlements',ceo,'POST',body);
    assert.equal(repeat.status,200);assert.equal(checkoutRpcCalls,1);
    assert.equal((await request('/settlements',ceo,'POST',{...body,total:1})).status,409);
    assert.equal(checkoutRpcCalls,1);
   } finally {completeCheckout=false;tables.settlements=[];}
  });
  await t.test('新版微信HTTP：网关超时后原号恢复，不按新目录重算；已付重试返回完成快照',async()=>{
   const {recoveryDependencies:deps}=await import('../backend/services/paymentRecovery.js');
   const savedDeps={...deps},savedRpc=supabase.rpc,savedTables=[tables.settlements,tables.payments,tables.shops[0].services];
   let rpcCount=0,gatewayCalls=0,failGateway=true,paid=false,attempt:any;
   tables.settlements=[];tables.payments=[];tables.shops[0].services=[{id:'svc',name:'Synthetic',price:58}];
   const body={id:'http_atomic',customerId:'c1',items:[{type:'service',id:'svc',quantity:1}],paymentMethod:'wechat',total:58};
   (supabase as any).rpc=async(name:string,args:any)=>{
    if(name!=='create_wechat_settlement_atomic') return savedRpc(name,args);
    rpcCount++;
    const s={...args.p_settlement,checkout_payment_started:true,server_priced:true,payment_status:'pending'};tables.settlements.push(s);
    tables.payments.push({id:args.p_payment_id,settlement_id:s.id,shop_id:s.shop_id,customer_id:s.customer_id,amount:s.total,status:'pending',channel:'wechat_native'});
    attempt={gateway_order_no:args.p_payment_id,payment_id:args.p_payment_id,state:'active'};
    return {data:{settlement:s,paymentCreated:true},error:null};
   };
   deps.rpc=(async(name:string,args:any)=>{
    if(name==='claim_wechat_recovery')return {data:{settlement:tables.settlements[0],payment:tables.payments[0],attempt},error:null};
    if(args.p_action==='request')attempt.request_body=args.p_data;
    if(args.p_action==='qr'){attempt.qr_updated_at=new Date().toISOString();tables.payments[0].code_url=args.p_data.code_url;}
    return {data:attempt,error:null};
   }) as any;
   deps.request=(id,amount,description)=>({appid:'synthetic',mchid:'synthetic',description,out_trade_no:id,notify_url:'https://synthetic.invalid',amount:{total:Math.round(amount*100),currency:'CNY'}});
   deps.query=async()=>paid?{status:'paid',amount:58,tradeState:'SUCCESS',transactionId:'420000001',paidAt:'2026-10-23T01:02:03Z'}:{status:'pending',tradeState:'NOT_FOUND'};
   deps.create=async(request)=>{gatewayCalls++;assert.equal(request.amount.total,5800);if(failGateway)throw new Error('Synthetic gateway timeout');return {paymentId:request.out_trade_no,status:'pending',amount:58,codeUrl:'weixin://wxpay/synthetic'};};
   try {
    assert.equal((await request('/settlements',ceo,'POST',body)).status,400);
    assert.equal(tables.payments.length,1);assert.equal(rpcCount,1);
    failGateway=false;tables.shops[0].services[0].price=999;
    const retry=await request('/settlements',ceo,'POST',body);
    assert.equal(retry.status,200);assert.equal(retry.body.data.payment.amount,58);assert.equal(rpcCount,1);
    assert.equal((await request('/settlements',ceo,'POST',{...body,total:999})).status,409);assert.equal(gatewayCalls,2);
    paid=true;const completed=await request('/settlements',ceo,'POST',body);
    assert.equal(completed.status,200);assert.equal(completed.body.data.paymentStatus,'completed');assert.equal(completed.body.data.total,58);assert.equal(completed.body.data.payment,undefined);
    assert.equal((await request('/settlements',ceo,'POST',body)).body.data.paymentStatus,'completed');
    assert.equal(rpcCount,1);assert.equal(gatewayCalls,2);
   }finally{Object.assign(deps,savedDeps);(supabase as any).rpc=savedRpc;[tables.settlements,tables.payments,tables.shops[0].services]=savedTables;}
  });
  await t.test('伪造/过期 token、旧员工 token、数据库验证失败均不能放行',async()=>{
   const expired=jwt.sign({id:'c1',shopId:'s1',kind:'customer'},getJwtSecret(),{algorithm:'HS256',audience:'customer',issuer:'mbs',expiresIn:-1});
   assert.equal((await request('/customers/c1/public',expired)).status,401);
   const forged=jwt.sign({id:'c1',shopId:'s1',kind:'customer'},'wrong-secret',{algorithm:'HS256',audience:'customer',issuer:'mbs'});
   assert.equal((await request('/customers/c1/public',forged)).status,401);
   assert.equal((await request('/customers',jwt.sign({id:'ceo',role:'ceo'},getJwtSecret()))).status,401);
   failAuthentication=true;assert.equal((await request('/customers',ceo)).status,503);failAuthentication=false;
   const employees=await request('/employees',ceo);assert.equal(employees.status,200);assert.ok(employees.body.data.every((r:any)=>r.password_hash===undefined));
  });
  await t.test('老客户初始密码：受限会话、强制改密、旧会话失效与身份状态独立', async () => {
   rpcFailures=0;
   const weak={id:'legacy',shop_id:'s1',name:'Synthetic legacy',phone:'13800000004',password_hash:await hashPassword('123456'),is_weak_password:true,identity_verified:false,identity_verified_at:null,identity_verified_by:null,stored_value_balance:321};
   tables.customers.push(weak);
   const login=await request('/customers/login','','POST',{phone:weak.phone,password:'123456',client:'mini'});
   assert.equal(login.status,200);assert.equal(login.body.data.mustChangePassword,true);
   assert.deepEqual(Object.keys(login.body.data).sort(),['id','identityVerified','mustChangePassword','shopId']);
   const token=login.body.token;
   assert.equal((await request('/customers/legacy/public',token)).body.data.mustChangePassword,true);
   for (const path of ['/customers/legacy/packages','/bookings/customer/legacy','/reviews/customer/legacy','/coupons/customer/legacy']) {
     const blocked=await request(path,token);assert.equal(blocked.status,403);assert.equal(blocked.body.code,'PASSWORD_CHANGE_REQUIRED');
   }
   // 不相信 token 中的改密声明，数据库状态才是边界。
   const {signCustomerToken}=await import('../backend/lib/tokens.js');
   const bypass=signCustomerToken(weak.id,weak.shop_id,weak.password_hash,false);
   assert.equal((await request('/customers/legacy/packages',bypass)).status,403);
   assert.equal((await request('/customers/c1/password/change',token,'POST',{})).status,403);
   const before=weak.password_hash;
   const change=(currentPassword:string,newPassword:string,confirmPassword=newPassword)=>request('/customers/legacy/password/change',token,'POST',{currentPassword,newPassword,confirmPassword,client:'mini'});
   for (const args of [['123456','123456'],['000000','246810'],['123456','246810','246811'],['123456','12345']]) assert.equal((await change(...args as [string,string,string?])).status,400);
   assert.equal(weak.password_hash,before);assert.equal(weak.is_weak_password,true);
   const changed=await change('123456','246810');assert.equal(changed.status,200);assert.ok(changed.body.token);
   assert.equal(weak.is_weak_password,false);assert.ok(await verifyPassword('246810',weak.password_hash));
   assert.equal(weak.identity_verified,false);assert.equal(weak.identity_verified_at,null);assert.equal(weak.identity_verified_by,null);
   assert.equal((await request('/customers/legacy/public',token)).status,401);
   const self=await request('/customers/legacy/public',changed.body.token);assert.equal(self.status,200);assert.equal(self.body.data.identityVerified,false);assert.equal(self.body.data.mustChangePassword,false);
   const payment=await request('/product-orders',changed.body.token,'POST',{shopId:'s1',customerId:'legacy',items:[{productId:'synthetic',quantity:1}],paymentMethod:'balance'});
   assert.equal(payment.status,403);assert.equal(payment.body.code,'CUSTOMER_IDENTITY_UNVERIFIED');assert.equal(weak.stored_value_balance,321);
   assert.equal((await request('/customers/legacy/identity/verify',cs,'POST',{})).status,200);
   assert.equal((await request('/customers/legacy/public',changed.body.token)).body.data.identityVerified,true);
   weak.is_weak_password=true;
   assert.equal((await request('/customers/legacy/packages',changed.body.token)).status,403);
   tables.customers.splice(tables.customers.indexOf(weak),1);
  });
  await t.test('全项目复核：团购、上传、商品及优惠券写入拒绝匿名、低权限、跨店',async()=>{
   tables.group_buy_batches=[{id:'gb1',shop_id:'s1',name:'Synthetic batch'},{id:'gb2',shop_id:'s2',name:'Foreign'}];
   for(const [path,method,body] of [
    ['/group-buy/batches','GET',undefined],['/group-buy/vouchers/verify','POST',{code:'123456'}],
    ['/group-buy/vouchers/redeem','POST',{code:'123456'}],['/upload/image','POST',{image:'anything'}],
    ['/queues/s1','PUT',{}],['/reviews/x/reply','PUT',{reply:'Forged'}],['/reviews/x/hide','PUT',{isHidden:true}],
    ['/coupons/x/claim','POST',{customerId:'c1'}],['/product-orders/x/refund','POST',{reason:'Forged'}],
    ['/product-orders/x/confirm','PUT',{customerId:'c1'}],['/product-orders/x/tracking','GET',undefined],
    ['/reviews','POST',{customerId:'c1'}],['/referrals/invite','POST',{customerId:'c1'}],
   ] as const) assert.equal((await request(path,'',method,body)).status,401,path);
   assert.equal((await request('/group-buy/batches?shopId=s2',ceo)).status,403);
   assert.equal((await request('/group-buy/batches/gb2',ceo,'PUT',{name:'Forged'})).status,404);
   assert.equal((await request('/group-buy/batches',stylist,'POST',{})).status,403);
   assert.equal((await request('/group-buy/batches?shopId=s1',ceo)).body.data.length,1);
   const updated=await request('/group-buy/batches/gb1',manager,'PUT',{name:'Changed'});
   assert.equal(updated.status,200);assert.equal(updated.body.data.shopId,'s1');
   for(const path of ['/shops/s2/products','/shops/s2/products/p/inventory']) assert.equal((await request(path,ceo,'POST',{})).status,403);
   assert.equal((await request('/shops/s1/products',stylist,'POST',{})).status,403);
   assert.equal((await request('/coupons',manager,'POST',{shopId:'s2',name:'Forged',value:1})).status,403);
   tables.coupons=[{id:'foreign',shop_id:'s2'}];
   assert.equal((await request('/coupons/foreign',manager,'PUT',{value:999})).status,404);
   assert.equal(tables.coupons[0].value,undefined);
  });
  await t.test('全项目复核：顾客资源归属、评价来源和公开隐私',async()=>{
   const {signCustomerToken}=await import('../backend/lib/tokens.js');
   const hash=await hashPassword('246810');tables.customers[1].password_hash=hash;tables.customers[1].is_weak_password=false;
   const own=signCustomerToken('c2','s1',hash);
   tables.product_orders=[{id:'o1',shop_id:'s1',customer_id:'c1',status:'shipped'},{id:'o2',shop_id:'s1',customer_id:'c2',status:'shipped',shipping_no:'SYNTHETIC'}];
   for(const path of ['/product-orders/o1/tracking','/reviews/booking/b1']) assert.equal((await request(path,own)).status,404);
   assert.equal((await request('/product-orders/o1/refund',own,'POST',{reason:'Forged'})).status,404);
   assert.equal((await request('/product-orders/o2/confirm',own,'PUT',{customerId:'c1'})).status,403);
   assert.equal((await request('/product-orders/o2/confirm',own,'PUT',{customerId:'c2'})).status,200);
   assert.equal((await request('/product-orders/o2/tracking',own)).status,200);
   tables.reviews=[{id:'r1',shop_id:'s1',customer_id:'c1',booking_id:'b1',customer_name:'Synthetic Private',comment:'Public',is_hidden:false},{id:'r2',shop_id:'s1',comment:'Hidden private',is_hidden:true},{id:'r3',shop_id:'s2',is_hidden:false}];
   const pub=await request('/reviews/shop/s1');assert.equal(pub.body.data.length,1);
   for(const key of ['customerId','bookingId','replyBy']) assert.equal(pub.body.data[0][key],undefined);
   assert.notEqual(pub.body.data[0].customerName,'Synthetic Private');
   assert.equal((await request('/reviews/shop/s1',ceo)).body.data.length,2);
   assert.equal((await request('/reviews/r3/hide',ceo,'PUT',{isHidden:true})).status,404);
   assert.equal((await request('/reviews/r1/reply',stylist,'PUT',{reply:'Forged'})).status,403);
   assert.equal((await request('/reviews/r1/reply',cs,'PUT',{reply:'Thanks',replyBy:'Forged'})).body.data.replyBy,'Synthetic CS');
   tables.bookings=[{id:'b1',shop_id:'s1',customer_id:'c1',status:'completed'},{id:'b2',shop_id:'s1',customer_id:'c2',status:'confirmed'}];
   assert.equal((await request('/reviews',own,'POST',{shopId:'s1',customerId:'c2',bookingId:'b1',serviceScore:5,stylistScore:5})).status,404);
   assert.equal((await request('/reviews',own,'POST',{shopId:'s1',customerId:'c2',bookingId:'b2',serviceScore:5,stylistScore:5})).status,409);
   tables.bookings=[];tables.reviews=[];
  });
  await t.test('全项目复核：公开队列脱敏、JSON错误与过大请求明确拒绝',async()=>{
   tables.bookings=[{id:'private',shop_id:'s1',customer_id:'c1',customer_name:'Sensitive',notes:'PRIVATE',status:'confirmed',service_id:'svc',scheduled_time:new Date().toISOString(),queue_number:1}];
   const pub=await request('/queues/s1');assert.equal(pub.status,200);assert.equal(pub.body.data.bookings.length,1);
   for(const key of ['id','customerId','customerName','notes']) assert.equal(pub.body.data.bookings[0][key],undefined);
   assert.equal((await request('/queues/s1',ceo)).body.data.bookings[0].customerName,'Sensitive');
   assert.equal((await request('/queues/s2',ceo)).status,403);
   const invalid=await fetch(base+'/api/customers/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalid'});
   assert.equal(invalid.status,400);assert.equal((await invalid.json()).success,false);
   const large=await request('/customers/login','','POST',{value:'x'.repeat(3*1024*1024)});assert.equal(large.status,413);
   tables.bookings=[];
  });
  await t.test('客户资料只改姓名不改余额，经营字段需旧值且拒绝过期覆盖',async()=>{
   const c=tables.customers[0],before=structuredClone(c);
   try {
    assert.equal((await request('/customers/c1',ceo,'PUT',{})).status,400);
    assert.equal((await request('/customers/c1',ceo,'PUT',{_expected:{age:null}})).status,400);
    assert.equal((await request('/customers/c1',ceo,'PUT',{unknownField:'ignored'})).status,400);
    assert.equal((await request('/customers/c1',ceo,'PUT',{name:'Edited'})).status,200);
    assert.equal(c.stored_value_balance,before.stored_value_balance);
    assert.equal((await request('/customers/c1',ceo,'PUT',{storedValueBalance:999})).status,409);
    assert.equal((await request('/customers/c1',ceo,'PUT',{storedValueBalance:999,_expected:{storedValueBalance:0}})).status,409);
    const response=await request('/customers/c1',ceo,'PUT',{storedValueBalance:222,_expected:{storedValueBalance:before.stored_value_balance}});
    assert.equal(response.status,200);assert.equal(c.stored_value_balance,222);assert.equal(response.body.data.passwordHash,undefined);
    assert.equal((await request('/customers/c1',ceo,'PUT',{storedValueBalance:-1,_expected:{storedValueBalance:222}})).status,400);
    assert.equal((await request('/customers/c1',ceo,'PUT',{storedValueBalance:333,_expected:{storedValueBalance:before.stored_value_balance}})).status,409);
   } finally {Object.assign(c,before);}
  });
  await t.test('退款终态防反转、拒绝需原因、重复请求不产生二次处理',async()=>{
   tables.refund_requests=[{id:'refund-cas',shop_id:'s1',status:'pending',amount:10}];
   assert.equal((await request('/refunds/refund-cas/status',ceo,'PUT',{status:'rejected'})).status,400);
   assert.equal((await request('/refunds/refund-cas/status',ceo,'PUT',{status:'approved',refundMethod:'forged'})).status,400);
   assert.equal((await request('/refunds/refund-cas/status',ceo,'PUT',{status:'approved'})).status,200);
   assert.equal((await request('/refunds/refund-cas/status',ceo,'PUT',{status:'approved'})).status,200);
   assert.equal((await request('/refunds/refund-cas/status',ceo,'PUT',{status:'completed',refundMethod:'original'})).status,400);
   assert.equal((await request('/refunds/refund-cas/status',ceo,'PUT',{status:'completed',refundMethod:'original',receiptRef:'synthetic-refund-001',receiptAmount:10,receiptAt:'2026-10-24T10:00:00+08:00'})).status,200);
   assert.equal((await request('/refunds/refund-cas/status',ceo,'PUT',{status:'approved'})).status,409);
   tables.refund_requests=[];
  });
  await t.test('经营报表只统计同店已付，设计师列表识别实际角色并按本人过滤',async()=>{
   const saved=[tables.settlements,tables.shops,tables.reviews];
   const now=new Date().toISOString();
   tables.shops=[{id:'s1',name:'Own',is_active:true},{id:'s2',name:'Foreign',is_active:true}];
   tables.settlements=[{id:'paid',shop_id:'s1',total:10,payment_method:'cash',payment_status:'completed',created_at:now,manual_paid_at:now,manual_paid_recorded_at:now,manual_paid_recorded_by:'cashier',items:[{employeeId:'stylist',type:'service',total:10,quantity:1}]},{id:'draft',shop_id:'s1',total:999,payment_status:'pending',created_at:now},{id:'foreign',shop_id:'s2',total:888,payment_status:'completed',created_at:now}];tables.reviews=[];
   try {
    const owner=await request('/owner/dashboard',ceo);assert.equal(owner.status,200);assert.equal(owner.body.data.totalRevenue.today,10);assert.equal(owner.body.data.shopStats.length,1);
    const financial=await request('/financial/report',ceo);assert.equal(financial.body.data.revenue.today,10);
    const performance=await request('/stylists/performance',stylist);assert.equal(performance.status,200);assert.equal(performance.body.data.length,1);assert.equal(performance.body.data[0].revenue.today,10);
   }finally{[tables.settlements,tables.shops,tables.reviews]=saved;}
  });
  await t.test('经营看板HTTP：旧单新付、旧项目分页、本人隔离、员工数与失败不返回部分业绩',async()=>{
   const keys=['settlements','payments','settlement_items','reviews','wechat_payment_attempts','shops','employees','bookings'];
   const saved=Object.fromEntries(keys.map(k=>[k,tables[k]]));const now=new Date().toISOString();
   const settlement=(id:string)=>({id,shop_id:'s1',customer_id:'c1',total:33.64,payment_method:'wechat',payment_status:'completed',created_at:'2024-01-01T00:00:00Z',items:[]});
   tables.shops=[{id:'s1',name:'Own',is_active:true}]; tables.reviews=[{id:'review',shop_id:'s1',stylist_id:'stylist',overall_score:4}];
   tables.employees=[...saved.employees,{id:'second',shop_id:'s1',role:'stylist',name:'Second',is_active:true}];
   tables.bookings=[{id:'today',shop_id:'s1',customer_id:'c1',scheduled_time:now,status:'confirmed'},{id:'cancel',shop_id:'s1',customer_id:'c2',scheduled_time:now,status:'cancelled'},
     {id:'future',shop_id:'s1',customer_id:'future',scheduled_time:'2099-12-01T00:00:00Z',status:'confirmed'}];
   tables.settlements=[settlement('valid'),settlement('unknown')];
   tables.payments=[{id:'p',shop_id:'s1',settlement_id:'valid',customer_id:'c1',amount:33.64,status:'paid',paid_at:now,paid_at_source:'wechat_success_time',transaction_id:'wx'}];
   tables.settlement_items=[{id:'i',settlement_id:'valid',employee_id:'stylist',employee_name:'Stylist',total:33.64,quantity:2,type:'service'},
    {id:'bad',settlement_id:'unknown',employee_id:'stylist',total:33.64,quantity:1,type:'service'}]; tables.wechat_payment_attempts=[];
   try{
    const owner=await request('/owner/dashboard',ceo);assert.equal(owner.status,200);
    assert.equal(owner.body.data.totalRevenue.today,33.64);assert.equal(owner.body.data.excluded.count,1);
    assert.equal(owner.body.data.shopStats[0].employees,5);assert.equal(owner.body.data.totalCustomers.today,1);
    assert.equal(owner.body.data.periodDetails.today.topStylists[0].services,2);
    const own=await request('/stylists/performance?shopId=s2',stylist);assert.equal(own.status,200);
    assert.equal(own.body.data.length,1);assert.equal(own.body.data[0].services.total,2);assert.equal(own.body.data[0].averageRating,4);
    assert.equal(own.body.data[0].revenue.today,33.64);assert.equal(own.body.data[0].excluded.count,1);assert.equal(own.body.data[0].records,undefined);
    assert.equal((await request('/owner/dashboard',stylist)).status,403);
    failPaymentQuery=true;
    for(const path of ['/owner/dashboard','/stylists/performance']){const failed=await request(path,ceo);assert.equal(failed.status,503);assert.equal(failed.body.data,undefined);}
    failPaymentQuery=false;failDashboardTable='reviews';
    for(const path of ['/owner/dashboard','/stylists/performance'])assert.equal((await request(path,ceo)).status,503);
    failDashboardTable='';tables.payments=[];
    tables.settlements=Array.from({length:1003},(_,i)=>({...settlement('page-'+i),total:0.01,payment_method:'cash',created_at:now,manual_paid_at:now,manual_paid_recorded_at:now,manual_paid_recorded_by:'cashier'}));
    tables.settlement_items=tables.settlements.map(s=>({id:'i-'+s.id,settlement_id:s.id,employee_id:'stylist',total:0.01,quantity:1,type:'service'}));
    tables.bookings=Array.from({length:1003},(_,i)=>({id:'b-'+i,shop_id:'s1',customer_id:'c-'+i,scheduled_time:now,status:'confirmed'}));
    const paged=await request('/owner/dashboard',ceo);assert.equal(paged.body.data.totalRevenue.today,10.03);assert.equal(paged.body.data.totalCustomers.today,1003);
    const pagedOwn=await request('/stylists/performance',stylist);assert.equal(pagedOwn.body.data[0].services.total,1003);assert.equal(pagedOwn.body.data[0].revenue.today,10.03);
   }finally{failPaymentQuery=false;failDashboardTable='';for(const k of keys)tables[k]=saved[k];}
  });
  await t.test('财务HTTP：跨年旧单新付、历史时间缺失与金额异常、分页及支付查询失败',async()=>{
   const saved=[tables.settlements,tables.payments,tables.settlement_items,tables.reviews,tables.wechat_payment_attempts];
   const now=new Date().toISOString();
   const settlement=(id:string,total=33.64)=>({id,shop_id:'s1',customer_id:'c1',customer_name:'Synthetic',total,payment_method:'wechat',payment_status:'completed',created_at:'2024-01-01T00:00:00Z',items:[{id:'svc',type:'service',quantity:1,total,employeeId:'stylist'}]});
   const payment=(sid:string)=>({id:'payment-'+sid,shop_id:'s1',settlement_id:sid,customer_id:'c1',amount:33.64,status:'paid',paid_at:now,paid_at_source:'wechat_success_time',transaction_id:'wx-'+sid,created_at:now});
   tables.settlements=[settlement('old'),settlement('unknown'),settlement('mismatch'),settlement('multiple'),{...settlement('foreign'),shop_id:'s2'},{...settlement('draft'),payment_status:'pending'}];
   tables.payments=[payment('old'),{...payment('unknown'),paid_at_source:null},{...payment('mismatch'),amount:58},payment('multiple'),{...payment('multiple'),id:'second-payment'}];
   tables.wechat_payment_attempts=[{payment_id:'payment-old',gateway_order_no:'actual-active-wechat-order',state:'active'}];
   tables.reviews=[];tables.settlement_items=[];
   try {
    const result=await request('/financial/report',ceo);assert.equal(result.status,200);
    const r=result.body.data;assert.equal(r.revenue.today,33.64);assert.equal(r.records.length,4);assert.equal(r.excluded.count,3);assert.equal(r.excluded.amount,100.92);
    assert.equal(r.records.find((s:Row)=>s.id==='old').gatewayOrderNo,'actual-active-wechat-order');
    assert.equal(r.topStylists[0].revenue,33.64);
    failPaymentQuery=true;
    const failed=await request('/financial/report',ceo);assert.equal(failed.status,503);assert.equal(failed.body.data,undefined);
    failPaymentQuery=false;
    // 超过默认1000行；最后一页也必须计入。旧表明细同样超过1000条。
    tables.settlements=Array.from({length:1003},(_,i)=>({...settlement('page-'+String(i).padStart(4,'0'),0.01),payment_method:'cash',created_at:now,manual_paid_at:now,manual_paid_recorded_at:now,manual_paid_recorded_by:'cashier',items:[]}));
    tables.payments=[];
    tables.settlement_items=tables.settlements.map(s=>({id:'item-'+s.id,settlement_id:s.id,quantity:1,type:'service',total:0.01,employee_id:'stylist'}));
    const paged=await request('/financial/report',ceo);assert.equal(paged.status,200);assert.equal(paged.body.data.records.length,1003);
    assert.equal(paged.body.data.revenue.today,10.03);assert.equal(paged.body.data.services.today,1003);assert.equal(paged.body.data.topStylists[0].revenue,10.03);
    // 单个旧单也可能有超过一页的项目，验证项目查询自身的range翻页。
    tables.settlement_items.push(...Array.from({length:1003},(_,i)=>({id:'free-'+i,settlement_id:tables.settlements[0].id,quantity:1,type:'service',total:0,employee_id:'stylist'})));
    const manyItems=await request('/financial/report',ceo);assert.equal(manyItems.status,200);
    assert.equal(manyItems.body.data.services.today,2006);assert.equal(manyItems.body.data.revenue.today,10.03);
   }finally{failPaymentQuery=false;[tables.settlements,tables.payments,tables.settlement_items,tables.reviews,tables.wechat_payment_attempts]=saved;}
  });
  await t.test('埋点不能伪造顾客身份或夹带凭证，上传拒绝SVG和伪装图片',async()=>{
   tables.customer_events=[];
   const event={event_type:'page_view',customer_id:'c1',page_path:'/profile?token=private',timestamp:new Date().toISOString(),properties:{phone:'PRIVATE',token:'PRIVATE',button:'book'}};
   const r=await request('/analytics/events/batch','','POST',{events:[event]});assert.equal(r.status,200);
   const stored=tables.customer_events[0];assert.equal(stored.customer_id,null);assert.equal(stored.page_path,'/profile');assert.deepEqual(stored.properties,{button:'book'});
   assert.equal((await request('/analytics/events/batch','','POST',{events:Array(51).fill(event)})).status,400);
   for(const image of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,SGVsbG8=']) assert.equal((await request('/upload/image',ceo,'POST',{image})).status,400);
   tables.customer_events=[];
  });
  await t.test('团购结算核对活动归属和有效期，一券不能扩展为多次抵扣',async()=>{
   const saved=[tables.group_buy_batches,tables.group_buy_vouchers,tables.shops[0].services];
   const batch={id:'batch',shop_id:'s1',is_active:true,valid_from:new Date(Date.now()-86400000).toISOString(),valid_to:new Date(Date.now()+86400000).toISOString(),service_ids:['svc'],price_type:'fixed',fixed_price:40};
   tables.group_buy_batches=[batch];tables.group_buy_vouchers=[{id:'voucher',batch_id:'batch',shop_id:'s1',status:'used',used_by_customer_id:'c1'}];tables.shops[0].services=[{id:'svc',name:'Synthetic',price:58}];
   const body={customerId:'c1',items:[{type:'service',id:'svc',quantity:1,groupBuyVoucherId:'voucher'}],total:40,paymentMethod:'cash'};
   failRpc=true;
   try {
    assert.equal((await request('/settlements',ceo,'POST',body)).status,503);
    assert.equal((await request('/settlements',ceo,'POST',{...body,items:[{...body.items[0],quantity:2}],total:80})).status,400);
    batch.is_active=false;assert.equal((await request('/settlements',ceo,'POST',body)).status,400);batch.is_active=true;
    batch.valid_to='2000-01-01';assert.equal((await request('/settlements',ceo,'POST',body)).status,400);
    batch.valid_to=new Date(Date.now()+86400000).toISOString();batch.shop_id='s2';assert.equal((await request('/settlements',ceo,'POST',body)).status,400);
   }finally{failRpc=false;[tables.group_buy_batches,tables.group_buy_vouchers,tables.shops[0].services]=saved;}
  });
  await t.test('公开图片按需读取完整字节；跨店索引拒绝，资料保存不破坏原图',async()=>{
   const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
   const shop=tables.shops[0];const before=structuredClone(shop);const products=tables.products;
   shop.avatar=png;shop.images=[png];tables.products=[{id:'image-product',shop_id:'s1',name:'Synthetic',images:[png],price:10,stock:1}];
   try {
    const read=await request('/shops/s1');assert.equal(read.body.data.avatar,'/api/shops/s1/media/avatar');
    const response=await fetch(base+read.body.data.avatar);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'),png.split(',')[1]);
    assert.equal((await fetch(base+'/api/shops/s2/products/image-product/images/0')).status,404);
    assert.equal((await request('/shops/s1',ceo,'PUT',{name:shop.name,avatar:read.body.data.avatar,images:read.body.data.images})).status,200);assert.equal(shop.avatar,png);assert.deepEqual(shop.images,[png]);
    const product=await request('/shops/s1/products');assert.ok(product.body.data[0].images[0].startsWith('/api/shops/s1/products/'));
    assert.equal((await request('/shops/s1/products/image-product',ceo,'PUT',{name:'Edited',images:product.body.data[0].images,stock:999})).status,200);assert.deepEqual(tables.products[0].images,[png]);assert.equal(tables.products[0].stock,1);
   }finally{Object.assign(shop,before);tables.products=products;}
  });
  await t.test('服务端预约遵守门店营业配置，不信任前端可选时段',async()=>{
   const shop=tables.shops[0],before=structuredClone(shop);tables.bookings=[];
   const body={shopId:'s1',customerId:'c1',serviceId:'svc',stylistId:'stylist',scheduledTime:'2029-01-01T10:00:00+08:00'};
   shop.services=[{id:'svc',name:'Synthetic',price:58,duration:30}];shop.opening_hours={monday:{isOpen:false,open:'09:00',close:'21:00'}};
   try {
    assert.equal((await request('/bookings',ceo,'POST',body)).status,400);
    shop.opening_hours.monday={isOpen:true,open:'11:00',close:'18:00'};
    assert.equal((await request('/bookings',ceo,'POST',body)).status,400);
    assert.equal((await request('/bookings',ceo,'POST',{...body,scheduledTime:'2029-01-01T12:00:00+08:00'})).status,201);
   } finally {Object.assign(shop,before);delete shop.opening_hours;tables.bookings=[];}
  });
  await t.test('停用、降权、改密即时影响现有员工会话',async()=>{
   tables.employees[0].role='stylist';assert.equal((await request('/financial/report',ceo)).status,403);tables.employees[0].role='ceo';
   tables.employees[0].is_active=false;assert.equal((await request('/customers',ceo)).status,401);tables.employees[0].is_active=true;
   tables.employees[0].password_hash=await hashPassword('changed-password');assert.equal((await request('/customers',ceo)).status,401);
  });
  await t.test('模拟充值接口无数据库访问，余额保持不变',async()=>{
   const before=calls,balance=tables.customers[0].stored_value_balance;
   const r=await request('/customers/c1/recharge','','POST',{shopId:'s1',storedValueLevel:'store_5000'});assert.equal(r.status,403);assert.equal(calls,before);assert.equal(tables.customers[0].stored_value_balance,balance);
  });
  await t.test('密码迁移失败不签发会话，旧值保持，恢复后可登录',async()=>{
   tables.employees.push({id:'failure',shop_id:'s1',role:'stylist',phone:'synthetic-failure',is_active:true,password_hash:'old-password'});
   failMigration=true;const r=await request('/auth/login','','POST',{phone:'synthetic-failure',password:'old-password'});assert.equal(r.status,503);assert.equal(r.body.data,undefined);assert.equal(tables.employees.at(-1)!.password_hash,'old-password');failMigration=false;await login('failure');
  });
  await t.test('旧单新付列表分页、支付来源、金额和跨店隔离；支付查询故障不返回假成功',async()=>{
   const token=(await request('/auth/login','','POST',{phone:'synthetic-ceo',password:'changed-password'})).body.data.token;const previous=[tables.settlements,tables.payments];
   try {
    tables.settlements=Array.from({length:1002},(_,i)=>({id:'old-'+i,shop_id:'s1',customer_id:'c1',customer_name:'Synthetic',payment_method:'wechat',payment_status:'completed',created_at:'2026-10-01T00:00:00Z',total:58,items:[]}));
    const target=tables.settlements[1001];target.total=33.64;target.created_at='2026-08-01T00:00:00Z';
    tables.payments=[{id:'gateway1',shop_id:'s1',customer_id:'c1',settlement_id:target.id,status:'paid',amount:33.64,created_at:'2026-10-22T10:00:00Z',paid_at:'2026-10-22T11:12:34Z',paid_at_source:'wechat_success_time',transaction_id:'420000001'},
      {id:'foreign',shop_id:'s2',customer_id:'c1',settlement_id:target.id,status:'paid',amount:33.64,paid_at:'2026-10-23T00:00:00Z',paid_at_source:'wechat_success_time'}];
    tables.wechat_payment_attempts=[{payment_id:'gateway1',gateway_order_no:'new-gateway',state:'active'}];
    const result=await request('/settlements?shopId=s2',token);
    assert.equal(result.status,200);assert.equal(result.body.data.length,1002);assert.equal(result.body.data[0].id,target.id);
    assert.equal(result.body.data[0].paidAt,'2026-10-22T11:12:34Z');assert.equal(result.body.data[0].paymentAmount,33.64);assert.equal(result.body.data[0].gatewayOrderNo,'new-gateway');
    assert.equal((await request('/settlements/'+target.id,token)).body.data.paymentId,'gateway1');
    tables.payments[0].customer_id='wrong-customer';
    assert.equal((await request('/settlements/'+target.id+'/confirm-payment',token,'POST',{})).status,409);
    tables.payments[0].customer_id='c1';
    delete tables.payments[0].paid_at_source;
    const legacy=(await request('/settlements/'+target.id,token)).body.data;
    assert.equal(legacy.paidAt,undefined);assert.equal(legacy.paymentRecordedAt,'2026-10-22T11:12:34Z');
    failPaymentQuery=true;assert.notEqual((await request('/settlements',token)).status,200);
   } finally {failPaymentQuery=false;tables.wechat_payment_attempts=[];[tables.settlements,tables.payments]=previous;}
  });
  await t.test('真实RSA验签/AES解密回调使用success_time；重复回调不改时间，失败要求微信重试',async()=>{
   const previous=[tables.settlements,tables.payments];
   const keys=generateKeyPairSync('rsa',{modulusLength:2048});
   process.env.WECHAT_PAY_PUBLIC_KEY=keys.publicKey.export({type:'spki',format:'pem'}).toString();
   process.env.WECHAT_API_V3_KEY='01234567890123456789012345678901';process.env.WECHAT_MCH_ID='synthetic-mch';process.env.WECHAT_APP_ID='synthetic-app';
   const notify=async(overrides:Record<string,unknown>={},tamper=false)=>{
    const receipt={mchid:'synthetic-mch',appid:'synthetic-app',out_trade_no:'gateway1',transaction_id:'420000001',trade_state:'SUCCESS',amount:{currency:'CNY',total:3364},success_time:'2026-10-22T19:12:34+08:00',...overrides};
    const nonce='012345678901',aad='synthetic';const cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.WECHAT_API_V3_KEY!),Buffer.from(nonce));cipher.setAAD(Buffer.from(aad));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(receipt)),cipher.final(),cipher.getAuthTag()]).toString('base64');
    const raw=JSON.stringify({resource:{ciphertext:encrypted,nonce,associated_data:aad}});
    const timestamp=String(Math.floor(Date.now()/1000));const signature=createSign('RSA-SHA256').update(timestamp+'\n'+'notify'+'\n'+raw+'\n').sign(keys.privateKey,'base64');
    const response=await fetch(base+'/api/webhook/wechat-pay',{method:'POST',headers:{'Content-Type':'application/json','wechatpay-signature':tamper?'invalid':signature,'wechatpay-timestamp':timestamp,'wechatpay-nonce':'notify','wechatpay-serial':'synthetic'},body:raw});
    return {status:response.status,body:await response.json()};
   };
   try {
    tables.settlements=[{id:'receipt',shop_id:'s1',customer_id:'c1',total:33.64,payment_method:'wechat',payment_status:'pending'}];
    tables.payments=[{id:'gateway1',shop_id:'s1',customer_id:'c1',settlement_id:'receipt',amount:33.64,status:'pending'}];
    assert.equal((await notify({},true)).status,400);assert.equal((await notify({success_time:undefined})).status,400);
    failRpc=true;assert.equal((await notify()).status,500);assert.equal(tables.payments[0].status,'pending');failRpc=false;
    assert.equal((await notify()).status,200);assert.equal((await notify()).status,200);
    assert.equal(tables.payments[0].paid_at,'2026-10-22T11:12:34.000Z');assert.equal(tables.payments[0].transaction_id,'420000001');
    const token=(await request('/auth/login','','POST',{phone:'synthetic-ceo',password:'changed-password'})).body.data.token;const confirmed=await request('/settlements/receipt/confirm-payment',token,'POST',{transactionId:'forged',paidAt:'2999-01-01'});
    assert.equal(confirmed.status,200);assert.equal(confirmed.body.data.transactionId,'420000001');
   } finally {failRpc=false;[tables.settlements,tables.payments]=previous;}
  });
  await t.test('主动微信核对必须查询原单；成功、重复和失败均保留已登记凭据',async()=>{
   const {recoveryDependencies}=await import('../backend/services/paymentRecovery.js');
   const previous=[tables.settlements,tables.payments,tables.wechat_payment_attempts];
   const originalQuery=recoveryDependencies.query;
   const paidAt='2026-10-24T07:34:31.000Z';
   let queries=0;
   let gateway:any={status:'paid',tradeState:'SUCCESS',amount:33.64,transactionId:'420000001',paidAt:'2026-10-24T15:34:31+08:00'};
   try {
    tables.settlements=[{id:'recheck',shop_id:'s1',customer_id:'c1',total:33.64,payment_method:'wechat',payment_status:'completed'}];
    tables.payments=[{id:'ledger1',shop_id:'s1',customer_id:'c1',settlement_id:'recheck',amount:33.64,status:'paid',paid_at:paidAt,paid_at_source:'wechat_success_time',transaction_id:'420000001'}];
    tables.wechat_payment_attempts=[{payment_id:'ledger1',gateway_order_no:'gateway1',state:'active'}];
    recoveryDependencies.query=async id=>{queries++;assert.equal(id,'gateway1');if(gateway instanceof Error)throw gateway;return gateway;};
    const token=(await request('/auth/login','','POST',{phone:'synthetic-ceo',password:'changed-password'})).body.data.token;
    const endpoint='/settlements/recheck/confirm-payment';
    assert.equal((await request(endpoint,token,'POST',{})).status,200);assert.equal(queries,0);
    assert.equal((await request(endpoint,'','POST',{recheckWechat:true})).status,401);assert.equal(queries,0);
    const before=structuredClone([tables.settlements,tables.payments,tables.wechat_payment_attempts]);
    for(let i=0;i<2;i++) {
     const result=await request(endpoint,token,'POST',{recheckWechat:true,paidAt:'2999-01-01',transactionId:'forged'});
     assert.equal(result.status,200);assert.equal(result.body.data.paidAt,paidAt);assert.equal(result.body.data.paymentAmount,33.64);assert.equal(result.body.data.transactionId,'420000001');
    }
    assert.equal(queries,2);
    for(const change of [
      {status:'pending',message:'微信查单暂不可用或验签未通过'},
      {...gateway,amount:0.01}, {...gateway,transactionId:'different'}, {...gateway,paidAt:'2026-10-24T15:35:00+08:00'},
      {...gateway,paidAt:undefined}, new Error('synthetic unavailable'),
    ]) {
     gateway=change;
     const result=await request(endpoint,token,'POST',{recheckWechat:true});
     assert.notEqual(result.status,200);
     assert.deepEqual([tables.settlements,tables.payments,tables.wechat_payment_attempts],before);
    }
   } finally {recoveryDependencies.query=originalQuery;[tables.settlements,tables.payments,tables.wechat_payment_attempts]=previous;}
  });
  await t.test('哈希密码校验与生产缺密钥拒绝',async()=>{
   for (const password of ['x', '长'.repeat(40), 'mbs-sha256:legacy', '$2b$12$legacy']) { const migrated = await hashPassword(password, true); assert.ok(await verifyPassword(password, migrated)); assert.equal(await verifyPassword(password + 'wrong', migrated), false); }
   const hash=await hashPassword('test-password');assert.ok(await verifyPassword('test-password',hash));assert.equal(await verifyPassword('wrong',hash),false);
   const secret=process.env.JWT_SECRET;process.env.NODE_ENV='production';delete process.env.JWT_SECRET;assert.throws(getJwtSecret);process.env.JWT_SECRET=secret;process.env.NODE_ENV='test';
  });
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));globalThis.fetch=realFetch;}
});

