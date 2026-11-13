import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describeQueue, queueOrder, type QueueRow } from '../shared/lib/liveQueue';
const now=Date.parse('2026-11-12T06:00:00Z');
const row=(id:string,patch:Partial<QueueRow>={}):QueueRow=>({id,shop_id:'s',customer_id:id,status:'confirmed',scheduled_time:'2026-11-12T06:00:00Z',stylist_id:'a',service_id:'cut',planned_duration_minutes:40,...patch});
test('queue counts real arrived customers on the same stylist lane, excludes absent reservations and temporary absences',()=>{
 const mine=row('mine',{queue_state:'arrived',arrived_at:'2026-11-12T05:30:00Z'});
 const all=[mine,row('reserved'),row('away',{queue_state:'away',arrived_at:'2026-11-12T05:00:00Z'}),row('other-lane',{queue_state:'arrived',stylist_id:'b',arrived_at:'2026-11-12T05:00:00Z'}),row('waiting',{queue_state:'arrived',arrived_at:'2026-11-12T05:10:00Z'}),row('serving',{queue_state:'serving',actual_start_time:'2026-11-12T05:50:00Z'})];
 const result=describeQueue(mine,all,[],now);assert.equal(result.aheadCount,2);assert.ok(result.waitHigh!>result.waitLow!);assert.equal(result.duration.samples,0);assert.equal(result.state,'arrived');
 assert.equal(describeQueue(row('pending',{status:'pending'}),all,[],now).aheadCount,null);
 assert.equal(describeQueue(row('next',{scheduled_time:'2026-11-13T06:00:00Z',queue_state:'arrived'}),all,[],now).canLeave,false);
});
test('overrun widens uncertainty instead of presenting an elapsed timer as completed service',()=>{
 const mine=row('m',{queue_state:'arrived',arrived_at:'2026-11-12T05:00:00Z'});
 const busy=row('b',{queue_state:'serving',actual_start_time:'2026-11-12T04:00:00Z',progress_updated_at:'2026-11-12T05:30:00Z',progress_remaining_minutes:10});
 const result=describeQueue(mine,[mine,busy],[],now);assert.equal(result.estimateUncertain,true);assert.match(result.estimateLabel,/延长/);assert.equal(result.overWait,true);assert.ok(result.waitHigh!>=25);
 const histories=Array.from({length:8},(_,i)=>row('h'+i,{actual_start_time:'2026-11-11T05:00:00Z',actual_end_time:new Date(Date.parse('2026-11-11T05:00:00Z')+(20+i*5)*60000).toISOString()}));
 assert.equal(describeQueue(mine,[mine],histories,now).duration.samples,8);
 assert.ok(queueOrder(row('a',{queue_priority_at:'2026-11-12T05:00:00Z'}),row('b',{queue_priority_at:'2026-11-12T05:01:00Z'}))<0);
});
async function database(){
 const db=new PGlite();await db.exec(`CREATE TABLE public.shops(id text PRIMARY KEY,services jsonb);
 CREATE TABLE public.employees(id text PRIMARY KEY,shop_id text,role text,is_active boolean);
 CREATE TABLE public.bookings(id text PRIMARY KEY,shop_id text REFERENCES public.shops(id),customer_id text,stylist_id text,service_id text,status text,scheduled_time timestamptz,actual_start_time timestamptz,actual_end_time timestamptz);
 INSERT INTO shops VALUES ('s','[{"id":"cut","duration":40}]'),('other','[]');
 INSERT INTO employees VALUES ('front','s','customer_service',true),('stylist','s','stylist',true),('other-staff','other','ceo',true),('manager','s','shop_manager',true);`);
 for(const file of ['046_booking_queue_pilot.sql','048_live_queue.sql']){const sql=(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/(?:REVOKE|GRANT)[^;]+;/g,'');await db.exec(sql);}
 await db.exec(`INSERT INTO bookings(id,shop_id,customer_id,stylist_id,service_id,status,scheduled_time) VALUES ('b','s','c','stylist','cut','confirmed',now()),('b2','s','c2','stylist','cut','confirmed',now()),('future','s','c','stylist','cut','confirmed',now()+interval '1 day');`);
 return db;
}
async function action(db:PGlite,id:string,type:string,version:number,actor='front',kind='staff',minutes:number|null=null,note:string|null=null){return db.query("SELECT public.live_queue_action($1,'s',$2,$3,$4,$5,$6,$7) result",[id,actor,kind,type,version,minutes,note]);}
test('live actions enforce ownership, versions, attendance verification, grace period, atomic service exclusivity and immutable history',async()=>{
 const db=await database();try{
 await assert.rejects(action(db,'b','arrived',0,'c','customer'),/QUEUE_FORBIDDEN/);
 await assert.rejects(action(db,'b','arrived',0,'other-staff'),/QUEUE_FORBIDDEN/);
 await assert.rejects(action(db,'future','arrived',0),/QUEUE_CLOSED/);
 await assert.rejects(action(db,'b','called',0),/QUEUE_STATE_CONFLICT/);
 await action(db,'b','arrived',0);
 await assert.rejects(action(db,'b','arrived',0),/QUEUE_STALE_VERSION/);
 await action(db,'b','left_reported',1,'c','customer',10);
 await action(db,'b','return_requested',2,'c','customer');
 let b=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT * FROM bookings WHERE id='b'")).rows[0];assert.equal(b.queue_state,'away');assert.ok(b.return_requested_at);
 await assert.rejects(action(db,'b','service_started',3,'stylist'),/QUEUE_STATE_CONFLICT/);
 await action(db,'b','returned',3);await action(db,'b','ready',4,'stylist');await action(db,'b','called',5,'stylist');
 await assert.rejects(action(db,'b','missed',6),/QUEUE_STATE_CONFLICT/);
 await action(db,'b','acknowledged',6,'c','customer');
 b=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT * FROM bookings WHERE id='b'")).rows[0];assert.equal(Date.parse(b.grace_deadline_at)-Date.parse(b.called_at),600000);assert.ok(Number(b.queue_ack_event_id)>0);
 await action(db,'b','service_started',7,'stylist');
 await action(db,'b2','arrived',0);await assert.rejects(action(db,'b2','service_started',1,'stylist'),/QUEUE_STYLIST_BUSY/);
 await action(db,'b','progress_updated',8,'stylist','staff',20);await action(db,'b','service_finished',9,'stylist');
 await action(db,'b2','service_started',1,'stylist');
 await assert.rejects(action(db,'b','left_reported',10,'c','customer',10),/QUEUE_CLOSED/);
 const count=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT count(*)::int n FROM booking_queue_events WHERE booking_id='b'")).rows[0].n;assert.equal(count,10);
 }finally{await db.close();}
});
test('missed return preserves first priority, repeat/long absence goes to tail, duplicate help and stale concurrent actions are rejected',async()=>{
 const db=await database();try{
 await action(db,'b','arrived',0);await action(db,'b2','arrived',0);
 await db.exec("UPDATE bookings SET arrived_at=now()-interval '10 minutes',queue_priority_at=now()-interval '10 minutes' WHERE id='b'; UPDATE bookings SET arrived_at=now()-interval '5 minutes',queue_priority_at=now()-interval '5 minutes' WHERE id='b2'");
 await action(db,'b','called',1);await db.exec("UPDATE bookings SET grace_deadline_at=now()-interval '1 minute' WHERE id='b'");
 await action(db,'b','missed',2);await action(db,'b','returned',3);
 let b=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT arrived_at,queue_priority_at,missed_count FROM bookings WHERE id='b'")).rows[0];assert.equal(b.missed_count,1);assert.equal(Date.parse(b.queue_priority_at),Date.parse(b.arrived_at));
 await action(db,'b','called',4);await db.exec("UPDATE bookings SET grace_deadline_at=now()-interval '1 minute' WHERE id='b'");await action(db,'b','missed',5);await action(db,'b','returned',6);
 b=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT arrived_at,queue_priority_at,missed_count FROM bookings WHERE id='b'")).rows[0];assert.equal(b.missed_count,2);assert.ok(Date.parse(b.queue_priority_at)>Date.parse(b.arrived_at));
 await assert.rejects(action(db,'b','service_started',7,'stylist'),/QUEUE_ORDER_REASON_REQUIRED/);
 await action(db,'b','help_requested',7,'c','customer');await assert.rejects(action(db,'b','help_requested',8,'c','customer'),/QUEUE_HELP_PENDING/);
 await action(db,'b','contact_attempted',8);await action(db,'b','help_requested',9,'c','customer');
 const results=await Promise.allSettled([action(db,'b2','called',1),action(db,'b2','left_reported',1,'front','staff',10)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(action(db,'b','reordered',10,'front','staff',null,'a'),/QUEUE_ORDER_REASON_REQUIRED/);
 await db.exec("UPDATE bookings SET queue_state='missed',missed_count=1,missed_at=now()-interval '61 minutes',arrived_at=now()-interval '90 minutes' WHERE id='b'");
 await action(db,'b','returned',10);
 const longReturn=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT queue_priority_at,arrived_at FROM bookings WHERE id='b'")).rows[0];
 assert.ok(Date.parse(longReturn.queue_priority_at)-Date.parse(longReturn.arrived_at)>89*60000);
 }finally{await db.close();}
});

test('staff pauses are scoped, versioned and block new service; no automatic finish on resume',async()=>{
 const db=await database();try{
 const pause=(actor:string,id:string,v:number,m:number)=>db.query("SELECT public.live_queue_availability('s',$1,$2,$3,$4)",[actor,id,v,m]);
 await assert.rejects(pause('other-staff','stylist',0,20),/QUEUE_FORBIDDEN/);
 await pause('stylist','stylist',0,20);await assert.rejects(pause('front','stylist',0,0),/QUEUE_STALE_VERSION/);
 await action(db,'b','arrived',0);await assert.rejects(action(db,'b','service_started',1,'stylist'),/QUEUE_STYLIST_PAUSED/);
 await pause('stylist','stylist',1,0);await action(db,'b','service_started',1,'stylist');
 await assert.rejects(action(db,'b2','called',0),/QUEUE_STYLIST_BUSY/);
 await pause('stylist','stylist',2,20);
 const b=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT queue_state FROM bookings WHERE id='b'")).rows[0];assert.equal(b.queue_state,'serving');
 const mine=row('m',{queue_state:'arrived',arrived_at:'2026-11-12T05:30:00Z'});
 assert.match(describeQueue(mine,[mine],[],now,'2026-11-12T06:20:00Z').estimateLabel,/暂停接客/);
 }finally{await db.close();}
});

test('arrival correction updates default priority and invalidates stale devices, preserving explicit reorders',async()=>{
 const db=await database();try{
 await action(db,'b','arrived',0);
 const event=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT id FROM booking_queue_events WHERE booking_id='b' AND event_type='arrived'")).rows[0];
 await db.query("SELECT public.correct_booking_queue_event($1,'s','manager',now()-interval '1 minute')",[event.id]);
 let b=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT arrived_at,queue_priority_at,queue_version FROM bookings WHERE id='b'")).rows[0];
 assert.equal(b.queue_version,2);assert.equal(Date.parse(b.arrived_at),Date.parse(b.queue_priority_at));
 await assert.rejects(action(db,'b','left_reported',1,'c','customer',10),/QUEUE_STALE_VERSION/);
 await action(db,'b','reordered',2,'front','staff',null,'现场协商调整');
 const priority=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT queue_priority_at FROM bookings WHERE id='b'")).rows[0].queue_priority_at;
 await db.query("SELECT public.correct_booking_queue_event($1,'s','manager',now()-interval '2 minutes')",[event.id]);
 b=(await db.query<{[key:string]:unknown;arrived_at?:string;queue_priority_at?:string;grace_deadline_at?:string;called_at?:string}>("SELECT queue_priority_at FROM bookings WHERE id='b'")).rows[0];assert.equal(Date.parse(b.queue_priority_at),Date.parse(priority));
 }finally{await db.close();}
});
