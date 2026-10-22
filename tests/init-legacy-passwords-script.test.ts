import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { initializeLegacyPasswords, databaseErrorDiagnostic, type PasswordConnection } from '../scripts/init-legacy-passwords.js';

async function fixture(count: number) {
  const db = new PGlite();
  await db.exec(`CREATE TABLE public.customers (
    id text PRIMARY KEY, password_hash text, is_weak_password boolean NOT NULL DEFAULT false,
    password_reset_at timestamptz, identity_verified boolean NOT NULL DEFAULT true,
    identity_verified_at timestamptz, identity_verified_by text, balance numeric DEFAULT 321
  );`);
  await db.query(`INSERT INTO customers(id,password_hash,identity_verified_at,identity_verified_by)
    SELECT lpad(i::text,4,'0'),CASE WHEN i%2=0 THEN NULL ELSE '' END,now(),'synthetic-staff'
    FROM generate_series(1,$1::integer) AS i`, [count]);
  await db.exec("INSERT INTO customers(id,password_hash) VALUES ('existing','existing-hash'),('whitespace','   ');");
  const logs: string[] = [];
  const batches: number[] = [];
  const statements: string[] = [];
  let writes = 0;
  let salt = 0;
  let hook: ((sql: string, values?: any[]) => Promise<{ rows: any[] } | void>) | undefined;
  const connection: PasswordConnection = { query: async (sql, values) => {
    statements.push(sql);
    const intercepted = await hook?.(sql, values);
    if (intercepted) return intercepted;
    const result = await db.query(sql, values);
    if (sql.startsWith('UPDATE')) writes++;
    if (sql.startsWith('SELECT id')) batches.push(result.rows.length);
    return result;
  } };
  const run = (extra = {}) => initializeLegacyPasswords(connection, {
    log: line => logs.push(line), hash: async () => 'synthetic-distinct-salted-hash-' + salt++, ...extra,
  });
  return { db, logs, batches, statements, run, writes: () => writes,
    setHook: (value: typeof hook) => { hook = value; } };
}

test('真实 SQL：105 条按 50/50/5 无 offset 分批，保留已有密码/余额，重跑零写入', async () => {
  const f = await fixture(105);
  try {
    assert.equal((await f.run()).updated, 105);
    assert.deepEqual(f.batches, [50,50,5,0]);
    const initialized=(await f.db.query<any>("SELECT * FROM customers WHERE id NOT IN ('existing','whitespace')")).rows;
    assert.equal(new Set(initialized.map(row=>row.password_hash)).size,105);
    for(const row of initialized) {
      assert.equal(row.is_weak_password,true);assert.equal(row.identity_verified,false);
      assert.equal(row.identity_verified_at,null);assert.equal(row.identity_verified_by,null);
      assert.ok(row.password_reset_at);assert.equal(Number(row.balance),321);
    }
    const existing=(await f.db.query<any>("SELECT * FROM customers WHERE id='existing'")).rows[0];
    assert.equal(existing.password_hash,'existing-hash');assert.equal(existing.identity_verified,true);
    assert.equal((await f.run()).updated,0);assert.equal(f.writes(),105);
    assert.equal(f.logs.filter(line=>line.startsWith('[进度]')).length,3);
    assert.ok(f.statements.every(sql=>!sql.includes('OFFSET')&&!sql.includes('synthetic-distinct')));
  }finally{await f.db.close();}
});

test('真实 SQL：读取后顾客并发设密，条件 UPDATE 不覆盖新密码或核实标记',async()=>{
  const f=await fixture(3);let raced=false;
  try{
    f.setHook(async(sql,values)=>{
      if(sql.startsWith('UPDATE')&&!raced){raced=true;
        assert.equal(values?.[1],true);assert.match(sql,/WHERE id = \$3 AND \(password_hash IS NULL OR password_hash = ''\)/);
        await f.db.query("UPDATE customers SET password_hash='customer-concurrent-password' WHERE id=$1",[values![2]]);
      }
    });
    const result=await f.run();assert.equal(result.updated,2);assert.equal(result.skipped,1);
    const row=(await f.db.query<any>("SELECT * FROM customers WHERE password_hash='customer-concurrent-password'")).rows[0];
    assert.equal(row.identity_verified,true);assert.equal(row.is_weak_password,false);
  }finally{await f.db.close();}
});

test('真实 SQL：第三条写入失败前两条保留，重跑补齐，并打印失败批次进度',async()=>{
  const f=await fixture(7);let calls=0;
  try{
    f.setHook(async sql=>{if(sql.startsWith('UPDATE')&&++calls===3)throw Object.assign(new Error('connection reset'),{code:'ECONNRESET'});});
    await assert.rejects(f.run(),/条件更新失败.*ECONNRESET/);
    assert.equal(f.writes(),2);assert.match(f.logs.join('\n'),/累计更新 2 条/);
    f.setHook(undefined);assert.equal((await f.run()).updated,5);
  }finally{await f.db.close();}
});

test('dry-run：限定 public 元数据+精确计数，不生成哈希、不写数据、不打印客户行',async()=>{
  const f=await fixture(7);
  try{
    const result=await f.run({dryRun:true,hash:async()=>{throw new Error('不应调用');}});
    assert.equal(result.pending,7);assert.equal(f.writes(),0);assert.equal(f.statements.length,2);
    assert.match(f.statements[0],/table_schema = \$1 AND table_name = \$2/);
    assert.ok(f.statements.every(sql=>sql.startsWith('SELECT')));
    assert.match(f.logs.join('\n'),/SQL 请求/);assert.match(f.logs.join('\n'),/SQL 响应/);
    assert.doesNotMatch(f.logs.join('\n'),/synthetic-staff|existing-hash/);
  }finally{await f.db.close();}
});

test('缺字段停止、无进展退出、中断后可继续',async()=>{
  const f=await fixture(10);
  try{
    await f.db.exec('ALTER TABLE customers DROP COLUMN password_reset_at;');
    await assert.rejects(f.run(),/password_reset_at/);assert.equal(f.writes(),0);
    await f.db.exec('ALTER TABLE customers ADD COLUMN password_reset_at timestamptz;');
    f.setHook(async sql=>sql.startsWith('UPDATE')?{rows:[]}:undefined);
    await assert.rejects(f.run(),/未发生进展/);assert.equal(f.writes(),0);
    f.setHook(undefined);
    const stopped=await f.run({shouldStop:()=>f.writes()>=3});
    assert.equal(stopped.interrupted,true);assert.equal(stopped.updated,3);
    assert.equal((await f.run()).updated,7);
  }finally{await f.db.close();}
});

test('真实 SQL 与 bcrypt：默认 cost12 每条随机盐，核实状态同条更新',async()=>{
  const f=await fixture(2);
  try{
    await f.run({hash:undefined});
    const rows=(await f.db.query<any>("SELECT * FROM customers WHERE id NOT IN ('existing','whitespace') ORDER BY id")).rows;
    assert.notEqual(rows[0].password_hash,rows[1].password_hash);
    for(const row of rows){assert.match(row.password_hash,/^\$2[ab]\$12\$/);assert.ok(await bcrypt.compare('123456',row.password_hash));assert.equal(row.identity_verified,false);}
  }finally{await f.db.close();}
});

test('dry-run SQLSTATE、网络 cause 可见；连接串/密码/哈希/客户失败行隐藏',async()=>{
  const logs:string[]=[];
  const secret='synthetic-database-secret';
  const failure=Object.assign(new Error('permission denied '+secret),{code:'42501',hint:'check table grants',detail:'PRIVATE-FAILED-CUSTOMER-ROW',cause:Object.assign(new Error('read ECONNRESET'),{code:'ECONNRESET'})});
  const connection:PasswordConnection={query:async()=>{throw failure;}};
  await assert.rejects(initializeLegacyPasswords(connection,{dryRun:true,log:line=>logs.push(line),diagnosticSecrets:[secret]}),/结构预检失败/);
  assert.match(logs.join('\n'),/42501/);assert.match(logs.join('\n'),/ECONNRESET/);assert.match(logs.join('\n'),/check table grants/);
  assert.doesNotMatch(logs.join('\n'),/synthetic-database-secret|PRIVATE-FAILED-CUSTOMER-ROW/);
  const hash=await bcrypt.hash('123456',12);
  const redacted=databaseErrorDiagnostic(new Error('postgresql://postgres:secret@synthetic.invalid:5432/postgres '+hash));
  assert.doesNotMatch(redacted,/postgres:secret@|\$2[ab]\$12\$/);
});

test('初始化脚本不依赖 Supabase REST/HTTP，复用 setup 连接配置',async()=>{
  const source=await readFile(new URL('../scripts/init-legacy-passwords.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/@supabase\/supabase-js|\bfetch\s*\(|createClient\s*\(/);
  assert.match(source,/databaseConfig\(process.env\)/);assert.match(source,/new pg.Client\(config\)/);
});
