import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { miniPaymentParams } from '../backend/services/paymentService';

test('mini pay parameters are signed for the mini-program AppID and prepay ID', () => {
  const oldAppId=process.env.WECHAT_MINI_APP_ID;
  const oldKey=process.env.WECHAT_API_KEY;
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,
    publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  try {
    process.env.WECHAT_MINI_APP_ID='wx-test-mini-app';
    process.env.WECHAT_API_KEY=privateKey;
    const params=miniPaymentParams('wx-validated-prepay-123456');
    assert.equal(params.signType,'RSA');
    assert.equal(params.package,'prepay_id=wx-validated-prepay-123456');
    const verify=createVerify('RSA-SHA256');
    verify.update('wx-test-mini-app\n'+params.timeStamp+'\n'+params.nonceStr+'\n'+params.package+'\n');
    assert.ok(verify.verify(publicKey,params.paySign,'base64'));
  } finally {
    if(oldAppId===undefined)delete process.env.WECHAT_MINI_APP_ID;else process.env.WECHAT_MINI_APP_ID=oldAppId;
    if(oldKey===undefined)delete process.env.WECHAT_API_KEY;else process.env.WECHAT_API_KEY=oldKey;
  }
});

test('verified membership receipt activates exactly once and mismatched receipts never credit funds', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
    await db.exec(
      "CREATE TABLE shops(id text primary key, services jsonb DEFAULT '[]');"+
      "CREATE TABLE customers(id text primary key,shop_id text,purchase_vip_level text DEFAULT 'regular',purchase_vip_expires_at timestamptz,"+
      "stored_value_level text DEFAULT 'none',stored_value_expires_at timestamptz,stored_value_balance numeric DEFAULT 0,balance numeric DEFAULT 0,"+
      "has_recharged boolean DEFAULT false,recharge_level text DEFAULT 'none',is_member boolean DEFAULT false,membership_level text DEFAULT 'regular',"+
      "is_stockholder boolean DEFAULT false,updated_at timestamptz DEFAULT now());"+
      "CREATE TABLE payments(id text primary key,shop_id text,customer_id text,channel text,amount numeric,status text,transaction_id text,"+
      "prepay_id text,paid_at timestamptz,paid_at_source text);"+
      "CREATE TABLE membership_enrollments(id text primary key,shop_id text,customer_id text,level text,source text,activity_type text,"+
      "package_id text,enrolled_at timestamptz,expires_at timestamptz,status text,note text);"+
      "CREATE TABLE member_benefit_records(id text primary key,shop_id text,customer_id text,type text,name text,description text,"+
      "status text,granted_at timestamptz,granted_by text,expires_at timestamptz);"+
      "CREATE TABLE customer_packages(id text primary key,shop_id text,customer_id text,name text,service_id text,total_times int,"+
      "used_times int,price numeric,expires_at timestamptz,allow_holiday_use boolean,status text,source text,activity_type text);"+
      "CREATE TABLE stored_value_transactions(id text primary key,customer_id text,type text,amount numeric,balance_after numeric,"+
      "principal_portion numeric,referral_portion numeric,order_id text,note text,created_at timestamptz,created_by text);"+
      "INSERT INTO shops(id) VALUES('s'),('other'); INSERT INTO customers(id,shop_id) VALUES('c','s');"
    );
    await db.exec(fs.readFileSync('migrations/035_membership_and_shipping_atomic.sql','utf8').split('CREATE OR REPLACE FUNCTION public.ship_product_order_atomic')[0]);
    const migration=fs.readFileSync('migrations/050_customer_membership_payments.sql','utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("INSERT INTO membership_payment_orders(id,shop_id,customer_id,kind,level,amount,channel,expected_level) VALUES('viporder','s','c','vip','bronze',29,'wechat_mini','regular')");
    const paidAt=new Date().toISOString();
    const finalize=(id:string,shop:string,tx:string,amount:number)=>db.query(
      'SELECT status FROM finalize_paid_membership_order($1,$2,$3,$4,$5)',[id,shop,tx,paidAt,amount]);
    await assert.rejects(finalize('viporder','s','420000000001',30),/MEMBERSHIP_RECEIPT_MISMATCH/);
    await assert.rejects(finalize('viporder','other','420000000001',29),/MEMBERSHIP_ORDER_NOT_FOUND/);
    assert.equal((await finalize('viporder','s','420000000001',29)).rows[0].status,'paid');
    assert.equal((await finalize('viporder','s','420000000001',29)).rows[0].status,'paid');
    assert.equal((await db.query<{n:number}>("SELECT count(*) n FROM membership_enrollments WHERE customer_id='c'")).rows[0].n,1);
    assert.equal((await db.query<{purchase_vip_level:string}>("SELECT purchase_vip_level FROM customers WHERE id='c'")).rows[0].purchase_vip_level,'bronze');
    await db.exec("INSERT INTO membership_payment_orders(id,shop_id,customer_id,kind,level,amount,channel,expected_level) VALUES('storedorder','s','c','stored','store_500',500,'wechat_h5','none')");
    assert.equal((await finalize('storedorder','s','420000000002',500)).rows[0].status,'paid');
    assert.equal((await finalize('storedorder','s','420000000002',500)).rows[0].status,'paid');
    assert.equal(Number((await db.query<{stored_value_balance:string}>("SELECT stored_value_balance FROM customers WHERE id='c'")).rows[0].stored_value_balance),500);
    assert.equal((await db.query<{n:number}>("SELECT count(*) n FROM stored_value_transactions WHERE customer_id='c'")).rows[0].n,1);
    assert.equal((await db.query<{n:number}>("SELECT count(*) n FROM payments WHERE customer_id='c' AND status='paid'")).rows[0].n,2);
    await db.exec("INSERT INTO membership_payment_orders(id,shop_id,customer_id,kind,level,amount,channel,expected_level) VALUES('changed','s','c','vip','bronze',29,'wechat_mini','regular')");
    assert.equal((await finalize('changed','s','420000000003',29)).rows[0].status,'review');
    assert.equal((await db.query<{n:number}>("SELECT count(*) n FROM membership_enrollments WHERE customer_id='c'")).rows[0].n,1);
    assert.equal((await db.query<{n:number}>("SELECT count(*) n FROM payments WHERE customer_id='c' AND status='paid'")).rows[0].n,3);
  } finally { await db.close(); }
});
