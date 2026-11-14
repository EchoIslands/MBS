import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
type Snapshot={booking:{id:string;state?:string;version?:number;scheduledTime?:string};notices:unknown[];rules:{text?:string};contactPhone?:string};
async function harness(){
 let page!:vm.Context;let data:Snapshot={booking:{id:'b',state:'arrived',version:2,scheduledTime:'2026-11-12T06:00:00Z'},notices:[],rules:{text:'rules'},contactPhone:'123'};
 const calls:unknown[][]=[];const intervals=new Map<number,()=>void>();let timer=0;let read:()=>Promise<Snapshot>=async()=>structuredClone(data);
 const ctx=vm.createContext({console,Date,setInterval:(fn:()=>void)=>{intervals.set(++timer,fn);return timer;},clearInterval:(id:number)=>intervals.delete(id),notificationConfig:async()=>({templateId:''}),subscribeQueue:async()=>({subscribed:true}),takeRouteParams:()=>({bookingId:'b'}),getLiveQueue:()=>read(),actOnQueue:async(...args:unknown[])=>calls.push(args),wx:{vibrateLong(){},showToast(){},makePhoneCall(){}},Page:(p:vm.Context)=>{page=p;}});
 const code=(await readFile(new URL('../mini-program/pages/queue/queue.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');vm.runInContext(code,ctx);
 page.setData=(patch:object)=>Object.assign(page.data,patch);page.onLoad({});page.visible=true;
 return {page,calls,intervals,setRead:(fn:()=>Promise<Snapshot>)=>read=fn,setSnapshot:(s:Snapshot)=>data=s};
}
test('mini queue polls server, prevents duplicate mutations, marks stale and stops hidden-page updates',async()=>{
 const h=await harness();await h.page.refresh();assert.equal(h.page.data.booking.version,2);assert.equal(h.page.data.stale,false);
 h.page.data.lastSync=Date.now()-21000;h.page.updateFreshness();assert.equal(h.page.data.stale,true);
 await h.page.act({currentTarget:{dataset:{action:'left_reported',minutes:10}}});assert.equal(h.calls.length,0);
 await h.page.refresh();await h.page.act({currentTarget:{dataset:{action:'left_reported',minutes:10}}});assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0],['b','left_reported',2,10]);
 h.page.startPolling();assert.equal(h.intervals.size,2);h.page.onHide();assert.equal(h.intervals.size,0);
 h.page.visible=true;let release!:(value:Snapshot)=>void;h.setRead(()=>new Promise(r=>release=r));const pending=h.page.refresh();h.page.onHide();release({booking:{id:'old'},notices:[],rules:{}});await pending;assert.equal(h.page.data.booking.id,'b');
});
test('late stale reads cannot overwrite the result of an explicit refresh; failures retain last data but disable actions',async()=>{
 const h=await harness();let release!:(value:Snapshot)=>void;h.setRead(()=>new Promise(r=>release=r));const old=h.page.refresh();
 h.setRead(async()=>({booking:{id:'b',version:4},notices:[],rules:{text:''}}));await h.page.refresh(true);
 release({booking:{id:'b',version:1},notices:[],rules:{}});await old;assert.equal(h.page.data.booking.version,4);
 h.setRead(async()=>{throw new Error('network offline');});await h.page.refresh();assert.equal(h.page.data.stale,true);assert.equal(h.page.data.booking.version,4);assert.match(h.page.data.error,/offline/);
});
