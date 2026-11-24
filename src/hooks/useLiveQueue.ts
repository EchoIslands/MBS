import { useCallback, useEffect, useRef, useState } from 'react';
/** Poll only while visible; latest response wins, and stale data cannot authorize actions. */
export function useLiveQueue<T>(loader:()=>Promise<T>,enabled=true,pollMs=2000){
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[lastSync,setLastSync]=useState(0),[clock,setClock]=useState(Date.now());
 const flight=useRef(false),sequence=useRef(0),alive=useRef(true);
 const failures = useRef(0), retryAt = useRef(0);
 const refresh=useCallback(async(force=false)=>{
  if(!enabled||!alive.current||(!force && (flight.current || Date.now() < retryAt.current)))return;
  const seq=++sequence.current;flight.current=true;
  try{const next=await loader();if(alive.current&&seq===sequence.current){failures.current = 0; retryAt.current = 0; setData(next);setError('');setLastSync(Date.now());}}
  catch(e){if(alive.current&&seq===sequence.current){
   failures.current++;
   retryAt.current = Date.now() + Math.min(15_000, pollMs * 2 ** Math.min(failures.current, 3));
   setError(e instanceof Error?e.message:'同步失败，请联系前台');
  }}
  finally{if(seq===sequence.current)flight.current=false;}
 },[loader,enabled,pollMs]);
 useEffect(()=>{const cleanupCounter=sequence;alive.current=true;setData(null);setLastSync(0);setError('');void refresh(true);
  const resume=()=>{if(document.visibilityState==='visible'){setClock(Date.now());void refresh(true);}};
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  const poll=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},Math.max(1000,pollMs));
  const tick=window.setInterval(()=>setClock(Date.now()),1000);
  return()=>{alive.current=false;cleanupCounter.current++;flight.current=false;window.clearInterval(poll);window.clearInterval(tick);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);};
 },[refresh,pollMs]);
 return {data,error,lastSync,refresh,stale:!lastSync||clock-lastSync>20000||!!error};
}
