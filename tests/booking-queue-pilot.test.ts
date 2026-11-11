import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('queue events and booking snapshots commit together, including a corrected call time', async () => {
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE public.shops(id text PRIMARY KEY,services jsonb);
      CREATE TABLE public.bookings(id text PRIMARY KEY,shop_id text REFERENCES public.shops(id),service_id text,
      status text,scheduled_time timestamptz,actual_start_time timestamptz,actual_end_time timestamptz);`);
    const sql=(await readFile(new URL('../migrations/046_booking_queue_pilot.sql',import.meta.url),'utf8'))
      .replaceAll(/REVOKE ALL ON [^;]+;/g,'').replaceAll(/GRANT (?:SELECT,INSERT|USAGE,SELECT|EXECUTE) ON [^;]+;/g,'');
    await db.exec(sql);
    await db.exec(`INSERT INTO public.shops VALUES ('shop1','[{"id":"s1","duration":40}]');
      INSERT INTO public.bookings(id,shop_id,service_id,status,scheduled_time)
      VALUES('b1','shop1','s1','confirmed',now()),('b2','shop1','s1','confirmed',now());`);
    const snapshot=await db.query<{planned_duration_minutes:number;duration_source:string}>("SELECT planned_duration_minutes,duration_source FROM bookings WHERE id='b1'");
    assert.deepEqual(snapshot.rows[0],{planned_duration_minutes:40,duration_source:'service'});
    const record=(type:string)=>db.query<{id:number}>("SELECT (public.record_booking_queue_event('b1','shop1',$1,'staff1')).id AS id",[type]);
    await record('arrived');
    await assert.rejects(record('arrived'),/QUEUE_STATE_CONFLICT/);
    await record('left_reported'); await record('returned');
    const call=(await record('called')).rows[0];
    await assert.rejects(record('missed'),/QUEUE_STATE_CONFLICT/);
    const earlier=(await db.query<{at:string}>("SELECT (now()-interval '1 minute')::text AS at")).rows[0].at;
    await db.query("SELECT public.correct_booking_queue_event($1,'shop1','manager1',$2)",[call.id,earlier]);
    await record('service_started'); await record('service_finished');
    const result=await db.query<{queue_state:string;grace_deadline_at:string;called_at:string;actual_start_time:string;actual_end_time:string}>("SELECT queue_state,grace_deadline_at,called_at,actual_start_time,actual_end_time FROM bookings WHERE id='b1'");
    assert.equal(result.rows[0].queue_state,'finished');
    assert.ok(result.rows[0].actual_start_time && result.rows[0].actual_end_time);
    assert.equal(Date.parse(result.rows[0].grace_deadline_at)-Date.parse(result.rows[0].called_at),600000);
    const count=await db.query<{n:number}>("SELECT count(*)::int n FROM booking_queue_events WHERE booking_id='b1'");
    assert.equal(count.rows[0].n,7);
    const other=await db.query<{queue_state:string|null}>("SELECT queue_state FROM bookings WHERE id='b2'");
    assert.equal(other.rows[0].queue_state,null);
  } finally {await db.close();}
});
