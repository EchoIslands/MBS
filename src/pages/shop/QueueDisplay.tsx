import {useCallback} from 'react';
import {Link} from 'react-router-dom';
import {liveQueueApi} from '../../api';
import {useAppStore} from '../../store';
import {useLiveQueue} from '../../hooks/useLiveQueue';
import type {LiveQueueDesk} from '../../../shared/lib/liveQueue';

/** Authenticated, read-only wall display. Controls remain in the employee workbench. */
export default function QueueDisplay(){
 const shop=useAppStore(s=>s.currentShop);
 const loader=useCallback(()=>liveQueueApi.desk(shop?.id||''),[shop?.id]);
 const {data,error,stale,lastSync,refresh}=useLiveQueue<LiveQueueDesk>(loader,!!shop?.id);
 return <main className="min-h-screen bg-orange-50 p-6 text-gray-900 md:p-10">
 <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-4xl font-bold">{shop?.name} · 服务动态</h1><p className="mt-3 text-xl">到店请先由前台确认排队 · 等待时间以现场动态为准</p></div><div className="flex gap-3"><button className="rounded-xl border bg-white p-4" onClick={()=>void document.documentElement.requestFullscreen().catch(()=>{})}>全屏显示</button><Link className="rounded-xl border bg-white p-4" to="/shop/queue-desk">员工操作台</Link></div></header>
 <div role="status" className={`mb-6 rounded-xl p-4 text-xl ${stale?'bg-red-100 text-red-800':'bg-white'}`}>{stale?'同步中断或尚未完成，旧状态不代表现场，请咨询前台':'每5秒同步'} · 最近同步 {lastSync?new Date(lastSync).toLocaleTimeString('zh-CN'):'尚未同步'} <button className="ml-4 underline" onClick={()=>void refresh(true)}>刷新</button>{error&&<p>{error}</p>}</div>
 <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{data?.availability.map(a=>{
 const lane=data.bookings.filter(b=>b.stylistId===a.id),current=lane.find(b=>b.state==='serving'),called=lane.find(b=>b.state==='called');
 const waiting=lane.filter(b=>['arrived','returned','called'].includes(b.state));
 const paused=!!a.pausedUntil&&Date.parse(a.pausedUntil)>Date.now();
 return <article key={a.id} className="rounded-3xl border border-orange-200 bg-white p-7"><h2 className="text-3xl font-bold">{a.name}</h2><p className="my-5 rounded-2xl bg-orange-100 p-5 text-3xl font-bold">{stale?'状态待核实':current?'服务中':paused?'暂停接客':'可接待'}</p>{!stale&&<><p className="text-xl">{current?`当前服务：${current.serviceName}`:paused?'稍后恢复接待':'欢迎到店咨询'}</p>{called&&<p className="my-4 text-2xl font-bold text-orange-800">请 {called.queueNumber?`排队号 ${called.queueNumber}`:'已叫号顾客'} 到位</p>}<p className="mt-4 text-2xl">现场等候 {waiting.length} 位</p>{current&&<p className="mt-3 text-lg text-gray-600">{current.progressStale?'进度待更新，请咨询工作人员':current.progressRemainingMinutes!=null?`上次更新预计剩余 ${current.progressRemainingMinutes} 分钟`:'服务结束时间待更新'}</p>}</>}</article>;
 })}</section>
 {!data&&<p className="p-10 text-center text-2xl">正在读取门店服务状态…</p>}
 <footer className="mt-8 text-xl text-gray-600">发型师可在手机网页登录后进入员工操作台，直接开始服务、结束服务、更新进度或暂停接客。</footer>
 </main>;
}
