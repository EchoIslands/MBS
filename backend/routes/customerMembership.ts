import { membershipOperation } from '../../shared/lib/membershipOperation.js';
import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/index.js';
import { customerSession } from '../middleware/resourceAccess.js';
import { createPayment, miniPaymentParams, queryPaymentStatus, closeNativePayment } from '../services/paymentService.js';
import { purchaseVIPPlans, storedValuePlans } from '../../shared/membershipPlans.js';

const router = Router();
router.use(customerSession);

type Kind = 'vip' | 'stored';
type CustomerTier = { purchase_vip_level?:string|null; purchase_vip_expires_at?:string|null;
  stored_value_level?:string|null; stored_value_expires_at?:string|null };
export type Order = { id:string; shop_id:string; customer_id:string; kind:Kind; level:string; amount:number;
  channel:'wechat_mini'|'wechat_h5'; status:string; expected_level:string; expected_expires_at:string|null;
  payer_openid:string|null; prepay_id:string|null; h5_url:string|null; transaction_id:string|null;
  paid_at:string|null; created_at:string };

function publicOrder(o: Order) {
  return { id:o.id, kind:o.kind, level:o.level, amount:Number(o.amount), channel:o.channel,
    status:o.status, paidAt:o.paid_at, createdAt:o.created_at };
}

function planFor(kind:Kind, level:string) {
  if (kind==='vip') return purchaseVIPPlans.find(p => p.level===level && p.price>0);
  return storedValuePlans.find(p => p.level===level && p.amount>0);
}

function priceFor(kind:Kind, level:string) {
  const plan=planFor(kind,level);
  return plan ? (kind==='vip' ? Number((plan as typeof purchaseVIPPlans[number]).price) : Number((plan as typeof storedValuePlans[number]).amount)) : null;
}

function paymentPreflight(channel:'wechat_mini'|'wechat_h5',clientIp:string|undefined) {
  const keys=['WECHAT_MCH_ID','WECHAT_APP_ID','WECHAT_API_CERT','WECHAT_API_KEY','WECHAT_API_V3_KEY','WECHAT_NOTIFY_URL'];
  if(process.env.WECHAT_PAY_MOCK==='true' || keys.some(key=>!process.env[key]) ||
     !/^https:\/\//.test(process.env.WECHAT_NOTIFY_URL || '')) throw new Error('线上会员支付尚未配置完整，请联系门店');
  if(channel==='wechat_mini' && !process.env.WECHAT_MINI_APP_SECRET)
    throw new Error('小程序支付尚未配置完整，请联系门店');
  if(channel==='wechat_h5' && (!/^https:\/\//.test(process.env.WECHAT_H5_APP_URL || '') ||
      !clientIp || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(clientIp)))
    throw new Error('H5 支付未开通或当前网络地址不支持，请使用小程序办理');
}

function currentTier(c:CustomerTier,kind:Kind) {
  const level=kind==='vip' ? c.purchase_vip_level || 'regular' : c.stored_value_level || 'none';
  const expires=kind==='vip' ? c.purchase_vip_expires_at : c.stored_value_expires_at;
  const defaultLevel=kind==='vip'?'regular':'none';
  const active=level!==defaultLevel && (!expires || Date.parse(expires)>Date.now());
  return {level,expires:expires||null,active};
}

async function ownCustomer(req:Request) {
  const {data,error}=await supabase.from('customers').select('id,shop_id,purchase_vip_level,purchase_vip_expires_at,stored_value_level,stored_value_expires_at')
    .eq('id',req.customer!.id).eq('shop_id',req.customer!.shopId).maybeSingle();
  if(error || !data) throw new Error('会员资料暂不可用');
  return data;
}

export async function exchangeMiniCode(code:string):Promise<string> {
  const appid=process.env.WECHAT_MINI_APP_ID || process.env.WECHAT_APP_ID,secret=process.env.WECHAT_MINI_APP_SECRET;
  if(!appid || !secret) throw new Error('小程序支付尚未配置，请联系门店');
  if(!/^[A-Za-z0-9_-]{8,256}$/.test(code)) throw new Error('微信登录凭证无效，请重试');
  const url='https://api.weixin.qq.com/sns/jscode2session?'+new URLSearchParams({appid,secret,js_code:code,grant_type:'authorization_code'});
  const response=await fetch(url,{signal:AbortSignal.timeout(5000)});
  const data=await response.json() as {openid?:string;errcode?:number};
  if(!response.ok || data.errcode || !data.openid || !/^[A-Za-z0-9_-]{8,128}$/.test(data.openid)) throw new Error('微信身份获取失败，请重新打开小程序');
  return data.openid;
}

async function ownOrder(req:Request,id:string):Promise<Order|null> {
  const {data,error}=await supabase.from('membership_payment_orders').select('*').eq('id',id)
    .eq('customer_id',req.customer!.id).eq('shop_id',req.customer!.shopId).maybeSingle();
  if(error) throw new Error('会员订单暂不可用，请确认 050 迁移已部署');
  return data as Order|null;
}

export async function refreshOrder(o:Order) {
  if(o.status!=='pending') return {order:o,tradeState:o.status};
  const expectedAppId=o.channel==='wechat_mini' ? process.env.WECHAT_MINI_APP_ID || process.env.WECHAT_APP_ID : process.env.WECHAT_APP_ID;
  const gateway=await queryPaymentStatus(o.id,expectedAppId);
  if(gateway.status==='paid' && gateway.amount!==Number(o.amount))
    throw new Error('微信收款金额与会员订单不一致，请联系门店核对，勿重复支付');
  if(gateway.status==='paid' && gateway.transactionId && gateway.paidAt && gateway.amount===Number(o.amount)) {
    const {data,error}=await supabase.rpc('finalize_paid_membership_order',{
      p_order_id:o.id,p_shop_id:o.shop_id,p_transaction_id:gateway.transactionId,p_paid_at:gateway.paidAt,p_amount:gateway.amount,
    });
    if(error || !data?.[0]) throw new Error('微信已收款，会员入账待核对，请联系门店，勿重复支付');
    return {order:data[0] as Order,tradeState:'SUCCESS'};
  }
  if(gateway.tradeState==='CLOSED') {
    const {data,error}=await supabase.from('membership_payment_orders').update({status:'closed',updated_at:new Date().toISOString()})
      .eq('id',o.id).eq('status','pending').select('*').maybeSingle();
    if(error) throw new Error('支付状态暂未同步，请稍后重试');
    return {order:(data||o) as Order,tradeState:'CLOSED'};
  }
  return {order:o,tradeState:gateway.tradeState||'UNKNOWN'};
}

router.get('/plans',async(req:Request,res:Response)=>{
  try {
    const c=await ownCustomer(req);
    const {data:orders,error}=await supabase.from('membership_payment_orders').select('id,kind,level,amount,status,channel,created_at')
      .eq('customer_id',c.id).eq('shop_id',c.shop_id).in('status',['pending','review']).limit(1);
    if(error) throw new Error('会员订单暂不可用，请确认 050 迁移已部署');
    return res.json({success:true,data:{vip:purchaseVIPPlans.filter(p=>p.price>0).map(p=>({...p,operationQuote:membershipOperation(c.purchase_vip_level||'regular',c.purchase_vip_expires_at,p.level)})),stored:storedValuePlans.filter(p=>p.amount>0),
      currentVip:currentTier(c,'vip'),currentStored:currentTier(c,'stored'),activeOrder:orders?.[0]||null}});
  }catch(err){return res.status(503).json({success:false,error:err instanceof Error?err.message:'会员方案暂不可用'});}
});

router.post('/orders',async(req:Request,res:Response)=>{
  const {kind,level,channel}=req.body||{};
  if(!['vip','stored'].includes(kind) || typeof level!=='string' || !['wechat_mini','wechat_h5'].includes(channel))
    return res.status(400).json({success:false,error:'请选择有效的会员方案和支付方式'});
  let amount=priceFor(kind,level);
  if(!amount) return res.status(400).json({success:false,error:'会员方案无效'});
  try {
    const forwarded=process.env.VERCEL==='1' ? req.headers['x-vercel-forwarded-for'] : undefined;
    const rawClientIp=typeof forwarded==='string' ? forwarded.split(',')[0].trim() : req.ip;
    const clientIp=rawClientIp?.replace(/^::ffff:/,'');
    paymentPreflight(channel,clientIp);
    const openid=channel==='wechat_mini' ? await exchangeMiniCode(req.body?.code) : null;
    const c=await ownCustomer(req);
    const tier=currentTier(c,kind);
    const quote=kind==='vip'?membershipOperation(c.purchase_vip_level||'regular',c.purchase_vip_expires_at,level):null;
    if(quote?.action==='downgrade'||kind==='stored'&&tier.active&&tier.level!==level) return res.status(409).json({success:false,error:'降档或储值跨档调整请联系门店，不会自动退款'});
    if(quote)amount=quote.amount;
    const {data:active,error:activeError}=await supabase.from('membership_payment_orders').select('*')
      .eq('customer_id',c.id).eq('shop_id',c.shop_id).in('status',['pending','review']).limit(1);
    if(activeError) throw new Error('会员订单暂不可用，请确认 050 迁移已部署');
    let order=active?.[0] as Order|undefined;
    if(order?.status==='review') return res.status(409).json({success:false,error:'已有已收款订单需要门店核对，请勿再次付款'});
    if(order && (order.kind!==kind || order.level!==level || order.channel!==channel || (channel==='wechat_mini' && order.payer_openid!==openid)))
      return res.status(409).json({success:false,error:'已有未完成会员订单，请先完成或联系门店核对'});
    if(order) {
      const synced=await refreshOrder(order);
      order=synced.order;
      if(order.status==='paid' || order.status==='review') return res.json({success:true,data:publicOrder(order)});
      if(order.status==='pending' && Date.now()-Date.parse(order.created_at)>110*60*1000) {
        if(synced.tradeState==='NOTPAY') {
          try { await closeNativePayment(order.id); } catch { /* 必须再次查单确认，不能凭关单请求推断。 */ }
          order=(await refreshOrder(order)).order;
        }
        if(order.status!=='closed') return res.status(409).json({success:false,error:'原支付单尚未关闭或查单不确定，请稍后核对原单，勿重复付款'});
      }
    }
    if(!order || order.status==='closed') {
      if(quote && (quote.action==='upgrade' || req.body.confirmedAmount!==undefined) && req.body.confirmedAmount!==amount) return res.status(409).json({success:false,error:'会员报价已变化，请刷新方案后确认应付金额'});
      const id=randomUUID().replace(/-/g,'');
      const {data,error}=await supabase.from('membership_payment_orders').insert({id,shop_id:c.shop_id,customer_id:c.id,kind,level,amount,
        channel,status:'pending',operation_kind:quote?.action||'legacy',expected_level:tier.level,expected_expires_at:tier.expires,payer_openid:openid}).select('*').single();
      if(error || !data) throw new Error('会员订单创建失败，请先核对是否已有待支付订单');
      order=data as Order;
    }
    if(channel==='wechat_mini' && order.prepay_id) return res.json({success:true,data:{...publicOrder(order),payParams:miniPaymentParams(order.prepay_id)}});
    if(channel==='wechat_h5' && order.h5_url) return res.json({success:true,data:{...publicOrder(order),payUrl:order.h5_url}});
    amount=Number(order.amount);
    const payment=await createPayment({paymentId:order.id,shopId:c.shop_id,customerId:c.id,settlementId:'',amount,
      channel,openid:openid||undefined,clientIp,description:kind==='vip'?'会员开通/续费 '+level:'储值会员 '+level});
    if(payment.paymentId!==order.id || payment.amount!==amount || payment.status!=='pending' ||
       (channel==='wechat_mini' && (!payment.prepayId || !payment.miniProgramParams)) ||
       (channel==='wechat_h5' && !payment.codeUrl)) throw new Error('微信下单结果不完整，请核对原单，勿重新付款');
    const update=channel==='wechat_mini'?{prepay_id:payment.prepayId}:{h5_url:payment.codeUrl};
    const {data:saved,error:saveError}=await supabase.from('membership_payment_orders').update(update).eq('id',order.id).eq('status','pending').select('*').maybeSingle();
    if(saveError || !saved) throw new Error('微信订单已创建但本地状态未保存，请联系门店核对，勿重复付款');
    return res.json({success:true,data:{...publicOrder(saved as Order),payParams:payment.miniProgramParams,payUrl:channel==='wechat_h5'?payment.codeUrl:undefined}});
  }catch(err){return res.status(503).json({success:false,error:err instanceof Error?err.message:'支付下单暂不可用'});}
});

router.get('/orders/:orderId',async(req:Request,res:Response)=>{
  try {
    const order=await ownOrder(req,req.params.orderId);
    if(!order) return res.status(404).json({success:false,error:'会员订单不存在'});
    const result=await refreshOrder(order);
    return res.json({success:true,data:publicOrder(result.order)});
  }catch(err){return res.status(503).json({success:false,error:err instanceof Error?err.message:'支付状态暂不可用'});}
});

export default router;
