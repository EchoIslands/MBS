/** 门店采用北京时间；不能依赖 Vercel/本机的系统时区。周起点沿用原有周日规则。 */
const OFFSET=8*60*60*1000;
export function businessPeriods(now=new Date()) {
  const local=new Date(now.getTime()+OFFSET);
  const year=local.getUTCFullYear(),month=local.getUTCMonth(),day=local.getUTCDate();
  const start=(m:number,d:number)=>new Date(Date.UTC(year,m,d)-OFFSET);
  return {today:start(month,day),weekStart:start(month,day-local.getUTCDay()),monthStart:start(month,1),quarterStart:start(Math.floor(month/3)*3,1),yearStart:start(0,1)};
}
export function businessDayRange(date:string) {
  const start=new Date(date+'T00:00:00+08:00');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || businessDate(start)!==date) return null;
  return {start,end:new Date(start.getTime()+86400000)};
}
export function businessDate(date:Date) {return new Date(date.getTime()+OFFSET).toISOString().slice(0,10);}
