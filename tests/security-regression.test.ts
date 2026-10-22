import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
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
 if (name === 'delete_settlement_draft_atomic') return { data: null, error: draftDeleteError };
 if (name === 'create_settlement_atomic' && completeCheckout) {
  checkoutRpcCalls++;
  const row={...args.p_settlement,payment_status:'completed'};
  tables.settlements.push(row);
  return {data:[row],error:null};
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
  await t.test('哈希密码校验与生产缺密钥拒绝',async()=>{
   for (const password of ['x', '长'.repeat(40), 'mbs-sha256:legacy', '$2b$12$legacy']) { const migrated = await hashPassword(password, true); assert.ok(await verifyPassword(password, migrated)); assert.equal(await verifyPassword(password + 'wrong', migrated), false); }
   const hash=await hashPassword('test-password');assert.ok(await verifyPassword('test-password',hash));assert.equal(await verifyPassword('wrong',hash),false);
   const secret=process.env.JWT_SECRET;process.env.NODE_ENV='production';delete process.env.JWT_SECRET;assert.throws(getJwtSecret);process.env.JWT_SECRET=secret;process.env.NODE_ENV='test';
  });
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));globalThis.fetch=realFetch;}
});
