import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('SMS registration creates once, reuses existing customer and rejects duplicates', async () => {
 const db = new PGlite();
 try {
 await db.exec(`CREATE TABLE shops(id text primary key); INSERT INTO shops VALUES('shop1'); CREATE TABLE customers(id text primary key,shop_id text,name text,phone text,source text,identity_verified boolean default false,is_weak_password boolean default false);`);
 const sql=await readFile('migrations/047_sms_customer_registration.sql','utf8');
 await db.exec(sql.replace(/REVOKE ALL[^;]+;/g,'').replace(/GRANT EXECUTE[^;]+;/g,''));
 const resolve=()=>db.query<{id:string}>("SELECT resolve_sms_customer('13800000000') AS id");
 const first=(await resolve()).rows[0].id;
 assert.equal((await resolve()).rows[0].id,first);
 const row=(await db.query<any>('SELECT * FROM customers')).rows[0];
 assert.equal(row.identity_verified,false); assert.equal(row.shop_id,'shop1');
 await db.exec("INSERT INTO customers(id,phone) VALUES('duplicate','13800000000')");
 await assert.rejects(resolve,/AMBIGUOUS_CUSTOMER/);
 await assert.rejects(()=>db.query("SELECT resolve_sms_customer('bad')"),/INVALID_PHONE/);
 } finally {await db.close();}
});
