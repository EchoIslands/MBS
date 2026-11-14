import Dysmsapi, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import { Config } from '@alicloud/openapi-client';
import { supabase } from '../db/index.js';
import { miniProgramAccessToken } from './miniProgramCode.js';

export type QueueNotice = { id:number; shop_id:string; booking_id:string; event_type:string; expires_at:string };
export type NoticeResult = { status:'accepted'|'phone'|'obsolete'; channel?:string; reason:string; provider_id?:string };
export type NoticeDependencies = { wechat:()=>Promise<string>; sms:()=>Promise<string> };
/** Provider acceptance is not delivery or customer acknowledgement. No blind resend after ambiguity. */
export async function sendQueueNotice(deps:NoticeDependencies):Promise<NoticeResult> {
  try { return {status:'accepted',channel:'wechat',reason:'微信受理，等待顾客确认',provider_id:await deps.wechat()}; }
  catch { /* Consent exhausted, rejected, unconfigured or unavailable: try the approved notification SMS. */ }
  try { return {status:'accepted',channel:'sms',reason:'短信受理，等待顾客确认',provider_id:await deps.sms()}; }
  catch { return {status:'phone',reason:'微信及短信未确认受理，请电话联系'}; }
}
const wechatToken = miniProgramAccessToken;
export const queueTemplateId=()=>process.env.WECHAT_QUEUE_TEMPLATE_ID||'';
async function wechat(job:QueueNotice,customerId:string,shopName:string) {
  const template=queueTemplateId();
  const nameField=process.env.WECHAT_QUEUE_NAME_FIELD,noticeField=process.env.WECHAT_QUEUE_NOTICE_FIELD;
  if(!template||!/^thing\d+$/.test(nameField||'')||!/^thing\d+$/.test(noticeField||'')||nameField===noticeField)throw new Error('TEMPLATE_UNCONFIGURED');
  const {data,error}=await supabase.rpc('consume_queue_subscription',{p_shop_id:job.shop_id,p_customer_id:customerId});
  const consent=data?.[0];if(error||!consent||consent.template_id!==template)throw new Error('NO_CONSENT');
  const token=await wechatToken();
  const response=await fetch('https://api.weixin.qq.com/cgi-bin/message/subscribe/send?'+new URLSearchParams({access_token:token}),{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),
    body:JSON.stringify({touser:consent.openid,template_id:template,page:'pages/queue/queue?bookingId='+encodeURIComponent(job.booking_id),
      miniprogram_state:process.env.WECHAT_NOTIFICATION_STATE||'formal',lang:'zh_CN',
      data:{[nameField!]:{value:shopName.slice(0,20)},[noticeField!]:{value:job.event_type==='called'?'已叫号，请在10分钟内到服务位':'即将轮到，请准备返回门店'}}})});
  const body=await response.json() as {errcode?:number;msgid?:string};
  if(!response.ok||body.errcode!==0)throw new Error('WECHAT_REJECTED');return body.msgid||String(job.id);
}
async function sms(job:QueueNotice,phone:string) {
  if(!/^1\d{10}$/.test(phone)||!process.env.SMS_QUEUE_TEMPLATE_CODE||!process.env.SMS_ACCESS_KEY_ID||!process.env.SMS_ACCESS_KEY_SECRET||!process.env.SMS_SIGN_NAME)throw new Error('SMS_UNCONFIGURED');
  const Ctor=(Dysmsapi as unknown as {default?:typeof Dysmsapi}).default||Dysmsapi;
  const client=new Ctor(new Config({accessKeyId:process.env.SMS_ACCESS_KEY_ID,accessKeySecret:process.env.SMS_ACCESS_KEY_SECRET,endpoint:'dysmsapi.aliyuncs.com',connectTimeout:3000,readTimeout:5000}));
  // Use a separately approved notification template, never the OTP template.
  const result=await client.sendSms(new SendSmsRequest({phoneNumbers:phone,signName:process.env.SMS_SIGN_NAME,
    templateCode:process.env.SMS_QUEUE_TEMPLATE_CODE,templateParam:JSON.stringify({status:job.event_type==='called'?'已叫号，请在10分钟内到服务位':'即将轮到，请准备返回门店'}),outId:'queue_'+job.id}));
  if(result.body?.code!=='OK')throw new Error('SMS_REJECTED');return result.body.bizId||String(job.id);
}
export async function dispatchQueueNotifications(limit=1) {
  let processed=0; const until=Date.now()+20000;
  while(processed<Math.min(limit,10)&&Date.now()<until){
    const claim=await supabase.rpc('claim_queue_notification');if(claim.error)throw new Error('QUEUE_OUTBOX_UNAVAILABLE');
    const job=claim.data?.[0] as QueueNotice|undefined;if(!job)break;
    let result:NoticeResult;
    try {
      const b=await supabase.from('bookings').select('customer_id,customer_phone,queue_state,queue_call_event_id,queue_ack_event_id,status').eq('id',job.booking_id).eq('shop_id',job.shop_id).single();
      if(b.error||!b.data)throw new Error('BOOKING_UNAVAILABLE');
      if(Date.parse(job.expires_at)<=Date.now()||Number(b.data.queue_ack_event_id)>=job.id||b.data.status==='cancelled'||['serving','finished','missed'].includes(b.data.queue_state)||job.event_type==='ready'&&b.data.queue_state==='called'||job.event_type==='called'&&Number(b.data.queue_call_event_id)!==job.id){result={status:'obsolete',reason:'已确认或排队状态变化，取消旧提醒'};}
      else {
        const shop=await supabase.from('shops').select('name').eq('id',job.shop_id).single();
        if(shop.error)throw new Error('SHOP_UNAVAILABLE');
        result=await sendQueueNotice({wechat:()=>wechat(job,b.data.customer_id,shop.data?.name||'门店'),sms:()=>sms(job,b.data.customer_phone||'')});
      }
    }catch{result={status:'phone',reason:'发送条件核对失败，请电话联系'};}
    const saved=await supabase.from('queue_notification_outbox').update({...result,finished_at:new Date().toISOString()}).eq('id',job.id).eq('status','sending');
    if(saved.error)throw new Error('QUEUE_SEND_RESULT_UNRECORDED');processed++;
  }
  return processed;
}
