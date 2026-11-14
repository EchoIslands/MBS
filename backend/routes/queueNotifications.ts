import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { supabase } from '../db/index.js';
import { customerSession, shopContext } from '../middleware/resourceAccess.js';
import { authMiddleware } from '../middleware/index.js';
import { dispatchQueueNotifications, queueTemplateId } from '../services/queueNotifications.js';
import { exchangeMiniCode } from './customerMembership.js';
const router=Router();
router.get('/config',customerSession,(_req,res)=>res.json({success:true,data:{templateId:queueTemplateId()}}));
router.post('/consent',customerSession,async(req,res)=>{
  try {
    if(!queueTemplateId()||req.body?.templateId!==queueTemplateId()||typeof req.body?.code!=='string')return res.status(400).json({success:false,error:'通知模板未配置或授权参数无效'});
    const openid=await exchangeMiniCode(req.body.code);
    const c=req.customer!;
    // One explicit subscription gesture grants at most one send, not permanent permission.
    const result=await supabase.from('queue_notification_consent').upsert({shop_id:c.shopId,customer_id:c.id,openid,template_id:queueTemplateId(),quota:1,updated_at:new Date().toISOString()});
    if(result.error)throw new Error('CONSENT_UNAVAILABLE');
    return res.json({success:true,data:{subscribed:true}});
  }catch{return res.status(503).json({success:false,error:'通知授权未保存，请重试；请保持电话畅通'});}
});
router.get('/desk',authMiddleware,shopContext,async(req,res)=>{
  const staff=req.employee!;
  if(!['ceo','shop_manager','customer_service'].includes(staff.role))return res.status(403).json({success:false,error:'无权查看门店通知待办'});
  const result=await supabase.from('queue_notification_outbox').select('id,booking_id,event_type,status,channel,reason,created_at,finished_at').eq('shop_id',staff.shopId).gte('created_at',new Date(Date.now()-86400000).toISOString()).order('id',{ascending:false}).limit(200);
  if(result.error)return res.status(503).json({success:false,error:'通知待办不可用，请电话核实未确认顾客'});
  res.setHeader('Cache-Control','no-store');return res.json({success:true,data:result.data});
});
// A trusted scheduler invokes this endpoint. Secret is never exposed to a browser or mini-program.
router.post('/dispatch',async(req,res)=>{
  const expected=process.env.QUEUE_DISPATCH_SECRET||'',provided=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(expected.length<32||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return res.status(401).json({success:false,error:'Unauthorized'});
  try{return res.json({success:true,data:{processed:await dispatchQueueNotifications(5)}});}
  catch{return res.status(503).json({success:false,error:'通知任务未完成，请查看电话待办及发送状态'});}
});
export default router;
