import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('真实 PostgreSQL 引擎隔离验证：迁移、事务回滚、限流与幂等', async (t) => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;');
    for (const file of ['001_baseline_schema.sql','007_create_product_tables.sql','009_create_product_inventory_logs.sql','011_create_product_order_refunds.sql','013_create_group_buy.sql','016_fix_coupon_schema.sql','019_create_customer_packages.sql','020_create_package_usage_logs.sql','025_add_customer_password_hash.sql','026_customer_identity_and_auth_limits.sql','027_atomic_settlement_and_package_redemption.sql','028_atomic_product_order_payments.sql','029_customer_password_change_required.sql']) {
      await db.exec((await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
    }
    await db.exec(await readFile(new URL('../migrations/031_booking_checkout_consistency.sql', import.meta.url), 'utf8'));
    await db.exec(`INSERT INTO shops(id,name) VALUES ('s','Synthetic shop');
      INSERT INTO customers(id,shop_id,name,phone,stored_value_balance,balance,withdrawable_referral_amount) VALUES('c','s','Synthetic customer','13800000001',100,100,20);
      INSERT INTO customer_packages(id,shop_id,customer_id,name,service_id,total_times,used_times,expires_at) VALUES('p','s','c','Synthetic package','svc',2,0,NOW()+INTERVAL '1 day');`);
    const scalar = async (sql: string) => Object.values((await db.query(sql)).rows[0] as object)[0];
    const create = (id: string, total: number, complete = true, pkg: string | null = null) => db.query('SELECT * FROM create_settlement_atomic($1::jsonb,$2,$3,$4)', [JSON.stringify({ id,shop_id:'s',customer_id:'c',items:[{type:'service',id:'svc',name:'Synthetic service',quantity:1,originalPrice:pkg?0:total}],subtotal:total,discount:0,total,payment_method:'balance',customer_package_id:pkg,used_benefit_ids:[] }), 'staff','Synthetic staff',complete]);
    await t.test('限流持久化：每日十次、第五次失败锁定、到期解锁且不跨日清除未到期锁', async () => {
      for (let i=0;i<5;i++) {
        assert.equal((await db.query('SELECT * FROM begin_customer_auth_attempt($1)',['ip1'])).rows[0].allowed,true);
        await db.query('SELECT finish_customer_auth_attempt($1,FALSE)',['ip1']);
      }
      assert.equal((await db.query('SELECT * FROM begin_customer_auth_attempt($1)',['ip1'])).rows[0].allowed,false);
      await db.exec("UPDATE customer_auth_limits SET attempt_day=CURRENT_DATE-1 WHERE ip_hash='ip1'");
      assert.equal((await db.query('SELECT * FROM begin_customer_auth_attempt($1)',['ip1'])).rows[0].allowed,false);
      await db.exec("UPDATE customer_auth_limits SET locked_until=NOW()-INTERVAL '1 second' WHERE ip_hash='ip1'");
      assert.equal((await db.query('SELECT * FROM begin_customer_auth_attempt($1)',['ip1'])).rows[0].allowed,true);
      for (let i=0;i<10;i++) assert.equal((await db.query('SELECT * FROM begin_customer_auth_attempt($1)',['ip2'])).rows[0].allowed,true);
      assert.equal((await db.query('SELECT * FROM begin_customer_auth_attempt($1)',['ip2'])).rows[0].allowed,false);
    });
    await t.test('余额、次卡、日志、结算同事务；重复完成不重复扣费', async () => {
      await create('one',30,true,'p');
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),70);
      assert.equal(await scalar("SELECT used_times FROM customer_packages WHERE id='p'"),1);
      await Promise.all(Array.from({length:5},()=>db.query("SELECT * FROM finalize_settlement_atomic('one','s','staff','Synthetic staff')")));
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),70);
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM package_usage_logs WHERE package_id='p'"),1);
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM stored_value_transactions WHERE order_id='one'"),1);
    });
    await t.test('不足余额整笔回滚，无残留结算和次卡扣减', async () => {
      await assert.rejects(create('insufficient',1000,true,'p'), /INSUFFICIENT_BALANCE/);
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM settlements WHERE id='insufficient'"),0);
      assert.equal(await scalar("SELECT used_times FROM customer_packages WHERE id='p'"),1);
      assert.equal(await scalar("SELECT reserved_times FROM customer_packages WHERE id='p'"),0);
    });
    await t.test('日志写入故障回滚已做的扣款、核销和结算', async () => {
      await db.exec("CREATE FUNCTION reject_package_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_LOG_FAILURE'; END $$; CREATE TRIGGER reject_log BEFORE INSERT ON package_usage_logs FOR EACH ROW EXECUTE FUNCTION reject_package_log();");
      await assert.rejects(create('logfail',10,true,'p'), /SYNTHETIC_LOG_FAILURE/);
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),70);
      assert.equal(await scalar("SELECT used_times FROM customer_packages WHERE id='p'"),1);
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM settlements WHERE id='logfail'"),0);
      await db.exec('DROP TRIGGER reject_log ON package_usage_logs;');
    });
    await t.test('异步支付占用最后次卡名额；草稿释放；竞态消费不超卖', async () => {
      await create('pending',0,false,'p');
      await assert.rejects(db.query("SELECT * FROM consume_customer_package_atomic('p','s','staff')"), /PACKAGE_UNAVAILABLE/);
      await db.query("SELECT delete_settlement_draft_atomic('pending','s')");
      const results = await Promise.allSettled([create('race-a',50,true,'p'),create('race-b',50,true,'p')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),20);
      assert.equal(await scalar("SELECT used_times FROM customer_packages WHERE id='p'"),2);
    });
    await t.test('预约草稿原号结算、失败恢复原草稿、重复提交与同预约重复收费防护', async () => {
      await db.exec(`INSERT INTO employees(id,shop_id,name,role) VALUES('designer','s','Actual designer','stylist');
        INSERT INTO bookings(id,shop_id,customer_id,stylist_id,stylist_name,service_id,scheduled_time,status) VALUES('booking','s','c','designer','Actual designer','svc',NOW(),'confirmed');
        INSERT INTO customer_packages(id,shop_id,customer_id,name,service_id,total_times,used_times,expires_at) VALUES('last','s','c','Last time','svc',1,0,NOW()+INTERVAL '1 day');`);
      const payload = {id:'draft',shop_id:'s',customer_id:'c',booking_id:'booking',items:[{type:'service',id:'svc',name:'Service',quantity:1,originalPrice:10}],subtotal:10,discount:0,total:10,payment_method:'cash',used_benefit_ids:[],checkout_request_key:'draft'};
      const submit = (value: any, complete=true) => db.query('SELECT * FROM create_settlement_atomic($1::jsonb,$2,$3,$4)',[JSON.stringify(value),'staff','Cashier',complete]);
      await submit(payload,false);
      const before = await scalar("SELECT visit_count FROM customers WHERE id='c'");
      const spent = Number(await scalar("SELECT total_spent FROM customers WHERE id='c'"));
      await db.exec('CREATE TRIGGER reject_log BEFORE INSERT ON package_usage_logs FOR EACH ROW EXECUTE FUNCTION reject_package_log();');
      const final = {...payload,total:0,subtotal:0,customer_package_id:'last',items:[{...payload.items[0],originalPrice:0}],checkout_request_key:'final'};
      await assert.rejects(submit(final), /SYNTHETIC_LOG_FAILURE/);
      assert.equal(Number(await scalar("SELECT total FROM settlements WHERE id='draft'")),10);
      assert.equal(await scalar("SELECT status FROM bookings WHERE id='booking'"),'confirmed');
      assert.equal(await scalar("SELECT reserved_times FROM customer_packages WHERE id='last'"),0);
      await db.exec('DROP TRIGGER reject_log ON package_usage_logs;');
      await submit(final);
      await submit(final); // 同单重试，包括次卡已用完。
      assert.equal(await scalar("SELECT status FROM bookings WHERE id='booking'"),'completed');
      assert.equal(await scalar("SELECT used_times FROM customer_packages WHERE id='last'"),1);
      assert.equal(await scalar("SELECT visit_count FROM customers WHERE id='c'"),Number(before)+1);
      assert.equal(Number(await scalar("SELECT total_spent FROM customers WHERE id='c'")),spent);
      assert.equal(await scalar("SELECT stylist_name FROM customer_visit_records WHERE id='visit_draft'"),'Actual designer');
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM customer_visit_records WHERE booking_id='booking'"),1);
      await assert.rejects(submit({...final,checkout_request_key:'changed'}), /SETTLEMENT_NOT_PAYABLE/);
      await assert.rejects(submit({...payload,id:'another'}), /BOOKING_ALREADY_SETTLED/);
      await assert.rejects(db.exec("UPDATE bookings SET status='cancelled' WHERE id='booking'"), /BOOKING_ALREADY_SETTLED/);
    });
    await t.test('取消/错归属拒绝；异步支付初始化只能认领一次；预约服务统计不提前写入', async () => {
      await db.exec("INSERT INTO bookings(id,shop_id,customer_id,service_id,scheduled_time,status) VALUES('cancelled','s','c','svc',NOW(),'cancelled'),('async','s','c','svc',NOW(),'confirmed');");
      const payload={id:'async-draft',shop_id:'s',customer_id:'c',booking_id:'async',items:[{type:'service',id:'svc',name:'Service',quantity:1,originalPrice:10}],subtotal:10,total:10,discount:0,payment_method:'wechat',used_benefit_ids:[],start_payment:true,checkout_request_key:'async'};
      const submit=(value:any)=>db.query('SELECT * FROM create_settlement_atomic($1::jsonb,$2,$3,FALSE)',[JSON.stringify(value),'staff','Cashier']);
      await assert.rejects(submit({...payload,booking_id:'cancelled'}),/BOOKING_CANCELLED/);
      await assert.rejects(submit({...payload,booking_id:'missing'}),/BOOKING_OWNER_MISMATCH/);
      await submit(payload);
      await assert.rejects(submit(payload),/PAYMENT_ORDER_EXISTS/);
      assert.equal(await scalar("SELECT status FROM bookings WHERE id='async'"),'confirmed');
      await db.exec("INSERT INTO payments(id,shop_id,customer_id,settlement_id,channel,amount,status) VALUES('gateway','s','c','async-draft','wechat_native',10,'pending')");
      await assert.rejects(db.exec("UPDATE bookings SET status='cancelled' WHERE id='async'"),/BOOKING_PAYMENT_IN_PROGRESS/);
      await db.query("SELECT * FROM finalize_settlement_atomic('async-draft','s','staff','Cashier')");
      assert.equal(await scalar("SELECT status FROM bookings WHERE id='async'"),'completed');
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM customer_visit_records WHERE booking_id='async'"),1);
    });
    await t.test('预约时长重叠由数据库拒绝、相邻时段可预约、并发入口只成功一笔', async () => {
      await db.exec(`UPDATE shops SET services='[{"id":"svc","duration":90}]'::jsonb WHERE id='s';`);
      const book=(id:string,time:string)=>db.query("INSERT INTO bookings(id,shop_id,customer_id,stylist_id,service_id,scheduled_time,status) VALUES($1,'s','c','designer','svc',$2,'confirmed')",[id,time]);
      await book('slot-one','2029-01-01T10:00:00+08:00');
      await assert.rejects(book('slot-overlap','2029-01-01T11:00:00+08:00'),/BOOKING_SLOT_TAKEN/);
      await book('slot-adjacent','2029-01-01T11:30:00+08:00');
      const results=await Promise.allSettled([book('slot-race-one','2029-01-02T10:00:00+08:00'),book('slot-race-two','2029-01-02T10:00:00+08:00')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM bookings WHERE id='slot-overlap'"),0);
    });
    await t.test('商城：未核实拒付且全部回滚、库存并发、重复付款只扣一次', async () => {
      await db.exec("INSERT INTO products(id,shop_id,name,price,stock) VALUES('product','s','Synthetic product',10,1)");
      const order = (id: string) => db.query('SELECT * FROM create_product_order_atomic($1::jsonb,$2::jsonb)',[JSON.stringify({id,shop_id:'s',customer_id:'c',order_no:id,total_amount:10,discount_amount:0,payable_amount:10,payment_method:'balance'}),JSON.stringify([{product_id:'product',name:'Synthetic product',price:10,original_price:10,quantity:1,total_amount:10}])]);
      await assert.rejects(order('unverified'), /CUSTOMER_IDENTITY_UNVERIFIED/);
      assert.equal(await scalar("SELECT stock FROM products WHERE id='product'"),1);
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM product_orders WHERE id='unverified'"),0);
      await db.exec("UPDATE customers SET identity_verified=TRUE WHERE id='c'");
      await db.exec("UPDATE customers SET is_weak_password=TRUE WHERE id='c'");
      await assert.rejects(order('weak-password'), /CUSTOMER_IDENTITY_UNVERIFIED/);
      assert.equal(await scalar("SELECT stock FROM products WHERE id='product'"),1);
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM product_orders WHERE id='weak-password'"),0);
      await db.exec("UPDATE customers SET is_weak_password=FALSE WHERE id='c'");
      const results = await Promise.allSettled([order('product-a'),order('product-b')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const paidId=String(await scalar("SELECT id FROM product_orders WHERE payment_status='paid'"));
      await db.query('SELECT * FROM pay_product_order_atomic($1,$2)',[paidId,'c']);
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),10);
      assert.equal(await scalar("SELECT stock FROM products WHERE id='product'"),0);
    });


    await t.test('取消与付款竞争串行化，库存仅退回一次', async () => {
      await db.exec("UPDATE products SET stock=1 WHERE id='product'");
      const payload={id:'cancel-order',shop_id:'s',customer_id:'c',order_no:'cancel-order',total_amount:10,discount_amount:0,payable_amount:10,payment_method:'store_pickup'};
      await db.query('SELECT * FROM create_product_order_atomic($1::jsonb,$2::jsonb)',[JSON.stringify(payload),JSON.stringify([{product_id:'product',name:'Synthetic product',price:10,original_price:10,quantity:1,total_amount:10}])]);
      await db.query("SELECT * FROM cancel_product_order_atomic('cancel-order','c','s','Synthetic cancel')");
      await db.query("SELECT * FROM cancel_product_order_atomic('cancel-order','c','s','Synthetic cancel')");
      await assert.rejects(db.query("SELECT * FROM pay_product_order_atomic('cancel-order','c')"), /ORDER_NOT_PAYABLE/);
      assert.equal(await scalar("SELECT stock FROM products WHERE id='product'"),1);
    });
    await t.test('余额退款事务与重复处理幂等', async () => {
      await db.exec("INSERT INTO product_order_refunds(id,order_id,shop_id,customer_id,amount,reason) SELECT 'refund',id,'s','c',10,'Synthetic refund' FROM product_orders WHERE payment_status='paid'");
      await Promise.all(Array.from({length:3},()=>db.query("SELECT * FROM handle_product_refund_atomic('refund','s','approved','staff','Synthetic staff')")));
      assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),20);
      assert.equal(await scalar("SELECT stock FROM products WHERE id='product'"),2);
      assert.equal(await scalar("SELECT COUNT(*)::INTEGER FROM stored_value_transactions WHERE type='refund'"),1);
    });
  } finally { await db.close(); }

});
