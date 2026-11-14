import {useCallback,useEffect,useRef,useState} from 'react';
import {bookingApi} from '../../api';
type Data=Awaited<ReturnType<typeof bookingApi.attendanceDesk>>;
export default function AttendanceDesk({canReverse,onChanged}:{canReverse:boolean;onChanged:()=>void}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const flight=useRef(false);
 const load=useCallback(async()=>{try{setData(await bookingApi.attendanceDesk());setError('');}catch(e){setData(null);setError(e instanceof Error?e.message:'读取失败');}},[]);
 useEffect(()=>{if(!open)return;void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer);},[open,load]);
 const act=async(id:string,action:'no_show'|'reverse')=>{
  if(flight.current)return;
  const reason=window.prompt(action==='no_show'?'请先电话核实；门店延误、协商改期及已到店不得计爽约。填写联系时间、结果和原因（至少5字）：':'填写纠正原因（至少5字）；会立即重新计算预约限制，不会自动恢复已取消预约：');
  if(!reason)return;if(reason.trim().length<5){setError('请完整填写核实情况，至少5字');return;}
  flight.current=true;setBusy(true);
  try{await bookingApi.attendance(id,action,reason.trim());await load();onChanged();}catch(e){setError(e instanceof Error?e.message:'操作未确认，请刷新核对');}finally{flight.current=false;setBusy(false);}
 };
 return <section className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-4"><button className="font-bold py-3 px-4 bg-orange-200 rounded-xl" onClick={()=>setOpen(!open)}>到店核实 / 爽约管理 {open?'收起':'展开'}</button>
 {open&&<div className="space-y-3 mt-3"><p className="text-sm">提前2小时取消不处罚，临时取消单独记录。近90天第2次爽约限制14天仅约当天，第3次起暂停自助预约30天；只限制预约，不影响会员、余额及售后。</p><button onClick={()=>void load()} className="border rounded-lg p-2">刷新列表</button>{error&&<p role="alert" className="text-red-700">{error}</p>}{data?.truncated&&<p>列表达到100条，仅显示最近记录，请及时处理。</p>}
 <h3 className="font-bold">待联系核实（近7天，到店开始时间已超过60分钟）</h3>{data?.due.map(b=><div key={b.id} className="rounded-xl bg-white p-3 flex flex-wrap gap-3 items-center"><span>{b.customer_name} · {b.service_name} · {new Date(b.scheduled_time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</span>{b.customer_phone&&<a className="p-3 rounded-lg bg-orange-100" href={'tel:'+b.customer_phone}>电话核实</a>}<button disabled={busy} onClick={()=>void act(b.id,'no_show')} className="p-3 rounded-lg border font-bold disabled:opacity-40">确认未到店</button></div>)}{data&&!data.due.length&&<p>暂无待核实预约</p>}
 <h3 className="font-bold">最近90天确认记录</h3>{data?.decisions.map(d=><div key={d.id} className="rounded-xl bg-white p-3"><span>{d.booking_id} · {d.reason} · {d.reversed_at?'已纠正':'已确认爽约'}</span>{canReverse&&!d.reversed_at&&<button disabled={busy} className="ml-3 p-3 border rounded-lg" onClick={()=>void act(d.booking_id,'reverse')}>纠正误判</button>}</div>)}</div>}
 </section>;
}
