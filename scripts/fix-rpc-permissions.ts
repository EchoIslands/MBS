/** 仅运行 030 授权迁移，不执行 setup 或密码初始化。 */
import pg from 'pg';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseConfig, type SetupConnection } from './setup-db.js';
import { databaseErrorDiagnostic } from './init-legacy-passwords.js';

export async function fixRpcPermissions(connection: SetupConnection) {
  const sql = await readFile(new URL('../migrations/030_restrict_sensitive_rpc_execution.sql', import.meta.url), 'utf8');
  try { await connection.query(sql); }
  catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('用法：npx tsx scripts/fix-rpc-permissions.ts\n复用 .env SUPABASE_DB_URL，仅事务执行 030：收紧 10 个 RPC 执行权限，不改客户、密码或余额。成功后另运行 verify-release.ts。');
    return;
  }
  if (process.argv.length > 2) throw new Error('未知参数');
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const config = databaseConfig(process.env);
  config.application_name = 'mbs-fix-rpc-permissions';
  const secrets = [process.env.SUPABASE_DB_URL || '', decodeURIComponent(new URL(config.connectionString!).password)];
  const client = new pg.Client(config);
  client.on('error', () => {});
  try {
    await client.connect();
    await fixRpcPermissions(client);
    console.log('[完成] 030 权限事务已提交：10 个 RPC 的 anon/authenticated 执行权限已撤销，service_role 保留；未修改客户、密码或余额。请运行 npx tsx scripts/verify-release.ts 复核。');
  } catch (error) {
    console.error('[失败] ' + databaseErrorDiagnostic(error, secrets));
    console.error('未确认提交；请用 verify-release.ts 核对最终状态。');
    process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('[失败] 本地配置无效；未打印密钥。'); process.exitCode = 1; });
}
