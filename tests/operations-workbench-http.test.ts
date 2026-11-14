import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import express from 'express';
import type { AddressInfo } from 'node:net';

test('运营核对台限制门店和角色，指标不猜原因，部分查询失败不显示伪完整结果，退款须实际凭据',async()=>{
 let broken=false,mutations=0;
 const tables:Record<string,Record<string,unknown>[]>={
  membership_payment_orders:[{id:'own',shop_id:'s',customer_id:'c',status:'review',amount:29},{id:'private',shop_id:'other',status:'review'}],
  customers:[{id:'c',shop_id:'s',purchase_vip_level:'bronze',stored_value_balance:0}],
  bookings:[{id:'b',shop_id:'s',scheduled_time:new Date().toISOString(),arrived_at:'2026-11-14T05:00:00Z',actual_start_time:'2026-11-14T05:20:00Z',missed_count:1}, {id:'cancel',shop_id:'s',scheduled_time:new Date().toISOString(),status:'cancelled',arrived_at:'2026-11-14T05:00:00Z'}],
  membership_operation_audit:[{shop_id:'s',created_at:new Date().toISOString(),operation:{membershipAction:'renew'}}],queue_notification_outbox:[{shop_id:'s',created_at:new Date().toISOString(),status:'phone'}],
 };
 class Query{
  rows:Record<string,unknown>[];singleRow=false;
  constructor(table:string){this.rows=[...(tables[table]||[])];}
  select(){return this;}order(){return this;}limit(n:number){this.rows=this.rows.slice(0,n);return this;}
  eq(k:string,v:unknown){this.rows=this.rows.filter(r=>r[k]===v);return this;}
  in(k:string,v:unknown[]){this.rows=this.rows.filter(r=>v.includes(r[k]));return this;}
  gte(k:string,v:unknown){this.rows=this.rows.filter(r=>String(r[k])>=String(v));return this;}
  maybeSingle(){this.singleRow=true;return this;}single(){return this.maybeSingle();}
  then(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown){return Promise.resolve(broken?{error:{message:'offline'}}:{data:this.singleRow?this.rows[0]:this.rows,error:null}).then(resolve,reject);}
 }
 const exports:{default?:express.Router}={};
 const source=(await readFile(new URL('../backend/routes/operationsWorkbench.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Router:express.Router,Date,
  supabase:{from:(t:string)=>new Query(t),rpc:async()=>{mutations++;return {data:[{status:'paid'}]};}},refreshOrder:async(order:unknown)=>({order,tradeState:'SUCCESS'}),
  authMiddleware:(req:express.Request,res:express.Response,next:express.NextFunction)=>{const role=String(req.headers['x-role']||'');if(!role)return res.status(401).json({});req.employee={id:'staff',shopId:'s',role,name:'Synthetic',phone:'synthetic'};next();},
  shopContext:(req:express.Request,res:express.Response,next:express.NextFunction)=>req.query.shopId&&req.query.shopId!=='s'?res.status(403).json({}):next(),
 });
 const app=express();app.use(express.json());app.use(exports.default!);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const request=(path:string,role='ceo',body?:object)=>fetch(base+path,{method:body?'POST':'GET',headers:{'x-role':role,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
  assert.equal((await request('/','')).status,401);assert.equal((await request('/','stylist')).status,403);assert.equal((await request('/?shopId=other')).status,403);
  let response=await request('/');assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.deepEqual(body.data.memberships.map((m:{id:string})=>m.id),['own']);assert.equal(body.data.metrics.waitMedian,20);assert.equal(body.data.metrics.waitSamples,1);assert.equal(body.data.metrics.waitingCancelled,1);assert.equal(body.data.metrics.renewalOperations,1);assert.equal(body.data.metrics.phoneFallbacks,1);
  assert.equal((await request('/membership/private/review')).status,409);
  assert.equal((await request('/membership/own/resolve','ceo',{decision:'refund',reason:'合成测试原因',expected:{},refundRef:'actual-123',refundAmount:29,refundAt:'2026-11-14'})).status,400);assert.equal(mutations,0);
  broken=true;response=await request('/');assert.equal(response.status,503);assert.equal((await response.json()).data,undefined);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
