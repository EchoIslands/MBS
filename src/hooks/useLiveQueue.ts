import { useCallback, useEffect, useRef, useState } from 'react';
/** Poll only while visible; latest response wins, and stale data cannot authorize actions. */
export function useLiveQueue<T>(loader:()=>Promise<T>,enabled=true){
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[lastSync,setLastSync]=useState(0),[clock,setClock]=useState(Date.now());
 const flight=useRef(false),sequence=useRef(0),alive=useRef(true);
 const refresh=useCallback(async(force=false)=>{
  if(!enabled||!alive.current||flight.current&&!force)return;
  const seq=++sequence.current;flight.current=true;
  try{const next=await loader();if(alive.current&&seq===sequence.current){setData(next);setError('');setLastSync(Date.now());}}
  catch(e){if(alive.current&&seq===sequence.current)setError(e instanceof Error?e.message:'同步失败，请联系前台');}
  finally{if(seq===sequence.current)flight.current=false;}
 },[loader,enabled]);
 useEffect(()=>{alive.current=true;setData(null);setLastSync(0);setError('');void refresh(true);
  const resume=()=>{if(document.visibilityState==='visible'){setClock(Date.now());void refresh(true);}};
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  const poll=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);
  const tick=window.setInterval(()=>setClock(Date.now()),1000);
  return()=>{alive.current=false;sequence.current++;flight.current=false;window.clearInterval(poll);window.clearInterval(tick);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);};
 },[refresh]);
 return {data,error,lastSync,refresh,stale:!lastSync||clock-lastSync>20000||!!error};
}
