import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { setupDatabase, type SetupConnection } from '../scripts/setup-db.js';
import { verifyRelease } from '../scripts/verify-release.js';
import { fixRpcPermissions } from '../scripts/fix-rpc-permissions.js';

test('只读发布检查：缺迁移、空密码、危险授权、RLS和字段缺失均能识别，禁止写入', async () => {
  const db = new PGlite();
  const queries: string[] = [];
  const connection: SetupConnection = { query: async (sql, values) => {
    queries.push(sql);
    if (values) return db.query(sql, values);
    return { rows: (await db.exec(sql)).at(-1)?.rows || [] };
  } };
  try {
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;');
    const files = ['001_baseline_schema.sql', '007_create_product_tables.sql', '009_create_product_inventory_logs.sql', '011_create_product_order_refunds.sql', '013_create_group_buy.sql', '016_fix_coupon_schema.sql', '019_create_customer_packages.sql', '020_create_package_usage_logs.sql'];
    for (const file of files) await db.exec((await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
    const missing = await verifyRelease(connection);
    assert.equal(missing.passed, false);
    assert.ok(missing.issues.some(issue => issue.includes('password_hash')));
    // 模拟托管环境显式给 anon/authenticated 的默认函数授权。
    await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;');
    await setupDatabase(connection, () => {});
    await db.exec("INSERT INTO shops(id,name) VALUES ('s','Synthetic'); INSERT INTO customers(id,shop_id,name,phone) VALUES ('c','s','Synthetic','13800000000');");
    const incomplete = await verifyRelease(connection);
    assert.equal(incomplete.counts?.empty_password, '1');
    assert.ok(incomplete.issues.some(issue => issue.includes('仍有空密码')));
    await db.exec("UPDATE customers SET password_hash='synthetic',is_weak_password=true;");
    queries.length = 0;
    const report = await verifyRelease(connection);
    assert.deepEqual(report.issues, []);
    assert.equal(report.passed, true);
    assert.equal(report.counts?.must_change_password, '1');
    assert.equal(report.checkedFunctions, 10);
    assert.equal(queries[0], 'BEGIN READ ONLY');
    assert.equal(queries.at(-1), 'ROLLBACK');
    assert.ok(queries.every(sql => /^(SELECT|BEGIN READ ONLY|ROLLBACK|SET LOCAL statement_timeout)/.test(sql)));
    assert.equal((await db.query<any>('SELECT password_hash FROM customers')).rows[0].password_hash, 'synthetic');
    // 复现旧迁移只撤 PUBLIC 后仍遗留的 20 条有效授权。
    await db.exec('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;');
    const exposed = await verifyRelease(connection);
    assert.equal(exposed.issues.filter(issue => issue.includes('函数权限')).length, 20);
    await fixRpcPermissions(connection);
    assert.equal((await verifyRelease(connection)).passed, true);
    await fixRpcPermissions(connection); // 重入不影响数据和有效授权。
    assert.equal((await verifyRelease(connection)).passed, true);
    assert.equal((await db.query<any>('SELECT password_hash FROM customers')).rows[0].password_hash, 'synthetic');
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query("SELECT public.begin_customer_auth_attempt('synthetic-test')"), /permission denied/i);
    await db.exec('RESET ROLE');
    // 中途缺签名时，前面已经撤销的权限也须回滚。
    await db.exec('GRANT EXECUTE ON FUNCTION public.begin_customer_auth_attempt(TEXT) TO anon; DROP FUNCTION public.finish_customer_auth_attempt(TEXT,BOOLEAN);');
    await assert.rejects(fixRpcPermissions(connection), /RPC_MISSING/);
    assert.equal((await db.query<any>("SELECT has_function_privilege('anon','public.begin_customer_auth_attempt(text)','EXECUTE') allowed")).rows[0].allowed, true);
    await setupDatabase(connection, () => {}); // 重建缺函数并应用 030，不重置客户。
    await db.exec('GRANT EXECUTE ON FUNCTION public.pay_product_order_atomic(TEXT,TEXT) TO anon; ALTER TABLE customer_auth_limits DISABLE ROW LEVEL SECURITY; ALTER TABLE customers DROP COLUMN password_reset_at;');
    const unsafe = await verifyRelease(connection);
    assert.ok(unsafe.issues.some(issue => issue.includes('/ anon')));
    assert.ok(unsafe.issues.some(issue => issue.includes('RLS')));
    assert.ok(unsafe.issues.some(issue => issue.includes('password_reset_at')));
    // PostgreSQL 自身拒绝意外写入，而非仅依赖代码约定。
    await db.exec('BEGIN READ ONLY');
    await assert.rejects(db.exec("UPDATE customers SET name='forbidden'"));
    await db.exec('ROLLBACK');
  } finally { await db.close(); }
});

test('生产启动缺密钥时不向客户端泄露堆栈、路径或底层配置错误', () => {
  const code = `import handler from './api/index.ts'; const res={status(n){this.code=n;return this},json(body){console.log(JSON.stringify({status:this.code,body}));return this}}; await handler({},res);`;
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', VERCEL: '1', JWT_SECRET: 'too-short', SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const report = JSON.parse(output.trim().split(/\r?\n/).at(-1)!);
  assert.equal(report.status, 500);
  assert.deepEqual(report.body, { error: 'FUNCTION_INVOCATION_FAILED', message: '服务暂不可用，请联系门店或管理员' });
});
