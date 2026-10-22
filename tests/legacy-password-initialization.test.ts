import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';

test('一次性初始化 SQL：筛选、标记、重入和事务回滚（pgcrypto 调用使用替身）', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE customers(id text PRIMARY KEY,password_hash text,identity_verified boolean,identity_verified_at timestamptz,identity_verified_by text);
   INSERT INTO customers VALUES ('null',NULL,true,now(),'staff'),('empty','   ',true,now(),'staff'),('existing','preserved-hash',true,now(),'staff');
   -- 本测试只验证初始化数据逻辑；函数调用边界使用替身，不宣称验证 pgcrypto。
   CREATE SCHEMA extensions;
   CREATE FUNCTION extensions.gen_salt(text,integer) RETURNS text LANGUAGE sql VOLATILE AS 'SELECT md5(random()::text)';
   CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql VOLATILE AS 'SELECT ''synthetic-bcrypt-'' || $2';
  `);
  // 029 的真实函数在交易测试完整加载；本用例仅加载本任务的结构部分。
  const migration = await readFile(new URL('../migrations/029_customer_password_change_required.sql',import.meta.url),'utf8');
  await db.exec(migration.split('-- 余额付款')[0] + 'COMMIT;');
  const original = await readFile(new URL('../scripts/sql/initialize_legacy_customer_passwords_once.sql',import.meta.url),'utf8');
  const sql=original.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;','')
   .replace(/SELECT n.nspname INTO STRICT crypto_schema[\s\S]*?e.extname='pgcrypto';/, "crypto_schema := 'extensions';");
  // 注入真实事务错误：密码更新和运行标记须同时回滚。
  await db.exec(`CREATE FUNCTION reject_init() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_FAILURE'; END $$;
    CREATE TRIGGER reject_init BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION reject_init();`);
  await assert.rejects(db.exec(sql),/SYNTHETIC_FAILURE/);await db.exec('ROLLBACK; DROP TRIGGER reject_init ON customers;');
  assert.equal((await db.query<{n:number}>('SELECT count(*)::integer n FROM customer_password_initialization_runs')).rows[0].n,0);
  await db.exec(sql);
  const rows=(await db.query<any>('SELECT * FROM customers ORDER BY id')).rows;
  const initialized=rows.filter(r=>r.id!=='existing');
  assert.equal(initialized.length,2);assert.notEqual(initialized[0].password_hash,initialized[1].password_hash);
  for(const row of initialized){ assert.equal(row.is_weak_password,true);assert.equal(row.identity_verified,false);assert.equal(row.identity_verified_at,null);assert.equal(row.identity_verified_by,null);assert.ok(row.password_reset_at);assert.notEqual(row.password_hash,'123456'); }
  const existing=rows.find(r=>r.id==='existing');assert.equal(existing.password_hash,'preserved-hash');assert.equal(existing.identity_verified,true);assert.equal(existing.is_weak_password,false);
  assert.equal((await db.query<any>('SELECT affected_count FROM customer_password_initialization_runs')).rows[0].affected_count,2);
  await db.exec("INSERT INTO customers(id) VALUES ('future');");await db.exec(sql);
  assert.deepEqual((await db.query<any>("SELECT password_hash,is_weak_password FROM customers WHERE id='future'")).rows[0],{password_hash:null,is_weak_password:false});
  assert.deepEqual((await db.query<any>("SELECT * FROM customers WHERE id<>'future' ORDER BY id")).rows,rows);
  // 同时确认服务端接受 bcrypt 的 2a 格式；实际 pgcrypto 加密需 Supabase 隔离项目验收。
  const hash=await bcrypt.hash('123456',12);assert.ok(await bcrypt.compare('123456',hash.replace('$2b$','$2a$')));
 } finally {await db.close();}
});
