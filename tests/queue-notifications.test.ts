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
