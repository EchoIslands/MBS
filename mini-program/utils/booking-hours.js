const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export function bookingSlots(date,hours) {
  const day=hours?.[days[new Date(date+'T12:00:00+08:00').getUTCDay()]];
  // 缺配置保留原有09:00–20:30时段；有配置完全按门店定义，不新增定价或营业规则。
  let open=540,close=1260;
  if(day) {
    if(day.isOpen===false) return [];
    const parse=(v)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?Number(v.slice(0,2))*60+Number(v.slice(3)):NaN;
    open=parse(day.open);close=parse(day.close);
    if(!Number.isFinite(open) || !Number.isFinite(close)) return [];
    if(close<=open) close+=1440;
  }
  const result=[];
  for(let time=Math.ceil(open/30)*30;time<Math.min(close,1440);time+=30) result.push(String(Math.floor(time/60)).padStart(2,'0')+':'+String(time%60).padStart(2,'0'));
  return result;
}
