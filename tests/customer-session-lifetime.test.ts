import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('device session migration enforces 30-day inactivity, scope and revocation', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE shops (id text PRIMARY KEY);
   CREATE TABLE customers (id text PRIMARY KEY, shop_id text REFERENCES shops(id));
   INSERT INTO shops VALUES ('shop1'), ('other');
   INSERT INTO customers VALUES ('customer1', 'shop1');`);
  const migration = await readFile(new URL('../migrations/067_customer_device_sessions.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const { rows: [{ id }] } = await db.query<{id: string}>("SELECT open_customer_device_session('customer1','shop1') AS id");
  const touch = async (customerId: string, shopId: string) =>
   (await db.query<{valid: boolean}>('SELECT touch_customer_device_session($1,$2,$3) AS valid', [id, customerId, shopId])).rows[0].valid;
  assert.equal(await touch('customer1','other'), false);
  assert.equal(await touch('someone-else','shop1'), false);
  await db.query("UPDATE customer_device_sessions SET last_seen_at=now()-interval '29 days' WHERE id=$1", [id]);
  assert.equal(await touch('customer1','shop1'), true);
  assert.equal((await db.query<{recent: boolean}>("SELECT last_seen_at > now()-interval '1 minute' AS recent FROM customer_device_sessions WHERE id=$1", [id])).rows[0].recent, true);
  await db.query("UPDATE customer_device_sessions SET last_seen_at=now()-interval '30 days' WHERE id=$1", [id]);
  assert.equal(await touch('customer1','shop1'), false);
  const { rows: [{ id: nextId }] } = await db.query<{id: string}>("SELECT open_customer_device_session('customer1','shop1') AS id");
  assert.notEqual(nextId, id);
  await db.query('DELETE FROM customer_device_sessions WHERE id=$1',[nextId]);
  assert.equal((await db.query<{valid:boolean}>("SELECT touch_customer_device_session($1,'customer1','shop1') AS valid",[nextId])).rows[0].valid,false);
  assert.equal((await db.query<{allowed: boolean}>("SELECT has_function_privilege('authenticated','public.touch_customer_device_session(uuid,text,text)','EXECUTE') AS allowed")).rows[0].allowed, false);
 } finally { await db.close(); }
});
import fs from 'node:fs';
import vm from 'node:vm';
import {signCustomerToken,CUSTOMER_SESSION_SECONDS,CUSTOMER_RESTRICTED_SESSION_SECONDS} from '../backend/lib/tokens';
test('customer normal session lasts 30 days; restricted password-change session remains two hours',()=>{
 for(const restricted of [false,true]){const p=jwt.decode(signCustomerToken('synthetic','shop','hash',restricted)) as jwt.JwtPayload;assert.equal(p.exp!-p.iat!,restricted?7200:2592000);}
 assert.equal(CUSTOMER_SESSION_SECONDS,2592000);assert.equal(CUSTOMER_RESTRICTED_SESSION_SECONDS,7200);
});
test('H5 restore preserves session on network/503/invalid body, clears only 401 and ignores old-account responses',async()=>{
 const source=fs.readFileSync('src/store.ts','utf8');const body=source.slice(source.indexOf('export const restoreCustomerSession = async () => {')+'export const restoreCustomerSession = async () => {'.length,source.indexOf('// 顾客登录：真实模式')) .trim().replace(/};$/,'');
 for(const kind of ['network','503','badbody','401','success','old401']){
 let cached:{id:string}|null={id:'a'};const state:{currentCustomer?:{id:string}}={};const response={status:kind==='401'||kind==='old401'?401:kind==='503'?503:200,ok:!['401','old401','503'].includes(kind),json:async()=>kind==='badbody'?{}:{success:true,data:{id:'a',name:'fresh'}}};
 const context={loadCustomerSession:()=>cached,saveCustomerSession:(v:typeof cached)=>cached=v,isRealApi:()=>true,getApiBase:()=>'/api',encodeURIComponent,UserRole:{CUSTOMER:'customer'},useAppStore:{setState:(v:object)=>Object.assign(state,v),getState:()=>({setCurrentCustomer:(v:{id:string})=>{state.currentCustomer=v;cached=v;}})},fetch:async()=>{if(kind==='old401')cached={id:'b'};if(kind==='network')throw Error('offline');return response;}};
 await vm.runInNewContext('(async()=>{'+body+'})()',context);
 if(kind==='401')assert.equal(cached,null);else if(kind==='old401'){assert.equal(cached.id,'b');assert.equal(state.currentCustomer,undefined);}else{assert.equal(cached.id,'a');assert.equal(state.currentCustomer.id,'a');}
 }
});
