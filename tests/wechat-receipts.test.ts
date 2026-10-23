import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setupDatabase} from '../scripts/setup-db.js';
import {upgradePaymentAudit} from '../scripts/upgrade-payment-audit.js';
import {readReceiptCandidates} from '../scripts/audit-wechat-receipts.js';
import {wechatSuccessReceipt} from '../backend/lib/wechatReceipt.js';
import {compareSettlements,matchesSettlement,settlementDateLabel,isPaidOnBusinessDay} from '../shared/lib/settlementDisplay.js';
import type {Settlement} from '../shared/types.js';

test('微信成功时间只取带时区的success_time，校验商户、订单、分币和交易号',()=>{
  const data={trade_state:'SUCCESS',mchid:'m',appid:'a',out_trade_no:'gateway1',transaction_id:'420000001',amount:{currency:'CNY',total:3364},success_time:'2026-10-22T19:12:34+08:00'};
  const expected={mchid:'m',appid:'a',paymentId:'gateway1'};
  assert.deepEqual(wechatSuccessReceipt(data,expected),{paymentId:'gateway1',transactionId:'420000001',amount:33.64,paidAt:'2026-10-22T11:12:34.000Z'});
  for(const change of [{mchid:'other'},{appid:'other'},{out_trade_no:'another'},{transaction_id:''},{trade_state:'NOTPAY'},
    {amount:{currency:'USD',total:3364}},{amount:{currency:'CNY',total:33.64}},{success_time:undefined},{success_time:'2026-10-22T19:12:34'},{success_time:'invalid'},
    {success_time:'2999-01-01T12:00:00+08:00'}]) assert.throws(()=>wechatSuccessReceipt({...data,...change},expected));
});

test('旧单刚支付排第一，未知时间不猜，姓名金额和三种单号可搜，北京时间跨日正确',()=>{
  const oldPaid={id:'old',customerName:'顾客甲',total:33.64,paymentMethod:'wechat',paymentStatus:'completed',createdAt:new Date('2026-08-01T00:00:00Z'),paidAt:'2026-10-22T16:02:00Z',paidAtSource:'wechat_success_time',paymentId:'gateway1',gatewayOrderNo:'rotated-gateway',transactionId:'420000001'} as Settlement;
  const newer={...oldPaid,id:'newer',createdAt:new Date('2026-10-21T00:00:00Z'),paidAt:'2026-10-21T01:00:00Z'};
  const unknown={...oldPaid,id:'unknown',createdAt:new Date('2026-10-23T00:00:00Z'),paidAt:undefined,paidAtSource:undefined};
  assert.deepEqual([unknown,newer,oldPaid].sort(compareSettlements).map(s=>s.id),['old','newer','unknown']);
  for(const term of ['顾客甲','33.64','¥33.64','old','gateway1','rotated-gateway','420000001']) assert.equal(matchesSettlement(oldPaid,term),true);
  assert.equal(matchesSettlement(oldPaid,'33.51'),false);
  assert.equal(settlementDateLabel(undefined),'未记录');
  assert.match(settlementDateLabel(oldPaid.paidAt),/2026\/10\/23 00:02:00/);
  assert.equal(isPaidOnBusinessDay(oldPaid,new Date('2026-10-23T01:00:00Z')),true);
  assert.equal(isPaidOnBusinessDay(unknown,new Date('2026-10-23T01:00:00Z')),false);
});

test('037真实SQL：微信凭据、结算、副作用同事务，重试与历史补记不重复扣费',async(t)=>{
  const db=new PGlite();
  const query=async(sql:string,values?:any[])=>values ? db.query(sql,values) : {rows:(await db.exec(sql)).at(-1)?.rows || []};
  const scalar=async(sql:string)=>Object.values((await db.query(sql)).rows[0] as object)[0];
  try {
    await db.exec('CREATE ROLE service_role;CREATE ROLE anon;CREATE ROLE authenticated;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
    for(const file of ['001_baseline_schema.sql','019_create_customer_packages.sql','021_create_membership_enrollments.sql','007_create_product_tables.sql','009_create_product_inventory_logs.sql','010_add_shipping_to_orders.sql','011_create_product_order_refunds.sql','016_fix_coupon_schema.sql','013_create_group_buy.sql','020_create_package_usage_logs.sql']) await db.exec((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
    await setupDatabase({query},()=>{});
    await upgradePaymentAudit({query});await upgradePaymentAudit({query});
    await db.exec("INSERT INTO shops(id,name) VALUES('s','Synthetic'); INSERT INTO customers(id,shop_id,name,phone,balance,stored_value_balance) VALUES('c','s','Synthetic','13800000000',100,100)");
    const seed=async(id:string)=>db.exec(`INSERT INTO settlements(id,shop_id,customer_id,customer_name,payment_method,payment_status,total,server_priced,created_at) VALUES('${id}','s','c','Synthetic','wechat','pending',33.64,true,'2026-08-01T00:00:00Z'); INSERT INTO payments(id,shop_id,customer_id,settlement_id,channel,amount) VALUES('${id}-pay','s','c','${id}','wechat_native',33.64)`);
    const finalize=(id:string,transaction='420000001',time='2026-10-22T19:12:34+08:00',amount=33.64,shop='s')=>db.query('SELECT * FROM finalize_verified_wechat_payment($1,$2,$3,$4,$5,$6,$7)',[id+'-pay',shop,transaction,time,amount,'staff','Synthetic']);
    await t.test('旧单新付保留创建时间并记录微信时间，迟到/重复回调不改时间或重复统计',async()=>{
      await seed('one'); await finalize('one');
      await Promise.all([finalize('one'),finalize('one')]);
      const row=(await db.query<any>("SELECT * FROM payments WHERE id='one-pay'")).rows[0];
      assert.equal(new Date(row.paid_at).toISOString(),'2026-10-22T11:12:34.000Z');assert.equal(row.paid_at_source,'wechat_success_time');
      assert.equal(await scalar("SELECT payment_status FROM settlements WHERE id='one'"),'completed');
      assert.equal(Number(await scalar("SELECT visit_count FROM customers WHERE id='c'")),1);
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),100);
      assert.equal(new Date(String(await scalar("SELECT created_at FROM settlements WHERE id='one'"))).toISOString(),'2026-08-01T00:00:00.000Z');
      await assert.rejects(finalize('one','420000001','2026-10-22T19:12:35+08:00'),/PAYMENT_TIME_CONFLICT/);
    });
    await t.test('错金额、跨店、错顾客、其他交易号、多支付映射均不完成结算',async()=>{
      await seed('bad');
      await assert.rejects(finalize('bad','420000002',undefined,33.51),/PAYMENT_RECEIPT_MISMATCH/);
      await assert.rejects(finalize('bad','420000002',undefined,33.64,'other'),/PAYMENT_MAPPING_NOT_FOUND/);
      await assert.rejects(finalize('bad','420000001'),/MULTIPLE_PAYMENT/);
      await db.exec("UPDATE payments SET transaction_id='420000999' WHERE id='bad-pay'");
      await assert.rejects(finalize('bad','420000002'),/TRANSACTION_CONFLICT/);
      await db.exec("UPDATE payments SET transaction_id=NULL,customer_id=NULL WHERE id='bad-pay'");
      await assert.rejects(finalize('bad','420000002'),/RECEIPT_MISMATCH/);
      // Simulate a legacy schema with nullable state/channel; SQL NULL must never bypass guards.
      await db.exec("ALTER TABLE payments ALTER COLUMN channel DROP NOT NULL; ALTER TABLE payments ALTER COLUMN status DROP NOT NULL; UPDATE payments SET customer_id='c',channel=NULL WHERE id='bad-pay'");
      await assert.rejects(finalize('bad','420000002'),/RECEIPT_MISMATCH/);
      await db.exec("UPDATE payments SET channel='wechat_native',status=NULL WHERE id='bad-pay'");
      await assert.rejects(finalize('bad','420000002'),/STATE_REQUIRES_REVIEW/);
      await db.exec("UPDATE payments SET status='pending' WHERE id='bad-pay'; ALTER TABLE payments ALTER COLUMN channel SET NOT NULL; ALTER TABLE payments ALTER COLUMN status SET NOT NULL");
      assert.equal(await scalar("SELECT payment_status FROM settlements WHERE id='bad'"),'pending');
    });
    await t.test('结算失败支付记录回滚；支付记录失败结算和客户统计不变',async()=>{
      await seed('legacy');await db.exec("UPDATE settlements SET server_priced=false WHERE id='legacy'");
      await assert.rejects(finalize('legacy','420000003'),/LEGACY_SETTLEMENT/);
      assert.equal(await scalar("SELECT status FROM payments WHERE id='legacy-pay'"),'pending');
      assert.equal(await scalar("SELECT paid_at FROM payments WHERE id='legacy-pay'"),null);
      await seed('fault');await db.exec("CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='fault-pay' THEN RAISE EXCEPTION 'SYNTHETIC_RECEIPT_FAILURE'; END IF; RETURN NEW; END$$; CREATE TRIGGER receipt_fault BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION fail_receipt();");
      await assert.rejects(finalize('fault','420000004'),/SYNTHETIC_RECEIPT_FAILURE/);
      assert.equal(await scalar("SELECT payment_status FROM settlements WHERE id='fault'"),'pending');
      assert.equal(Number(await scalar("SELECT visit_count FROM customers WHERE id='c'")),1);
      await db.exec('DROP TRIGGER receipt_fault ON payments');
    });
    await t.test('历史已完成订单只补真实凭据，不重记消费或补发奖励',async()=>{
      await seed('history');await db.exec("UPDATE settlements SET payment_status='completed' WHERE id='history'; UPDATE payments SET status='paid',paid_at='2026-10-22T12:00:00Z' WHERE id='history-pay'");
      const visits=await scalar("SELECT visit_count FROM customers WHERE id='c'");
      await finalize('history','420000005');
      assert.equal(await scalar("SELECT visit_count FROM customers WHERE id='c'"),visits);
      assert.equal(new Date(String(await scalar("SELECT paid_at FROM payments WHERE id='history-pay'"))).toISOString(),'2026-10-22T11:12:34.000Z');
    });
    await t.test('只读核对按订单金额查找且数据库拒绝写入；升级缺基础列回滚',async()=>{
      const queries:string[]=[];
      const candidates=await readReceiptCandidates({query:async(sql,values)=>{queries.push(sql);return query(sql,values);}},33.64,'s','one');
      assert.equal(candidates.length,1);assert.equal(candidates[0].payment_id,'one-pay');
      assert.ok(queries.every(sql=>/^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK)/.test(sql)));
      assert.equal(queries.at(-1),'ROLLBACK');
      assert.equal((await readReceiptCandidates({query},33.51)).length,0);
      await db.exec('ALTER TABLE payments RENAME COLUMN transaction_id TO renamed');
      await assert.rejects(upgradePaymentAudit({query}),/支付结构预检不通过/);
      await db.exec('ALTER TABLE payments RENAME COLUMN renamed TO transaction_id');
      for(const role of ['anon','authenticated']) assert.equal((await db.query<any>("SELECT has_function_privilege($1,'public.finalize_verified_wechat_payment(text,text,text,timestamptz,numeric,text,text)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
    });
  } finally {await db.close();}
});
