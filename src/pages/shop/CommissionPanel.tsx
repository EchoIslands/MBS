import {useEffect,useRef,useState} from 'react';
import {getApiBase,http} from '../../../shared/api-base';
import {getAuthToken} from '../../api';
import {useAppStore} from '../../store';
type Employee={id:string;name:string;commission_rate:number|null;is_active:boolean};
type Line={id:string;employee_id:string|null;settlement_id:string;base_amount:number;commission_rate:number|null;commission_amount:number;adjustment_amount:number;status:string;updated_at:string};
type Audit={id:string;kind:string;target_id:string;actor_id:string;reason:string;created_at:string;after_value:Record<string,unknown>};
type Data={employees:Employee[];ledger:Line[];audit:Audit[];truncated:boolean;generatedAt:string};
const labels:Record<string,string>={pending:'待配置比例',review:'实收待核对',accrued:'已计提',adjusted:'已调整',reversed:'已退款冲正'};
const money=(v:unknown)=>Number(v||0).toFixed(2);
export default function CommissionPanel(){
 const {currentEmployee,currentShop}=useAppStore();
 const [open,setOpen]=useState(false),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [choice,setChoice]=useState(''),[rate,setRate]=useState(''),[base,setBase]=useState(''),[amount,setAmount]=useState(''),[employee,setEmployee]=useState(''),[reason,setReason]=useState('');
 const retry=useRef<{signature:string;id:string}|null>(null);
 const allowed=!!currentEmployee&&['ceo','shop_manager'].includes(currentEmployee.role);
 useEffect(()=>{if(!open||!allowed)return;let active=true;setData(null);setError('');
 http<{data:Data}>(getApiBase()+'/commissions',{headers:{Authorization:'Bearer '+getAuthToken()}}).then(r=>{if(active&&r)setData(r.data);}).catch(e=>{if(active)setError(e.message);});
 return()=>{active=false;};},[open,allowed,revision,currentEmployee?.id,currentShop?.id]);
 if(!allowed)return null;
 const selected=data?.ledger.find(l=>l.id===choice);
 const reset=(value:string)=>{setChoice(value);setReason('');setRate('');setBase('');setAmount('');setEmployee('');retry.current=null;};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(busy||!data)return;
 let payload:Record<string,unknown>;
 if(choice.startsWith('rate:')){const emp=data.employees.find(x=>x.id===choice.slice(5));if(!emp)return;payload={action:'rate',target:emp.id,rate:Number(rate)/100,expectedRate:emp.commission_rate,reason};}
 else {if(!selected)return;payload={action:['pending','review'].includes(selected.status)?'review':'adjust',target:selected.id,expectedUpdatedAt:selected.updated_at,reason,
 ...(['pending','review'].includes(selected.status)?{base:Number(base),rate:Number(rate)/100,employeeId:employee||selected.employee_id}:{amount:Number(amount)})};}
 const signature=JSON.stringify(payload);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()};
 setBusy(true);setError('');try{await http(getApiBase()+'/commissions/operation',{method:'POST',headers:{Authorization:'Bearer '+getAuthToken()},body:JSON.stringify({...payload,requestId:retry.current.id})});reset('');setRevision(v=>v+1);}catch(e){setError(e instanceof Error?e.message:'操作未确认，请核对');}finally{setBusy(false);}
 };
 return <section className="my-5 rounded-2xl border border-orange-200 bg-orange-50 p-4">
 <button type="button" onClick={()=>setOpen(v=>!v)} className="rounded-xl bg-orange-100 px-5 py-3 font-bold text-orange-950">员工提成与审核 {open?'收起':'展开'}</button>
 {open&&<div className="mt-4 space-y-4">
 <p className="text-sm">仅服务实收计提，商品不计。未配置比例、优惠无法准确归属或员工未指定时需人工核对。历史单据不自动补算；提成不代表工资已发放。</p>
 <button disabled={busy} className="rounded-lg border bg-white p-2" onClick={()=>{reset('');setRevision(v=>v+1);}}>刷新核对</button>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 {!data&&!error&&<p>正在读取提成记录…</p>}
 {data&&<>
 <p className="text-sm">数据截止 {new Date(data.generatedAt).toLocaleString('zh-CN')}；本页有效计提 ¥{money(data.ledger.reduce((sum,l)=>sum+(['accrued','adjusted'].includes(l.status)?Number(l.commission_amount)+Number(l.adjustment_amount):0),0))}。{data.truncated&&'列表已截取，以上不是全店总额；请缩小业务范围或联系管理员导出。'}</p>
 <div className="flex flex-wrap gap-2">{data.employees.map(emp=><button key={emp.id} disabled={busy} onClick={()=>reset('rate:'+emp.id)} className="rounded-xl border bg-white p-3">{emp.name} · {emp.commission_rate===null?'未设置':(Number(emp.commission_rate)*100).toFixed(2)+'%'} · 设置比例</button>)}</div>
 <div className="max-h-96 space-y-2 overflow-y-auto">{data.ledger.length===0&&<p>暂无新提成流水</p>}{data.ledger.map(l=><div key={l.id} className="rounded-xl border bg-white p-3">
 <p className="break-all">{data.employees.find(e=>e.id===l.employee_id)?.name||'待指定员工'} · {labels[l.status]} · 原结算 {l.settlement_id}</p>
 <p>服务基数 ¥{money(l.base_amount)}；{['pending','review'].includes(l.status)?'金额待核对':l.status==='reversed'?'退款冲正后 ¥0.00':'有效提成 ¥'+money(Number(l.commission_amount)+Number(l.adjustment_amount))}</p>
 {l.status!=='reversed'&&<button disabled={busy} onClick={()=>reset(l.id)} className="mt-2 rounded-lg bg-orange-100 px-4 py-2 font-bold">{['pending','review'].includes(l.status)?'核对并计提':'调整金额'}</button>}
 </div>)}</div>
 {choice&&<form onSubmit={submit} className="space-y-3 rounded-xl border-2 border-orange-300 bg-white p-4">
 <p className="break-all font-bold">{choice.startsWith('rate:')?'配置员工比例，仅影响后续新单':selected?.settlement_id+' · '+(selected&&['pending','review'].includes(selected.status)?'核对服务实收':'调整最终提成')}</p>
 {(choice.startsWith('rate:')||selected&&['pending','review'].includes(selected.status))&&<label className="block">提成比例 % <input required type="number" min="0" max="100" step="0.001" value={rate} onChange={e=>setRate(e.target.value)} className="rounded border p-2"/></label>}
 {selected&&['pending','review'].includes(selected.status)&&<><label className="block">本员工服务实收 ¥ <input required type="number" min="0" max={selected.base_amount} step="0.01" value={base} onChange={e=>setBase(e.target.value)} className="rounded border p-2"/></label><label className="block">归属员工 <select required value={employee||selected.employee_id||''} onChange={e=>setEmployee(e.target.value)} className="rounded border p-2"><option value="">请选择</option>{data.employees.map(emp=><option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></label></>}
 {selected&&['accrued','adjusted'].includes(selected.status)&&<label className="block">调整后最终提成 ¥ <input required type="number" min="0" max={selected.base_amount} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="rounded border p-2"/></label>}
 <label className="block">核对原因 <input required minLength={4} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} className="w-full rounded border p-2"/></label>
 <button disabled={busy} className="rounded-xl bg-orange-200 p-3 font-bold">{busy?'正在保存…':'确认保存并记录审计'}</button><button type="button" disabled={busy} onClick={()=>reset('')} className="ml-3 p-3">取消</button>
 </form>}
 <details><summary className="cursor-pointer font-bold">最近配置、审核、调整与退款记录</summary>{data.audit.map(a=><p key={a.id} className="my-2 break-all rounded border bg-white p-2 text-sm">{new Date(a.created_at).toLocaleString('zh-CN')} · {a.kind} · {data.employees.find(e=>e.id===a.actor_id)?.name||a.actor_id} · {a.reason} · {a.target_id}{a.kind==='refund'?' · 冲正 ¥'+money(a.after_value.reversalAmount):''}</p>)}</details>
 </>}
 </div>}
 </section>;
}
