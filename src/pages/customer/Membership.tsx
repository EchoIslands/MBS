import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customerApi, customerMembershipApi, type CustomerMembershipOrder, type CustomerMembershipPlans } from '../../api';
import { useAppStore } from '../../store';

const Membership: React.FC = () => {
  const navigate=useNavigate();
  const {currentCustomer,setCurrentCustomer}=useAppStore();
  const [plans,setPlans]=useState<CustomerMembershipPlans|null>(null);
  const [order,setOrder]=useState<CustomerMembershipOrder|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=async()=>{
    try { const data=await customerMembershipApi.plans();setPlans(data);setOrder(data.activeOrder);setError(''); }
    catch(e){setError(e instanceof Error?e.message:'会员方案加载失败');}
  };
  useEffect(()=>{void load();},[]);
  const check=async()=>{
    if(!order?.id || busy)return;
    setBusy(true);setError('');
    try{
      const result=await customerMembershipApi.check(order.id);
      setOrder(result.status==='paid'||result.status==='closed'?null:result);
      setNotice(result.status==='paid'?'支付已核实，会员权益已生效':result.status==='review'
        ?'微信已收款，会员资料有变动，请联系门店核对，勿重复支付':result.status==='closed'
          ?'原订单已关闭，可重新选择方案':'尚未查到支付成功，请稍后核对原订单');
      if(result.status==='paid'||result.status==='closed')await load();
      if(result.status==='paid'&&currentCustomer){
        try {
          const updated=await customerApi.getMyProfile(currentCustomer.id);
          const latest=useAppStore.getState().currentCustomer;
          if(updated&&latest?.id===currentCustomer.id)setCurrentCustomer({...latest,...updated});
        } catch { /* 收款核对已完成；资料可稍后刷新。 */ }
      }
    }catch(e){setError(e instanceof Error?e.message:'查单暂不可用，请勿重复付款');}
    finally{setBusy(false);}
  };
  const checkRef=useRef(check);
  checkRef.current=check;
  useEffect(()=>{
    if(order?.status!=='pending')return;
    const onReturn=()=>{if(document.visibilityState==='visible')void checkRef.current();};
    window.addEventListener('focus',onReturn);
    document.addEventListener('visibilitychange',onReturn);
    void checkRef.current();
    return()=>{window.removeEventListener('focus',onReturn);document.removeEventListener('visibilitychange',onReturn);};
  },[order?.id,order?.status]);
  const resume=async()=>{
    if(!order||order.status!=='pending'||busy)return;
    if(order.channel!=='wechat_h5'){setError('原订单在小程序创建，请返回小程序继续支付');return;}
    if(/MicroMessenger/i.test(navigator.userAgent)){setError('微信内浏览器请使用小程序完成支付');return;}
    setBusy(true);setError('');
    try{
      const result=await customerMembershipApi.create(order.kind,order.level);
      setOrder(result);
      if(result.status==='paid'||result.status==='review'){await check();return;}
      if(!result.payUrl||!/^https:\/\//.test(result.payUrl))throw new Error('原单支付链接暂不可用，请先核对支付结果');
      window.location.assign(result.payUrl);
    }catch(e){setError(e instanceof Error?e.message:'原单暂无法继续支付');}
    finally{setBusy(false);}
  };
  const buy=async(kind:'vip'|'stored',level:string,price:number)=>{
    if(busy||order)return;
    const current=kind==='vip'?plans?.currentVip:plans?.currentStored;
    if(current?.active&&current.level!==level){setError('有效期内仅可原档续费；调整档位请联系门店');return;}
    if(!window.confirm('微信支付 ¥'+price+'；经微信收款核验后自动生效。确认办理？'))return;
    if(/MicroMessenger/i.test(navigator.userAgent)){setError('微信内浏览器请打开小程序办理；H5 支付请使用手机外部浏览器');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const result=await customerMembershipApi.create(kind,level);
      setOrder(result);
      if(result.status==='paid'||result.status==='review'){setNotice('订单已处理，请核对支付结果');return;}
      if(!result.payUrl||!/^https:\/\//.test(result.payUrl))throw new Error('微信支付链接暂不可用，请核对原订单');
      window.location.assign(result.payUrl);
    }catch(e){setError(e instanceof Error?e.message:'微信下单暂不可用');}
    finally{setBusy(false);}
  };
  return <div className="min-h-screen bg-[#faf4ec] px-4 pb-12 text-[#493b32]">
    <header className="mx-auto flex max-w-xl items-center gap-4 py-5"><button onClick={()=>navigate('/customer/profile')} aria-label="返回个人中心">←</button><h1 className="text-xl font-bold">会员办理</h1></header>
    <main className="mx-auto max-w-xl space-y-5">
      <section className="rounded-2xl border border-orange-100 bg-[#fff2e7] p-5"><h2 className="text-lg font-bold">本人办理 · 微信支付</h2><p className="mt-2 text-sm text-stone-600">支付成功并经微信核验后，自动开通或续费会员。</p></section>
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {notice&&<p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{notice}</p>}
      {order&&<section className="rounded-2xl bg-amber-50 p-4"><p className="font-semibold">原订单：{order.kind==='vip'?'VIP':'储值'} {order.level} · ¥{order.amount}</p><p className="my-2 text-sm">{order.status==='review'?'微信已收款，待门店核对；请勿重复付款':'付款状态待确认，请先核对原单'}</p><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void check()} className="rounded-xl bg-[#f6ae79] px-4 py-2 font-semibold text-[#392719]">核对支付结果</button>{order.status==='pending'&&order.channel==='wechat_h5'&&<button disabled={busy} onClick={()=>void resume()} className="rounded-xl border border-orange-300 bg-white px-4 py-2 font-semibold">继续支付原订单</button>}</div>{order.status==='pending'&&order.channel==='wechat_mini'&&<p className="mt-2 text-sm">原订单在小程序创建，请返回小程序继续支付。</p>}</section>}
      <section className="rounded-2xl border border-stone-200 bg-[#fffaf5] p-4"><h2 className="text-lg font-bold">购买 VIP</h2><p className="my-2 text-sm text-stone-600">原档续费按完整年费收取，从原到期日顺延 365 天。</p>
        {plans?.vip.map(p=><article key={p.level} className="my-3 rounded-xl border border-stone-200 bg-white p-4"><div className="flex justify-between font-bold"><span>{p.name}</span><span className="text-orange-800">¥{p.price} / 年</span></div><p className="my-3 text-sm leading-6 text-stone-600">{p.benefits.join(' · ')}</p><button disabled={busy||!!order} onClick={()=>void buy('vip',p.level,p.price)} className="w-full rounded-xl bg-[#f6ae79] py-2.5 font-bold text-[#392719] disabled:opacity-50">{plans.currentVip.active&&plans.currentVip.level===p.level?'原档续费':'微信支付办理'}</button></article>)}
      </section>
      <section className="rounded-2xl border border-stone-200 bg-[#fffaf5] p-4"><h2 className="text-lg font-bold">储值会员</h2><p className="my-2 text-sm text-stone-600">储值本金全额到账，原档续期顺延 730 天。</p>
        {plans?.stored.map(p=><article key={p.level} className="my-3 rounded-xl border border-stone-200 bg-white p-4"><div className="flex justify-between font-bold"><span>{p.name}</span><span className="text-orange-800">¥{p.amount}</span></div><p className="my-3 text-sm leading-6 text-stone-600">{p.benefits.join(' · ')}</p><button disabled={busy||!!order} onClick={()=>void buy('stored',p.level,p.amount)} className="w-full rounded-xl bg-[#f6ae79] py-2.5 font-bold text-[#392719] disabled:opacity-50">{plans.currentStored.active&&plans.currentStored.level===p.level?'原档续费':'微信支付办理'}</button></article>)}
      </section>
      <p className="text-sm leading-6 text-stone-600">有效期内跨档调整及支付异常请联系门店。付款后如未即时显示权益，请先核对支付结果，不要重复付款。</p>
    </main>
  </div>;
};
export default Membership;
