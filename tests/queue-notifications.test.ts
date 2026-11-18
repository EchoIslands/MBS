import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://synthetic.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service-key';
const {sendQueueNotice}=await import('../backend/services/queueNotifications.js');
test('WeChat acceptance does not send an extra SMS or claim delivery',async()=>{
 let sms=0;const r=await sendQueueNotice({wechat:async()=>'wx1',sms:async()=>{sms++;return 's1';}});
 assert.equal(r.status,'accepted');assert.equal(r.channel,'wechat');assert.equal(sms,0);assert.match(r.reason,/等待顾客确认/);
});
test('WeChat failure falls back to SMS exactly once',async()=>{
 let calls=0;const r=await sendQueueNotice({wechat:async()=>{throw new Error('43101');},sms:async()=>{calls++;return 's1';}});
 assert.equal(r.channel,'sms');assert.equal(calls,1);
});
test('ambiguous or rejected SMS becomes a phone task, never a blind retry',async()=>{
 let calls=0;const r=await sendQueueNotice({wechat:async()=>{throw new Error('timeout');},sms:async()=>{calls++;throw new Error('timeout');}});
 assert.equal(r.status,'phone');assert.equal(calls,1);
});

test('stock-expiry failure does not block trusted notification dispatch; anonymous callers do neither',async()=>{
 process.env.QUEUE_DISPATCH_SECRET='synthetic-dispatch-secret-000000000000';
 const {supabase}=await import('../backend/db/index.js');
 const {default:router}=await import('../backend/routes/queueNotifications.js');
 const handler=router.stack.find(layer=>layer.route?.path==='/dispatch')!.route!.stack[0].handle;
 const original=supabase.rpc;const calls:string[]=[];
 supabase.rpc=((name:string)=>{calls.push(name);return Promise.resolve({data:[],error:name==='expire_due_product_reservations'?{message:'synthetic expiry unavailable'}:null});}) as unknown as typeof original;
 let status=200;let body:{success?:boolean;data?:{processed:number}}={};
 const response={status(n:number){status=n;return this;},json(value:typeof body){body=value;return this;}};
 try {
  await handler({headers:{}} as never,response as never,()=>{});assert.equal(status,401);assert.equal(calls.length,0);
  await handler({headers:{authorization:'Bearer '+process.env.QUEUE_DISPATCH_SECRET}} as never,response as never,()=>{});
  assert.equal(status,503);assert.ok(calls.includes('claim_queue_notification'));assert.equal(body.data?.processed,0);
 }finally{supabase.rpc=original;}
});
