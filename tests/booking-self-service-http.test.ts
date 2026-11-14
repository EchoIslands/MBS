import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {startsDuringOpening} from '../shared/lib/bookingHours.js';

test('customer changes bind authenticated identity, reject bad/closed times and surface atomic conflicts without fake success',async()=>{
 let broken=false;const calls:{name:string;args:Record<string,unknown>}[]=[];
 const supabase={from:()=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:{is_active:true,opening_hours:{monday:{isOpen:false,open:'09:00',close:'21:00'}}},error:broken?{message:'offline'}:null};}}),rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return args.p_time?{data:null,error:{message:'BOOKING_SLOT_TAKEN'}}:{data:{id:'b',status:'cancelled',customer_id:'c'},error:null};}};
 const source=(await readFile(new URL('../backend/services/bookingSelfService.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const handlers={} as typeof import('../backend/services/bookingSelfService.js');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:handlers,supabase,startsDuringOpening,console,Date});
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.customer={id:'c',shopId:'s',passwordVersion:'v',mustChangePassword:false};next();});
 app.put('/bookings/:id/cancel',handlers.changeOwnBooking);app.put('/bookings/:id/reschedule',handlers.changeOwnBooking);
 const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const send=(path:string,body:unknown)=>fetch(base+'/bookings/b/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
 let res=await send('cancel',{customerId:'other'});assert.equal(res.status,403);assert.equal(calls.length,0);
 res=await send('reschedule',{customerId:'c',scheduledTime:'bad'});assert.equal(res.status,400);
 res=await send('reschedule',{customerId:'c',scheduledTime:'2030-01-07T10:00'});assert.equal(res.status,400);assert.equal(calls.length,0);
 res=await send('reschedule',{customerId:'c',scheduledTime:'2030-01-08T10:00'});assert.equal(res.status,409);assert.match((await res.json()).error,/档期已满/);assert.equal(calls[0].args.p_time,'2030-01-08T02:00:00.000Z');
 broken=true;res=await send('reschedule',{customerId:'c',scheduledTime:'2030-01-08T10:00'});assert.equal(res.status,503);assert.equal(calls.length,1);
 res=await send('cancel',{customerId:'c',actorId:'other'});assert.equal(res.status,200);assert.equal(calls[1].args.p_customer,'c');assert.equal((await res.json()).data.customerId,'c');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('mini profile preserves booking action eligibility instead of dropping service/arrival state',async()=>{
 const source=await readFile(new URL('../mini-program/pages/profile/profile.js',import.meta.url),'utf8');
 const slim=source.slice(source.indexOf('function slimBookings'),source.indexOf('\nPage({'));
 const context=vm.createContext({truncate:(s:string)=>s});vm.runInContext(slim,context);
 const rows=context.slimBookings([{id:'reserved',status:'confirmed'},{id:'arrived',status:'confirmed',arrived_at:'now',queue_state:'arrived'},{id:'started',status:'confirmed',actual_start_time:'now',queue_state:'serving'},{id:'cancelled',status:'cancelled'}]);
 assert.deepEqual(Array.from(rows,(b:{canChange:boolean;canCancel:boolean})=>[b.canChange,b.canCancel]),[[true,true],[false,true],[false,false],[false,false]]);
 const template=await readFile(new URL('../mini-program/pages/profile/profile.wxml',import.meta.url),'utf8');
 assert.ok(template.includes('catchtap="openReschedule"')&&template.includes('catchtap="cancelFromList"'));
});
