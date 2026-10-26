import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setupDatabase} from '../scripts/setup-db.js';
import {upgradePaymentRecovery} from '../scripts/upgrade-payment-recovery.js';
import {upgradeAtomicCheckout} from '../scripts/upgrade-atomic-checkout.js';
process.env.SUPABASE_URL='https://synthetic.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
const {recoverWechatPayment,recoveryDependencies}=await import('../backend/services/paymentRecovery.js');

test('038恢复：真实SQL事务与合成微信网关，不连接生产或真实微信',async(t)=>{
  const db=new PGlite();
  const query=async(sql:string,values?:any[])=>values?db.query(sql,values):{rows:(await db.exec(sql)).at(-1)?.rows || []};
  const scalar=async(sql:string)=>Object.values((await db.query(sql)).rows[0] as object)[0];
  let sequence=0,current='',events:string[]=[],states:any[]=[],createFailure=false,closeFailure=false;
  const rpc=async(name:string,args:Record<string,unknown>)=>{
    try {const values=Object.values(args);const r=await db.query<any>('SELECT '+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') AS value',values);return {data:r.rows[0]?.value,error:null};}
    catch(error) {return {data:null,error:error as any};}
  };
  const deps:any={...recoveryDependencies,rpc,now:()=>Date.now(),orderNo:()=> 'new_gateway_'+(++sequence),
    request:(orderNo:string,amount:number,description:string)=>({appid:'a',mchid:'m',description,out_trade_no:orderNo,notify_url:'https://synthetic.invalid/notify',amount:{total:Math.round(amount*100),currency:'CNY'}}),
    query:async(id:string)=>{events.push('query:'+id);return states.shift() || {status:'pending',message:'synthetic unknown'};},
    close:async(id:string)=>{events.push('close:'+id);if(closeFailure)throw new Error('synthetic close timeout');},
    create:async(body:any)=>{
      events.push('create:'+body.out_trade_no);
      const saved=(await db.query<any>('SELECT request_body FROM wechat_payment_attempts WHERE gateway_order_no=$1',[body.out_trade_no])).rows[0];
      assert.deepEqual(saved.request_body,body); // Snapshot MUST commit before gateway POST.
      if(createFailure)throw new Error('synthetic POST timeout');
      return {paymentId:body.out_trade_no,status:'pending',amount:body.amount.total/100,codeUrl:'weixin://wxpay/synthetic/'+body.out_trade_no};
    },
    receipt:async(r:any,shop:string,e:string,n:string)=>{
      events.push('receipt:'+r.paymentId);
      const result=await db.query<any>('SELECT * FROM finalize_wechat_attempt($1,$2,$3,$4,$5,$6,$7)',[r.paymentId,shop,r.transactionId,r.paidAt,r.amount,e,n]);return result.rows[0];
    },
  };
  async function seed() {
    current='case_'+(++sequence);events=[];states=[];createFailure=false;closeFailure=false;
    await db.query("INSERT INTO settlements(id,shop_id,customer_id,payment_method,payment_status,total,server_priced,items) VALUES($1,'s','c','wechat','pending',67.28,true,$2)",[current,JSON.stringify([{name:'合成洗剪吹',quantity:2}])]);
    await db.query("INSERT INTO payments(id,shop_id,customer_id,settlement_id,channel,status,amount) VALUES($1,'s','c',$2,'wechat_native','pending',67.28)",[current+'_pay',current]);
  }
  const recover=(initial=false,shop='s')=>recoverWechatPayment(current,shop,'staff','Synthetic',initial,deps);
  const pending={status:'pending',tradeState:'NOTPAY',amount:67.28};
  const closed={status:'failed',tradeState:'CLOSED',amount:67.28};
  const success=()=>({status:'paid',tradeState:'SUCCESS',amount:67.28,transactionId:'42000000'+(++sequence),paidAt:'2026-10-23T01:02:03.000Z'});
  try {
    await db.exec('CREATE ROLE service_role;CREATE ROLE anon;CREATE ROLE authenticated;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
    for(const file of ['001_baseline_schema.sql','019_create_customer_packages.sql','021_create_membership_enrollments.sql','007_create_product_tables.sql','009_create_product_inventory_logs.sql','010_add_shipping_to_orders.sql','011_create_product_order_refunds.sql','016_fix_coupon_schema.sql','013_create_group_buy.sql','020_create_package_usage_logs.sql']) await db.exec((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
    await setupDatabase({query},()=>{});await upgradePaymentRecovery({query});await upgradePaymentRecovery({query});
    await db.exec("INSERT INTO shops(id,name) VALUES('s','Synthetic');INSERT INTO customers(id,shop_id,name,phone) VALUES('c','s','Synthetic','13800000000')");
    await t.test('请求快照先提交；POST超时后只重试同号；原码可复用，过期同号刷新',async()=>{
      await seed();createFailure=true;
      await assert.rejects(recover(true),/POST timeout/);
      assert.deepEqual(events,['create:'+current+'_pay']);
      const originalBody = (await db.query<any>('SELECT request_body FROM wechat_payment_attempts WHERE gateway_order_no=$1',[current+'_pay'])).rows[0].request_body;
      assert.equal(originalBody.description,'合成洗剪吹×2');
      // 恢复请求只读已提交快照，即使原结算后来变化也不能悄悄换描述。
      await db.query('UPDATE settlements SET items=$1 WHERE id=$2',[JSON.stringify([{name:'后来变更的合成项目',quantity:1}]),current]);
      createFailure=false;events=[];states=[{status:'pending',tradeState:'NOT_FOUND'}];
      const first=await recover();assert.equal(first.paymentId,current+'_pay');
      events=[];states=[pending];await recover();assert.deepEqual(events,['query:'+current+'_pay']);
      await db.exec("UPDATE wechat_payment_attempts SET qr_updated_at=NOW()-INTERVAL '3 hours'");
      events=[];states=[pending];await recover();assert.deepEqual(events,['query:'+current+'_pay','create:'+current+'_pay']);
      assert.deepEqual((await db.query<any>('SELECT request_body FROM wechat_payment_attempts WHERE gateway_order_no=$1',[current+'_pay'])).rows[0].request_body,originalBody);
      assert.equal(Number(await scalar('SELECT COUNT(*) FROM payments')),1);
    });
    await t.test('老单缺快照：查未付、关闭、再查CLOSED才换号；保留原结算和所有尝试，旧回调不串新单',async()=>{
      await seed();states=[pending,closed];const result=await recover();
      assert.notEqual(result.paymentId,current+'_pay');assert.equal(result.amount,67.28);
      assert.deepEqual(events.slice(0,3),['query:'+current+'_pay','close:'+current+'_pay','query:'+current+'_pay']);
      assert.equal(Number(await scalar("SELECT COUNT(*) FROM wechat_payment_attempts WHERE payment_id='"+current+"_pay'")),2);
      assert.equal(Number(await scalar("SELECT COUNT(*) FROM payments WHERE settlement_id='"+current+"'")),1);
      await assert.rejects(deps.receipt({...success(),paymentId:current+'_pay'},'s','staff','Synthetic'),/OLD_PAYMENT_ATTEMPT/);
      states=[success()];assert.equal((await recover()).status,'paid');
      assert.equal(await scalar("SELECT payment_status FROM settlements WHERE id='"+current+"'"),'completed');
      assert.equal(await scalar("SELECT paid_at_source FROM payments WHERE id='"+current+"_pay'"),'wechat_success_time');
    });
    await t.test('关闭超时、未知状态、错金额都不生成另一张码；关闭和付款竞态同步已付',async()=>{
      await seed();states=[pending,{status:'pending'}];closeFailure=true;
      await assert.rejects(recover(),/尚未确认原单关闭/);assert.ok(events.every(e=>!e.startsWith('create:')));
      states=[{...pending,amount:33.64}];events=[];await assert.rejects(recover(),/金额或状态/);assert.equal(events.length,1);
      states=[pending,success()];events=[];assert.equal((await recover()).status,'paid');assert.ok(events.every(e=>!e.startsWith('create:')));
    });
    await t.test('跨店、旧未核价单、NULL支付状态均在网关前拒绝；已记收款不另收',async()=>{
      await seed();await assert.rejects(recover(false,'other'));assert.deepEqual(events,[]);
      await db.exec("UPDATE settlements SET server_priced=false WHERE id='"+current+"'");
      await assert.rejects(recover(),/未经服务端核价/);assert.deepEqual(events,[]);
      await db.exec("UPDATE settlements SET server_priced=true WHERE id='"+current+"';ALTER TABLE payments ALTER COLUMN status DROP NOT NULL;UPDATE payments SET status=NULL WHERE id='"+current+"_pay'");
      await assert.rejects(recover());assert.deepEqual(events,[]);
      await db.exec("UPDATE payments SET status='paid' WHERE id='"+current+"_pay'");
      states=[pending];await assert.rejects(recover(),/本地已记收款/);assert.ok(events.every(e=>!e.startsWith('create:')));
    });
    await t.test('数据库互斥阻止并发恢复；陈旧持有者不能保存二维码',async()=>{
      await seed();
      let ready!:()=>void,continueQuery!:()=>void;
      const arrived=new Promise<void>(resolve=>ready=resolve),gate=new Promise<void>(resolve=>continueQuery=resolve);
      const first=recoverWechatPayment(current,'s','staff','Synthetic',false,{...deps,query:async()=>{ready();await gate;return {status:'pending',tradeState:'NOT_FOUND'};}});
      await arrived;await assert.rejects(recover(),/其他员工/);continueQuery();await first;
      const one='token_111111111111111',two='token_222222222222222';
      await rpc('claim_wechat_recovery',{id:current,shop:'s',token:one});
      await db.exec("UPDATE wechat_payment_attempts SET recovery_started_at=NOW()-INTERVAL '3 minutes' WHERE payment_id='"+current+"_pay'");
      assert.equal((await rpc('claim_wechat_recovery',{id:current,shop:'s',token:two})).error,null);
      assert.ok((await rpc('mutate_wechat_recovery',{payment:current+'_pay',shop:'s',token:one,action:'qr',data:{gateway_order_no:current+'_pay',code_url:'weixin://wxpay/forged'}})).error);
    });
    await upgradeAtomicCheckout({query});await upgradeAtomicCheckout({query});
    const checkout=(payload:any,paymentId:string)=>db.query<any>('SELECT create_wechat_settlement_atomic($1,$2,$3,$4) AS result',[JSON.stringify(payload),'staff','Synthetic',paymentId]);
    const payload=(id:string)=>({id,shop_id:'s',customer_id:'c',items:[{type:'service',id:'svc',name:'Synthetic',quantity:1,originalPrice:67.28,discountedPrice:67.28,total:67.28}],subtotal:67.28,discount:0,total:67.28,payment_method:'wechat',start_payment:true,checkout_request_key:'request_'+id,used_benefit_ids:[]});
    await t.test('040支付映射故障回滚整笔新结算和次卡预占；原草稿失败保留',async()=>{
      await db.exec("INSERT INTO customer_packages(id,shop_id,customer_id,name,service_id,total_times,used_times,expires_at) VALUES('atomic_pkg','s','c','Synthetic','svc',2,0,NOW()+INTERVAL '1 day')");
      const bad={...payload('atomic_fail'),customer_package_id:'atomic_pkg',items:[{type:'service',id:'svc',quantity:1,originalPrice:0,discountedPrice:0,total:0},{type:'service',id:'extra',quantity:1,originalPrice:67.28,discountedPrice:67.28,total:67.28}]};
      const duplicate=String(await scalar('SELECT id FROM payments LIMIT 1'));
      await assert.rejects(checkout(bad,duplicate),/duplicate key/);
      assert.equal(Number(await scalar("SELECT count(*) FROM settlements WHERE id='atomic_fail'")),0);
      assert.equal(Number(await scalar("SELECT reserved_times FROM customer_packages WHERE id='atomic_pkg'")),0);
      assert.equal(Number(await scalar("SELECT count(*) FROM settlement_package_reservations WHERE settlement_id='atomic_fail'")),0);
      await db.query('SELECT * FROM create_settlement_with_manual_time_atomic($1,$2,$3,false,null)',[JSON.stringify({...payload('atomic_draft'),start_payment:false}),'staff','Synthetic']);
      const before=await scalar("SELECT to_jsonb(s) FROM settlements s WHERE id='atomic_draft'");
      await assert.rejects(checkout(payload('atomic_draft'),duplicate),/duplicate key/);
      assert.deepEqual(await scalar("SELECT to_jsonb(s) FROM settlements s WHERE id='atomic_draft'"),before);
    });
    await t.test('040相同请求并发重试仅一条映射；改金额、请求号、归属拒绝',async()=>{
      const body=payload('atomic_retry');
      const results=await Promise.all([checkout(body,'atomic_payment_1'),checkout(body,'atomic_payment_2')]);
      assert.deepEqual(results.map(r=>r.rows[0].result.paymentCreated),[true,false]);
      assert.equal(Number(await scalar("SELECT count(*) FROM payments WHERE settlement_id='atomic_retry'")),1);
      await assert.rejects(checkout({...body,total:1},'atomic_payment_3'),/PAYMENT_ORDER_EXISTS/);
      await assert.rejects(checkout({...body,checkout_request_key:'changed'},'atomic_payment_4'),/PAYMENT_ORDER_EXISTS/);
      await assert.rejects(checkout({...body,shop_id:'other'},'atomic_payment_5'),/CUSTOMER_NOT_FOUND/);
      await assert.rejects(checkout({...body,start_payment:false},'atomic_payment_6'),/INVALID_WECHAT_CHECKOUT/);
    });
    await t.test('040新单直通038恢复和037可信收款，重复回调不重复核销',async()=>{
      current='atomic_paid';events=[];states=[];
      await checkout(payload(current),'atomic_paid_payment');
      await recover(true);
      states=[pending];await recover();
      const receipt={...success(),paymentId:'atomic_paid_payment'};
      await deps.receipt(receipt,'s','staff','Synthetic');await deps.receipt(receipt,'s','staff','Synthetic');
      assert.equal(await scalar("SELECT payment_status FROM settlements WHERE id='atomic_paid'"),'completed');
      assert.equal(await scalar("SELECT paid_at_source FROM payments WHERE id='atomic_paid_payment'"),'wechat_success_time');
      assert.equal(new Date(String(await scalar("SELECT paid_at FROM payments WHERE id='atomic_paid_payment'"))).toISOString(),receipt.paidAt);
      const retried=await checkout(payload(current),'atomic_paid_redundant');
      assert.equal(retried.rows[0].result.paymentCreated,false);
      assert.equal(Number(await scalar("SELECT count(*) FROM payments WHERE settlement_id='atomic_paid'")),1);
      assert.equal(Number(await scalar("SELECT count(*) FROM customer_visit_records WHERE id='visit_atomic_paid'")),1);
    });
    await t.test('040客户端无调用权限；升级失败事务回滚',async()=>{
      for(const role of ['anon','authenticated']) assert.equal((await db.query<any>("SELECT has_function_privilege($1,'create_wechat_settlement_atomic(jsonb,text,text,text)','EXECUTE') allowed",[role])).rows[0].allowed,false);
      await assert.rejects(upgradeAtomicCheckout({query:async(sql,values)=>{if(sql.includes('CREATE OR REPLACE FUNCTION'))throw new Error('synthetic ddl failure');return query(sql,values);}}),/synthetic ddl failure/);
      assert.equal((await checkout(payload('after_rollback'),'after_rollback_payment')).rows[0].result.paymentCreated,true);
    });
    await db.exec('GRANT SELECT(request_body) ON wechat_payment_attempts TO anon');
    await upgradePaymentRecovery({query});
    await t.test('客户端角色不能读支付请求快照或调用任一恢复RPC',async()=>{
      for(const role of ['anon','authenticated']) {
        assert.equal((await db.query<any>("SELECT has_any_column_privilege($1,'wechat_payment_attempts','SELECT,INSERT,UPDATE') allowed",[role])).rows[0].allowed,false);
        assert.equal((await db.query<any>("SELECT has_table_privilege($1,'wechat_payment_attempts','SELECT,INSERT,UPDATE,DELETE') allowed",[role])).rows[0].allowed,false);
        for(const sig of ['claim_wechat_recovery(text,text,text)','mutate_wechat_recovery(text,text,text,text,jsonb)','finalize_wechat_attempt(text,text,text,timestamptz,numeric,text,text)'])
          assert.equal((await db.query<any>("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,sig])).rows[0].allowed,false);
      }
    });
  } finally {await db.close();}
});
