import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setupDatabase} from '../scripts/setup-db.js';
import {upgradePaymentRecovery} from '../scripts/upgrade-payment-recovery.js';
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
    await db.query("INSERT INTO settlements(id,shop_id,customer_id,payment_method,payment_status,total,server_priced) VALUES($1,'s','c','wechat','pending',67.28,true)",[current]);
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
      createFailure=false;events=[];states=[{status:'pending',tradeState:'NOT_FOUND'}];
      const first=await recover();assert.equal(first.paymentId,current+'_pay');
      events=[];states=[pending];await recover();assert.deepEqual(events,['query:'+current+'_pay']);
      await db.exec("UPDATE wechat_payment_attempts SET qr_updated_at=NOW()-INTERVAL '3 hours'");
      events=[];states=[pending];await recover();assert.deepEqual(events,['query:'+current+'_pay','create:'+current+'_pay']);
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
