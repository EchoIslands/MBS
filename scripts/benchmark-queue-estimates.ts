import { performance } from 'node:perf_hooks';
import { createDurationEstimator, duration, type QueueRow } from '../shared/lib/liveQueue.js';
const now=Date.parse('2026-11-14T06:00:00Z');
const history:QueueRow[]=Array.from({length:1000},(_,i)=>({id:'synthetic-'+i,shop_id:'synthetic',customer_id:'synthetic',status:'completed',scheduled_time:new Date(now-86400000).toISOString(),stylist_id:'s'+i%5,service_id:'cut',actual_start_time:new Date(now-86400000-(20+i%45)*60000).toISOString(),actual_end_time:new Date(now-86400000).toISOString()}));
const queue=history.slice(0,100);
let at=performance.now();const baseline=queue.map(b=>duration(b,history,now));const repeated=performance.now()-at;
at=performance.now();const estimate=createDurationEstimator(history,now);const optimized=queue.map(estimate);const grouped=performance.now()-at;
if(JSON.stringify(baseline)!==JSON.stringify(optimized))throw new Error('快照计算不一致');
console.log(JSON.stringify({synthetic:true,history:1000,queue:100,repeatedMs:+repeated.toFixed(2),groupedMs:+grouped.toFixed(2),sameResults:true,note:'仅本机合成计算基准，不代表手机或网络加载耗时'}));
