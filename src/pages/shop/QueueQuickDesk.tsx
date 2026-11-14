import { useCallback, useEffect, useRef, useState } from 'react';
import { liveQueueApi, bookingApi } from '../../api';
import { useAppStore } from '../../store';
import { useLiveQueue } from '../../hooks/useLiveQueue';
import type { LiveQueueDesk } from '../../../shared/lib/liveQueue';
import ShopLayout from './ShopLayout';
type Item=LiveQueueDesk['bookings'][number];
type Event={id:number;event_type:string;occurred_at:string;note?:string;actor_type?:string;related_event_id?:number};
const fmt=(v?:string)=>v?new Date(v).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}):'—';
const labels:Record<string,string>={arrived:'到店确认',left_reported:'登记暂离',returned:'确认返回',return_requested:'顾客报返回',ready:'准备返回提醒',called:'正式叫号',missed:'前台确认过号',service_started:'开始服务',service_finished:'结束服务计时',progress_updated:'更新剩余时间',help_requested:'顾客请求协助',contact_attempted:'前台联系处理',reordered:'手动调整顺序',acknowledged:'顾客确认收到',correction:'更正时间'};
export default function QueueQuickDesk(){
 const shopId=useAppStore(s=>s.currentShop?.id)||'';const role=useAppStore(s=>s.currentEmployee?.role);
 const loader=useCallback(()=>liveQueueApi.desk(shopId),[shopId]);const {data,error,lastSync,stale,refresh}=useLiveQueue<LiveQueueDesk>(loader,!!shopId);
 const [busy,setBusy]=useState(''),[message,setMessage]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('active'),[stylist,setStylist]=useState('all');
 const [history,setHistory]=useState<{id:string;events:Event[]}|null>(null),[sound,setSound]=useState(false);
 const acting=useRef(false),audio=useRef<AudioContext|null>(null),lastAttention=useRef('');
 const manager=role==='ceo'||role==='shop_manager',front=role!=='stylist';
 const list=data?.bookings||[];
 const attention=list.filter(b=>b.returnRequestedAt||b.needsHelp||b.unacknowledged||b.overWait||b.notification?.status==='phone');
 useEffect(()=>{const signature=attention.map(b=>b.id+':'+b.latestEventId).join('|');if(signature&&signature!==lastAttention.current&&sound&&audio.current){try{const c=audio.current;void c.resume();const o=c.createOscillator(),g=c.createGain();o.connect(g);g.gain.value=.1;o.frequency.value=550;o.start();o.stop(c.currentTime+.3);}catch{/* 音频未获授权时保留视觉提示。 */}}lastAttention.current=signature;},[attention,sound]);
 useEffect(()=>()=>{void audio.current?.close();},[]);
 const act=async(b:Item,action:string,minutes?:number,note?:string)=>{
 if(stale||acting.current)return;
 if(action==='reordered'||action==='service_started'&&(b.aheadCount||0)>0){note=window.prompt('前方仍有顾客：填写调整/优先安排的原因（至少4字，记录可追溯）')||'';if(note.trim().length<4)return;}
 acting.current=true;setBusy(b.id);setMessage('');
 try{await liveQueueApi.act(b.id,action,b.version,minutes,note,true);setMessage(`${b.customerName} · ${labels[action]||action}已记录`);}
 catch(e){setMessage(e instanceof Error?e.message:'操作未确认，请刷新核对，避免重复提交');}
 finally{await refresh(true);acting.current=false;setBusy('');}
 };
 const showHistory=async(b:Item)=>{try{setHistory({id:b.id,events:await bookingApi.getQueueEvents(b.id) as Event[]});}catch(e){setMessage(e instanceof Error?e.message:'读取失败');}};
 const correct=async(event:Event)=>{if(!history||!manager||acting.current)return;const input=window.prompt('更正北京时间，例如 2026-11-12 14:30；仅支持当天最新事件',new Date(event.occurred_at).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,16));if(!input)return;const t=new Date(input.replace(' ','T')+':00+08:00');if(!Number.isFinite(+t)){setMessage('时间格式无效');return;}
 acting.current=true;setBusy(history.id);try{await bookingApi.correctQueueEvent(history.id,event.id,t.toISOString());setHistory({id:history.id,events:await bookingApi.getQueueEvents(history.id) as Event[]});await refresh(true);}catch(e){setMessage(e instanceof Error?e.message:'更正失败');}finally{acting.current=false;setBusy('');}};
 const availability=async(id:string,version:number,minutes:number)=>{if(stale||acting.current)return;acting.current=true;setBusy(id);try{await liveQueueApi.availability(shopId,id,version,minutes);}catch(e){setMessage(e instanceof Error?e.message:'更新失败');}finally{await refresh(true);acting.current=false;setBusy('');}};
 const active=(b:Item)=>!['finished','cancelled','completed'].includes(b.state);
 const filtered=list.filter(b=>(filter==='all'||filter==='attention'?(filter==='all'||attention.includes(b)):active(b))&&(stylist==='all'||b.stylistId===stylist)&&`${b.customerName} ${b.customerPhone} ${b.stylistName}`.includes(search));
 const button=(b:Item,action:string,title:string,minutes?:number,primary=false)=><button key={action+title} disabled={stale||!!busy||(['called','service_started'].includes(action)&&!!data?.availability.some(a=>a.id===b.stylistId&&a.pausedUntil&&Date.parse(a.pausedUntil)>Date.now()))} onClick={()=>void act(b,action,minutes)} className={`min-h-14 rounded-xl px-3 py-3 text-base font-bold border disabled:opacity-40 ${primary?'bg-orange-200 border-orange-300 text-gray-900':'bg-white border-orange-200 text-gray-800'}`}>{title}</button>;
 return <ShopLayout title="实时排队工作台"><main className="max-w-6xl mx-auto p-4 space-y-4 bg-orange-50/40">
 <header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">今日排队工作台</h1><p className="text-sm text-gray-500">到店确认后进入队列 · 结束服务计时与收银结算分开</p></div><div className="flex gap-2"><button className="border rounded-xl p-3 bg-white" onClick={()=>{try{audio.current ||= new AudioContext();void audio.current.resume();setSound(true);}catch{setMessage('浏览器不支持提示音，请关注待处理提示');}}}>{sound?'页面提示音已开启':'开启提示音'}</button><button onClick={()=>void refresh(true)} className="rounded-xl p-3 bg-orange-200 font-bold">立即刷新</button></div></header>
 <div role="status" className={`rounded-xl p-3 ${stale?'bg-red-50 text-red-700':'bg-white text-gray-600'}`}>{stale?'同步异常/尚未完成：操作暂停，请核对现场':'每5秒自动同步'} · 上次成功 {lastSync?new Date(lastSync).toLocaleTimeString('zh-CN'):'尚未同步'}</div>
 <section className="grid gap-3 md:grid-cols-2" aria-label="发型师当前服务和下一位">
 {(data?.availability||[]).filter(e=>stylist==='all'||e.id===stylist).map(e=>{
  const lane=list.filter(b=>b.stylistId===e.id),current=lane.find(b=>b.state==='serving'),called=lane.find(b=>b.state==='called'),next=lane.find(b=>['arrived','returned'].includes(b.state));
  return <div key={e.id} className="rounded-2xl border border-orange-200 bg-white p-4 space-y-3"><h2 className="text-lg font-bold">{e.name} · 服务台</h2>
   {current?<><p>正在服务：{current.customerName} · {current.serviceName}</p><div className="grid grid-cols-2 gap-2">{button(current,'progress_updated','还需10分钟',10)}{button(current,'service_finished','结束当前服务',undefined,true)}</div></>:called?<><p>已叫号：{called.customerName} · 等待到位</p>{button(called,'service_started','顾客已到位，开始服务',undefined,true)}</>:next?<><p>下一位：{next.customerName} · {next.serviceName}</p><div className="grid grid-cols-2 gap-2">{button(next,'called','叫下一位',undefined,true)}{button(next,'service_started','已到位，开始服务',undefined,true)}</div></>:<p className="text-gray-500">暂无已到店的等候顾客</p>}
   {current&&next&&<p className="text-sm text-gray-600">下一位：{next.customerName}；结束当前服务后可直接叫号。</p>}
  </div>;
 })}</section>
 {(error||message)&&<div role="alert" className="border rounded-xl bg-white p-4">{error||message}</div>}
 <section className="bg-white border border-orange-100 rounded-xl p-4 space-y-3"><h2 className="font-bold">发型师接客状态</h2><div className="flex flex-wrap gap-3">{data?.availability.map(a=><div key={a.id} className="border rounded-xl p-3"><strong>{a.name}</strong><p className="text-sm text-gray-500">{a.pausedUntil&&Date.parse(a.pausedUntil)>Date.now()?`暂停至 ${fmt(a.pausedUntil)}`:'正常接客'}</p><div className="flex gap-2 mt-2"><button disabled={stale||!!busy} onClick={()=>void availability(a.id,a.version,20)} className="bg-orange-100 rounded-lg p-3 disabled:opacity-40">暂停20分钟</button><button disabled={stale||!!busy} onClick={()=>void availability(a.id,a.version,0)} className="border rounded-lg p-3 disabled:opacity-40">恢复接客</button></div></div>)}</div></section>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[['待到店',list.filter(b=>b.state==='reserved').length],['现场等候',list.filter(b=>['arrived','returned','called'].includes(b.state)).length],['服务中',list.filter(b=>b.state==='serving').length],['需关注',attention.length]].map(([label,n])=><div key={label} className="bg-white border border-orange-100 p-4 rounded-xl"><p className="text-sm text-gray-500">{label}</p><strong className="text-2xl">{n}</strong></div>)}</div>
 {attention.length>0&&<div role="alert" className="bg-amber-50 border border-amber-300 p-4 rounded-xl"><strong>待跟进 {attention.length} 位</strong><p className="text-sm">顾客报返回、请求协助、叫号未确认或等待较久，请直接处理下面卡片。</p><button onClick={()=>setFilter('attention')} className="mt-2 bg-orange-200 rounded-lg px-4 py-3 font-bold">只看待处理</button></div>}
 <div className="flex flex-wrap gap-3"><input aria-label="搜索顾客或发型师" placeholder="姓名 / 电话 / 发型师" value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 min-w-44 border rounded-xl p-3"/><select aria-label="队列筛选" value={filter} onChange={e=>setFilter(e.target.value)} className="border rounded-xl p-3"><option value="active">正在排队</option><option value="attention">需要处理</option><option value="all">全部记录</option></select><select aria-label="发型师筛选" value={stylist} onChange={e=>setStylist(e.target.value)} className="border rounded-xl p-3"><option value="all">全部发型师</option>{Array.from(new Map(list.map(b=>[b.stylistId||'',b.stylistName])).entries()).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>
 {filtered.length===0&&<div className="bg-white p-8 text-center rounded-xl text-gray-500">当前筛选没有排队记录</div>}
 {filtered.map(b=><section key={b.id} className={`bg-white border rounded-2xl p-4 space-y-3 ${b.returnRequestedAt||b.needsHelp?'border-amber-400':'border-orange-100'}`}>
 <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">{b.customerName} <span className="text-sm font-normal text-gray-500">{b.queueNumber?`#${b.queueNumber}`:''}</span></h2><p className="text-sm text-gray-600">{b.serviceName} · {b.stylistName} · 到店时段 {b.timeSlot}</p></div><strong className="rounded-lg bg-orange-50 p-2">{b.stateLabel}</strong></div>
 {front&&b.notification&&<p className={b.notification.status==='phone'?'rounded-xl bg-red-50 p-3 font-bold text-red-800':'text-sm text-gray-600'}>通知：{b.notification.status==='pending'?'等待发送':b.notification.status==='sending'?'正在发送':b.notification.reason}{b.notification.channel==='wechat'?' · 微信':b.notification.channel==='sms'?' · 短信':''}{b.unacknowledged?' · 顾客尚未确认，请电话核实':''}</p>}
 <p className="text-sm text-gray-600">{b.estimateLabel} {b.aheadCount!==null&&` · 前方${b.aheadCount}位 · 已等待${b.waitMinutes}分钟`}</p>
 {b.returnRequestedAt&&<p className="text-amber-800 font-bold">顾客已报返回：请核对本人在店，一键确认返回。</p>}
 {b.needsHelp&&<p className="text-amber-800 font-bold">顾客请求协助：请沟通进度、换人或改约，处理后点“已联系/已沟通”。</p>}
 {b.overWait&&<p className="text-amber-800">已等待超过45分钟，请主动说明情况。</p>}
 {b.state==='called'&&<p className="font-bold">保留至 {fmt(b.graceDeadlineAt)} · {b.unacknowledged?'顾客尚未确认收到，请电话联系':'顾客已确认收到'}（收到不等于已经到场）</p>}
 {b.expectedReturnAt&&<p>预计返回 {fmt(b.expectedReturnAt)}</p>}
 {b.progressStale&&<p className="text-amber-800 font-bold">服务进度已超过15分钟未更新，请点下方剩余时间，避免顾客误判。</p>}
 {b.state==='serving'&&<p className="text-sm">上次进度：{fmt(b.progressUpdatedAt)}，当时预计还需 {b.progressRemainingMinutes??'待更新'} 分钟</p>}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
 {front&&b.state==='reserved'&&button(b,'arrived','确认已到店',undefined,true)}
 {front&&b.canLeave&&<>{button(b,'left_reported','暂离10分钟',10)}{button(b,'left_reported','暂离20分钟',20)}</>}
 {front&&['away','missed'].includes(b.state)&&button(b,'returned','确认本人已返回',undefined,true)}
 {['arrived','returned','away'].includes(b.state)&&<>{!b.readyAt&&button(b,'ready','提醒准备返回')}{button(b,'called','正式叫号',undefined,true)}</>}
 {['arrived','returned','called'].includes(b.state)&&button(b,'service_started','开始服务',undefined,true)}
 {b.state==='serving'&&<>{button(b,'progress_updated','还需约10分钟',10)}{button(b,'progress_updated','还需约20分钟',20)}{button(b,'progress_updated','还需约30分钟',30)}{button(b,'service_finished','结束服务计时',undefined,true)}</>}
 {front&&b.state==='called'&&b.graceDeadlineAt&&Date.now()>=Date.parse(b.graceDeadlineAt)&&button(b,'missed','确认未到场，记过号')}
 {active(b)&&b.customerPhone&&<a href={`tel:${b.customerPhone}`} className="min-h-14 border rounded-xl p-3 text-center font-bold">直接拨打电话</a>}
 {active(b)&&button(b,'contact_attempted','已联系 / 已沟通')}
 {front&&['arrived','returned'].includes(b.state)&&button(b,'reordered','调整为优先安排')}
 </div>
 {front&&<button onClick={()=>void showHistory(b)} className="text-sm underline p-2 text-gray-600">查看操作记录{manager?' / 更正时间':''}</button>}
 </section>)}
 <details className="bg-white border rounded-xl p-4 text-sm leading-7"><summary className="font-bold cursor-pointer">排队规则与通知边界</summary><p>{data?.rules.text}</p><p>叫号必须由顾客确认；未确认时应电话联系。暂离不会占用空闲服务位。缺少发型师的预约请先在预约管理中分配。页面关闭或设备休眠后，提示音不能代替电话通知。</p></details>
 {history&&<div className="fixed inset-0 bg-black/40 z-50 p-4 flex justify-center items-center"><div className="bg-white rounded-2xl p-5 max-w-xl w-full max-h-[85vh] overflow-y-auto"><div className="flex justify-between"><h2 className="font-bold text-xl">排队操作记录</h2><button className="p-3 border rounded-lg" onClick={()=>setHistory(null)}>关闭</button></div>{history.events.map(e=><div key={e.id} className="border-b py-3 text-sm"><strong>{labels[e.event_type]||e.event_type}</strong> · {fmt(e.occurred_at)}<p>{e.note}</p>{manager&&['arrived','left_reported','returned','called','missed','service_started','service_finished'].includes(e.event_type)&&<button disabled={!!busy} onClick={()=>void correct(e)} className="underline p-2">更正时间</button>}</div>)}</div></div>}
 </main></ShopLayout>;
}
