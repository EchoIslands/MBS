import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { setupDatabase } from '../scripts/setup-db.js';

test('隔离数据库：上次服务资料与正式结算同事务同步',async(t)=>{
  const db=new PGlite();
  try {
    await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
    for(const file of ['001_baseline_schema.sql','007_create_product_tables.sql','010_add_shipping_to_orders.sql','009_create_product_inventory_logs.sql','011_create_product_order_refunds.sql','013_create_group_buy.sql','016_fix_coupon_schema.sql','019_create_customer_packages.sql','020_create_package_usage_logs.sql','021_create_membership_enrollments.sql']) {
      await db.exec((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
    }
    await setupDatabase({query:async(sql,values)=>values?db.query(sql,values):{rows:(await db.exec(sql)).at(-1)?.rows || []}},()=>{});
    await db.exec(`INSERT INTO shops(id,name) VALUES('s','Synthetic shop'),('other','Other shop');
      INSERT INTO customers(id,shop_id,name,phone,stored_value_balance,balance,last_stylist,last_service_items,last_visit_at)
        VALUES('c','s','Synthetic customer','13800000001',100,100,'历史发型师',ARRAY['历史服务'],'2020-01-01T03:00:00Z');
      INSERT INTO employees(id,shop_id,name,role) VALUES('stylist','s','预约发型师','stylist');
      INSERT INTO bookings(id,shop_id,customer_id,stylist_id,stylist_name,service_id,scheduled_time,status)
        VALUES('booking','s','c','stylist','预约发型师','svc',NOW(),'pending');`);
    const snapshot=async()=> (await db.query<any>("SELECT last_stylist,last_service_items,last_visit_at FROM customers WHERE id='c'")).rows[0];
    const before=await snapshot();
    const payload=(id:string,method='cash',booking:string|null=null,items?:any[])=>({id,shop_id:'s',customer_id:'c',booking_id:booking,items:items||[{id:'svc',type:'service',name:'实际洗剪吹',quantity:1,originalPrice:10,employeeId:'stylist',employeeName:'直接开单发型师'}],total:10,subtotal:10,discount:0,payment_method:method,checkout_request_key:id});
    const create=(body:any,complete=true)=>db.query('SELECT * FROM create_settlement_atomic($1::jsonb,$2,$3,$4)',[JSON.stringify(body),'cashier','收银员',complete]);
    const finish=(id:string)=>db.query("SELECT * FROM finalize_settlement_atomic($1,'s','cashier','收银员')",[id]);
    await t.test('预约、确认、服务完成、结算草稿均不改历史；正式结算三项一起更新',async()=>{
      await db.exec("UPDATE bookings SET status='confirmed' WHERE id='booking'; UPDATE bookings SET status='completed' WHERE id='booking';");
      assert.deepEqual(await snapshot(),before);
      await create(payload('booked','cash','booking'),false);
      assert.deepEqual(await snapshot(),before);
      await finish('booked');
      const row=await snapshot();
      assert.equal(row.last_stylist,'预约发型师');
      assert.deepEqual(row.last_service_items,['实际洗剪吹']);
      const visit=(await db.query<any>("SELECT check_in_time FROM customer_visit_records WHERE id='visit_booked'")).rows[0];
      assert.deepEqual(row.last_visit_at,visit.check_in_time);
    });
    await t.test('重复完成不覆盖后续人工修正；重装迁移不重放历史',async()=>{
      await db.exec("UPDATE customers SET last_stylist='人工修正',last_service_items=ARRAY['人工项目'] WHERE id='c'");
      const corrected=await snapshot();
      await finish('booked');
      await db.exec(await readFile(new URL('../migrations/044_customer_last_service.sql',import.meta.url),'utf8'));
      assert.deepEqual(await snapshot(),corrected);
    });
    await t.test('直接开单余额与微信完成共用入口；取服务员工而非收银员，多项目完整记录',async()=>{
      await create(payload('direct','balance'));
      assert.equal((await snapshot()).last_stylist,'直接开单发型师');
      const items=[{id:'svc',type:'service',name:'染发',quantity:1,originalPrice:5,employeeName:'微信服务发型师'}, {id:'svc2',type:'service',name:'护理',quantity:1,originalPrice:5}];
      const pending=await snapshot();
      await create(payload('wechat','wechat',null,items),false);
      assert.deepEqual(await snapshot(),pending);
      await finish('wechat');
      assert.equal((await snapshot()).last_stylist,'微信服务发型师');
      assert.deepEqual((await snapshot()).last_service_items,['染发','护理']);
    });
    await t.test('次卡抵扣零元服务同样同步，商品明细不覆盖服务人和项目',async()=>{
      await db.exec("INSERT INTO customer_packages(id,shop_id,customer_id,name,service_id,total_times,used_times,expires_at) VALUES('pkg','s','c','Synthetic package','svc',2,0,NOW()+INTERVAL '1 day')");
      const body=payload('package');body.total=0;body.subtotal=0;body.items[0].originalPrice=0;
      await create({...body,customer_package_id:'pkg'});
      assert.deepEqual((await snapshot()).last_service_items,['实际洗剪吹']);
      const previous=await snapshot();
      await create(payload('product','cash',null,[{id:'prod',type:'product',name:'商品',quantity:1,originalPrice:10}]));
      const row=await snapshot();assert.equal(row.last_stylist,previous.last_stylist);assert.deepEqual(row.last_service_items,previous.last_service_items);
    });
    await t.test('拒绝余额不足；触发器故障回滚整个结算，不能出现账已结档案没记',async()=>{
      const previous=await snapshot();
      await assert.rejects(create({...payload('insufficient','balance'),total:1000,subtotal:1000}),/INSUFFICIENT_BALANCE/);
      assert.deepEqual(await snapshot(),previous);
      await db.exec("CREATE FUNCTION reject_service_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.last_stylist='触发故障' THEN RAISE EXCEPTION 'SYNTHETIC_SNAPSHOT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_service_snapshot BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION reject_service_snapshot()");
      await assert.rejects(create(payload('fail','cash',null,[{id:'svc',type:'service',name:'失败项目',employeeName:'触发故障',quantity:1,originalPrice:10}])),/SYNTHETIC_SNAPSHOT_FAILURE/);
      assert.deepEqual(await snapshot(),previous);
      assert.equal((await db.query<any>("SELECT COUNT(*)::int n FROM settlements WHERE id='fail'")).rows[0].n,0);
    });
    await t.test('无可信到店记录、错归属记录不能串写；客户端角色不可直接执行触发函数',async()=>{
      const previous=await snapshot();
      await db.exec("INSERT INTO customer_visit_records(id,customer_id,shop_id,stylist_name,service_names,check_in_time) VALUES('visit_foreign','c','other','其他门店',ARRAY['其他服务'],NOW());");
      await db.exec("INSERT INTO settlements(id,shop_id,customer_id,items,payment_status) VALUES('foreign','s','c','[{\"type\":\"service\"}]','completed'),('legacy','s','c','[{\"type\":\"service\"}]','completed')");
      assert.deepEqual(await snapshot(),previous);
      for(const role of ['anon','authenticated','service_role']) {
        const result=await db.query<any>("SELECT has_function_privilege($1,'public.sync_customer_last_service()','EXECUTE') allowed",[role]);
        assert.equal(result.rows[0].allowed,role==='service_role');
      }
    });
  } finally {await db.close();}
});
