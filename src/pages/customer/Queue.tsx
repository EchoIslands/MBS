import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { liveQueueApi } from '../../api';
import { useLiveQueue } from '../../hooks/useLiveQueue';
import type { LiveQueueSnapshot } from '../../../shared/lib/liveQueue';
const fmt=(v?:string)=>v?new Date(v).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}):'—';
export default function Queue(){
 const {bookingId=''}=useParams();const navigate=useNavigate();
 const loader=useCallback(()=>liveQueueApi.snapshot(bookingId),[bookingId]);
 const {data,error,lastSync,refresh,stale}=useLiveQueue<LiveQueueSnapshot>(loader,!!bookingId);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[sound,setSound]=useState(false);
 const acting=useRef(false),lastNotice=useRef(0),audio=useRef<AudioContext|null>(null);
 const b=data?.booking;
 useEffect(()=>{if(!data)return;const latest=data.notices.find(n=>['called','ready'].includes(n.type));
 if(!latest||latest.acknowledged||latest.id<=lastNotice.current)return;lastNotice.current=latest.id;
 if(sound&&audio.current){try{const c=audio.current;void c.resume();const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);g.gain.value=.12;o.frequency.value=660;o.start();o.stop(c.currentTime+.5);}catch{/* Banner remains the primary notice. */}}
 },[data,sound]);
 useEffect(()=>()=>{void audio.current?.close();},[]);
 const act=async(action:string,minutes?:number)=>{
 if(!b||stale||acting.current)return;acting.current=true;setBusy(true);setMessage('');
 try{await liveQueueApi.act(b.id,action,b.version,minutes);setMessage(action==='return_requested'?'已提交返回信息，请到前台确认':action==='help_requested'?'协助请求已提交，请保持电话畅通':'操作已记录');}
 catch(e){setMessage(e instanceof Error?e.message:'操作未确认，请刷新核对，不要反复提交');}
 finally{await refresh(true);acting.current=false;setBusy(false);}
 };
 const enableSound=()=>{try{audio.current ||= new AudioContext();void audio.current.resume();setSound(true);}catch{setMessage('此浏览器无法播放提醒音，请关注页面与电话');}};
 return <main className="min-h-screen bg-orange-50/60 px-4 py-5 pb-12 text-gray-800"><div className="max-w-xl mx-auto space-y-4">
 <header className="flex justify-between items-center"><button onClick={()=>navigate(`/customer/shop/${b?.shopId||'shop1'}`)} className="px-3 py-3 rounded-xl border bg-white">返回首页</button><h1 className="text-xl font-bold">我的排队</h1><button onClick={()=>void refresh(true)} className="px-3 py-3 rounded-xl bg-orange-100">立即刷新</button></header>
 <div role="status" className={`rounded-xl p-3 text-sm ${stale?'bg-red-50 text-red-700':'bg-white text-gray-600'}`}>{stale?'同步中断或尚未完成，旧数据不能代表现场顺序':'页面开启时约每5秒同步'} · 上次成功 {lastSync?new Date(lastSync).toLocaleTimeString('zh-CN'):'尚未同步'}</div>
 {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status" className="bg-white border rounded-xl p-4">{message}</p>}
 {b&&<><section className="rounded-2xl border border-orange-200 bg-white p-5 space-y-4">
 <div className="text-sm text-gray-500">{b.serviceName} · {b.stylistName}</div><h2 className="text-2xl font-bold">{b.stateLabel}</h2>
 <p>预约到店：{new Date(b.scheduledTime).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})} {b.timeSlot}</p>
 <div className="bg-orange-50 rounded-xl p-4"><p className="text-sm text-gray-500">预计等待范围</p><strong className="text-2xl">{b.estimateLabel}</strong><p className="text-sm mt-2">{b.aheadCount===null?'由前台核实到店状态后加入现场队列':`前方 ${b.aheadCount} 位 · 已签到等待 ${b.waitMinutes} 分钟`}</p></div>
 {b.state==='called'&&<div role="alert" className="bg-orange-100 border-2 border-orange-300 rounded-xl p-4 font-bold">请到服务位，叫号保留至 {fmt(b.graceDeadlineAt)}。<button disabled={stale||busy} onClick={()=>void act('acknowledged')} className="w-full rounded-xl bg-orange-200 text-gray-900 p-4 mt-3 disabled:opacity-40">我已看到，正在到服务位</button></div>}
 {b.prepareReturn&&<p role="alert" className="bg-amber-50 p-3 rounded-xl">请准备返回门店。此提示是提前提醒，并非保证立即开始服务。</p>}
 {b.returnRequestedAt&&<p className="bg-amber-50 p-3 rounded-xl">已报返回，请到前台确认；确认前不自动插回现场队列。</p>}
 {b.expectedReturnAt&&<p>登记预计返回：{fmt(b.expectedReturnAt)}</p>}
 {b.overWait&&<p role="alert" className="text-orange-800">等待已超过45分钟，可一键请前台协助换人、改约或确认进度。</p>}
 <div className="grid grid-cols-2 gap-3">{b.canLeave&&<><button disabled={stale||busy} onClick={()=>void act('left_reported',10)} className="rounded-xl bg-orange-100 p-4 font-bold disabled:opacity-40">暂离10分钟</button><button disabled={stale||busy} onClick={()=>void act('left_reported',20)} className="rounded-xl bg-orange-100 p-4 font-bold disabled:opacity-40">暂离20分钟</button></>}
 {b.canReturn&&<button disabled={stale||busy} onClick={()=>void act('return_requested')} className="col-span-2 rounded-xl bg-orange-200 text-gray-900 p-4 font-bold disabled:opacity-40">我已返回，请前台确认</button>}
 {b.canAskHelp&&<button disabled={stale||busy} onClick={()=>void act('help_requested')} className="rounded-xl border border-orange-200 p-4 font-bold disabled:opacity-40">请前台协助</button>}
 {data.contactPhone&&<a href={`tel:${data.contactPhone}`} className="text-center rounded-xl border border-orange-200 p-4 font-bold">直接致电门店</a>}
 </div></section>
 <section className="bg-white rounded-2xl border p-5 space-y-3"><h2 className="font-bold">现场消息</h2>{data.notices.length?data.notices.map(n=><div key={n.id} className="border-b pb-3 text-sm"><span className="text-gray-500">{fmt(n.at)} · {n.acknowledged?'已确认':'现场更新'}</span><p>{n.message}</p></div>):<p className="text-gray-500 text-sm">暂无新的叫号消息</p>}</section>
 </>}
 <section className="bg-white rounded-2xl border p-5 text-sm leading-7 space-y-2"><h2 className="font-bold text-base">等待与过号规则</h2><p>{data?.rules.text||'到店请先到前台签到，预约时间为到店时间段。'}</p><button onClick={enableSound} className="border rounded-xl px-4 py-3">{sound?'页面提醒音已开启':'开启页面提醒音'}</button><p className="text-gray-500">离开页面、锁屏或网络中断时无法保证提醒音及时播放。不要只依赖页面叫号；请保持电话畅通，临近轮到时返回门店。</p></section>
 </div></main>;
}
