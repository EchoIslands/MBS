import type {Request,Response} from 'express';
import {supabase} from '../db/index.js';
import {startsDuringOpening} from '../../shared/lib/bookingHours.js';

export function bookingFailure(message:string):string {
 const errors:Record<string,string>={BOOKING_DATE_RANGE:'请选择未来14天内的到店时间',BOOKING_ACTIVE_LIMIT:'最多保留2个未完成预约，请先修改或取消已有预约',BOOKING_DAILY_LIMIT:'同一天只能保留一个预约，需要增加服务请联系门店',BOOKING_RATE_LIMIT:'操作过于频繁，请稍后再试',BOOKING_SUSPENDED:'多次确认爽约，已暂停自助预约30天，请联系门店',BOOKING_TODAY_ONLY:'近期多次爽约，暂时仅可预约当天',BOOKING_CAPACITY:'该到店时段已满，请选择其他时间',BOOKING_SLOT_TAKEN:'该发型师档期已满，请换一个时间',BOOKING_ALREADY_STARTED:'服务已开始或已结束，无法自行修改',BOOKING_CONTACT_DESK:'您已进入现场队列，请联系前台改期',BOOKING_NOT_NO_SHOW:'仅可确认超过到店时段且尚未签到的预约；门店延误不计爽约',BOOKING_REASON_REQUIRED:'请填写至少5字的联系核实情况或纠正原因',BOOKING_REQUEST_CONFLICT:'该提交已处理且内容不同，请刷新核对已有预约'};
 return Object.entries(errors).find(([key])=>message.includes(key))?.[1]||'预约操作未确认，请刷新核对后重试';
}
export async function changeOwnBooking(req:Request,res:Response){
 try{
  if(!req.customer||req.customer.id!==req.body?.customerId)return res.status(403).json({success:false,error:'请使用顾客本人账号操作'});
  const action=req.path.endsWith('/cancel')?'cancel':'reschedule';
  let time:Date|null=null;
  if(action==='reschedule'){
   const raw=req.body?.scheduledTime;
   if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(raw))return res.status(400).json({success:false,error:'预约时间格式无效'});
   const day=raw.slice(0,10),calendar=new Date(day+'T00:00:00Z');if(!Number.isFinite(+calendar)||calendar.toISOString().slice(0,10)!==day)return res.status(400).json({success:false,error:'预约日期无效'});
   time=new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)?raw:raw+'+08:00');
   const shop=await supabase.from('shops').select('opening_hours,is_active').eq('id',req.customer.shopId).maybeSingle();
   if(shop.error||!shop.data)return res.status(503).json({success:false,error:'门店信息暂不可用'});
   if(!Number.isFinite(+time)||shop.data.is_active===false||!startsDuringOpening(time,shop.data.opening_hours))return res.status(400).json({success:false,error:'请选择门店营业时间内的到店时间'});
  }
  const result=await supabase.rpc('change_own_booking',{p_id:req.params.id,p_customer:req.customer.id,p_action:action,p_time:time?.toISOString()||null});
  if(result.error)return res.status(409).json({success:false,error:bookingFailure(result.error.message)});
  // Same public shape as the existing booking detail endpoint, without importing its router.
  const b=result.data;const mapped=Object.fromEntries(Object.entries(b).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),v]));
  return res.json({success:true,data:mapped});
 }catch{return res.status(503).json({success:false,error:'预约操作未确认，请刷新核对后重试'});}
}
export async function attendanceDesk(req:Request,res:Response){
 const staff=req.employee!;
 if(!['ceo','shop_manager','customer_service'].includes(staff.role))return res.status(403).json({success:false,error:'仅店长、客服可处理到店核实'});
 try{
  if(req.method==='POST'){
   const result=await supabase.rpc('decide_booking_attendance',{p_id:req.params.id,p_actor:staff.id,p_action:req.body?.action,p_reason:req.body?.reason});
   if(result.error)return res.status(409).json({success:false,error:bookingFailure(result.error.message)});
   return res.json({success:true,data:true});
  }
  const [due,decisions]=await Promise.all([
   supabase.from('bookings').select('id,customer_name,customer_phone,service_name,scheduled_time').eq('shop_id',staff.shopId).eq('status','confirmed').or('delay_state.is.null,delay_state.eq.rescheduled,delay_state.eq.reassigned').is('arrived_at',null).is('queue_state',null).is('actual_start_time',null).lt('scheduled_time',new Date(Date.now()-3600000).toISOString()).gte('scheduled_time',new Date(Date.now()-7*86400000).toISOString()).order('scheduled_time',{ascending:false}).limit(100),
   supabase.from('booking_attendance_decisions').select('id,booking_id,reason,created_at,reversed_at').eq('shop_id',staff.shopId).gte('created_at',new Date(Date.now()-90*86400000).toISOString()).order('created_at',{ascending:false}).limit(100),
  ]);
  if(due.error||decisions.error)return res.status(503).json({success:false,error:'到店核实列表暂不可用'});
  return res.json({success:true,data:{due:due.data,decisions:decisions.data,truncated:due.data.length===100||decisions.data.length===100}});
 }catch{return res.status(503).json({success:false,error:'到店核实暂不可用'});}
}
