import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { setupDatabase, databaseConfig, type SetupConnection } from '../scripts/setup-db.js';
import { upgradeCheckout } from '../scripts/upgrade-checkout.js';

const baseline = ['001_baseline_schema.sql', '019_create_customer_packages.sql', '021_create_membership_enrollments.sql',  '007_create_product_tables.sql', '010_add_shipping_to_orders.sql', '009_create_product_inventory_logs.sql', '011_create_product_order_refunds.sql', '013_create_group_buy.sql', '016_fix_coupon_schema.sql', '019_create_customer_packages.sql', '020_create_package_usage_logs.sql'];
async function fixture() {
  const db = new PGlite();
  await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;');
  for (const file of baseline) await db.exec((await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  await db.exec("INSERT INTO shops(id,name) VALUES ('s','Synthetic'); INSERT INTO customers(id,shop_id,name,phone,balance,stored_value_balance) VALUES ('c','s','Synthetic','13800000000',100,100);");
  const connection: SetupConnection = { query: async (sql, values) => {
    if (values) return db.query(sql, values);
    const results = await db.exec(sql);
    return { rows: results.at(-1)?.rows || [] };
  } };
  return { db, connection };
}

test('真实引擎：无 025–029 时完整安装、重复执行、已有数据/密码保留', async () => {
  const { db, connection } = await fixture();
  const logs: string[] = [];
  try {
    await setupDatabase(connection, line => logs.push(line));
    assert.equal(logs.filter(line => line.includes('等待统一提交')).length, 13);
    const row = (await db.query<any>("SELECT password_hash,is_weak_password,identity_verified,balance FROM customers WHERE id='c'")).rows[0];
    assert.equal(row.password_hash, null); assert.equal(row.is_weak_password, false); assert.equal(row.identity_verified, false); assert.equal(Number(row.balance), 100);
    await db.exec("UPDATE customers SET password_hash='synthetic-preserved',is_weak_password=true,identity_verified=true WHERE id='c';");
    await setupDatabase(connection, () => {});
    await upgradeCheckout(connection);
    await upgradeCheckout(connection);
    const again = (await db.query<any>("SELECT password_hash,is_weak_password,identity_verified,balance FROM customers WHERE id='c'")).rows[0];
    assert.equal(again.password_hash, 'synthetic-preserved'); assert.equal(again.is_weak_password, true); assert.equal(again.identity_verified, true); assert.equal(Number(again.balance), 100);
    const functionBody = (await db.query<any>("SELECT pg_get_functiondef('public.pay_product_order_atomic(text,text)'::regprocedure) definition")).rows[0].definition;
    assert.match(functionBody, /c.is_weak_password/);
    assert.equal((await db.query<any>("SELECT COUNT(*)::integer n FROM customer_password_initialization_runs")).rows[0].n, 0);
  } finally { await db.close(); }
});

test('部分迁移已存在可补齐；模拟 028 失败回滚所有本轮 DDL，重跑成功', async () => {
  const { db, connection } = await fixture();
  try {
    await db.exec((await readFile(new URL('../migrations/025_add_customer_password_hash.sql', import.meta.url), 'utf8')));
    await db.exec("UPDATE customers SET password_hash='synthetic-existing' WHERE id='c'");
    let fail = true;
    const fault: SetupConnection = { query: async (sql, values) => {
      if (fail && sql.includes('CREATE OR REPLACE FUNCTION create_product_order_atomic')) { fail = false; throw Object.assign(new Error('PRIVATE-DETAILS'), { code: '42703' }); }
      return connection.query(sql, values);
    } };
    await assert.rejects(setupDatabase(fault, () => {}), error => {
      assert.match(String(error), /028_.*42703/); assert.doesNotMatch(String(error), /PRIVATE/); return true;
    });
    assert.equal((await db.query<any>("SELECT COUNT(*)::integer n FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='identity_verified'")).rows[0].n, 0);
    await setupDatabase(connection, () => {});
    assert.equal((await db.query<any>("SELECT password_hash FROM customers WHERE id='c'")).rows[0].password_hash, 'synthetic-existing');
  } finally { await db.close(); }
});

test('缺历史基础表在 DDL 前停止；缺陷列类型不兼容则回滚', async () => {
  const db = new PGlite();
  try {
    const connection: SetupConnection = { query: async (sql, values) => {
      if (values) return db.query(sql, values);
      return { rows: (await db.exec(sql)).at(-1)?.rows || [] };
    } };
    await assert.rejects(setupDatabase(connection, () => {}), /缺少 001–024/);
    assert.equal((await db.query<any>("SELECT COUNT(*)::integer n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0);
  } finally { await db.close(); }
  const f = await fixture();
  try {
    await f.db.exec('ALTER TABLE customers ADD COLUMN password_hash integer;');
    await assert.rejects(setupDatabase(f.connection, () => {}), /客户字段缺失或类型不兼容：password_hash/);
    assert.equal((await f.db.query<any>("SELECT COUNT(*)::integer n FROM information_schema.columns WHERE table_name='customers' AND column_name='is_weak_password'")).rows[0].n, 0);
  } finally { await f.db.close(); }
});

test('本地连接配置：SSL 跳过证书验证、剥离冲突参数、项目匹配、拒绝事务池', () => {
  assert.throws(() => databaseConfig({}), /SUPABASE_DB_URL/);
  assert.throws(() => databaseConfig({ SUPABASE_DB_URL: 'https://synthetic.invalid' }), /PostgreSQL URI/);
  const config = databaseConfig({ SUPABASE_DB_URL: 'postgresql://postgres.fake:secret@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=disable', SUPABASE_URL: 'https://fake.supabase.co' });
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  assert.doesNotMatch(config.connectionString!, /sslmode/);
  for (const mode of ['require', 'verify-full', 'disable']) {
    const local = databaseConfig({ SUPABASE_DB_URL: `postgresql://postgres.fake:secret@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=${mode}&sslrootcert=unused&sslcert=unused&sslkey=unused&ssl=true&uselibpqcompat=true&application_name=local-test`, SUPABASE_DB_CA_FILE: 'unused' });
    const parsed = new URL(local.connectionString!);
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat']) assert.equal(parsed.searchParams.has(key), false);
    assert.equal(parsed.searchParams.get('application_name'), 'local-test');
    // 只构造真实 pg 客户端，不连接网络；确认 URI 解析后也不覆盖配置。
    const client = new pg.Client(local);
    assert.deepEqual(client.ssl, { rejectUnauthorized: false });
  }
  assert.throws(() => databaseConfig({ SUPABASE_DB_URL: 'postgresql://postgres.other:secret@aws-0-test.pooler.supabase.com:5432/postgres', SUPABASE_URL: 'https://fake.supabase.co' }), /项目不一致/);
  assert.throws(() => databaseConfig({ SUPABASE_DB_URL: 'postgresql://postgres.fake:secret@aws-0-test.pooler.supabase.com:6543/postgres' }), /5432/);
});
