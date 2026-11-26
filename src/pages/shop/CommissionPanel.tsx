import {useEffect,useState,useRef} from 'react';
import {getAuthToken} from '../../api';
import {apiFetch,getApiBase} from '../../../shared/api-base';
import type {CommissionEntry} from '../../../shared/lib/commission';
type Source={id:string;kind:string;source_record_id:string;occurred_at:string;payload:{customer_id?:string;customer_name?:string;name?:string;total?:number;amount?:number;price?:number;settlement_id?:string}};
const kindLabels:Record<string,string>={settlements:'服务结算',stored_value_transactions:'储值充值',customer_packages:'次卡销售',refund_requests:'服务退款',manual_refund_receipts:'人工核实退款',income:'销售计提',redemption:'核销不重复计提',gift:'店铺补贴',transfer_in:'利润转入',transfer_out:'利润转出',refund:'退款冲减',correction:'退款转移冲正'};
type Data={entries:CommissionEntry[];sources:Source[];employees:Array<{id:string;name:string;is_active:boolean}>;summary:Array<{employeeId:string;period:string;base:number;rate:number;transfers:number;commission:number}>;canConfirm:boolean;total:number;page:number};
async function request<T>(path:string,body?:object):Promise<T>{
 const res=await apiFetch(getApiBase()+'/commissions'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getAuthToken()},body:body?JSON.stringify(body):undefined});
 const result=await res.json();if(!res.ok||!result.success)throw new Error(result.error||'提成读取失败');return result.data;
}
export default function CommissionPanel(){
 const [open,setOpen]=useState(false),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1),[loading,setLoading]=useState(false);
 const [source,setSource]=useState<Source|null>(null),[kind,setKind]=useState('income'),[employee,setEmployee]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[reference,setReference]=useState(''),[saving,setSaving]=useState(false);
 const [receipt,setReceipt]=useState(''),[receiptAt,setReceiptAt]=useState('');
 const sequence=useRef(0),inFlight=useRef(false),intent=useRef({signature:'',key:''});
 async function load(){const id=++sequence.current;setLoading(true);setError('');try{const value=await request<Data>('?page='+page);if(id===sequence.current)setData(value);}catch(err){if(id===sequence.current)setError((err as Error).message);}finally{if(id===sequence.current)setLoading(false);}}
 useEffect(()=>{if(open)void load();return()=>{sequence.current++;};},[open,page]); // eslint-disable-line react-hooks/exhaustive-deps
 async function confirm(){
  if(!source||inFlight.current)return;
  const n=Number(amount);if(!amount.trim()||!Number.isFinite(n)||n<0||reason.trim().length<4){setError('请填写准确金额和至少4字的确认原因');return;}
  const manual=source.kind==='manual_refund_receipts';
  if(manual&&(!receiptAt||receipt.trim().length<4)){setError('请填写真实退款凭据号和退款时间');return;}
  const fields={sourceId:source.id,kind,employeeId:employee,amount:n,reason,referenceId:reference||null,...(manual?{receiptRef:receipt.trim(),receiptAt:new Date(receiptAt).toISOString()}:{})};const signature=JSON.stringify(fields);
  const intentKey='mbs_commission_intent:'+getApiBase();
  try{const stored=JSON.parse(localStorage.getItem(intentKey)||'{}');if(stored.signature===signature)intent.current=stored;}catch{/* discard corrupt local intent */}
  if(intent.current.signature!==signature)intent.current={signature,key:crypto.randomUUID()};
  try{localStorage.setItem(intentKey,JSON.stringify(intent.current));}catch{setError('请开启本地存储后重试，避免重复提交');return;}
  if(!window.confirm(`确认记录${source.source_record_id}，金额¥${n.toFixed(2)}？仅记录提成，不执行转账。`))return;
  inFlight.current=true;setSaving(true);setError('');
  try{await request(manual?'/refund-receipt':'/confirm',{...fields,requestId:intent.current.key});localStorage.removeItem(intentKey);setSource(null);await load();}catch(err){setError((err as Error).message);}finally{inFlight.current=false;setSaving(false);}
 }
 const names=new Map(data?.employees.map(e=>[e.id,e.name]));
 return <section className="bg-white rounded-2xl border border-orange-200 p-5 space-y-4">
  <button type="button" onClick={()=>setOpen(v=>!v)} className="px-5 py-3 bg-orange-100 text-orange-950 font-bold rounded-xl">员工提成台账 · {open?'收起':'展开核对'}</button>
  {open&&<>
   <p className="text-sm text-gray-600">整月套档、每月独立计算。充值销售计提，券/卡核销不重复计提；换人服务利润转移和赠券补贴由CEO确认。这里只记录，不发工资、不打款。</p>
   <p className="text-sm text-gray-500">退款追溯原计提月份，当前记录时间保留；历史已发金额的线下差额请按记录核对。不得把本月流水总额直接当成工资。</p>
   {error&&<p role="alert" className="text-red-700 bg-red-50 p-3 rounded-xl">{error}</p>}
   <button type="button" onClick={()=>void load()} className="border rounded-xl px-4 py-2">{loading?'同步中…':'刷新记录'}</button>
   {data&&<>
    <div className="overflow-auto max-h-80"><table className="w-full text-sm"><thead><tr>{['员工','归属月份','确认基数','整月比例','利润转移','记录提成'].map(v=><th key={v} className="p-2 text-left">{v}</th>)}</tr></thead><tbody>{data.summary.map(row=><tr key={row.employeeId+row.period}><td className="p-2">{names.get(row.employeeId)||row.employeeId}</td><td>{row.period}</td><td>¥{row.base.toFixed(2)}</td><td>{(row.rate*100).toFixed(0)}%</td><td>¥{row.transfers.toFixed(2)}</td><td>¥{row.commission.toFixed(2)}</td></tr>)}</tbody></table>{!data.summary.length&&<p>尚无人工确认的计提记录。</p>}</div>
    {data.canConfirm&&<button type="button" className="border border-orange-300 px-4 py-2 rounded-lg font-bold" onClick={()=>{setSource({id:'manual',kind:'manual_refund_receipts',source_record_id:'充值 / 卡券 / 服务退款凭据',occurred_at:'',payload:{}});setKind('refund');setEmployee('');setReference('');setAmount('');setReason('');setReceipt('');setReceiptAt('');}}>登记已完成的充值 / 卡券退款</button>}
    <h3 className="font-bold">待确认凭据（{data.total}）</h3>
    <div className="max-h-80 overflow-y-auto space-y-2">{data.sources.map(row=><div key={row.id} className="p-3 bg-orange-50 rounded-xl flex flex-wrap gap-3 items-center justify-between"><div><strong>{row.payload.customer_name||row.payload.name||'顾客凭据'}</strong><p className="text-xs break-all">{kindLabels[row.kind]||'经营凭据'} · {row.source_record_id} · {new Date(row.occurred_at).toLocaleString()}</p></div>{data.canConfirm&&<button type="button" className="bg-orange-200 px-4 py-2 rounded-lg font-bold" onClick={()=>{setSource(row);setKind(row.kind==='refund_requests'?'refund':'income');setAmount(String(row.payload.total??row.payload.amount??row.payload.price??''));setEmployee('');setReference('');setReason('');}}>核对并确认</button>}</div>)}</div>
    <div className="flex gap-4"><button disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}>上一页</button><span>第{page}页</span><button disabled={page*50>=data.total||loading} onClick={()=>setPage(p=>p+1)}>下一页</button></div>
    {source&&<div className="p-4 border-2 border-orange-300 rounded-xl space-y-3">
     <h4 className="font-bold">确认凭据：{source.source_record_id}</h4><p className="text-sm">最终金额可由CEO人工调整。充值/次卡销售记销售员工；已售券卡同人核销选择“不重复计提”；换人服务选择“利润转移”；免费赠券选择“店铺补贴”。同一笔资金不得在充值和卡销售两张凭据重复计提。</p>
     <select disabled={source.kind==='manual_refund_receipts'} aria-label="计提方式" value={kind} onChange={e=>{setKind(e.target.value);if(e.target.value==='redemption')setAmount('0');}} className="border p-2 rounded-lg"><option value="income">实收 / 充值 / 卡券销售计提</option><option value="redemption">券卡核销不重复计提（0元）</option><option value="gift">免费赠券服务 · 店铺补贴</option><option value="transfer">换人服务 · 利润转移</option><option value="refund">退款 · 冲减原计提</option></select>
     <select aria-label="归属员工" value={employee} onChange={e=>setEmployee(e.target.value)} className="border p-2 rounded-lg"><option value="">选择归属 / 实际服务员工</option>{data.employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.is_active?'':'（已停用）'}</option>)}</select>
     {(kind==='transfer'||kind==='refund')&&<select aria-label="原计提记录" value={reference} onChange={e=>{setReference(e.target.value);if(kind==='refund')setEmployee(data.entries.find(row=>row.id===e.target.value)?.employee_id||'');}} className="border p-2 rounded-lg max-w-full"><option value="">选择该顾客的原销售计提</option>{data.entries.filter(e=>['income','gift'].includes(e.kind)).map(e=><option key={e.id} value={e.id}>{e.id} · {names.get(e.employee_id)} · ¥{e.base_amount} · {e.period}</option>)}</select>}
     <label className="block">{kind==='transfer'?'双方转移的提成金额（元）':'人工确认计提基数 / 退款基数（元）'}<input aria-label="确认金额" type="number" min="0" step="0.01" value={amount} disabled={kind==='redemption'} onChange={e=>setAmount(e.target.value)} className="border p-2 rounded-lg ml-2" /></label>
     {source.kind==='manual_refund_receipts'&&<div className="flex flex-wrap gap-3"><input aria-label="退款凭据号" value={receipt} onChange={e=>setReceipt(e.target.value)} placeholder="真实退款凭据号" className="border p-2 rounded-lg"/><label>实际退款时间<input aria-label="实际退款时间" type="datetime-local" value={receiptAt} onChange={e=>setReceiptAt(e.target.value)} className="border p-2 rounded-lg"/></label></div>}
     <textarea aria-label="确认原因" value={reason} onChange={e=>setReason(e.target.value)} placeholder="填写凭据核对、改价或补贴原因（至少4字）" className="border p-3 rounded-lg w-full" />
     <button disabled={saving||!employee} onClick={()=>void confirm()} className="px-5 py-3 bg-orange-500 text-white font-bold rounded-xl disabled:opacity-50">{saving?'记录中…':'CEO确认记录'}</button><button disabled={saving} onClick={()=>setSource(null)} className="px-5 py-3 ml-2 border rounded-xl">取消</button>
    </div>}
    <details><summary>查看已确认记录与退款、转移痕迹（{data.entries.length}条）</summary><div className="max-h-80 overflow-auto text-xs space-y-2">{[...data.entries].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(e=><p key={e.id}>{e.created_at} · {names.get(e.employee_id)} · {kindLabels[e.kind]||'记录'} · 基数 {e.base_amount} / 转移 {e.transfer_amount} · 原因：{e.reason} · 记录号：{e.id}</p>)}</div></details>
   </>}
  </>}
 </section>;
}
