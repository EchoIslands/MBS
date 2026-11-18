export type CommissionRank = 'designer' | 'gold' | 'manager' | 'director';
export function commissionRank(employee: {role?: string; isGoldStylist?: boolean; title?: string}): CommissionRank {
 if (employee.role === 'shop_manager') return 'manager';
 if (/总监/.test(employee.title || '')) return 'director';
 return employee.isGoldStylist ? 'gold' : 'designer';
}
export function monthlyCommissionRate(base: number, rank: CommissionRank): number {
 const bands = rank === 'designer' ? [0.08,0.13,0.18,0.25,0.30,0.35] : rank === 'gold' ? [0.09,0.14,0.19,0.25,0.30,0.35] : [0.10,0.15,0.20,0.25,0.30,0.35];
 const index = base >= 80000 ? 5 : base >= 60000 ? 4 : base >= 40000 ? 3 : base >= 20000 ? 2 : base >= 10000 ? 1 : 0;
 return bands[index];
}
export type CommissionEntry = {id: string; employee_id: string; period: string; rank: CommissionRank; base_amount: number | string; transfer_amount: number | string; kind: string; source_id: string; reason: string; created_at: string};
export function summarizeCommissions(entries: CommissionEntry[]) {
 const groups = new Map<string,{employeeId: string; period: string; rank: CommissionRank; base: number; transfers: number}>();
 for (const item of entries) {
  const key = item.employee_id + ':' + item.period;
  const group = groups.get(key) || {employeeId:item.employee_id,period:item.period,rank:item.rank,base:0,transfers:0};
  if (group.rank !== item.rank) throw new Error('同一员工同月档位身份存在冲突，请核对台账');
  group.base += Math.round(Number(item.base_amount)*100);
  group.transfers += Math.round(Number(item.transfer_amount)*100);groups.set(key,group);
 }
 return [...groups.values()].map(g=>{
  const base=g.base/100, rate=monthlyCommissionRate(Math.max(0,base),g.rank);
  return {...g,base,transfers:g.transfers/100,rate,commission:Math.round(Math.max(0,base)*rate*100)/100+g.transfers/100};
 });
}
