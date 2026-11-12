import type { Request, Response } from 'express';
import { supabase } from '../db/index.js';
import { describeQueue, queueOrder, QUEUE_RULES, type QueueRow } from '../../shared/lib/liveQueue.js';
const allowed=['ceo','shop_manager','customer_service','stylist'];
const eventMessages:Record<string,string>={ready:'请准备返回门店，即将轮到您。',called:'已正式叫号，请在10分钟内到服务位；收到后请点“我已看到”。',missed:'叫号宽限已结束，前台已确认过号。返回后请联系前台补位。',returned:'前台已确认您返回，排队顺序已更新。',service_started:'发型师已开始为您服务。',service_finished:'本次服务已结束。',progress_updated:'前序服务进度已更新，请查看最新等待范围。',reordered:'前台按现场情况调整了顺序，如有疑问请联系门店。'};
async function readQueue(shopId:string,date:string) {
 const start=new Date(date+'T00:00:00+08:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(start.getTime())||new Date(start.getTime()+8*3600000).toISOString().slice(0,10)!==date)throw new Error('INVALID_DATE');
 const [a,h,s,staff]=await Promise.all([
 supabase.from('bookings').select('*').eq('shop_id',shopId).gte('scheduled_time',start.toISOString()).lt('scheduled_time',new Date(+start+86400000).toISOString()).order('scheduled_time').limit(500),
 supabase.from('bookings').select('id,shop_id,customer_id,status,scheduled_time,stylist_id,service_id,actual_start_time,actual_end_time').eq('shop_id',shopId).not('actual_end_time','is',null).gte('actual_end_time',new Date(Date.now()-90*86400000).toISOString()).order('actual_end_time',{ascending:false}).limit(1000),
 supabase.from('shops').select('phone').eq('id',shopId).maybeSingle(),
 supabase.from('employees').select('id,name,queue_pause_until,queue_availability_version').eq('shop_id',shopId).eq('is_active',true).in('role',['stylist','shop_manager'])]);
 if(a.error||h.error||s.error||staff.error)throw new Error('QUEUE_READ_FAILED');
 if((a.data||[]).length===500)throw new Error('QUEUE_CAPACITY');
 return {rows:(a.data||[]) as QueueRow[],history:(h.data||[]) as QueueRow[],phone:s.data?.phone||'',availability:(staff.data||[]).map(e=>({id:e.id,name:e.name,pausedUntil:e.queue_pause_until,version:e.queue_availability_version||0}))};
}
async function readEvents(ids:string[],shopId:string){
 if(!ids.length)return [];
 const r=await supabase.from('booking_queue_events').select('id,booking_id,event_type,occurred_at,note').eq('shop_id',shopId).in('booking_id',ids).order('id',{ascending:false}).limit(2000);
 if(r.error)throw new Error('QUEUE_EVENTS_FAILED'); return r.data||[];
}
const fail=(res:Response,e:unknown)=>{console.error('[live-queue]',e instanceof Error?e.message:'failed');return res.status(503).json({success:false,error:'排队同步暂不可用，请联系前台；页面旧数据不能代表当前顺序'});};
export async function customerQueueSnapshot(req:Request,res:Response){
 try {
 const shopId=req.customer?.shopId||req.employee?.shopId;
 const lookup=await supabase.from('bookings').select('*').eq('id',req.params.id).eq('shop_id',shopId).maybeSingle();
 if(lookup.error)throw new Error('QUEUE_READ_FAILED');const b=lookup.data as QueueRow|null;
 if(!b||req.customer&&b.customer_id!==req.customer.id)return res.status(404).json({success:false,error:'预约不存在'});
 const date=new Date(Date.parse(b.scheduled_time)+8*3600000).toISOString().slice(0,10);
 const {rows,history,phone,availability}=await readQueue(b.shop_id,date);const current=rows.find(q=>q.id===b.id)||b;
 const events=await readEvents([b.id],b.shop_id);const last=Number(events[0]?.id||0);
 res.setHeader('Cache-Control','no-store');res.json({success:true,data:{serverTime:new Date().toISOString(),rules:QUEUE_RULES,booking:describeQueue(current,rows,history,Date.now(),availability.find(e=>e.id===b.stylist_id)?.pausedUntil),contactPhone:phone,latestEventId:last,
 notices:events.filter(e=>eventMessages[e.event_type]).slice(0,10).map(e=>({id:e.id,type:e.event_type,at:e.occurred_at,message:eventMessages[e.event_type],acknowledged:Number(e.id)<=Number(current.queue_ack_event_id||0)}))}});
 }catch(e){return fail(res,e);}
}
export async function staffQueueSnapshot(req:Request,res:Response){
 const staff=req.employee!;if(!allowed.includes(staff.role)||req.params.shopId!==staff.shopId)return res.status(403).json({success:false,error:'无权访问此门店排队'});
 try{
 const date=String(req.query.date||new Date(Date.now()+8*3600000).toISOString().slice(0,10));
 const {rows,history,availability}=await readQueue(staff.shopId,date);const visible=rows.filter(b=>staff.role!=='stylist'||b.stylist_id===staff.id).sort(queueOrder);

 res.setHeader('Cache-Control','no-store');res.json({success:true,data:{serverTime:new Date().toISOString(),rules:QUEUE_RULES,availability:availability.filter(e=>staff.role!=='stylist'||e.id===staff.id),bookings:visible.map(b=>{

 return {...describeQueue(b,rows,history,Date.now(),availability.find(e=>e.id===b.stylist_id)?.pausedUntil),customerName:b.customer_name||'顾客',customerPhone:b.customer_phone||'',stylistId:b.stylist_id,latestEventId:Number(b.queue_version||0),
 unacknowledged:b.queue_state==='called'&&Number(b.queue_call_event_id||0)>Number(b.queue_ack_event_id||0),needsHelp:!!b.queue_help_requested_at&&(!b.queue_contacted_at||Date.parse(b.queue_help_requested_at)>Date.parse(b.queue_contacted_at))};})}});
 }catch(e){return fail(res,e);}
}
export async function liveQueueAction(req:Request,res:Response){
 const staff=req.employee; const customer=req.customer;
 if(!staff&&!customer)return res.status(401).json({success:false,error:'请先登录'});
 const {action,version,minutes,note}=req.body||{};
 if(typeof action!=='string'||!Number.isInteger(version)||version<0||(minutes!=null&&(!Number.isInteger(minutes)||minutes<5||minutes>180))||(note!=null&&(typeof note!=='string'||note.length>300)))return res.status(400).json({success:false,error:'排队操作参数无效'});
 if(staff&&!allowed.includes(staff.role))return res.status(403).json({success:false,error:'无权操作排队'});
 try{
 const {data,error}=await supabase.rpc('live_queue_action',{p_booking_id:req.params.id,p_shop_id:staff?.shopId||customer!.shopId,p_actor_id:staff?.id||customer!.id,p_actor_type:staff?'staff':'customer',p_action:action,p_version:version,p_minutes:minutes??null,p_note:note??null});
 if(error){const code=error.message;const messages:Record<string,string>={QUEUE_HELP_PENDING:'已有待处理协助请求，请保持电话畅通，紧急时可直接致电门店',QUEUE_STALE_VERSION:'现场状态已变化，已为您刷新，请核对后重新操作',QUEUE_FORBIDDEN:'无权执行此操作',QUEUE_STYLIST_PAUSED:'这位发型师暂停接客，请先确认恢复接客',QUEUE_STYLIST_BUSY:'这位发型师仍在服务，先结束当前服务',QUEUE_ORDER_REASON_REQUIRED:'前方还有等候顾客，调整顺序需填写至少4字原因',QUEUE_CLOSED:'仅能操作今天有效的排队记录',QUEUE_STATE_CONFLICT:'当前状态不允许该操作，请刷新核对',QUEUE_NOT_FOUND:'预约不存在'};const key=Object.keys(messages).find(k=>code.includes(k));return res.status(key==='QUEUE_FORBIDDEN'?403:key?409:503).json({success:false,code:key||'QUEUE_UNAVAILABLE',error:key?messages[key]:'排队操作暂不可用，请联系前台'});}
 res.setHeader('Cache-Control','no-store');return res.json({success:true,data});
 }catch(e){return fail(res,e);}
}

export async function staffQueueAvailability(req:Request,res:Response){
 const staff=req.employee!;
 if(req.params.shopId!==staff.shopId||!allowed.includes(staff.role))return res.status(403).json({success:false,error:'无权更改其他门店状态'});
 const {stylistId,version,minutes}=req.body||{};
 if(typeof stylistId!=='string'||!Number.isInteger(version)||version<0||!Number.isInteger(minutes)||minutes!==0&&(minutes<5||minutes>180))return res.status(400).json({success:false,error:'暂停时间或版本无效'});
 try{const {error}=await supabase.rpc('live_queue_availability',{p_shop_id:staff.shopId,p_actor_id:staff.id,p_stylist_id:stylistId,p_version:version,p_minutes:minutes});
 if(error)return res.status(error.message.includes('FORBIDDEN')?403:409).json({success:false,error:'状态已变化或无权操作，请刷新后核对'});
 return res.json({success:true,data:{recorded:true}});
 }catch(e){return fail(res,e);}
}
