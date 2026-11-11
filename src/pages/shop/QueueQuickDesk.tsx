import { useCallback, useEffect, useState } from 'react';
import { Clock3, RefreshCw, Check, LogOut, Megaphone, Scissors, Flag, Pencil } from 'lucide-react';
import { bookingApi } from '../../api';
import { useAppStore } from '../../store';
import type { Booking } from '../../../shared/types';
import ShopLayout from './ShopLayout';

type QueueEvent = {id:number;event_type:string;occurred_at:string;recorded_at:string;actor_id:string;note?:string;related_event_id?:number};
const actions = [
  {type:'arrived',label:'到店',icon:Check,states:[null]},
  {type:'left_reported',label:'暂时离店',icon:LogOut,states:['arrived','returned']},
  {type:'returned',label:'返回',icon:Check,states:['away','missed']},
  {type:'called',label:'叫号',icon:Megaphone,states:['arrived','returned']},
  {type:'service_started',label:'开始服务',icon:Scissors,states:['arrived','returned','called']},
  {type:'service_finished',label:'结束计时',icon:Flag,states:['serving']},
] as const;
const labels: Record<string,string> = {arrived:'到店',left_reported:'暂时离店',returned:'返回',called:'叫号',missed:'过号',service_started:'开始服务',service_finished:'完成服务',correction:'更正'};
const states: Record<string,string> = {arrived:'已到店',away:'暂时离店',returned:'已返回',called:'已叫号',missed:'已过号',serving:'服务中',finished:'已完成'};
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const displayTime = (value: Date | string | undefined) => value ? new Date(value).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}) : '--:--';
const localInput = (value: string) => {
  const parts = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  return parts.replace(' ','T');
};

export default function QueueQuickDesk() {
  const shopId=useAppStore(s=>s.currentShop?.id);
  const role=useAppStore(s=>s.currentEmployee?.role);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [events,setEvents]=useState<QueueEvent[]>([]);
  const [editing,setEditing]=useState<number|null>(null);
  const [editedTime,setEditedTime]=useState('');
  const [search,setSearch]=useState('');
  const canCorrect=role==='ceo'||role==='shop_manager';
  const refresh=useCallback(async()=>{
    if(!shopId)return;
    try {setBookings(await bookingApi.getBookingsByShop(shopId,today()));setError('');}
    catch(e){setError(e instanceof Error?e.message:'预约加载失败');}
  },[shopId]);
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);return()=>window.clearInterval(timer);},[refresh]);
  const openHistory=async(id:string)=>{
    if(selected===id){setSelected(null);return;}
    setSelected(id);setEditing(null);
    try{setEvents(await bookingApi.getQueueEvents(id));}catch(e){setError(e instanceof Error?e.message:'记录加载失败');}
  };
  const act=async(id:string,type:string)=>{
    if(busy)return;
    setBusy(id+type);
    try{await bookingApi.recordQueueEvent(id,type);await refresh();if(selected===id)setEvents(await bookingApi.getQueueEvents(id));}
    catch(e){setError(e instanceof Error?e.message:'操作失败，请刷新核对');}
    finally{setBusy(null);}
  };
  const correct=async(id:string,eventId:number)=>{
    if(!editedTime||busy)return;
    setBusy(id+'correct');
    try{
      // Explicit China offset avoids interpreting a manager's browser timezone as shop time.
      await bookingApi.correctQueueEvent(id,eventId,new Date(editedTime+':00+08:00').toISOString());
      setEvents(await bookingApi.getQueueEvents(id));await refresh();setEditing(null);
    }catch(e){setError(e instanceof Error?e.message:'更正失败');}
    finally{setBusy(null);}
  };
  const list=bookings.filter(b=>['confirmed','completed'].includes(b.status) && (b.customerName||'').includes(search));
  return <ShopLayout title="前台快记">
    <div className="max-w-5xl mx-auto px-3 py-5 space-y-4">
      <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-semibold text-gray-900">今日到店快记</h1><p className="text-sm text-gray-500">{today()} · 北京时间 · 结束计时不改变结算状态</p></div><button type="button" onClick={()=>void refresh()} title="刷新预约" className="p-3 border rounded-md"><RefreshCw size={20}/></button></div>
      <input aria-label="搜索顾客" placeholder="搜索顾客姓名" value={search} onChange={e=>setSearch(e.target.value)} className="w-full border rounded-md px-4 py-3"/>
      {error&&<div role="alert" className="bg-red-50 text-red-700 p-3 rounded-md">{error}</div>}
      {list.length===0&&<p className="text-gray-500 py-8">今天暂无已确认预约</p>}
      {list.map(b=><div key={b.id} className="border bg-white rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-lg">{b.customerName||'顾客'}</strong><span className="ml-3 text-gray-600">{b.serviceName} · {b.stylistName||'待分配'}</span></div><div className="flex items-center gap-2 text-sm"><Clock3 size={16}/>{displayTime(b.scheduledTime)} 预约 <span className="font-semibold text-orange-700">{states[b.queueState||'']||'待到店'}</span></div></div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{actions.filter(a=>role!=='stylist'||a.type==='service_started'||a.type==='service_finished').map(a=><button type="button" key={a.type} disabled={busy!==null||!a.states.some(s=>s===(b.queueState||null))||(b.status==='completed'&&a.type!=='service_finished')} onClick={()=>void act(b.id,a.type)} className="min-h-16 flex items-center justify-center gap-2 bg-orange-600 text-white font-semibold rounded-md disabled:bg-gray-100 disabled:text-gray-400"><a.icon size={21}/>{a.label}</button>)}</div>
        {b.queueState==='called'&&<div className="text-sm text-gray-600">宽限至 {displayTime(b.graceDeadlineAt)}；过号需工作人员核实顾客未在场后操作。 <button type="button" disabled={busy!==null||!b.graceDeadlineAt||Date.now()<new Date(b.graceDeadlineAt).getTime()} onClick={()=>void act(b.id,'missed')} className="underline text-orange-700 disabled:text-gray-400">记录过号</button></div>}
        {role!=='stylist'&&<button type="button" className="text-sm text-blue-700 underline" onClick={()=>void openHistory(b.id)}>{selected===b.id?'收起记录':'查看记录 / 更正时间'}</button>}
        {selected===b.id&&<div className="border-t pt-3 space-y-2">{events.length===0&&<span className="text-sm text-gray-500">暂无记录</span>}{events.map(e=><div key={e.id} className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-20">{labels[e.event_type]||e.event_type}</span><strong>{displayTime(e.occurred_at)}</strong><span className="text-gray-500">录入 {displayTime(e.recorded_at)}</span>{e.event_type==='correction'&&<span className="text-gray-500">更正 #{e.related_event_id}</span>}{canCorrect&&['arrived','left_reported','returned','called','missed','service_started','service_finished'].includes(e.event_type)&&<button type="button" title="更正事件时间" onClick={()=>{setEditing(e.id);setEditedTime(localInput(e.occurred_at));}} className="p-2 text-blue-700"><Pencil size={16}/></button>}{editing===e.id&&<div className="flex gap-2 items-center flex-wrap"><input aria-label="更正北京时间" type="datetime-local" value={editedTime} onChange={v=>setEditedTime(v.target.value)} className="border p-2 rounded-md"/><button type="button" disabled={busy!==null} onClick={()=>void correct(b.id,e.id)} className="bg-blue-700 text-white px-3 py-2 rounded-md">保存更正</button></div>}</div>)}</div>}
      </div>)}
    </div>
  </ShopLayout>;
}
