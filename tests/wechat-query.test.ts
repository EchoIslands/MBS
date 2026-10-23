import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync,createSign,createVerify} from 'node:crypto';
import {rootCertificates} from 'node:tls';

test('真实查单代码：签名GET、响应验签、精确success_time；缺时间/篡改响应不标记成功',async()=>{
  const merchant=generateKeyPairSync('rsa',{modulusLength:2048});
  const provider=generateKeyPairSync('rsa',{modulusLength:2048});
  process.env.NODE_ENV='test';process.env.WECHAT_PAY_MOCK='false';
  process.env.WECHAT_MCH_ID='synthetic-mch';process.env.WECHAT_APP_ID='synthetic-app';
  process.env.WECHAT_API_KEY=merchant.privateKey.export({type:'pkcs8',format:'pem'}).toString();
  // A public Node CA certificate only supplies an X509 serial to the synthetic request.
  process.env.WECHAT_API_CERT=rootCertificates[0];
  process.env.WECHAT_PAY_PUBLIC_KEY=provider.publicKey.export({type:'spki',format:'pem'}).toString();
  const {queryPaymentStatus}=await import('../backend/services/paymentService.js');
  const original=globalThis.fetch;
  let overrides:Record<string,unknown>={},tamper=false,stale=false,noHeaders=false,calls=0;
  globalThis.fetch=(async(url:any,init:any)=>{
    calls++;
    assert.equal(String(url),'https://api.mch.weixin.qq.com/v3/pay/transactions/out-trade-no/gateway1?mchid=synthetic-mch');
    assert.equal(init.body,undefined);assert.ok(init.signal);
    const auth=init.headers.Authorization;
    const timestamp=auth.match(/timestamp="([^"]+)"/)[1],nonce=auth.match(/nonce_str="([^"]+)"/)[1],signature=auth.match(/signature="([^"]+)"/)[1];
    const verifier=createVerify('RSA-SHA256');verifier.update('GET\n/v3/pay/transactions/out-trade-no/gateway1?mchid=synthetic-mch\n'+timestamp+'\n'+nonce+'\n\n');
    assert.equal(verifier.verify(merchant.publicKey,signature,'base64'),true);
    const body=JSON.stringify({trade_state:'SUCCESS',mchid:'synthetic-mch',appid:'synthetic-app',out_trade_no:'gateway1',transaction_id:'420000001',success_time:'2026-10-22T19:12:34+08:00',amount:{currency:'CNY',total:3364},...overrides});
    const responseTimestamp=String(Math.floor(Date.now()/1000)-(stale?600:0));
    const responseSignature=createSign('RSA-SHA256').update(responseTimestamp+'\nresponse-nonce\n'+body+'\n').sign(provider.privateKey,'base64');
    return new Response(body,{status:200,headers:noHeaders ? {} : {'wechatpay-timestamp':responseTimestamp,'wechatpay-nonce':'response-nonce','wechatpay-signature':tamper?'invalid':responseSignature,'wechatpay-serial':'synthetic-provider'}});
  }) as typeof fetch;
  try {
    assert.deepEqual(await queryPaymentStatus('gateway1'),{status:'paid',amount:33.64,transactionId:'420000001',paidAt:'2026-10-22T11:12:34.000Z',message:'支付成功'});
    for(const change of [{success_time:undefined},{out_trade_no:'gateway2'},{mchid:'other'},{transaction_id:''},{amount:{currency:'CNY',total:33.64}}]) {
      overrides=change;assert.notEqual((await queryPaymentStatus('gateway1')).status,'paid');
    }
    overrides={};tamper=true;assert.notEqual((await queryPaymentStatus('gateway1')).status,'paid');
    tamper=false;stale=true;assert.notEqual((await queryPaymentStatus('gateway1')).status,'paid');
    stale=false;noHeaders=true;assert.notEqual((await queryPaymentStatus('gateway1')).status,'paid');
    const before=calls;assert.notEqual((await queryPaymentStatus('../forged')).status,'paid');assert.equal(calls,before);
  } finally {globalThis.fetch=original;}
});
