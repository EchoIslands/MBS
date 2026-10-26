import { Customer } from '../../shared/types';
import { getPurchaseVIPLabel, getStoredValueLabel } from './membership';

const date = (value: Date | string | undefined) => value ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : '—';
/** Shared table/export column definitions. Render values only, never rewrite customer snapshots. */
export const customerColumns: {label: string; value: (customer: Customer) => string | number}[] = [
  {label:'客户称呼',value:c=>c.name},{label:'联系方式',value:c=>c.phone},
  {label:'微信',value:c=>c.wechat || '—'},{label:'性别',value:c=>c.gender==='male'?'男':c.gender==='female'?'女':'其他'},
  {label:'年龄',value:c=>c.age ?? '—'},{label:'生日',value:c=>c.birthday ? new Date(c.birthday).toISOString().slice(0,10) : '—'},
  {label:'爱好',value:c=>c.hobbies || '—'},{label:'客户来源',value:c=>c.source || '—'},
  {label:'购买型VIP',value:c=>getPurchaseVIPLabel(c.purchaseVIPLevel)},{label:'储值等级',value:c=>getStoredValueLabel(c.storedValueLevel)},
  {label:'股东身份',value:c=>c.isStockholder ? '是' : '否'},
  {label:'储值余额',value:c=>Number(c.storedValueBalance ?? 0).toFixed(2)},{label:'推荐奖励余额',value:c=>Number(c.withdrawableReferralAmount ?? 0).toFixed(2)},
  {label:'积分',value:c=>c.points ?? 0},{label:'累计消费',value:c=>Number(c.totalSpent ?? 0).toFixed(2)},
  {label:'到店次数',value:c=>c.visitCount ?? 0},{label:'上次到店',value:c=>date(c.lastVisitAt)},
  {label:'上次服务设计师',value:c=>c.lastStylist || c.visitRecords?.[0]?.stylistName || '—'},
  {label:'上次消费项目',value:c=>(c.lastServiceItems ?? c.visitRecords?.[0]?.serviceNames ?? []).join('、') || '—'},
  {label:'是否有预约',value:c=>c.hasBooking ? '是' : '否'},
  {label:'档案会员标记',value:c=>c.isMember == null ? '未记录' : c.isMember ? '是' : '否'},
  {label:'档案充值标记',value:c=>c.hasRecharged == null ? '未记录' : c.hasRecharged ? '是' : '否'},
  {label:'是否转介绍',value:c=>c.isReferred ? '是' : '否'},{label:'转介绍人员',value:c=>c.referrerName || '—'},
  {label:'转介绍人员电话',value:c=>c.referrerPhone || '—'},{label:'转介绍消费',value:c=>Number(c.referralConsumption ?? 0).toFixed(2)},
  {label:'共享基金',value:c=>Number(c.sharedFund ?? 0).toFixed(2)},{label:'合计共享基金',value:c=>Number(c.totalSharedFund ?? 0).toFixed(2)},
  {label:'可消费金额',value:c=>Number(c.withdrawableAmount ?? 0).toFixed(2)},
  {label:'建档时间',value:c=>date(c.joinedAt)},
  {label:'本人核实状态',value:c=>c.identityVerified ? '已核实' : '未核实'},
];

export function exportCustomers(customers: Customer[]) {
  const safeCell = (value: string | number) => {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  };
  const csv = '\uFEFF'+[customerColumns.map(c=>c.label),...customers.map(customer=>customerColumns.map(c=>c.value(customer)))].map(row=>row.map(safeCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link = document.createElement('a'); link.href=url; link.download='客户管理表.csv'; link.click(); URL.revokeObjectURL(url);
}

