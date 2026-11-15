import {Router} from 'express';
import {supabase} from '../db/index.js';
import {authMiddleware} from '../middleware/index.js';
const router=Router();
router.use(authMiddleware);
router.use((req,res,next)=>['ceo','shop_manager'].includes(req.employee!.role)?next():res.status(403).json({success:false,error:'仅店长及负责人可管理提成'}));
router.get('/',async(req,res)=>{
 try{
 const shop=req.employee!.shopId;
 const [employees,ledger,audit]=await Promise.all([
 supabase.from('employees').select('id,name,is_active,commission_rate').eq('shop_id',shop).order('id').limit(1000),
 supabase.from('stylist_commission_ledger').select('*').eq('shop_id',shop).order('created_at',{ascending:false}).order('id').limit(501),
 supabase.from('commission_audit').select('*').eq('shop_id',shop).order('created_at',{ascending:false}).limit(101)]);
 if(employees.error||ledger.error||audit.error)throw new Error();
 return res.json({success:true,data:{employees:employees.data,ledger:ledger.data.slice(0,500),audit:audit.data.slice(0,100),truncated:ledger.data.length>500||audit.data.length>100||employees.data.length>=1000,generatedAt:new Date().toISOString()}});
 }catch{return res.status(503).json({success:false,error:'提成数据暂不可用，请核对056迁移；不能将读取失败当成零提成'});}
});
router.post('/operation',async(req,res)=>{
 try{
 const b=req.body;
 if(!b||!['rate','review','adjust'].includes(b.action)||typeof b.target!=='string'||typeof b.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(b.requestId)||typeof b.reason!=='string'||b.reason.trim().length<4||b.reason.length>300)return res.status(400).json({success:false,error:'请选择操作并填写至少4字核对原因'});
 const request:Record<string,unknown>={action:b.action,target:b.target,requestId:b.requestId,reason:b.reason.trim()};
 if(b.action==='rate')Object.assign(request,{rate:b.rate,expectedRate:b.expectedRate});
 else Object.assign(request,{expectedUpdatedAt:b.expectedUpdatedAt},b.action==='review'?{base:b.base,rate:b.rate,employeeId:b.employeeId}:{amount:b.amount});
 const result=await supabase.rpc('commission_operation',{p_shop:req.employee!.shopId,p_actor:req.employee!.id,p_request:request});
 if(result.error)return res.status(409).json({success:false,error:'提成操作未确认：数据已变化、原单已退款或输入不符合规则。请刷新核对，不会覆盖已有记录'});
 return res.json({success:true,data:result.data});
 }catch{return res.status(503).json({success:false,error:'提成操作结果未确认，请刷新核对后再操作'});}
});
export default router;
