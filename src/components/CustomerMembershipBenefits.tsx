
import { Crown } from 'lucide-react';
import { useState } from 'react';
import { purchaseVIPPlans, storedValuePlans } from '../../shared/membershipPlans';

const vip = purchaseVIPPlans.filter(plan => plan.price > 0);
const stored = storedValuePlans.filter(plan => plan.amount > 0);
const shortName = (name: string) => name.replace(/ VIP$/, '');
const discount = (rate: number) => (Math.round(rate * 100) / 10) + '折';

const rows = [
  { title: '服务折扣', values: vip.map(plan => discount(plan.discount)) },
  { title: '购买价格', values: vip.map(plan => '¥' + plan.price + '/年') },
  { title: '满59元赠洗护', values: vip.map(plan => plan.benefits.some(text => text.includes('护发素')) ? '洗发水＋护发素' : '洗发水') },
  { title: '饮品权益', values: vip.map(plan => plan.benefits.some(text => text.includes('饮品')) ? '每次消费送' : '—') },
  { title: '不满意重做', values: vip.map(plan => plan.benefits.some(text => text.includes('重做')) ? '支持' : '—') },
  { title: '免费剪发', values: vip.map(plan => plan.benefits.some(text => text.includes('免费剪发')) ? '1次' : '—') },
];

function BenefitsGrid({ names, benefits }: { names: string[]; benefits: typeof rows }) {
  return <div className="space-y-2">{benefits.map(row => <div className="rounded-xl border border-[#ecdfd1] bg-[#fffaf4] p-2.5" key={row.title}>
    <h4 className="text-sm font-semibold">{row.title}</h4>
    <dl className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
      {names.map((name, index) => <div className="min-w-0 rounded-md bg-white p-1" key={name}><dt className="text-gray-600">{name}</dt><dd className="mt-0.5 font-semibold">{row.values[index]}</dd></div>)}
    </dl>
  </div>)}</div>;
}

export default function CustomerMembershipBenefits() {
  const [expanded, setExpanded] = useState(false);
  return <section className="customer-card space-y-3">
    <h2 className="flex items-center gap-2 font-bold text-[#604a3c]"><Crown size={17} />会员体系 · 权益简介</h2>
    <p className="text-sm leading-6 text-gray-600">购买 VIP 享等级权益，储值会员可叠加消费折扣。</p>
    <div className="space-y-2 text-sm">
      <div className="rounded-xl border border-[#efd1b7] bg-[#fff4e6] p-3"><strong>购买 VIP</strong><p className="mt-1 text-gray-600">普卡 · 银卡 · 金卡 · 钻石</p><p>等级折扣、洗护赠礼等权益</p></div>
      <div className="rounded-xl border border-[#efd1b7] bg-[#fff4e6] p-3"><strong>储值会员</strong><p className="mt-1 text-gray-600">储值卡 · 安心卡 · 顺心卡 · 随心卡</p><p>不同储值档位，享折上折</p></div>
    </div>
    <button type="button" className="customer-secondary w-full" aria-expanded={expanded} aria-controls="customer-benefits-details"
      onClick={() => setExpanded(value => !value)}>{expanded ? '收起权益详情 −' : '查看各等级价格与权益 ＋'}</button>
    {expanded && <div id="customer-benefits-details" className="space-y-3">
      <h3 className="font-bold">购买 VIP 权益</h3>
      <BenefitsGrid names={vip.map(plan => shortName(plan.name))} benefits={rows} />
      <h3 className="font-bold">储值会员权益（折上折）</h3>
      <BenefitsGrid names={stored.map(plan => plan.name)} benefits={[
        { title: '储值金额', values: stored.map(plan => '¥' + plan.amount) },
        { title: '折上折折扣', values: stored.map(plan => discount(plan.discount)) },
      ]} />
      <p className="text-xs text-gray-600">具体适用范围与权益以门店会员规则为准。</p>
    </div>}
  </section>;
}
