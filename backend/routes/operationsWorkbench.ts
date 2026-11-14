import { Router } from 'express';
import { supabase } from '../db/index.js';
import { authMiddleware } from '../middleware/index.js';
import { shopContext } from '../middleware/resourceAccess.js';
import { refreshOrder, type Order } from './customerMembership.js';
const router=Router();
router.use(authMiddleware,shopContext);
router.use((req,res,next)=>['ceo','shop_manager'].includes(req.employee!.role)?next():res.status(403).json({success:false,error:'仅店长及负责人可访问运营核对台'}));
router.get('/',async(req,res)=>{
 try{
  const shop=req.employee!.shopId,since=new Date(Date.now()-30*86400000).toISOString();
  const results=await Promise.all([
   supabase.from('membership_payment_orders').select('id,customer_id,kind,level,amount,status,created_at,paid_at').eq('shop_id',shop).in('status',['pending','review']).order('created_at').limit(500),
   supabase.from('settlements').select('id,customer_id,total,payment_status,payment_method,created_at').eq('shop_id',shop).eq('payment_status','pending').order('created_at').limit(500),
   supabase.from('refund_requests').select('id,customer_id,status,amount,created_at').eq('shop_id',shop).in('status',['pending','approved']).order('created_at').limit(500),
   supabase.from('product_order_refunds').select('id,order_id,status,amount,created_at').eq('shop_id',shop).eq('status','pending').order('created_at').limit(500),
   supabase.from('bookings').select('id,status,queue_state,arrived_at,actual_start_time,actual_end_time,missed_count,stylist_id,service_id').eq('shop_id',shop).gte('scheduled_time',since).limit(1000),
   supabase.from('membership_operation_audit').select('operation,created_at').eq('shop_id',shop).gte('created_at',since).limit(1000),
   supabase.from('queue_notification_outbox').select('status,created_at,finished_at').eq('shop_id',shop).gte('created_at',since).limit(1000),
  ]);
  if(results.some(r=>r.error))throw new Error('WORKBENCH_UNAVAILABLE');
  const memberships=results[0].data||[],settlements=results[1].data||[],refunds=results[2].data||[],productRefunds=results[3].data||[],bookings=results[4].data||[],operations=results[5].data||[],notifications=results[6].data||[];
  const waits=bookings.filter(b=>b.arrived_at&&b.actual_start_time).map(b=>(Date.parse(b.actual_start_time)-Date.parse(b.arrived_at))/60000).filter(n=>n>=0&&n<=1440).sort((a,b)=>a-b);
  const percentile=(q:number)=>waits.length?Math.round(waits[Math.ceil((waits.length-1)*q)]):null;
  res.setHeader('Cache-Control','no-store');return res.json({success:true,data:{serverTime:new Date().toISOString(),memberships,settlements,refunds,productRefunds,
   truncated:results.some((r,i)=>(r.data?.length||0)>=(i<4?500:1000)),
   metrics:{periodDays:30,bookings:bookings.length,waitSamples:waits.length,waitMedian:percentile(.5),waitP90:percentile(.9),
    missedBookings:bookings.filter(b=>Number(b.missed_count)>0).length,
    waitingCancelled:bookings.filter(b=>b.arrived_at&&b.status==='cancelled'&&!b.actual_start_time).length,
    renewalOperations:operations.filter(o=>o.operation?.membershipAction==='renew').length,
    phoneFallbacks:notifications.filter(n=>n.status==='phone').length,
    pendingNotifications:notifications.filter(n=>['pending','sending'].includes(n.status)).length}}});
 }catch{return res.status(503).json({success:false,error:'核对台读取未完成，请检查数据库迁移；不得将部分数据视为全部结果'});}
});
router.post('/membership/:id/check',async(req,res)=>{
 try{
  const result=await supabase.from('membership_payment_orders').select('*').eq('id',req.params.id).eq('shop_id',req.employee!.shopId).maybeSingle();
  if(result.error)throw new Error('READ_FAILED');if(!result.data)return res.status(404).json({success:false,error:'订单不存在'});
  const checked=await refreshOrder(result.data as Order);
  return res.json({success:true,data:{status:checked.order.status,tradeState:checked.tradeState}});
 }catch(e){return res.status(409).json({success:false,error:e instanceof Error?e.message:'原单核对未完成，请勿重新收款'});}
});
router.get('/membership/:id/review',async(req,res)=>{
 try {
 const shop=req.employee!.shopId;
 const order=await supabase.from('membership_payment_orders').select('id,customer_id,kind,level,amount,status,operation_kind').eq('id',req.params.id).eq('shop_id',shop).maybeSingle();
 if(order.error)return res.status(503).json({success:false,error:'原单暂不可用'});
 if(!order.data||order.data.status!=='review')return res.status(409).json({success:false,error:'原单已处理或不在待核对状态，请刷新'});
 const customer=await supabase.from('customers').select('purchase_vip_level,purchase_vip_expires_at,stored_value_level,stored_value_expires_at,stored_value_balance').eq('id',order.data.customer_id).eq('shop_id',shop).single();
 if(customer.error)return res.status(503).json({success:false,error:'会员快照暂不可用'});
 return res.json({success:true,data:{order:order.data,expected:customer.data}});
 } catch { return res.status(503).json({success:false,error:'会员原单读取未完成'}); }
});
router.post('/membership/:id/resolve',async(req,res)=>{
 try {
 const b=req.body;
 if(!b||!['apply','refund'].includes(b.decision)||typeof b.reason!=='string'||b.reason.trim().length<4||b.reason.length>300||!b.expected||typeof b.expected!=='object'||Array.isArray(b.expected))return res.status(400).json({success:false,error:'请核对会员快照并填写至少4字处理原因'});
 if(b.decision==='refund'&&(typeof b.refundRef!=='string'||b.refundRef.trim().length<6||b.refundRef.length>100||typeof b.refundAmount!=='number'||!Number.isFinite(b.refundAmount)||b.refundAmount<=0||typeof b.refundAt!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(b.refundAt)||!Number.isFinite(Date.parse(b.refundAt))))return res.status(400).json({success:false,error:'请填写实际全额退款编号、金额及带时区的退款时间'});
 const request={decision:b.decision,reason:b.reason.trim(),expected:b.expected,...b.decision==='refund'?{refundRef:b.refundRef.trim(),refundAmount:b.refundAmount,refundAt:b.refundAt}:{}};
 const result=await supabase.rpc('resolve_membership_payment_review',{p_order_id:req.params.id,p_shop_id:req.employee!.shopId,p_actor_id:req.employee!.id,p_request:request});
 if(result.error||!result.data?.[0])return res.status(409).json({success:false,error:'处理未确认：资料可能已变化、退款凭据不符或差价订单约定冲突。请刷新核对；不会覆盖现有权益或再次收款'});
 return res.json({success:true,data:{status:result.data[0].status}});
 } catch { return res.status(503).json({success:false,error:'处理未确认，请刷新核对原单，勿重复收款'}); }
});
export default router;
