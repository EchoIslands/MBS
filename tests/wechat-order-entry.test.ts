import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { wechatPaymentDescription } from '../backend/lib/wechatDescription.js';

test('微信订单页的状态条件使用动态绑定，并显式包含在小程序代码包中', async () => {
  const root = new URL('../mini-program/', import.meta.url);
  const template = await readFile(new URL('pages/payment-order/payment-order.wxml', root), 'utf8');
  const conditions = [...template.matchAll(/wx:(?:if|elif)="([^"]*)"/g)].map(match => match[1]);
  assert.ok(conditions.length >= 6);
  for (const condition of conditions) assert.match(condition, /^\{\{.+\}\}$/, '静态字符串会被当作恒真条件');
  const config = JSON.parse(await readFile(new URL('project.config.json', root), 'utf8'));
  assert.ok(config.packOptions.include.some((rule: any) => rule.type === 'folder' && rule.value === 'pages/payment-order'));
});

test('真实项目说明与微信长度限制；无明细拒绝，不把内部单号伪装为商品', () => {
  assert.equal(wechatPaymentDescription([{name:'设计师洗剪吹',quantity:2},{name:'养发护理',quantity:1}]), '设计师洗剪吹×2、养发护理×1');
  const long = wechatPaymentDescription([{name:'洗剪吹💇'.repeat(60),quantity:1}]);
  assert.ok(Buffer.byteLength(long) <= 127); assert.ok(long.endsWith('…')); assert.ok(!long.includes('\ufffd'));
  assert.throws(() => wechatPaymentDescription([]));
  assert.throws(() => wechatPaymentDescription([{name:'',quantity:1}]));
  assert.throws(() => wechatPaymentDescription([{name:'服务',quantity:-1}]));
});

test('微信订单详情：真实 HTTP + 本人凭证/同店归属/旧单号/失败拒绝，全部合成数据', async () => {
  process.env.SUPABASE_URL = 'https://synthetic.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  process.env.JWT_SECRET = 'synthetic-test-secret-only-01234567890123456789';
  process.env.NODE_ENV = 'test';
  const { supabase } = await import('../backend/db/index.js');
  const { signCustomerToken } = await import('../backend/lib/tokens.js');
  const tables: Record<string, any[]> = {
    customers: [{id:'c1',shop_id:'s1',password_hash:'synthetic-hash',is_weak_password:false},{id:'c2',shop_id:'s1',password_hash:'synthetic-hash',is_weak_password:false}],
    wechat_payment_attempts: [{gateway_order_no:'gateway_123',payment_id:'payment_123',state:'active'},{gateway_order_no:'gateway_old',payment_id:'payment_123',state:'closed'}],
    payments: [{id:'payment_123',settlement_id:'settle1',customer_id:'c1',shop_id:'s1',channel:'wechat_native',amount:33.64,status:'paid',paid_at_source:'wechat_success_time',paid_at:'2026-10-24T07:34:31Z',transaction_id:'420000001',request_body:'PRIVATE',created_at:'2026-10-24T07:28:20Z'}],
    settlements: [{id:'settle1',customer_id:'c1',shop_id:'s1',total:33.64,payment_method:'wechat',payment_status:'completed',items:[{name:'合成洗剪吹',quantity:1,total:33.64,employeeName:'PRIVATE'}],created_at:'2026-10-24T07:28:20Z',customer_phone:'PRIVATE'}],
    settlement_items: [],
  };
  let fail = '';
  class Query {
    filters: ((r:any)=>boolean)[] = []; cols = '*'; single = false;
    constructor(public table:string) {}
    select(cols:string){this.cols=cols;return this;}
    eq(k:string,v:unknown){this.filters.push(r=>r[k]===v);return this;}
    maybeSingle(){this.single=true;return this;}
    order(){return this;} limit(){return this;}
    then(resolve:any,reject:any){
      if(fail===this.table) return Promise.resolve({data:null,error:{code:'synthetic'}}).then(resolve,reject);
      const data=(tables[this.table]||[]).filter(row=>this.filters.every(f=>f(row))).map(row=>Object.fromEntries(this.cols.split(',').map(k=>k.trim()).map(k=>[k,row[k]])));
      return Promise.resolve({data:this.single?data[0]||null:data,error:null}).then(resolve,reject);
    }
  }
  (supabase as any).from = (table:string)=>new Query(table);
  const { default: express } = await import('express');
  const { default: router } = await import('../backend/routes/customerPaymentOrders.js');
  const app = express(); app.use('/api/customer-payment-orders', router);
  const server = createServer(app); server.listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',()=>r()));
  const base='http://127.0.0.1:'+(server.address() as any).port;
  const realFetch=globalThis.fetch;
  globalThis.fetch=((input:any,init:any)=> { assert.ok(String(input).startsWith(base+'/api/'), '禁止外网'); return realFetch(input,init); }) as typeof fetch;
  const token=signCustomerToken('c1','s1','synthetic-hash');
  const get=async(no='gateway_123',auth=token)=>{
    const response=await fetch(base+'/api/customer-payment-orders/'+no,{headers:auth?{Authorization:'Bearer '+auth}:{}});
    return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
  };
  try {
    const original=JSON.stringify(tables);
    const own=await get(); assert.equal(own.status,200); assert.equal(own.cache,'no-store');
    assert.equal(own.body.data.amount,33.64); assert.equal(own.body.data.paidAt,'2026-10-24T07:34:31Z');
    assert.equal(own.body.data.createdAt,'2026-10-24T07:28:20Z'); assert.ok(!JSON.stringify(own).includes('PRIVATE'));
    assert.equal((await get('gateway_123','')).status,401);
    assert.equal((await get('gateway_123',signCustomerToken('c2','s1','synthetic-hash'))).status,404);
    assert.equal((await get('unknown_order')).status,404);
    assert.equal((await get('bad')).status,400);
    const closed=await get('gateway_old'); assert.equal(closed.body.data.status,'closed'); assert.equal(closed.body.data.paidAt,null);
    assert.equal(JSON.stringify(tables),original,'读取不能写入或重新收款');
    tables.payments[0].shop_id='s2'; assert.equal((await get()).status,404); tables.payments[0].shop_id='s1';
    tables.settlements[0].customer_id='c2'; assert.equal((await get()).status,404); tables.settlements[0].customer_id='c1';
    tables.customers[0].is_weak_password=true; assert.equal((await get()).body.code,'PASSWORD_CHANGE_REQUIRED'); tables.customers[0].is_weak_password=false;
    tables.payments[0].paid_at_source=null; assert.equal((await get()).body.data.status,'review'); assert.equal((await get()).body.data.paidAt,null); tables.payments[0].paid_at_source='wechat_success_time';
    tables.payments[0].amount=1; assert.equal((await get()).status,503); tables.payments[0].amount=33.64;
    for(const table of ['payments','wechat_payment_attempts','settlements']) { fail=table; assert.equal((await get()).status,503); }
    fail=''; assert.equal((await get()).status,200);
  } finally { globalThis.fetch=realFetch; await new Promise<void>(r=>server.close(()=>r())); }
});

async function miniHarness(route='pages/payment-order/payment-order', options:any={outTradeNo:'gateway_123'}) {
  const redirects:any[]=[];
  const context=vm.createContext({
    console, setTimeout, clearTimeout,
    getCurrentPages:()=>[{route,options}],
    wx:{reLaunch:(o:any)=>redirects.push(o),showToast(){}},
    getCustomerId:()=> 'c1', getToken:()=> 'token', getPasswordChangeRequired:()=>false,
    setCustomerId(){}, clearCustomerId(){}, changeCustomerPassword:async()=>{},
    loginCustomer:async()=>({customer:{id:'c1',mustChangePassword:false}}),
    Page:(page:any)=>{ context.page=page; },
  });
  const load=async(file:string)=>{
    const source=(await readFile(new URL('../mini-program/'+file,import.meta.url),'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?$/gm,'').replace(/^export /gm,'');
    vm.runInContext(source,context,{filename:file});
    if(context.page)context.page.setData=(patch:any)=>Object.assign(context.page.data,patch);
  };
  await load('utils/payment-order-link.js');
  return {context,redirects,load};
}

test('订单深链：参数白名单、未登录/401/强制改密与成功返回，不接受任意跳转',async()=>{
  const h=await miniHarness();
  assert.equal(h.context.paymentOrderNumber({outTradeNo:'https://evil.invalid'}),'');
  assert.equal(h.context.paymentOrderPath('../../shop'),'');
  await h.load('pages/payment-order/payment-order.js');
  h.context.page.onLoad({outTradeNo:'gateway_123'});
  h.context.getToken=()=>''; await h.context.page.onShow();
  assert.equal(h.redirects.at(-1).url,'/pages/login/login?returnOrderNo=gateway_123');
  h.context.getToken=()=> 'token';
  await h.load('utils/password-gate.js'); await h.load('utils/auth.js');
  h.context.handleExpiredCustomerSession('token','c1');
  assert.equal(h.redirects.at(-1).url,'/pages/login/login?reason=session_expired&returnOrderNo=gateway_123');
  h.context.getPasswordChangeRequired=()=>true;
  h.context.enforcePasswordChange('pages/payment-order/payment-order',{outTradeNo:'gateway_123'});
  assert.equal(h.redirects.at(-1).url,'/pages/change-password/change-password?returnOrderNo=gateway_123');
  const login=await miniHarness('pages/login/login'); login.context.getToken=()=>'';
  await login.load('pages/login/login.js');
  await login.context.page.onLoad({returnOrderNo:'gateway_123'});
  Object.assign(login.context.page.data,{phone:'13900000002',password:'246810'});
  await login.context.page.onLogin();
  assert.equal(login.redirects.at(-1).url,'/pages/payment-order/payment-order?outTradeNo=gateway_123');
  assert.equal(login.context.page.afterLoginPath({mustChangePassword:true}),'/pages/change-password/change-password?returnOrderNo=gateway_123');
  await login.load('pages/change-password/change-password.js');
  login.context.getToken=()=> 'token'; login.context.page.onLoad({returnOrderNo:'gateway_123'});
  Object.assign(login.context.page.data,{currentPassword:'123456',newPassword:'246810',confirmPassword:'246810'});
  await login.context.page.onSubmit();
  assert.equal(login.redirects.at(-1).url,'/pages/payment-order/payment-order?outTradeNo=gateway_123');
});

test('订单 Page：金额与北京时间、失败重试、切换账号和离页后的旧响应不覆盖',async()=>{
  const h=await miniHarness(); await h.load('pages/payment-order/payment-order.js');
  const page=h.context.page; page.onLoad({outTradeNo:'gateway_123'});
  const data={outTradeNo:'gateway_123',amount:33.64,status:'paid',items:[],createdAt:'2026-10-24T07:28:20Z',paidAt:'2026-10-24T07:34:31Z'};
  h.context.get=async()=>({data}); await page.onShow();
  assert.equal(page.data.order.amountText,'33.64'); assert.equal(page.data.order.paidAtText,'2026/10/24 15:34:31');
  h.context.get=async()=>{throw new Error('合成503');}; await page.loadOrder();
  assert.equal(page.data.order,null); assert.equal(page.data.error,'合成503'); assert.equal(page.data.loading,false);
  h.context.get=async()=>({data}); await page.loadOrder(); assert.equal(page.data.error,'');
  let finish:any;
  h.context.get=()=>new Promise(resolve=>{finish=resolve;});
  const old=page.loadOrder(); page.onHide(); finish({data}); await old; assert.equal(page.data.order,null);
  const stale=page.loadOrder(); h.context.getCustomerId=()=> 'other'; finish({data}); await stale; assert.equal(page.data.order,null);
});
