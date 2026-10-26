/** Read-only metadata preflight for future financial report aggregation. No business rows are read. */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseConfig } from './setup-db.js';

const targets: Record<string, string[]> = {
  settlements: ['id','shop_id','customer_id','booking_id','items','total','payment_method','payment_status','created_at','manual_paid_at','manual_paid_recorded_at','manual_paid_recorded_by'],
  settlement_items: ['id','settlement_id','type','quantity','total','employee_id','employee_name'],
  payments: ['id','settlement_id','status','amount','paid_at','paid_at_source','transaction_id','created_at'],
  wechat_payment_attempts: ['settlement_id','gateway_order_no','payment_id','state','created_at'],
  bookings: ['id','shop_id','customer_id','scheduled_time','status'],
  reviews: ['id','shop_id','stylist_id','overall_score','rating'],
  employees: ['id','shop_id','name','role','is_active'],
};

async function main() {
  dotenv.config({ quiet: true });
  const client = new pg.Client(databaseConfig(process.env));
  client.on('error', () => {});
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const columns = await client.query(
      `SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position`,
      [Object.keys(targets)],
    );
    const indexes = await client.query(
      `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename,indexname`,
      [Object.keys(targets)],
    );
    const requested = new Map(Object.entries(targets).map(([table, names]) => [table, new Set(names)]));
    const relevantColumns = columns.rows.filter((row: {table_name:string;column_name:string}) => requested.get(row.table_name)?.has(row.column_name));
    console.log(JSON.stringify({ columns: relevantColumns, indexes: indexes.rows }, null, 2));
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
