import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('membership follow-up stores append-only expiry-cycle contact records and rejects cross-shop, stale expiry and missing next contact',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE shops(id text primary key);CREATE TABLE employees(id text primary key,shop_id text,role text,is_active boolean,name text);CREATE TABLE customers(id text primary key,shop_id text,purchase_vip_expires_at timestamptz,stored_value_expires_at timestamptz,purchase_vip_level text,stored_value_level text);INSERT INTO shops VALUES ('s'),('other');INSERT INTO employees VALUES ('cs','s','customer_service',true,'客服'),('sty','s','stylist',true,'发型师'),('other','other','ceo',true,'他店');INSERT INTO customers VALUES ('c','s',now()+interval '10 days',now()-interval '2 days','gold','store_500');`);
 const sql=fs.readFileSync('migrations/049_membership_followups.sql','utf8');await db.exec(sql);await db.exec(sql);
 const expiry=(await db.query<{e:Date}>("SELECT purchase_vip_expires_at e FROM customers WHERE id='c'")).rows[0].e;
 const record=(actor='cs',outcome='contacted',next:Date|null=null,exp=expiry)=>db.query("SELECT record_membership_followup('c','s',$1,'vip',$2,$3,$4,'电话沟通')",[actor,exp,outcome,next]);
 await record();await assert.rejects(record('other'),/FORBIDDEN/);await assert.rejects(record('sty'),/FORBIDDEN/);await assert.rejects(record('cs','unreachable'),/INVALID/);await record('cs','scheduled',new Date(Date.now()+86400000));await assert.rejects(record('cs','contacted',null,new Date(0)),/STALE/);
 await db.exec("UPDATE customers SET purchase_vip_expires_at=purchase_vip_expires_at+interval '365 days' WHERE id='c'");await assert.rejects(record(),/STALE/);
 const rows=(await db.query<{employee_name:string;next_followup_at:Date|null}>('SELECT * FROM membership_followups ORDER BY id')).rows;assert.equal(rows.length,2);assert.equal(rows[1].employee_name,'客服');assert.ok(rows[1].next_followup_at);
 }finally{await db.close();}
});
