import { Crown, Gift } from 'lucide-react';
import { purchaseVIPPlans, storedValuePlans } from '../../shared/membershipPlans';

export default function CustomerMembershipBenefits() {
  return <section className="mt-4 rounded-2xl border border-[#eadbcf] bg-white p-5">
    <h2 className="flex items-center gap-2 text-lg font-bold text-[#604a3c]"><Crown size={22} />会员体系 · 权益简介</h2>
    <p className="my-3 text-sm leading-6 text-stone-600">购买 VIP 享等级权益，储值会员可叠加消费折扣。个人等级、余额和可用权益请到「我的」查看。</p>
    <details className="rounded-xl border border-orange-100 bg-[#fff7ee] p-4">
      <summary className="cursor-pointer font-bold text-[#754e31]">查看各等级价格与权益</summary>
      <div className="mt-4 space-y-3">
        {purchaseVIPPlans.filter(p => p.price > 0).map(p => <article key={p.level} className="rounded-xl border border-orange-100 bg-white p-3">
          <h3 className="flex justify-between gap-2 font-bold"><span>{p.name}</span><span>¥{p.price} / 365天</span></h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">{p.benefits.join(' · ')}</p>
        </article>)}
        <h3 className="flex items-center gap-2 pt-2 font-bold"><Gift size={18} />储值会员 · 折上折</h3>
        {storedValuePlans.filter(p => p.amount > 0).map(p => <article key={p.level} className="rounded-xl border border-orange-100 bg-white p-3">
          <h4 className="flex justify-between gap-2 font-bold"><span>{p.name}</span><span>¥{p.amount}</span></h4>
          <p className="mt-2 text-sm leading-6 text-stone-600">{p.benefits.join(' · ')}</p>
        </article>)}
      </div>
    </details>
  </section>;
}
