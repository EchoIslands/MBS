import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {monthlyCommissionRate,summarizeCommissions} from '../shared/lib/commission.js';
import {setupDatabase,type SetupConnection} from '../scripts/setup-db.js';

test('confirmed whole-month tiers use inclusive lower thresholds and independent months',()=>{
 for(const [value,rank,expected] of [[9999,'designer',.08],[10000,'designer',.13],[20000,'designer',.18],[20000,'gold',.19],[20000,'manager',.20],[40000,'gold',.25],[80000,'director',.35]] as const)assert.equal(monthlyCommissionRate(value,rank),expected);
});
test('060 isolated database: evidence, owner confirmation, transfers and cross-month refunds',async()=>{
 const db=new PGlite();
 try {
 await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;');
 for(const file of ['001_baseline_schema.sql','019_create_customer_packages.sql','021_create_membership_enrollments.sql','007_create_product_tables.sql','010_add_shipping_to_orders.sql','009_create_product_inventory_logs.sql','011_create_product_order_refunds.sql','013_create_group_buy.sql','016_fix_coupon_schema.sql','020_create_package_usage_logs.sql'])await db.exec((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const connection:SetupConnection={query:async(sql,values)=>values?db.query(sql,values):{rows:(await db.exec(sql)).at(-1)?.rows||[]}};
 await setupDatabase(connection,()=>{});
 await db.exec("INSERT INTO shops(id,name) VALUES('s','test'); INSERT INTO customers(id,shop_id,name,phone) VALUES('c','s','test','13800000000'); INSERT INTO employees(id,shop_id,name,role,is_active) VALUES('boss','s','boss','ceo',true),('seller','s','seller','stylist',true),('actual','s','actual','stylist',true);");
 // Synthetic sources represent a captured paid receipt and a later card redemption.
 await db.exec(`INSERT INTO commission_sources(id,shop_id,kind,source_record_id,payload,occurred_at) VALUES
 ('sale','s','settlements','original','{"customer_id":"c","total":20000}','2026-10-15T12:00:00+08:00'),
 ('use','s','settlements','use','{"customer_id":"c","total":0}','2026-11-15T12:00:00+08:00'),
 ('refund','s','refund_requests','refund','{"customer_id":"c","settlement_id":"original","amount":10000}','2026-11-16T12:00:00+08:00');`);
 const record=(key:string,source:string,kind:string,amount:number,employeeId='seller',referenceId:string|null=null,actor='boss')=>db.query('SELECT commission_record($1,$2,$3::jsonb)',['s',actor,JSON.stringify({requestId:key,sourceId:source,kind,amount,employeeId,referenceId,reason:'核对真实凭据后确认'})]);
 await assert.rejects(record('forbidden-request','sale','income',20000,'seller',null,'seller'),/COMMISSION_FORBIDDEN/);
 await record('confirmed-income','sale','income',20000);
 await record('confirmed-income','sale','income',20000);
 await assert.rejects(record('duplicate-record','sale','income',20000),/COMMISSION_SOURCE_UNAVAILABLE/);
 await record('profit-transfer-1','use','transfer',100,'actual','confirmed-income');
 await record('refund-original-1','refund','refund',10000,'seller','confirmed-income');
 const entries=(await db.query('SELECT * FROM commission_entries ORDER BY id')).rows as Parameters<typeof summarizeCommissions>[0];
 const summary=summarizeCommissions(entries);
 assert.equal(summary.find(row=>row.employeeId==='seller'&&row.period==='2026-10')?.base,10000);
 assert.equal(summary.find(row=>row.employeeId==='seller'&&row.period==='2026-10')?.transfers,-50);
 assert.equal(summary.find(row=>row.employeeId==='actual'&&row.period==='2026-11')?.transfers,50);
 assert.equal(entries.filter(row=>row.kind==='correction').length,2);
 // Raw base and original reason remain intact; no wallet or payroll writes.
 assert.equal(Number(entries.find(row=>row.id==='confirmed-income')?.base_amount),20000);
 assert.equal(Number((await db.query<{stored_value_balance:number}>("SELECT stored_value_balance FROM customers WHERE id='c'")).rows[0].stored_value_balance),0);
 // A transfer after a partial refund only belongs to the remaining sale.
 await db.exec(`INSERT INTO commission_sources(id,shop_id,kind,source_record_id,payload,occurred_at) VALUES ('use2','s','settlements','use2','{"customer_id":"c","total":0}','2026-11-17T12:00:00+08:00')`);
 await assert.rejects(record('transfer-over-limit','use2','transfer',2000,'actual','confirmed-income'),/COMMISSION_TRANSFER_EXCEEDS_ORIGIN/);
 await record('later-service-transfer','use2','transfer',100,'actual','confirmed-income');
 const refundRequest=JSON.stringify({requestId:'offline-refund-record',referenceId:'confirmed-income',amount:10000,reason:'核对银行卡退款到账凭据',receiptRef:'verified-bank-refund-0001',receiptAt:new Date().toISOString()});
 await db.query('SELECT commission_record_manual_refund($1,$2,$3::jsonb)',['s','boss',refundRequest]);
 await db.query('SELECT commission_record_manual_refund($1,$2,$3::jsonb)',['s','boss',refundRequest]);
 const after=summarizeCommissions((await db.query('SELECT * FROM commission_entries')).rows as Parameters<typeof summarizeCommissions>[0]);
 assert.ok(after.every(row=>row.commission===0));
 await assert.rejects(db.query('SELECT commission_record_manual_refund($1,$2,$3::jsonb)',['s','boss',refundRequest.replace('10000','10001')]),/COMMISSION_RECEIPT_CONFLICT/);
 // Compact SQL snapshot contains image links, never large inline bytes.
 await db.exec("UPDATE shops SET avatar='data:image/png;base64,AAAA',images=ARRAY['data:image/png;base64,BBBB'],products='[{\"id\":\"p\",\"images\":[\"data:image/png;base64,CCCC\"]}]' WHERE id='s'");
 const snapshot=JSON.stringify((await db.query<{value:unknown}>("SELECT shop_display_snapshot('s') AS value")).rows[0].value);assert.equal(snapshot.includes('data:image'),false);assert.match(snapshot,/\/api\/shops\/s\/media\/avatar/);
 }finally{await db.close();}
});
