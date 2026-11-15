import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('commission excludes products, handles direct multi-staff services and holds ambiguous discounts',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE shops(id text primary key); CREATE TABLE employees(id text primary key,shop_id text,role text default 'stylist',is_active boolean default true);
 CREATE TABLE bookings(id text primary key,shop_id text,stylist_id text);
 CREATE TABLE settlements(id text primary key,shop_id text,booking_id text,total numeric,payment_status text,items jsonb);
 CREATE TABLE refund_requests(id text primary key,shop_id text,settlement_id text,status text,amount numeric,refund_receipt_ref text,refund_receipt_at timestamptz,refund_receipt_amount numeric,refund_receipt_recorded_by text);
 INSERT INTO shops VALUES('s'); INSERT INTO employees(id,shop_id) VALUES('a','s'),('b','s');`);
 const sql=await readFile(new URL('../migrations/056_stylist_commission_ledger.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 await db.exec("UPDATE employees SET commission_rate=.3 WHERE id='a'");
 const items=[{type:'service',employeeId:'a',total:60},{type:'service',employeeId:'b',total:40},{type:'product',employeeId:'a',total:100}];
 await db.query("INSERT INTO settlements VALUES('one','s',null,200,'completed',$1)",[JSON.stringify(items)]);
 const rows=(await db.query<{employee_id:string;base_amount:string;commission_amount:string;status:string}>("SELECT * FROM stylist_commission_ledger ORDER BY employee_id")).rows;
 assert.equal(Number(rows[0].base_amount),60);assert.equal(Number(rows[0].commission_amount),18);
 assert.equal(rows[1].status,'pending');
 await db.exec("UPDATE settlements SET payment_status='completed' WHERE id='one'");
 assert.equal((await db.query('SELECT * FROM stylist_commission_ledger')).rows.length,2);
 await db.query("INSERT INTO settlements VALUES('discount','s',null,150,'completed',$1)",[JSON.stringify(items)]);
 const held=(await db.query<{status:string;commission_amount:string}>("SELECT * FROM stylist_commission_ledger WHERE settlement_id='discount'")).rows;
 assert.ok(held.every(r=>r.status==='review'&&Number(r.commission_amount)===0));
 await db.exec(`INSERT INTO settlements VALUES('unknown','s',null,50,'completed','[{"type":"service","total":20},{"type":"service","employeeId":"missing","total":30}]');`);
 const unknown=(await db.query<{employee_id:string|null;base_amount:string;status:string}>("SELECT * FROM stylist_commission_ledger WHERE settlement_id='unknown'")).rows;
 assert.equal(unknown.length,1);assert.equal(unknown[0].employee_id,null);assert.equal(Number(unknown[0].base_amount),50);assert.equal(unknown[0].status,'pending');
 await db.exec(`INSERT INTO settlements VALUES('zero','s',null,0,'completed','[{"type":"service","employeeId":"a","total":0}]');`);
 assert.equal(Number((await db.query<{commission_amount:string}>("SELECT commission_amount FROM stylist_commission_ledger WHERE settlement_id='zero'")).rows[0].commission_amount),0);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM stylist_commission_ledger'),/permission denied/);
 }finally{await db.close();}
});

test('commission decisions are role-scoped, audited, conflict-safe and reverse only on full refund evidence',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE shops(id text primary key); CREATE TABLE employees(id text primary key,shop_id text,role text,is_active boolean);
 CREATE TABLE bookings(id text primary key,shop_id text,stylist_id text);
 CREATE TABLE settlements(id text primary key,shop_id text,booking_id text,total numeric,payment_status text,items jsonb);
 CREATE TABLE refund_requests(id text primary key,shop_id text,settlement_id text,status text,amount numeric,refund_receipt_ref text,refund_receipt_at timestamptz,refund_receipt_amount numeric,refund_receipt_recorded_by text);
 INSERT INTO shops VALUES('s'),('other'); INSERT INTO employees VALUES('a','s','stylist',true),('boss','s','shop_manager',true),('outside','other','ceo',true);`);
 await db.exec(await readFile(new URL('../migrations/056_stylist_commission_ledger.sql',import.meta.url),'utf8'));
 const operate=(request:Record<string,unknown>,actor='boss')=>db.query("SELECT commission_operation('s',$1,$2) AS result",[actor,JSON.stringify(request)]);
 const rate={action:'rate',target:'a',rate:.3,expectedRate:null,reason:'双方核对个人比例',requestId:'rate_request_123456'};
 await assert.rejects(operate(rate,'a'),/FORBIDDEN/);await assert.rejects(operate(rate,'outside'),/FORBIDDEN/);
 await operate(rate);await operate(rate);
 assert.deepEqual(Object.keys((await db.query<{before_value:object}>("SELECT before_value FROM commission_audit WHERE kind='rate'")).rows[0].before_value).sort(),['commission_rate','id','rule_version']);
 await assert.rejects(operate({...rate,rate:.5}),/REQUEST_CONFLICT/);
 await assert.rejects(operate({...rate,requestId:'new_rate_request_123'}),/STALE/);
 await db.exec(`INSERT INTO settlements VALUES('review','s',null,60,'completed','[{"type":"service","employeeId":"a","total":100}]');`);
 const reviewLine=(await db.query<{id:string;updated_at:Date}>("SELECT id,updated_at FROM stylist_commission_ledger WHERE settlement_id='review'")).rows[0];
 const review={action:'review',target:reviewLine.id,base:70,rate:.3,employeeId:'a',reason:'核对优惠后的服务实收',expectedUpdatedAt:reviewLine.updated_at,requestId:'review_request_12345'};
 await assert.rejects(operate(review),/BASE_EXCEEDS_RECEIPTS/);
 await operate({...review,base:60});
 await assert.rejects(operate({...review,base:50,requestId:'review_again_123456'}),/STALE/);
 await db.exec(`INSERT INTO settlements VALUES('paid','s',null,100,'completed','[{"type":"service","employeeId":"a","total":100}]');`);
 const row=(await db.query<{id:string;updated_at:Date}>("SELECT * FROM stylist_commission_ledger WHERE settlement_id='paid'")).rows[0];
 const adjustment={action:'adjust',target:row.id,amount:25,reason:'核对原单调整提成',expectedUpdatedAt:row.updated_at,requestId:'adjust_request_123456'};
 await operate(adjustment);await operate(adjustment);
 assert.equal((await db.query('SELECT * FROM commission_audit')).rows.length,3);
 await db.exec("INSERT INTO refund_requests VALUES('r','s','paid','approved',100,null,null,null,null)");
 assert.equal((await db.query<{status:string}>("SELECT status FROM stylist_commission_ledger WHERE settlement_id='paid'")).rows[0].status,'adjusted');
 await db.exec("UPDATE refund_requests SET status='completed',refund_receipt_ref='receipt',refund_receipt_at=now(),refund_receipt_amount=100,refund_receipt_recorded_by='boss' WHERE id='r'");
 assert.equal((await db.query<{status:string}>("SELECT status FROM stylist_commission_ledger WHERE settlement_id='paid'")).rows[0].status,'reversed');
 const reversal=(await db.query<{after_value:{reversalAmount:number}}>("SELECT after_value FROM commission_audit WHERE kind='refund'")).rows[0];
 assert.equal(reversal.after_value.reversalAmount,-25);
 await db.exec("UPDATE refund_requests SET status='completed' WHERE id='r'");
 assert.equal((await db.query("SELECT * FROM commission_audit WHERE kind='refund'")).rows.length,1);
 await assert.rejects(operate({...adjustment,requestId:'after_refund_request',expectedUpdatedAt:(await db.query<{updated_at:Date}>("SELECT updated_at FROM stylist_commission_ledger WHERE settlement_id='paid'")).rows[0].updated_at}),/REFUNDED/);
 await db.exec('SET ROLE anon');await assert.rejects(operate(rate),/permission denied/);
 }finally{await db.close();}
});
