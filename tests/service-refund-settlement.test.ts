import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setupDatabase} from '../scripts/setup-db.js';

test('042原单服务退款：隔离真实SQL，不接触生产或渠道',async t=>{
  const db=new PGlite();
  const scalar=async(sql:string)=>Object.values((await db.query(sql)).rows[0] as object)[0];
  try {
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
    for(const f of ['001_baseline_schema.sql','019_create_customer_packages.sql','021_create_membership_enrollments.sql','007_create_product_tables.sql','009_create_product_inventory_logs.sql','010_add_shipping_to_orders.sql','011_create_product_order_refunds.sql','016_fix_coupon_schema.sql','013_create_group_buy.sql','020_create_package_usage_logs.sql'])
      await db.exec((await readFile(new URL('../migrations/'+f,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
    await setupDatabase({query:async(sql,values)=>values?db.query(sql,values):{rows:(await db.exec(sql)).at(-1)?.rows || []}},()=>{});
    await db.exec(`INSERT INTO shops(id,name) VALUES('s','Synthetic'),('s2','Other');
      INSERT INTO customers(id,shop_id,name,phone) VALUES('c','s','Synthetic one','13800000001'),('d','s','Synthetic two','13800000002');`);
    await t.test('无预约微信服务按原单33.64申请，重复同一结果，归属/状态/凭据/项目受控',async()=>{
      await db.exec(`INSERT INTO settlements(id,shop_id,customer_id,total,payment_method,payment_status,items) VALUES
        ('walkin','s','c',33.64,'wechat','completed','[{"type":"service","name":"Synthetic"}]'),
        ('unpaid','s','c',33.64,'wechat','pending','[{"type":"service"}]'),
        ('zero','s','c',0,'cash','completed','[{"type":"service"}]'),
        ('product','s','c',10,'cash','completed','[{"type":"product"}]'),
        ('unverified','s','c',33.64,'wechat','completed','[{"type":"service"}]');
        INSERT INTO payments(id,shop_id,customer_id,settlement_id,channel,amount,status,paid_at,paid_at_source,transaction_id)
          VALUES('wx-payment','s','c','walkin','wechat_native',33.64,'paid',NOW(),'wechat_success_time','synthetic-wx');`);
      const list=()=>db.query<any>("SELECT * FROM get_service_refund_candidates('c','s','')");
      assert.deepEqual((await list()).rows.map(r=>r.settlement_id),['walkin']);
      for(const [id,code] of [['unpaid','ORDER_NOT_REFUNDABLE'],['zero','ORDER_NOT_REFUNDABLE'],['product','ORDER_NOT_REFUNDABLE'],['unverified','PAYMENT_RECEIPT_REQUIRED']])
        await assert.rejects(db.query("SELECT * FROM request_settlement_refund_atomic('c','s',$1,'Synthetic')",[id]),new RegExp(code));
      await assert.rejects(db.query("SELECT * FROM request_settlement_refund_atomic('d','s','walkin','Synthetic')"),/ORDER_NOT_FOUND/);
      await assert.rejects(db.query("SELECT * FROM request_settlement_refund_atomic('c','s2','walkin','Synthetic')"),/ORDER_NOT_FOUND/);
      const call=()=>db.query<any>("SELECT * FROM request_settlement_refund_atomic('c','s','walkin','Synthetic')");
      const [a,b]=await Promise.all([call(),call()]);
      assert.equal(a.rows[0].id,b.rows[0].id);assert.equal(a.rows[0].settlement_id,'walkin');assert.equal(a.rows[0].booking_id,null);assert.equal(Number(a.rows[0].amount),33.64);
      assert.equal((await list()).rows.length,0);
      assert.equal(await scalar("SELECT status FROM payments WHERE id='wx-payment'"),'paid');
      assert.equal(Number(await scalar("SELECT count(*) FROM stored_value_transactions")),0);
    });
    await t.test('新旧入口防重；旧有效预约申请阻断新申请；多笔结算不合计猜选',async()=>{
      await db.exec(`INSERT INTO bookings(id,shop_id,customer_id,scheduled_time) VALUES('one','s','c',NOW()),('multi','s','c',NOW()),('legacy','s','c',NOW());
        INSERT INTO settlements(id,shop_id,customer_id,booking_id,total,payment_method,payment_status,items) VALUES
          ('one-paid','s','c','one',33.64,'cash','completed','[{"type":"service"}]'),
          ('multi1','s','c','multi',10,'cash','completed','[{"type":"service"}]'),('multi2','s','c','multi',20,'cash','completed','[{"type":"service"}]'),
          ('legacy-paid','s','c','legacy',10,'cash','completed','[{"type":"service"}]');
        INSERT INTO refund_requests(id,shop_id,customer_id,booking_id,amount,status) VALUES('legacy-request','s','c','legacy',10,'approved');`);
      const old=(await db.query<any>("SELECT * FROM request_service_refund_atomic('c','s','one','Synthetic')")).rows[0];
      assert.equal((await db.query<any>("SELECT * FROM request_settlement_refund_atomic('c','s','one-paid','Synthetic')")).rows[0].id,old.id);
      await assert.rejects(db.query("SELECT * FROM request_service_refund_atomic('c','s','multi','Synthetic')"),/REFUND_SETTLEMENT_SELECTION_REQUIRED/);
      for(const [id,amount] of [['multi1',10],['multi2',20]] as const) {
        const r=(await db.query<any>("SELECT * FROM request_settlement_refund_atomic('c','s',$1,'Synthetic')",[id])).rows[0];assert.equal(Number(r.amount),amount);
      }
      await assert.rejects(db.query("SELECT * FROM request_settlement_refund_atomic('c','s','legacy-paid','Synthetic')"),/LEGACY_REFUND_REVIEW_REQUIRED/);
      assert.equal((await db.query<any>("SELECT * FROM request_service_refund_atomic('c','s','legacy','Synthetic')")).rows[0].id,'legacy-request');
      assert.ok(!(await db.query<any>("SELECT * FROM get_service_refund_candidates('c','s','')")).rows.some(r=>r.settlement_id==='legacy-paid'));
    });
    await t.test('失败回滚，不重复回执；保留原单外键及唯一约束，拒绝非法重复插入',async()=>{
      await db.exec(`INSERT INTO settlements(id,shop_id,customer_id,total,payment_method,payment_status,items) VALUES('failure','s','c',10,'cash','completed','[{"type":"service"}]');
        CREATE FUNCTION reject_service_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_REFUND_FAILURE'; END $$;
        CREATE TRIGGER reject_service_refund BEFORE INSERT ON refund_requests FOR EACH ROW EXECUTE FUNCTION reject_service_refund();`);
      await assert.rejects(db.query("SELECT * FROM request_settlement_refund_atomic('c','s','failure','Synthetic')"),/SYNTHETIC_REFUND_FAILURE/);
      assert.equal(Number(await scalar("SELECT count(*) FROM refund_requests WHERE settlement_id='failure'")),0);
      await db.exec('DROP TRIGGER reject_service_refund ON refund_requests');
      const r=(await db.query<any>("SELECT * FROM request_settlement_refund_atomic('c','s','failure','Synthetic')")).rows[0];
      await assert.rejects(db.exec("DELETE FROM settlements WHERE id='failure'"),/refund_requests_settlement_fk/);
      await assert.rejects(db.exec("INSERT INTO refund_requests(id,shop_id,customer_id,settlement_id,status) VALUES('duplicate','s','c','failure','pending')"),/service_refund_active_settlement_unique/);
      await db.query("UPDATE refund_requests SET status='approved' WHERE id=$1",[r.id]);
      const finish=()=>db.query<any>("SELECT * FROM complete_service_refund_atomic($1,'s','staff','Staff','original','synthetic-receipt',10,NOW())",[r.id]);
      const first=await finish();assert.equal((await finish()).rows[0].refund_receipt_at.getTime(),first.rows[0].refund_receipt_at.getTime());
      assert.equal((await finish()).rows[0].settlement_id,'failure');
    });
    await t.test('205+1已付候选完整分页，跨店不可读，兼容历史明细表',async()=>{
      await db.exec(`INSERT INTO settlements(id,shop_id,customer_id,total,payment_method,payment_status,items)
        SELECT 'page-'||lpad(n::text,4,'0'),'s','d',1,'cash','completed','[{"type":"service","name":"Synthetic page"}]' FROM generate_series(1,205) n;
        INSERT INTO settlements(id,shop_id,customer_id,total,payment_method,payment_status) VALUES('page-legacy','s','d',2,'cash','completed');
        INSERT INTO settlement_items(settlement_id,type,name) VALUES('page-legacy','service','Synthetic legacy');`);
      const ids:string[]=[];let after='';
      for(;;) {
        const r=await db.query<any>("SELECT * FROM get_service_refund_candidates('d','s',$1)",[after]);
        ids.push(...r.rows.map(row=>row.settlement_id));if(r.rows.length<100) break;after=r.rows.at(-1).settlement_id;
      }
      assert.equal(ids.length,206);assert.equal(new Set(ids).size,206);assert.ok(ids.includes('page-legacy'));
      assert.equal((await db.query("SELECT * FROM get_service_refund_candidates('d','s2','')")).rows.length,0);
    });
    await t.test('重跑保留申请和回执，anon/authenticated不能读取或申请',async()=>{
      const before=(await db.query('SELECT * FROM refund_requests ORDER BY id')).rows;
      await db.exec(await readFile(new URL('../migrations/042_service_refunds_by_settlement.sql',import.meta.url),'utf8'));
      assert.deepEqual((await db.query('SELECT * FROM refund_requests ORDER BY id')).rows,before);
      for(const role of ['anon','authenticated']) {
        await db.exec('SET ROLE '+role);
        await assert.rejects(db.query("SELECT * FROM request_settlement_refund_atomic('c','s','walkin','Synthetic')"),/permission denied/);
        await assert.rejects(db.query("SELECT * FROM get_service_refund_candidates('c','s','')"),/permission denied/);
        await db.exec('RESET ROLE');
      }
    });
  } finally {await db.close();}
});
