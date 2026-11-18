import {Router} from 'express';
import {supabase} from '../db/index.js';
import {authMiddleware} from '../middleware/index.js';
import {summarizeCommissions,type CommissionEntry} from '../../shared/lib/commission.js';
const router=Router();
router.use(authMiddleware);
router.get('/',async(req,res)=>{
 try {
  const actor=req.employee!;const management=['ceo','shop_manager'].includes(actor.role);
  const page=Number(req.query.page || 1);if(!Number.isSafeInteger(page)||page<1)return res.status(400).json({success:false,error:'分页无效'});
  const entries:CommissionEntry[]=[];
  for(let offset=0;;offset+=500){
   let query=supabase.from('commission_entries').select('*').eq('shop_id',actor.shopId).order('id').range(offset,offset+499);
   if(!management)query=query.eq('employee_id',actor.id);
   const result=await query;if(result.error)throw result.error;
   entries.push(...result.data as CommissionEntry[]);if(result.data.length<500)break;
  }
  const [sources,employees]=management?await Promise.all([
   supabase.from('commission_sources').select('*',{count:'exact'}).eq('shop_id',actor.shopId).is('reviewed_at',null).order('occurred_at',{ascending:false}).order('id').range((page-1)*50,page*50-1),
   supabase.from('employees').select('id,name,role,title,is_gold_stylist,is_active').eq('shop_id',actor.shopId),
  ]):[{data:[],count:0,error:null},{data:[{id:actor.id,name:actor.name,is_active:true}],error:null}];
  if(sources.error||employees.error)throw new Error('incomplete');
  return res.json({success:true,data:{entries,summary:summarizeCommissions(entries),sources:sources.data,employees:employees.data,page,total:sources.count,canConfirm:actor.role==='ceo',generatedAt:new Date().toISOString()}});
 }catch{return res.status(503).json({success:false,error:'提成记录读取失败，请核对060迁移；读取失败不代表没有提成'});}
});
router.post(['/confirm','/refund-receipt'],async(req,res)=>{
 if(req.employee!.role!=='ceo')return res.status(403).json({success:false,error:'仅CEO可最终确认计提基数及服务利润转移金额'});
 const b=req.body;
 if(!b||!['income','gift','redemption','transfer','refund'].includes(b.kind)||typeof b.amount!=='number'||!Number.isFinite(b.amount)||b.amount<0||b.amount>1000000||Math.abs(Math.round(b.amount*100)-b.amount*100)>0.000001||typeof b.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(b.requestId)||typeof b.reason!=='string'||b.reason.trim().length<4||b.reason.length>500||typeof b.sourceId!=='string'||typeof b.employeeId!=='string')return res.status(400).json({success:false,error:'请选择原始凭据、归属员工、准确金额，并填写至少4字确认原因'});
 const request={kind:b.kind,amount:b.amount,requestId:b.requestId,sourceId:b.sourceId,employeeId:b.employeeId,referenceId:typeof b.referenceId==='string'?b.referenceId:null,reason:b.reason.trim()};
 const manual=req.path==='/refund-receipt';
 if(manual && (b.kind!=='refund'||typeof b.receiptRef!=='string'||b.receiptRef.trim().length<4||typeof b.receiptAt!=='string'||!Number.isFinite(Date.parse(b.receiptAt)))) return res.status(400).json({success:false,error:'请提供真实退款凭据号和退款时间'});
 let result;
 try {
  result=await supabase.rpc(manual?'commission_record_manual_refund':'commission_record',{p_shop:req.employee!.shopId,p_actor:req.employee!.id,p_request:manual?{...request,receiptRef:b.receiptRef.trim(),receiptAt:b.receiptAt}:request});
 } catch {
  return res.status(503).json({success:false,error:'记录结果暂未确认，请用同一内容重试并核对台账，勿重复录入'});
 }
 if(result.error)return res.status(409).json({success:false,error:'记录未确认：凭据已核对、原始计提或金额不匹配，请刷新核对；未执行打款或扣款'});
 return res.json({success:true,data:result.data});
});
export default router;
