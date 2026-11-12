/** Queue estimates describe uncertainty; they never decide order or manufacture service progress. */
export type QueueRow = {
 id:string; shop_id:string; customer_id:string; customer_name?:string; customer_phone?:string;
 stylist_id?:string; stylist_name?:string; service_id?:string; service_name?:string; status:string;
 scheduled_time:string; queue_state?:string|null; queue_version?:number; queue_number?:number;
 arrived_at?:string; called_at?:string; grace_deadline_at?:string; returned_at?:string; ready_at?:string;
 expected_return_at?:string; return_requested_at?:string; queue_priority_at?:string; missed_count?:number;
 actual_start_time?:string; actual_end_time?:string; planned_duration_minutes?:number;
 progress_remaining_minutes?:number; progress_updated_at?:string; queue_ack_event_id?:number; queue_call_event_id?:number; queue_help_requested_at?:string; queue_contacted_at?:string;
};
export const QUEUE_RULES = { graceMinutes:10, pollSeconds:5, staleSeconds:20, overWaitMinutes:45,
 text:'到店由前台确认后排队；暂离请登记。叫号后保留10分钟，未到场由前台确认过号。首次过号返回后恢复原排队优先级，不打断服务；再次过号或过号超过60分钟后返回，按返回时间排队。等待时间为动态范围，不保证准点开始。' };
export const QUEUE_LABELS:Record<string,string> = {pending:'待门店确认',reserved:'待到店确认',arrived:'已到店等待',away:'暂时离店',returned:'已确认返回',called:'已叫号，请到服务位',missed:'已过号，返回后联系前台',serving:'正在服务',finished:'服务已结束',cancelled:'预约已取消',completed:'服务已完成'};
const time=(v?:string)=>v?Date.parse(v):0;
const day=(v:string)=>new Date(Date.parse(v)+8*3600000).toISOString().slice(0,10);
const waiting=(b:QueueRow)=>b.status==='confirmed'&&['arrived','returned','called'].includes(b.queue_state||'');
export const queueOrder=(a:QueueRow,b:QueueRow)=>time(a.queue_priority_at||a.arrived_at||a.scheduled_time)-time(b.queue_priority_at||b.arrived_at||b.scheduled_time)||a.id.localeCompare(b.id);
function duration(b:QueueRow,history:QueueRow[]) {
 const samples=history.filter(h=>h.stylist_id===b.stylist_id&&h.service_id===b.service_id&&h.actual_start_time&&h.actual_end_time)
 .map(h=>(time(h.actual_end_time)-time(h.actual_start_time))/60000).filter(n=>n>=5&&n<=480).sort((a,b)=>a-b);
 const base=Math.min(480,Math.max(10,Number(b.planned_duration_minutes)||30));
 if(samples.length<8)return {low:Math.round(base*.75),high:Math.ceil(base*1.5),source:'服务参考时长，历史样本不足',samples:samples.length};
 return {low:Math.floor(samples[Math.floor((samples.length-1)*.5)]),high:Math.ceil(samples[Math.ceil((samples.length-1)*.85)]),source:'该发型师同类服务历史范围',samples:samples.length};
}
export function describeQueue(b:QueueRow,all:QueueRow[],history:QueueRow[],now=Date.now(),pausedUntil?:string) {
 const today=day(new Date(now).toISOString());
 const isToday=day(b.scheduled_time)===today;
 const lane=all.filter(q=>q.stylist_id===b.stylist_id&&day(q.scheduled_time)===day(b.scheduled_time));
 const before=lane.filter(q=>q.id!==b.id&&waiting(q)&&queueOrder(q,b)<0).sort(queueOrder);
 const active=lane.filter(q=>q.id!==b.id&&q.queue_state==='serving'&&!q.actual_end_time&&q.status!=='cancelled');
 let low=0,high=0,uncertain=false;
 for(const q of before){const d=duration(q,history);low+=d.low;high+=d.high;}
 for(const q of active){
  const d=duration(q,history); const elapsed=Math.max(0,(now-time(q.actual_start_time))/60000);
  if(q.progress_updated_at&&q.progress_remaining_minutes!=null){
   const age=Math.max(0,(now-time(q.progress_updated_at))/60000); const remaining=q.progress_remaining_minutes-age;
   low+=Math.max(0,Math.floor(remaining-5)); high+=Math.max(10,Math.ceil(remaining+10));
   if(age>15||remaining<=0){uncertain=true;high+=15;}
  }else{low+=Math.max(0,Math.floor(d.low-elapsed));high+=Math.max(15,Math.ceil(d.high-elapsed));if(elapsed>d.high)uncertain=true;}
 }
 const paused=!!pausedUntil&&time(pausedUntil)>now;
 if(paused){const pause=Math.ceil((time(pausedUntil)-now)/60000);low=Math.max(low,pause);high=Math.max(high,pause+10);}
 const state=b.status==='cancelled'?'cancelled':b.queue_state||(b.status==='completed'?'completed':b.status==='pending'?'pending':'reserved');
 const eligible=isToday&&waiting(b)&&!!b.stylist_id;
 const waitMinutes=b.arrived_at?Math.max(0,Math.floor((now-time(b.arrived_at))/60000)):0;
 const start=new Date(b.scheduled_time); const end=new Date(start.getTime()+30*60000);
 const fmt=(d:Date)=>d.toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'});
 return {id:b.id,shopId:b.shop_id,serviceName:b.service_name||'服务',stylistName:b.stylist_name||'待门店安排',
  scheduledTime:b.scheduled_time,scheduledDate:day(b.scheduled_time),timeSlot:fmt(start)+'—'+fmt(end),isToday,status:b.status,state,stateLabel:QUEUE_LABELS[state]||'等待确认',
  pausedUntil:paused?pausedUntil:null,version:b.queue_version||0,queueNumber:b.queue_number,arrivedAt:b.arrived_at,calledAt:b.called_at,graceDeadlineAt:b.grace_deadline_at,
  expectedReturnAt:b.expected_return_at,returnRequestedAt:b.return_requested_at,readyAt:b.ready_at,missedCount:b.missed_count||0,
  aheadCount:eligible?before.length+active.length:null,waitLow:eligible?Math.max(0,low):null,waitHigh:eligible?Math.max(10,high):null,
  waitMinutes,estimateUncertain:uncertain,estimateLabel:['finished','completed'].includes(state)?'服务已结束，无需等待':state==='cancelled'?'预约已取消':state==='serving'?'正在为您服务':!isToday?'请在预约当天到店确认':!b.stylist_id?'请前台安排发型师后确认等待':!eligible?(state==='away'?'暂离中，确认返回后更新等待':state==='missed'?'已过号，请返回前台确认顺序':'到店状态确认后更新等待范围'):paused?'发型师暂停接客，预计'+Math.ceil((time(pausedUntil)-now)/60000)+'分钟后恢复':uncertain?'前序服务延长，请联系前台确认':`${Math.max(0,low)}—${Math.max(10,high)} 分钟`,
  prepareReturn:isToday&&['away','arrived','returned'].includes(state)&&(!!b.ready_at||(before.length+active.length<=1&&!!b.arrived_at)),
  overWait:eligible&&waitMinutes>=QUEUE_RULES.overWaitMinutes,
  canLeave:isToday&&['arrived','returned'].includes(state),canReturn:isToday&&['away','missed'].includes(state)&&!b.return_requested_at,
  canAcknowledge:isToday&&state==='called',canAskHelp:isToday&&['reserved','arrived','returned','away','missed','called'].includes(state),
  duration:duration(b,history),progressStale:state==='serving'&&(!b.progress_updated_at||now-time(b.progress_updated_at)>15*60000),progressUpdatedAt:b.progress_updated_at,progressRemainingMinutes:b.progress_remaining_minutes};
}
export type LiveQueueBooking=ReturnType<typeof describeQueue>;
export type QueueNotice={id:number;type:string;at:string;message:string;acknowledged:boolean};
export type LiveQueueSnapshot={serverTime:string;rules:typeof QUEUE_RULES;booking:LiveQueueBooking;notices:QueueNotice[];contactPhone:string;latestEventId:number};
export type QueueAvailability={id:string;name:string;pausedUntil:string|null;version:number};
export type LiveQueueDesk={serverTime:string;rules:typeof QUEUE_RULES;availability:QueueAvailability[];bookings:(LiveQueueBooking&{customerName:string;customerPhone:string;stylistId?:string;latestEventId:number;unacknowledged:boolean;needsHelp:boolean})[]};
