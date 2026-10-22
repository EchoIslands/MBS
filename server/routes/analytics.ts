import {Router, type Request,type Response} from 'express';
import {randomUUID} from 'node:crypto';
import {supabase} from '../../backend/db/index.js';
import {customerSession} from '../../backend/middleware/resourceAccess.js';
import {CUSTOMER_COOKIE} from '../../backend/lib/tokens.js';

const router=Router();
const allowedEvents=new Set(['page_view','service_detail_view','add_to_cart','booking_start','booking_complete']);
const text=(value:unknown,max=200)=>typeof value==='string'?value.slice(0,max):undefined;

router.post('/events/batch',(req,res,next)=>{
  // 游客可上报匿名行为；个人归属只接受服务器验证的顾客身份。
  if(req.headers.authorization || req.headers.cookie?.includes(CUSTOMER_COOKIE+'=')) return customerSession(req,res,next);
  next();
},async(req: Request,res: Response)=>{
  const {events}=req.body || {};
  if(!Array.isArray(events) || events.length<1 || events.length>50 || events.some(e=>!e || !allowedEvents.has(e.event_type))) return res.status(400).json({success:false,error:'事件类型不正确，单批允许1至50条'});
  const rows=events.map(e=>{
    const properties=Object.fromEntries(Object.entries(e.properties && typeof e.properties==='object' && !Array.isArray(e.properties)?e.properties:{}).slice(0,20)
      .filter(([key,value])=>!/password|token|secret|phone|contact|姓名|密码|手机/i.test(key) && ['string','number','boolean'].includes(typeof value) && (typeof value!=='number' || Number.isFinite(value)))
      .map(([key,value])=>[key.slice(0,50),typeof value==='string'?value.slice(0,200):value]));
    return {id:randomUUID(),event_type:e.event_type,platform:text(e.platform,20),page_path:text(String(e.page_path || '').split('?')[0]),
      customer_id:req.customer?.id || null,shop_id:req.customer?.shopId || text(e.shop_id,100),session_id:text(e.session_id,100),app_version:text(e.app_version,30),
      timestamp:Number.isFinite(Date.parse(e.timestamp))?new Date(e.timestamp).toISOString():new Date().toISOString(),properties,created_at:new Date().toISOString()};
  });
  try {
    const {error}=await supabase.from('customer_events').insert(rows);
    if(error) return res.status(503).json({success:false,error:'事件未保存，请稍后重试'});
    return res.json({success:true,count:rows.length});
  } catch {return res.status(503).json({success:false,error:'事件未保存，请稍后重试'});}
});
export default router;
