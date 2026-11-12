import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { describeQueue, queueOrder, QUEUE_RULES } from '../shared/lib/liveQueue';
// Real HTTP exercises handler scoping/serialization. Credential validation is covered by security-regression;
// these synthetic identities deliberately never touch production credentials or data.
test('live HTTP snapshots expose only own customer details, scope stylist work and reject bad mutations',async()=>{
 const at=new Date().toISOString();const rows:any[]=[{id:'own',shop_id:'s',customer_id:'c',customer_name:'本人',customer_phone:'13000000001',stylist_id:'stylist',stylist_name:'甲',service_name:'剪发',service_id:'cut',status:'confirmed',scheduled_time:at,arrived_at:at,queue_state:'arrived',queue_version:1},
 {id:'private',shop_id:'s',customer_id:'c2',customer_name:'绝不可泄露姓名',customer_phone:'13999999999',stylist_id:'other',stylist_name:'乙',service_name:'剪发',status:'confirmed',scheduled_time:at,queue_state:'called',queue_call_event_id:8,queue_ack_event_id:0}];
 const tables:Record<string,any[]>={bookings:rows,shops:[{id:'s',phone:'053200000000'}],employees:[{id:'stylist',name:'甲',shop_id:'s',role:'stylist',is_active:true,queue_availability_version:0}],booking_queue_events:[]};
 let broken=false;const rpcs:any[]=[];
 class Query{
 data:any[];single=false;constructor(table:string){this.data=[...(tables[table]||[])];}
 select(){return this;} eq(k:string,v:any){this.data=this.data.filter(r=>r[k]===v);return this;}
 gte(k:string,v:any){this.data=this.data.filter(r=>r[k]>=v);return this;}lt(k:string,v:any){this.data=this.data.filter(r=>r[k]<v);return this;}
 in(k:string,values:any[]){this.data=this.data.filter(r=>values.includes(r[k]));return this;}
 not(k:string,_op:string,v:any){this.data=this.data.filter(r=>r[k]!=v);return this;}
 order(){return this;}limit(n:number){this.data=this.data.slice(0,n);return this;}maybeSingle(){this.single=true;return this;}
 then(resolve:any,reject:any){return Promise.resolve(broken?{data:null,error:{message:'offline'}}:{data:this.single?this.data[0]||null:this.data,error:null}).then(resolve,reject);}
 }
 const supabase={from:(t:string)=>new Query(t),rpc:async(name:string,args:any)=>{rpcs.push({name,args});return {data:{eventId:9},error:args.p_actor_type==='customer'&&args.p_action==='arrived'?{message:'QUEUE_FORBIDDEN'}:null};}};
 const source=(await readFile(new URL('../backend/services/liveQueue.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');const exports:any={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,supabase,describeQueue,queueOrder,QUEUE_RULES,console,Date});
 const app=express();app.use(express.json());app.use((req:any,res,next)=>{const key=req.headers['x-test-identity'];if(!key)return res.status(401).json({success:false});if(key==='customer')req.customer={id:'c',shopId:'s'};else req.employee={id:key==='stylist'?'stylist':'front',shopId:'s',role:key};next();});
 app.get('/bookings/:id/live',exports.customerQueueSnapshot);app.post('/bookings/:id/live',exports.liveQueueAction);app.get('/queues/:shopId/live',exports.staffQueueSnapshot);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',()=>r()));const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const request=(path:string,identity='customer',body?:any)=>fetch(base+path,{method:body?'POST':'GET',headers:{'x-test-identity':identity,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
 let res=await request('/bookings/own/live');assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');let text=await res.text();assert.equal(text.includes('绝不可泄露姓名'),false);assert.equal(text.includes('13999999999'),false);assert.equal(text.includes('customer_id'),false);
 res=await request('/bookings/private/live');assert.equal(res.status,404);
 res=await request('/queues/other/live','ceo');assert.equal(res.status,403);
 res=await request('/queues/s/live','stylist');let data=(await res.json()).data;assert.equal(data.bookings.length,1);assert.equal(data.bookings[0].id,'own');assert.equal(data.availability.length,1);
 res=await request('/queues/s/live','customer_service');data=(await res.json()).data;assert.equal(data.bookings.length,2);assert.equal(data.bookings.find((b:any)=>b.id==='private').unacknowledged,true);
 res=await request('/bookings/own/live','customer',{action:'left_reported'});assert.equal(res.status,400);assert.equal(rpcs.length,0);
 res=await request('/bookings/own/live','cashier',{action:'called',version:1});assert.equal(res.status,403);assert.equal(rpcs.length,0);
 res=await request('/bookings/own/live','customer',{action:'arrived',version:1,shopId:'other',actorId:'front'});assert.equal(res.status,403);assert.equal(rpcs[0].args.p_actor_id,'c');assert.equal(rpcs[0].args.p_shop_id,'s');
 broken=true;res=await request('/bookings/own/live');assert.equal(res.status,503);text=await res.text();assert.equal(text.includes('排队同步暂不可用'),true);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
