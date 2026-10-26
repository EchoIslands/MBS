import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setupDatabase} from '../scripts/setup-db.js';
import {upgradeOperations} from '../scripts/upgrade-operations.js';

test('033–041真实SQL：领券、退款、会员、库存、奖励、团购与新结算账本防重',async(t)=>{
  const db=new PGlite();
  const query=async(sql:string,values?:unknown[])=>values?db.query(sql,values):{rows:(await db.exec(sql)).at(-1)?.rows || []};
  const scalar=async(sql:string)=>Object.values((await db.query(sql)).rows[0] as object)[0];
  try {
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;');
    for(const file of ['001_baseline_schema.sql', '019_create_customer_packages.sql', '021_create_membership_enrollments.sql', '007_create_product_tables.sql','009_create_product_inventory_logs.sql','010_add_shipping_to_orders.sql','011_create_product_order_refunds.sql','016_fix_coupon_schema.sql','013_create_group_buy.sql','020_create_package_usage_logs.sql']) {
      await db.exec((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
    }
    await setupDatabase({query},()=>{});
    await upgradeOperations({query});await upgradeOperations({query});
    await db.exec(`INSERT INTO shops(id,name) VALUES('s','Synthetic'),('s2','Other');
      INSERT INTO customers(id,shop_id,name,phone) VALUES('c','s','Synthetic one','13800000001'),('d','s','Synthetic two','13800000002');
      INSERT INTO coupons(id,shop_id,name,value,start_at,end_at,remaining_quantity,per_customer_limit) VALUES('cp','s','Synthetic coupon',20,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day',1,1);
      INSERT INTO products(id,shop_id,name,category,price,stock) VALUES('p','s','Synthetic product','care',10,3);`);
    await t.test('最后一张券并发只成功一人，归属、限额、模板快照和失败回滚',async()=>{
      const claim=(id:string)=>db.query("SELECT * FROM claim_coupon_atomic('cp',$1,'s')",[id]);
      const result=await Promise.allSettled([claim('c'),claim('d')]);
      assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(await scalar("SELECT remaining_quantity FROM coupons WHERE id='cp'"),0);
      assert.equal(await scalar('SELECT COUNT(*)::integer FROM customer_coupons'),1);
      assert.equal(Number(await scalar('SELECT value FROM customer_coupons')),20);
      await assert.rejects(db.query("SELECT * FROM claim_coupon_atomic('cp','c','s2')"),/COUPON_UNAVAILABLE/);
      await db.exec("UPDATE coupons SET remaining_quantity=2 WHERE id='cp'");
      const owner=await scalar('SELECT customer_id FROM customer_coupons');
      await assert.rejects(claim(String(owner)),/COUPON_LIMIT_REACHED/);
      await db.exec("CREATE FUNCTION reject_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_CLAIM_FAILURE'; END $$; CREATE TRIGGER reject_claim BEFORE INSERT ON customer_coupons FOR EACH ROW EXECUTE FUNCTION reject_claim();");
      await assert.rejects(claim(owner==='c'?'d':'c'),/SYNTHETIC_CLAIM_FAILURE/);
      assert.equal(await scalar("SELECT remaining_quantity FROM coupons WHERE id='cp'"),2);
      await db.exec('DROP TRIGGER reject_claim ON customer_coupons');
    });
    await t.test('邀请绑定与领券一起提交，重试返回同一张券，不替别人领取',async()=>{
      await db.exec("INSERT INTO coupons(id,shop_id,name,value,remaining_quantity,per_customer_limit) VALUES('invite','s','Synthetic invite',20,-1,1); INSERT INTO referral_records(id,shop_id,referrer_id,coupon_id) VALUES('ref','s','d','invite')");
      await assert.rejects(db.query("SELECT * FROM claim_coupon_atomic('invite','d','s','ref')"),/REFERRAL_UNAVAILABLE/);
      const first=(await db.query<any>("SELECT * FROM claim_coupon_atomic('invite','c','s','ref')")).rows[0];
      const again=(await db.query<any>("SELECT * FROM claim_coupon_atomic('invite','c','s','ref')")).rows[0];
      assert.equal(again.id,first.id);assert.equal(await scalar("SELECT referred_id FROM referral_records WHERE id='ref'"),'c');
      await assert.rejects(db.query("SELECT * FROM claim_coupon_atomic('invite','d','s','ref')"),/REFERRAL_UNAVAILABLE/);
    });
    await t.test('退款申请幂等，订单状态失败时申请整笔回滚',async()=>{
      await db.exec("INSERT INTO product_orders(id,shop_id,customer_id,order_no,status,payment_method,payment_status,payable_amount,total_amount) VALUES('o','s','c','NO1','paid','balance','paid',10,10),('rollback','s','c','NO2','paid','balance','paid',10,10)");
      const request=()=>db.query<any>("SELECT * FROM request_product_refund_atomic('o','c','s','Synthetic reason')");
      const [a,b]=await Promise.all([request(),request()]);assert.equal(a.rows[0].id,b.rows[0].id);
      assert.equal(await scalar("SELECT status FROM product_orders WHERE id='o'"),'refunding');
      await db.exec("CREATE FUNCTION reject_refund_status() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='rollback' THEN RAISE EXCEPTION 'SYNTHETIC_STATUS_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_status BEFORE UPDATE ON product_orders FOR EACH ROW EXECUTE FUNCTION reject_refund_status();");
      await assert.rejects(db.query("SELECT * FROM request_product_refund_atomic('rollback','c','s','Synthetic')"),/SYNTHETIC_STATUS_FAILURE/);
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM product_order_refunds WHERE order_id='rollback'"),0);
      assert.equal(await scalar("SELECT status FROM product_orders WHERE id='rollback'"),'paid');
      await db.exec('DROP TRIGGER reject_status ON product_orders');
    });
    await t.test('确认收货与物流原子提交，重复确认一条记录，错归属拒绝',async()=>{
      await db.exec("INSERT INTO product_orders(id,shop_id,customer_id,order_no,status) VALUES('shipping','s','c','NO3','shipped')");
      await assert.rejects(db.query("SELECT * FROM confirm_product_receipt_atomic('shipping','d','s')"),/ORDER_NOT_FOUND/);
      const confirm=()=>db.query("SELECT * FROM confirm_product_receipt_atomic('shipping','c','s')");
      await Promise.all([confirm(),confirm()]);
      assert.equal(await scalar("SELECT status FROM product_orders WHERE id='shipping'"),'completed');
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM shipment_tracking WHERE order_id='shipping'"),1);
    });
    await t.test('库存和审计同事务，审计失败不改库存；评价并发防重',async()=>{
      await db.query("SELECT * FROM adjust_product_inventory_atomic('p','s',8,'Synthetic','staff','Staff')");
      assert.equal(await scalar("SELECT change_amount FROM product_inventory_logs WHERE product_id='p'"),5);
      await db.exec("CREATE FUNCTION reject_inventory_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_LOG_FAILURE'; END $$; CREATE TRIGGER reject_log BEFORE INSERT ON product_inventory_logs FOR EACH ROW EXECUTE FUNCTION reject_inventory_log();");
      await assert.rejects(db.query("SELECT * FROM adjust_product_inventory_atomic('p','s',1,'Synthetic','staff','Staff')"),/SYNTHETIC_LOG_FAILURE/);
      assert.equal(await scalar("SELECT stock FROM products WHERE id='p'"),8);
      await db.exec("INSERT INTO bookings(id,shop_id,customer_id,scheduled_time) VALUES('b','s','c',NOW())");
      const review=(id:string)=>db.query("INSERT INTO reviews(id,shop_id,customer_id,booking_id,type) VALUES($1,'s','c','b','shop')",[id]);
      const results=await Promise.allSettled([review('r1'),review('r2')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      await db.exec('DROP TRIGGER reject_log ON product_inventory_logs');
    });
    await t.test('会员办理与流水权益同事务；并发余额变化拒绝旧快照覆盖',async()=>{
      const apply=(expected:any,patch:any,tx:any,benefits:any[]=[])=>db.query("SELECT * FROM apply_membership_atomic('c','s',$1,$2,NULL,$3,$4,NULL)",[expected,patch,tx,benefits]);
      const tx={id:'sv1',type:'recharge',amount:100,note:'Synthetic',created_by:'staff'};
      await apply({balance:0,stored_value_balance:0},{balance:100,stored_value_balance:100,stored_value_level:'store_500'},tx);
      assert.equal(Number(await scalar("SELECT balance FROM customers WHERE id='c'")),100);
      await assert.rejects(apply({balance:0},{balance:200,stored_value_balance:200},{...tx,id:'sv2'}),/MEMBERSHIP_CONFLICT/);
      await db.exec("CREATE FUNCTION reject_benefit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_BENEFIT_FAILURE'; END $$; CREATE TRIGGER reject_benefit BEFORE INSERT ON member_benefit_records FOR EACH ROW EXECUTE FUNCTION reject_benefit();");
      await assert.rejects(apply({balance:100},{balance:200,stored_value_balance:200},{...tx,id:'sv2'},[{id:'benefit',type:'drink',name:'Synthetic'}]),/SYNTHETIC_BENEFIT_FAILURE/);
      assert.equal(Number(await scalar("SELECT balance FROM customers WHERE id='c'")),100);
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM stored_value_transactions WHERE id='sv2'"),0);
      await db.exec('DROP TRIGGER reject_benefit ON member_benefit_records');
    });
    await t.test('手工余额调整只记实际差额，过期快照拒绝覆盖',async()=>{
      const before=Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'"));
      await db.query("SELECT * FROM adjust_customer_balance_atomic('c','s',$1,$2,'staff','Staff','Synthetic manual correction')",[before,before+25]);
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),before+25);
      assert.equal(Number(await scalar("SELECT amount FROM stored_value_transactions WHERE customer_id='c' AND type='manual_adjust' ORDER BY created_at DESC LIMIT 1")),25);
      await assert.rejects(db.query("SELECT * FROM adjust_customer_balance_atomic('c','s',$1,$2,'staff','Staff','Stale snapshot')",[before,before+30]),/BALANCE_CONFLICT/);
      const count=Number(await scalar("SELECT count(*) FROM stored_value_transactions WHERE customer_id='c' AND type='manual_adjust'"));
      await db.query("SELECT * FROM adjust_customer_balance_atomic('c','s',$1,$1,'staff','Staff','Unchanged balance')",[before+25]);
      assert.equal(Number(await scalar("SELECT count(*) FROM stored_value_transactions WHERE customer_id='c' AND type='manual_adjust'")),count);
      await db.query("SELECT * FROM adjust_customer_balance_atomic('c','s',$1,$2,'staff','Staff','Restore test balance')",[before+25,before]);
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),before);
      assert.equal(Number(await scalar("SELECT count(*) FROM stored_value_transactions WHERE customer_id='c' AND type='manual_adjust' AND amount=-25")),1);
    });
    await t.test('商品余额退款按原消费本金与推荐金来源回退，并只写一笔退款流水',async()=>{
      await db.exec("UPDATE customers SET stored_value_balance=100,balance=100,withdrawable_referral_amount=3 WHERE id='c'; INSERT INTO product_orders(id,shop_id,customer_id,order_no,status,payment_method,payment_status,payable_amount,total_amount) VALUES('refund-source-order','s','c','REFUND-SOURCE','paid','balance','paid',10,10); INSERT INTO product_order_items(order_id,product_id,name,price,original_price,quantity,total_amount,category) VALUES('refund-source-order','p','Synthetic product',10,10,1,10,'care'); INSERT INTO stored_value_transactions(id,customer_id,type,amount,balance_after,principal_portion,referral_portion,order_id,note,created_by,created_by_name) VALUES('consume-refund-source','c','consume',-10,100,-7,-3,'refund-source-order','Synthetic source','c','Synthetic'); INSERT INTO product_order_refunds(id,order_id,shop_id,customer_id,customer_name,amount,reason) VALUES('refund-source-request','refund-source-order','s','c','Synthetic one',10,'Synthetic refund');");
      await db.query("SELECT * FROM handle_product_refund_atomic('refund-source-request','s','approved','staff','Staff','Synthetic')");
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),110);
      assert.equal(Number(await scalar("SELECT withdrawable_referral_amount FROM customers WHERE id='c'")),6);
      assert.equal(Number(await scalar("SELECT principal_portion FROM stored_value_transactions WHERE id='refund_refund-source-order'")),7);
      assert.equal(Number(await scalar("SELECT referral_portion FROM stored_value_transactions WHERE id='refund_refund-source-order'")),3);
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM stored_value_transactions WHERE order_id='refund-source-order' AND type='refund'"),1);
      await db.query("SELECT * FROM handle_product_refund_atomic('refund-source-request','s','approved','staff','Staff','Synthetic')");
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM stored_value_transactions WHERE order_id='refund-source-order' AND type='refund'"),1);
    });
    await t.test('发货和物流一起提交；重复发货不重复轨迹，未付款拒绝',async()=>{
      await db.exec("INSERT INTO product_orders(id,shop_id,customer_id,order_no,status,payment_status) VALUES('ship1','s','c','SHIP1','ready','paid'),('ship2','s','c','SHIP2','ready','pending')");
      const ship=()=>db.query("SELECT * FROM ship_product_order_atomic('ship1','s','Synthetic carrier','123')");
      await Promise.all([ship(),ship()]);
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM shipment_tracking WHERE order_id='ship1'"),1);
      await assert.rejects(db.query("SELECT * FROM ship_product_order_atomic('ship2','s','Carrier','123')"),/ORDER_NOT_SHIPPABLE/);
    });
    await t.test('活动开卡与入会失败整笔回滚，成功按原规则送次卡',async()=>{
      await db.exec(`UPDATE shops SET services='[{"id":"svc","name":"设计师洗剪吹","price":58}]' WHERE id='s';`);
      const pkg={id:'activity',customer_id:'d',name:'Synthetic activity',service_id:'svc',total_times:3,price:99,expires_at:new Date(Date.now()+86400000).toISOString(),activity_type:'99_3times'};
      await db.exec("CREATE FUNCTION reject_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_ENROLLMENT_FAILURE'; END $$; CREATE TRIGGER reject_enrollment BEFORE INSERT ON membership_enrollments FOR EACH ROW EXECUTE FUNCTION reject_enrollment();");
      await assert.rejects(db.query("SELECT * FROM create_customer_package_atomic($1,'s')",[pkg]),/SYNTHETIC_ENROLLMENT_FAILURE/);
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM customer_packages WHERE customer_id='d'"),0);
      assert.notEqual(await scalar("SELECT purchase_vip_level FROM customers WHERE id='d'"),'diamond');
      await db.exec('DROP TRIGGER reject_enrollment ON membership_enrollments');
      await db.query("SELECT * FROM create_customer_package_atomic($1,'s')",[pkg]);
      assert.equal(await scalar("SELECT purchase_vip_level FROM customers WHERE id='d'"),'diamond');
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM customer_packages WHERE customer_id='d'"),2);
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM membership_enrollments WHERE customer_id='d'"),1);
    });
    await t.test('撤销会员记录与客户状态同事务，旧快照不会产生半撤销',async()=>{
      const call=()=>db.query<any>("SELECT revoke_membership_atomic('d','s',NULL,'staff','Staff','Synthetic') result");
      await db.exec("CREATE FUNCTION reject_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.purchase_vip_level='regular' THEN RAISE EXCEPTION 'SYNTHETIC_REVOKE_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_revoke BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION reject_revoke();");
      await assert.rejects(call(),/SYNTHETIC_REVOKE_FAILURE/);
      assert.equal(await scalar("SELECT status FROM membership_enrollments WHERE customer_id='d'"),'active');
      await db.exec('DROP TRIGGER reject_revoke ON customers');
      const response=await call();assert.equal(response.rows[0].result.customer.purchase_vip_level,'regular');
      assert.equal(await scalar("SELECT status FROM membership_enrollments WHERE customer_id='d'"),'revoked');
    });
    await t.test('服务退款只取本人实付金额，同单申请防重，未付款拒绝',async()=>{
      await db.exec(`INSERT INTO bookings(id,shop_id,customer_id,scheduled_time) VALUES('refund-booking','s','c',NOW()),('unpaid-booking','s','c',NOW()); INSERT INTO settlements(id,shop_id,customer_id,booking_id,total,payment_method,payment_status,items) VALUES('refund-paid','s','c','refund-booking',33.64,'cash','completed','[{"type":"service","name":"Synthetic"}]')`);
      const request=()=>db.query<any>("SELECT * FROM request_service_refund_atomic('c','s','refund-booking','Synthetic')");
      const [a,b]=await Promise.all([request(),request()]);assert.equal(a.rows[0].id,b.rows[0].id);assert.equal(Number(a.rows[0].amount),33.64);
      await assert.rejects(db.query("SELECT * FROM request_service_refund_atomic('d','s','refund-booking','Synthetic')"),/ORDER_NOT_FOUND/);
      await assert.rejects(db.query("SELECT * FROM request_service_refund_atomic('c','s','unpaid-booking','Synthetic')"),/ORDER_NOT_REFUNDABLE/);
    });
    await t.test('服务退款完成必须登记回执，金额和时间写入退款记录',async()=>{
      await db.exec("INSERT INTO refund_requests(id,shop_id,customer_id,customer_name,amount,status,reason) VALUES('service-refund-receipt','s','c','Synthetic one',12,'approved','Synthetic');");
      await assert.rejects(db.query("SELECT * FROM complete_service_refund_atomic('service-refund-receipt','s','staff','Staff','original',NULL,12,NOW())"),/REFUND_RECEIPT_REQUIRED/);
      const result=await db.query<any>("SELECT * FROM complete_service_refund_atomic('service-refund-receipt','s','staff','Staff','original','receipt-001',12,NOW())");
      assert.equal(result.rows[0].status,'completed');
      assert.equal(result.rows[0].refund_receipt_ref,'receipt-001');
      assert.equal(Number(result.rows[0].refund_receipt_amount),12);
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM refund_requests WHERE id='service-refund-receipt' AND status='completed'"),1);
      const again=await db.query<any>("SELECT * FROM complete_service_refund_atomic('service-refund-receipt','s','staff','Staff','original','receipt-001',12,NOW())");
      assert.equal(again.rows[0].refund_receipt_ref,'receipt-001');
    });
    await t.test('结算奖励原子、按单幂等，推荐转化一次；奖励失败结算也回滚',async()=>{
      await db.exec("INSERT INTO customers(id,shop_id,name,phone) VALUES('e','s','Reward one','13800000003'),('f','s','Reward two','13800000004'); INSERT INTO referral_records(id,shop_id,referrer_id,referred_id,status) VALUES('reward-ref','s','f','e','pending'); UPDATE shops SET stockholder_config=jsonb_build_object('enabled',true,'cashbackRate',0.05) WHERE id='s'; UPDATE customers SET is_stockholder=true WHERE id='e'; INSERT INTO settlements(id,shop_id,customer_id,total,payment_method,payment_status) VALUES('reward','s','e',100,'cash','pending');");
      await db.exec("UPDATE settlements SET payment_status='completed' WHERE id='reward'");
      await db.exec("UPDATE settlements SET payment_status='completed' WHERE id='reward'");
      assert.equal(Number(await scalar("SELECT withdrawable_referral_amount FROM customers WHERE id='e'")),5);
      const referralBalance=Number(await scalar("SELECT withdrawable_referral_amount FROM customers WHERE id='f'"));
      assert.ok(referralBalance>=10);
      await db.exec("INSERT INTO settlements(id,shop_id,customer_id,total,payment_method,payment_status) VALUES('reward2','s','e',100,'cash','completed');");
      assert.equal(Number(await scalar("SELECT withdrawable_referral_amount FROM customers WHERE id='e'")),10);
      assert.equal(Number(await scalar("SELECT withdrawable_referral_amount FROM customers WHERE id='f'")),referralBalance);
      await db.exec("CREATE FUNCTION reject_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_REWARD_FAILURE'; END $$; CREATE TRIGGER reject_reward BEFORE INSERT ON stockholder_benefit_records FOR EACH ROW EXECUTE FUNCTION reject_reward();");
      await assert.rejects(db.exec("INSERT INTO settlements(id,shop_id,customer_id,total,payment_method,payment_status) VALUES('reward-fail','s','e',100,'cash','completed')"),/SYNTHETIC_REWARD_FAILURE/);
      assert.equal(await scalar("SELECT COUNT(*)::integer FROM settlements WHERE id='reward-fail'"),0);
      assert.equal(Number(await scalar("SELECT withdrawable_referral_amount FROM customers WHERE id='e'")),10);
    });
    await t.test('导券、数量同事务，并发不丢计数，核销撤销计数同步且保留已用券历史',async()=>{
      const batch='10000000-0000-4000-8000-000000000001';
      const v1='20000000-0000-4000-8000-000000000001',v2='20000000-0000-4000-8000-000000000002';
      await db.query("INSERT INTO group_buy_batches(id,shop_id,name,valid_to,total_quantity) VALUES($1,'s','Synthetic',NOW()+INTERVAL '1 day',0)",[batch]);
      const call=(id:string,code:string)=>db.query("SELECT * FROM import_group_buy_vouchers_atomic($1,'s',$2)",[batch,[{id,code}]]);
      await Promise.all([call(v1,'SYNTHETIC1'),call(v2,'SYNTHETIC2')]);
      assert.equal(await scalar("SELECT total_quantity FROM group_buy_batches WHERE name='Synthetic'"),2);
      await db.exec("CREATE FUNCTION reject_voucher_count() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_COUNT_FAILURE'; END $$; CREATE TRIGGER reject_voucher_count BEFORE UPDATE ON group_buy_batches FOR EACH ROW EXECUTE FUNCTION reject_voucher_count();");
      await assert.rejects(call('20000000-0000-4000-8000-000000000003','SYNTHETIC3'),/SYNTHETIC_COUNT_FAILURE/);
      assert.equal(await scalar('SELECT COUNT(*)::integer FROM group_buy_vouchers'),2);
      await db.exec('DROP TRIGGER reject_voucher_count ON group_buy_batches');
      await db.query("UPDATE group_buy_vouchers SET status='used' WHERE id=$1",[v1]);
      await db.query("UPDATE group_buy_vouchers SET status='used' WHERE id=$1",[v1]);
      assert.equal(await scalar("SELECT used_quantity FROM group_buy_batches WHERE name='Synthetic'"),1);
      await assert.rejects(db.query('DELETE FROM group_buy_batches WHERE id=$1',[batch]),/VOUCHER_HISTORY_REQUIRED/);
      await db.query("UPDATE group_buy_vouchers SET status='unused' WHERE id=$1",[v1]);
      assert.equal(await scalar("SELECT used_quantity FROM group_buy_batches WHERE name='Synthetic'"),0);
    });
    await t.test('匿名和authenticated不能直接读写业务表或执行新增业务函数',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec('SET ROLE '+role);
        await assert.rejects(db.query("SELECT * FROM claim_coupon_atomic('cp','c','s')"),/permission denied/);
        for(const table of ['customers','products','product_orders','product_order_items']) {
          await assert.rejects(db.query('SELECT * FROM '+table),/permission denied/);
          await assert.rejects(db.query('DELETE FROM '+table),/permission denied/);
        }
        await db.exec('RESET ROLE');
      }
    });
  } finally {await db.close();}
});
