/** Read-only metadata preflight for migration 039. Does not inspect customer data or mutate the database. */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseConfig } from './setup-db.js';

async function main() {
  dotenv.config({ quiet: true });
  const client = new pg.Client(databaseConfig(process.env));
  client.on('error', () => {});
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const columns = await client.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements' AND column_name IN ('manual_paid_at','manual_paid_recorded_at','manual_paid_recorded_by','payment_status','payment_method','processed_by') ORDER BY ordinal_position");
    const functions = await client.query("SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_settlement_atomic','finalize_settlement_atomic') ORDER BY p.proname");
    const triggers = await client.query("SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t WHERE t.tgrelid='public.settlements'::regclass AND NOT t.tgisinternal ORDER BY t.tgname");
    console.log(JSON.stringify({ settlementColumns: columns.rows, settlementFunctions: functions.rows, settlementTriggers: triggers.rows }, null, 2));
    await client.query('ROLLBACK');
  } finally { await client.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = /^[A-Z0-9_]{1,30}$/i.test(String(error?.code || '')) ? ` (${error.code})` : '';
    console.error(`[只读预检失败] ${error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[connection redacted]') : '数据库连接异常'}${code}`);
    process.exitCode = 1;
  });
}
