import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {calcDiscountedItemPrice, calcSettlementDiscountDetail} from '../shared/lib/membership';
import {ProductCategory, PurchaseVIPLevel, StoredValueLevel} from '../shared/types';

test('058 checkout: retries, changed prices, expiry and actual sales',async t=>{
 const db=new PGlite();
 try {
 await db.exec('CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;');
 for(const file of ['001_baseline_schema.sql','007_create_product_tables.sql','009_create_product_inventory_logs.sql','011_create_product_order_refunds.sql','013_create_group_buy.sql','016_fix_coupon_schema.sql','019_create_customer_packages.sql','020_create_package_usage_logs.sql','021_create_membership_enrollments.sql','025_add_customer_password_hash.sql','026_customer_identity_and_auth_limits.sql','027_atomic_settlement_and_package_redemption.sql','028_atomic_product_order_payments.sql','029_customer_password_change_required.sql','058_product_checkout_safety.sql']) await db.exec((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 await db.exec("INSERT INTO shops(id,name) VALUES('s','test'); INSERT INTO customers(id,shop_id,name,phone,identity_verified,stored_value_balance,balance) VALUES('c','s','test','13800000000',true,1000,1000); INSERT INTO products(id,shop_id,name,price,stock,category) VALUES('p','s','test',10,100,'hair_care');");
 const scalar=async(sql:string)=>Object.values((await db.query(sql)).rows[0] as object)[0];
 const order=(id:string,price=10,method='balance',key=id.padEnd(20,'_'),fingerprint='a'.repeat(64))=>db.query('SELECT * FROM create_product_order_atomic($1::jsonb,$2::jsonb)',[JSON.stringify({id,shop_id:'s',customer_id:'c',order_no:id,request_key:key,request_fingerprint:fingerprint,total_amount:price,payable_amount:price,discount_amount:0,payment_method:method}),JSON.stringify([{product_id:'p',price,quantity:1,total_amount:price}])]);
 await t.test('lost response and concurrent retry produce one order and one debit',async()=>{
 await Promise.all(Array.from({length:4},(_,i)=>order('retry-'+i,10,'balance','same-business-request')));
 assert.equal(Number(await scalar('SELECT count(*) FROM product_orders')),1);
 assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),990);
 assert.equal(Number(await scalar("SELECT sales FROM products WHERE id='p'")),1);
 await assert.rejects(order('conflict',10,'balance','same-business-request','b'.repeat(64)),/CHECKOUT_REQUEST_CONFLICT/);
 });
 await t.test('price or expired membership change fails atomically',async()=>{
 await db.exec("UPDATE products SET price=20 WHERE id='p'");
 await assert.rejects(order('stale',10),/CHECKOUT_PRICE_CHANGED/);
 assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),990);
 await db.exec("UPDATE customers SET purchase_vip_level='diamond',purchase_vip_expires_at=NOW()-INTERVAL '1 second' WHERE id='c'");
 await assert.rejects(order('expired-vip',11.6),/CHECKOUT_PRICE_CHANGED/);
 await order('current',20);
 // Replaying a committed order survives later price and balance changes.
 await order('retry-later',10,'balance','same-business-request');
 assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")),970);
 });
 await t.test('unpaid reservation is not sales; expiry restores stock once and rejects late payment',async()=>{
 await order('pending',20,'store_pickup');
 assert.equal(Number(await scalar("SELECT sales FROM products WHERE id='p'")),2);
 await db.exec("UPDATE customers SET is_weak_password=true WHERE id='c'");
 await assert.rejects(db.query("SELECT * FROM pay_product_order_atomic('pending','c')"),/CUSTOMER_IDENTITY_UNVERIFIED/);
 await db.exec("UPDATE customers SET is_weak_password=false WHERE id='c'");
 await db.exec("UPDATE product_orders SET reservation_expires_at=NOW()-INTERVAL '1 second' WHERE id='pending'");
 await assert.rejects(db.query("SELECT * FROM pay_product_order_atomic('pending','c')"),/ORDER_RESERVATION_EXPIRED/);
 // Staff pickup/update paths are also protected by the DB trigger.
 await assert.rejects(db.query("UPDATE product_orders SET payment_status='paid',status='completed' WHERE id='pending'"),/ORDER_RESERVATION_EXPIRED/);
 assert.equal(Number(await scalar("SELECT expire_product_order_reservations('s')")),1);
 assert.equal(Number(await scalar("SELECT expire_product_order_reservations('s')")),0);
 assert.equal(Number(await scalar("SELECT stock FROM products WHERE id='p'")),98);
 assert.equal(Number(await scalar("SELECT sales FROM products WHERE id='p'")),2);
 });
 await t.test('066 applies the same wig discount in shop settlement, mini-program and atomic checkout', async () => {
  await db.exec(`UPDATE products SET category='wig',price=10.25 WHERE id='p';
    UPDATE customers SET purchase_vip_level='gold',purchase_vip_expires_at=NOW()+INTERVAL '1 day',
      stored_value_level='store_1000',stored_value_expires_at=NOW()+INTERVAL '1 day' WHERE id='c';`);
  const wigOrder = (id: string, unit: number, quantity = 1) => {
   const total = Math.round(unit * quantity * 100) / 100;
   return db.query<{id: string; payable_amount: string}>('SELECT * FROM create_product_order_atomic($1::jsonb,$2::jsonb)', [
    JSON.stringify({id,shop_id:'s',customer_id:'c',order_no:id,request_key:id.padEnd(20,'_'),request_fingerprint:'a'.repeat(64),
     total_amount:total,payable_amount:total,discount_amount:0,payment_method:'balance'}),
    JSON.stringify([{product_id:'p',price:unit,quantity,total_amount:total}]),
   ]);
  };
  await wigOrder('pre-066', 10.25);
  const migration = await readFile(new URL('../migrations/066_wig_membership_discount.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const miniSource = await readFile(new URL('../mini-program/utils/membership.js', import.meta.url), 'utf8');
  const mini = await import(`data:text/javascript;base64,${Buffer.from(miniSource).toString('base64')}`);
  const unit = calcDiscountedItemPrice(10.25, PurchaseVIPLevel.GOLD, StoredValueLevel.STORE_1000, ProductCategory.WIG);
  assert.equal(unit, 5.92);
  assert.equal(mini.calcDiscountedItemPrice(10.25, {purchaseVIPLevel:'gold',storedValueLevel:'store_1000'}, 'wig'), unit);
  const detail = calcSettlementDiscountDetail([
   {originalPrice:10.25,quantity:3,category:ProductCategory.WIG},
   {originalPrice:10.25,quantity:1,category:'service'},
  ], PurchaseVIPLevel.GOLD, StoredValueLevel.STORE_1000);
  assert.equal(detail.total, 23.68);
  assert.equal(detail.discount, 17.32);
  await assert.rejects(wigOrder('stale-066', 10.25), /CHECKOUT_PRICE_CHANGED/);
  const previousBalance = Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'"));
  const {rows} = await wigOrder('new-066', unit, 3);
  assert.equal(Number(rows[0].payable_amount), 17.76);
  assert.equal(Number(await scalar("SELECT stored_value_balance FROM customers WHERE id='c'")), Math.round((previousBalance - 17.76) * 100) / 100);
  assert.equal(Number((await wigOrder('pre-066', 10.25)).rows[0].payable_amount), 10.25);
  await db.exec("UPDATE customers SET purchase_vip_expires_at=NOW()-INTERVAL '1 day',stored_value_expires_at=NOW()-INTERVAL '1 day' WHERE id='c'");
  assert.equal(Number((await wigOrder('expired-066', 10.25)).rows[0].payable_amount), 10.25);
 });
 } finally {await db.close();}
});
