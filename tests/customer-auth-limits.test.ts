import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('043失败限流：隔离PostgreSQL验证占位、失败计数、时间和权限', async t => {
  const db = new PGlite();
  const migration = await readFile(new URL('../migrations/043_customer_auth_failure_limits.sql',import.meta.url),'utf8');
  const key = (n: number) => n.toString(16).padStart(64,'0');
  const begin = async (n: number) => (await db.query<any>('SELECT * FROM public.begin_customer_auth_attempt_v2($1)',[key(n)])).rows[0];
  const finish = async (n: number, id: string, outcome: string) => (await db.query<any>('SELECT public.finish_customer_auth_attempt_v2($1,$2,$3) ok',[key(n),id,outcome])).rows[0].ok;
  const row = async (n: number) => (await db.query<any>('SELECT * FROM customer_auth_limits WHERE ip_hash=$1',[key(n)])).rows[0];
  try {
    await db.exec(`CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
      CREATE TABLE customers(id TEXT);`);
    await db.exec(await readFile(new URL('../migrations/026_customer_identity_and_auth_limits.sql',import.meta.url),'utf8'));
    await db.exec(migration);
    await t.test('旧日总次数10不当作失败；20次正确验证均可继续',async()=>{
      await db.query('INSERT INTO customer_auth_limits(ip_hash,daily_attempts) VALUES($1,10)',[key(1)]);
      for(let i=0;i<20;i++) {
        const a=await begin(1); assert.equal(a.allowed,true);
        assert.equal(await finish(1,a.attempt_id,'success'),true);
      }
      assert.equal((await row(1)).daily_attempts,10);
      assert.equal((await row(1)).daily_failures,0);
      assert.equal((await row(1)).failed_attempts,0);
    });
    await t.test('连续五错锁15分钟；成功不冲销日失败，不清除较新并发锁',async()=>{
      const lateSuccess=await begin(2);
      for(let i=0;i<5;i++) { const a=await begin(2); assert.equal(a.allowed,true); assert.equal(await finish(2,a.attempt_id,'failure'),true); }
      const denied=await begin(2);
      assert.equal(denied.allowed,false); assert.equal(denied.reason,'temporary_lock');
      assert.ok(denied.retry_after_seconds>890 && denied.retry_after_seconds<=900);
      const locked=(await row(2)).locked_until;
      assert.equal(await finish(2,lateSuccess.attempt_id,'success'),true);
      assert.equal((await row(2)).locked_until.getTime(),locked.getTime());
      assert.equal((await row(2)).daily_failures,5);
      await db.query("UPDATE customer_auth_limits SET locked_until=NOW()-INTERVAL '1 second' WHERE ip_hash=$1",[key(2)]);
      const a=await begin(2); assert.equal(a.allowed,true); await finish(2,a.attempt_id,'success');
      assert.equal((await row(2)).daily_failures,5); assert.equal((await row(2)).failed_attempts,0);
      for(let i=0;i<5;i++) { const a=await begin(2); await finish(2,a.attempt_id,'failure'); }
      await db.query("UPDATE customer_auth_limits SET locked_until=NOW()-INTERVAL '1 second' WHERE ip_hash=$1",[key(2)]);
      const daily=await begin(2);
      assert.equal(daily.allowed,false); assert.equal(daily.reason,'daily_limit');
      assert.ok(daily.retry_after_seconds>0 && daily.retry_after_seconds<=86400);
    });
    await t.test('北京时间日切与数据库时区无关；日切保留未到期锁',async()=>{
      await db.exec("SET TIME ZONE 'America/New_York'");
      await db.query("INSERT INTO customer_auth_limits(ip_hash,failure_day,daily_failures,locked_until) VALUES($1,(NOW() AT TIME ZONE 'Asia/Shanghai')::DATE-1,10,NOW()+INTERVAL '10 minutes')",[key(3)]);
      const denied=await begin(3); assert.equal(denied.reason,'temporary_lock');
      assert.equal((await row(3)).daily_failures,0);
      await db.query('UPDATE customer_auth_limits SET locked_until=NULL,daily_failures=10 WHERE ip_hash=$1',[key(3)]);
      const daily=await begin(3);
      const expected=(await db.query<any>("SELECT CEIL(EXTRACT(EPOCH FROM ((((NOW() AT TIME ZONE 'Asia/Shanghai')::DATE+1)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai')-NOW())))::INTEGER seconds")).rows[0].seconds;
      assert.ok(Math.abs(daily.retry_after_seconds-expected)<=1);
    });
    await t.test('批量占位只准10次；重复/越IP完成不改计数，过期释放但不接受成功',async()=>{
      const attempts=await Promise.all(Array.from({length:10},()=>begin(4)));
      assert.ok(attempts.every(a=>a.allowed)); assert.equal(new Set(attempts.map(a=>a.attempt_id)).size,10);
      const busy=await begin(4); assert.equal(busy.reason,'verification_busy'); assert.ok(busy.retry_after_seconds<=120);
      assert.equal(await finish(1,attempts[0].attempt_id,'failure'),false);
      assert.equal(await finish(4,attempts[0].attempt_id,'failure'),true);
      assert.equal(await finish(4,attempts[0].attempt_id,'failure'),false);
      assert.equal((await row(4)).daily_failures,1);
      assert.equal((await begin(4)).allowed,false);
      assert.equal(await finish(4,attempts[1].attempt_id,'cancelled'),true);
      assert.equal((await row(4)).daily_failures,1); assert.equal((await row(4)).failed_attempts,1);
      const replacement=await begin(4); assert.equal(replacement.allowed,true);
      await db.query("UPDATE customer_auth_reservations SET expires_at=NOW()-INTERVAL '1 second' WHERE ip_hash=$1",[key(4)]);
      assert.equal(await finish(4,replacement.attempt_id,'success'),false);
      const recovered=await begin(4); assert.equal(recovered.allowed,true);
      assert.equal((await db.query<any>('SELECT COUNT(*)::INTEGER n FROM customer_auth_reservations WHERE ip_hash=$1',[key(4)])).rows[0].n,1);
      assert.equal(await finish(4,recovered.attempt_id,'cancelled'),true);
      assert.equal((await row(4)).failed_attempts,1);
    });
    await t.test('跨日完成不冲销当日失败；重跑迁移不清计数或占位',async()=>{
      const a=await begin(5);
      await db.query("UPDATE customer_auth_limits SET failure_day=(NOW() AT TIME ZONE 'Asia/Shanghai')::DATE-1,daily_failures=9 WHERE ip_hash=$1",[key(5)]);
      assert.equal(await finish(5,a.attempt_id,'failure'),true);
      assert.equal((await row(5)).daily_failures,1);
      const pending=await begin(5); await db.exec(migration);
      assert.equal((await row(5)).daily_failures,1); assert.equal((await row(5)).failed_attempts,1);
      assert.equal(await finish(5,pending.attempt_id,'success'),true);
      assert.equal((await row(5)).daily_failures,1);
    });
    await t.test('匿名/顾客角色无RPC或表权限，非法键/结果不受理',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec('SET ROLE '+role);
        await assert.rejects(begin(1),/permission denied/);
        await assert.rejects(db.query('SELECT * FROM customer_auth_reservations'),/permission denied/);
        await assert.rejects(finish(1,'00000000-0000-4000-8000-000000000000','success'),/permission denied/);
        await db.exec('RESET ROLE');
      }
      await assert.rejects(db.query("SELECT * FROM begin_customer_auth_attempt_v2('unknown')"),/INVALID_AUTH_KEY/);
      await assert.rejects(finish(1,'00000000-0000-4000-8000-000000000000','bad'),/INVALID_AUTH_OUTCOME/);
      assert.equal((await db.query<any>("SELECT has_function_privilege('service_role','public.begin_customer_auth_attempt_v2(text)','EXECUTE') ok")).rows[0].ok,true);
    });
  } finally { await db.close(); }
});
