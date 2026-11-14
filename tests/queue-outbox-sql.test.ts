import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('durable queue outbox: rollback, unique event, concurrent claim, ambiguous lease, consent quota',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE ROLE service_role;CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE bookings(id text PRIMARY KEY);CREATE TABLE booking_queue_events(id bigint PRIMARY KEY,shop_id text,booking_id text,event_type text);INSERT INTO bookings VALUES(\'b\');');
  await db.exec(await readFile(new URL('../migrations/052_queue_notification_outbox.sql',import.meta.url),'utf8'));
  await db.exec("BEGIN; INSERT INTO booking_queue_events VALUES(1,'s','b','called'); ROLLBACK;");
  assert.equal((await db.query('SELECT * FROM queue_notification_outbox')).rows.length,0);
  await db.exec("INSERT INTO booking_queue_events VALUES(2,'s','b','called'),(3,'s','b','arrived');");
  const jobs=await Promise.all([db.query('SELECT * FROM claim_queue_notification()'),db.query('SELECT * FROM claim_queue_notification()')]);
  assert.equal(jobs.reduce((n,j)=>n+j.rows.length,0),1);
  await db.exec("UPDATE queue_notification_outbox SET lease_until=now()-interval '1 minute'");
  assert.equal((await db.query('SELECT * FROM claim_queue_notification()')).rows.length,0);
  assert.equal((await db.query<{status:string}>('SELECT status FROM queue_notification_outbox')).rows[0].status,'phone');
  await db.exec("INSERT INTO queue_notification_consent VALUES('s','c','openid','template',1,now())");
  const consent=await Promise.all([db.query("SELECT * FROM consume_queue_subscription('s','c')"),db.query("SELECT * FROM consume_queue_subscription('s','c')")]);
  assert.equal(consent.reduce((n,j)=>n+j.rows.length,0),1);
  await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT * FROM queue_notification_outbox'),/permission denied/);
 }finally{await db.close();}
});
