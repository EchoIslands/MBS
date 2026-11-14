import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { operationsApi, type MembershipReview } from '../../api';
import ShopLayout from './ShopLayout';
import { useAppStore } from '../../store';
type Data=Awaited<ReturnType<typeof operationsApi.read>>;
export default function OperationsWorkbench(){
 const identity=useAppStore(s=>(s.currentEmployee?.id||'')+':'+(s.currentShop?.id||''));
 return <OperationsWorkbenchContent key={identity}/>;
}
function OperationsWorkbenchContent(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [review,setReview]=useState<MembershipReview|null>(null),[reason,setReason]=useState(''),[refundRef,setRefundRef]=useState(''),[refundAt,setRefundAt]=useState('');
 const flight=useRef(false);
 const refresh=useCallback(async()=>{if(flight.current)return;flight.current=true;setBusy(true);try{setData(await operationsApi.read());setError('');}catch(e){setError(e instanceof Error?e.message:'读取失败');setData(null);}finally{flight.current=false;setBusy(false);}},[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},30000);return()=>clearInterval(timer);},[refresh]);
 const check=async(id:string)=>{if(flight.current)return;flight.current=true;setBusy(true);try{const result=await operationsApi.checkMembership(id);setNotice('原单核对结果：'+result.status+' / '+result.tradeState+'；请核对下方最新列表。');}catch(e){setNotice(e instanceof Error?e.message:'核对未完成');}finally{flight.current=false;setBusy(false);await refresh();}};
 const openReview=async(id:string)=>{if(flight.current)return;flight.current=true;setBusy(true);try{setReview(await operationsApi.review(id));setReason('');setRefundRef('');setRefundAt('');}catch(e){setError(e instanceof Error?e.message:'读取未完成');}finally{flight.current=false;setBusy(false);}};
 const resolveReview=async(decision:'apply'|'refund')=>{
  if(!review||flight.current||reason.trim().length<4)return;
  if(decision==='refund'&&(!refundRef.trim()||!refundAt))return;
  const parsed=refundAt?new Date(refundAt+':00+08:00'):null;
  if(parsed&&!Number.isFinite(+parsed)){setError('请填写有效北京时间');return;}
  if(!window.confirm(decision==='apply'?'按已核对的原单金额补开权益，不会再次收款。确认顾客已同意？':'仅登记已经实际完成的全额退款凭据。此按钮不会向微信发起退款。确认退款已到账？'))return;
  flight.current=true;setBusy(true);
  try{await operationsApi.resolve(review.order.id,{decision,reason,expected:review.expected,...decision==='refund'?{refundRef,refundAmount:Number(review.order.amount),refundAt:parsed!.toISOString()}:{}});setReview(null);setNotice('处理已记录，请核对原单和顾客权益。');}
  catch(e){setNotice(e instanceof Error?e.message:'处理未确认，请刷新原单');}
  finally{flight.current=false;setBusy(false);await refresh();}
 };
 return <ShopLayout title="收款异常与运营核对"><main className="max-w-6xl mx-auto p-4 space-y-5"><header className="flex justify-between items-center"><h1 className="text-2xl font-bold">收款异常与运营核对</h1><button disabled={busy} onClick={()=>void refresh()} className="rounded-xl bg-orange-200 px-5 py-3 font-bold">{busy?'核对中…':'刷新'}</button></header>
 <p>先查原订单，再处理到账。核对按钮不会创建新订单，也不会再次扣款。会员已收款待核对时，请联系负责人核对权益或按原收款渠道退款。</p>
 {notice&&<p role="status" className="rounded-xl bg-orange-50 p-4">{notice}</p>}
 {error&&<p role="alert" className="rounded-xl bg-amber-50 p-4">{error}</p>}
 {review&&<section className="rounded-xl border-2 border-orange-300 bg-orange-50 p-5 space-y-3"><h2 className="text-xl font-bold">处理已收款待核对订单</h2><p className="break-all">{review.order.id} · {review.order.level} · 已收 ¥{review.order.amount}</p><p>当前VIP：{review.expected.purchase_vip_level}；到期：{review.expected.purchase_vip_expires_at?new Date(review.expected.purchase_vip_expires_at).toLocaleString('zh-CN'):'长期/未开通'}；储值余额 ¥{review.expected.stored_value_balance}</p><p>完整年费订单可按顾客确认补开原档并顺延一年；储值订单追加原单实付本金。差价升档必须保持原约定，不能覆盖冲突档位。</p>
 <label className="block">处理原因（至少4字）<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={300} className="block w-full rounded-lg border p-3" /></label>
 <button disabled={busy||reason.trim().length<4} onClick={()=>void resolveReview('apply')} className="rounded-xl bg-orange-200 p-3 font-bold disabled:opacity-40">顾客已确认，按原单补入权益</button>
 <div className="border-t pt-3 space-y-3"><p className="font-bold">如已在微信商户平台实际完成全额退款，登记凭据：</p><label className="block">实际退款编号<input value={refundRef} onChange={e=>setRefundRef(e.target.value)} maxLength={100} className="block w-full rounded-lg border p-3" /></label><label className="block">实际退款时间（北京时间）<input type="datetime-local" value={refundAt} onChange={e=>setRefundAt(e.target.value)} className="block rounded-lg border p-3" /></label><button disabled={busy||reason.trim().length<4||refundRef.trim().length<6||!refundAt} onClick={()=>void resolveReview('refund')} className="rounded-xl border border-red-200 bg-white p-3 font-bold disabled:opacity-40">已实际退回 ¥{review.order.amount}，登记退款凭据</button></div><button disabled={busy} onClick={()=>setReview(null)} className="p-3 underline">关闭处理面板</button></section>}
 {data&&<><p className="text-sm text-gray-500">最近同步：{new Date(data.serverTime).toLocaleString('zh-CN')}</p>{data.truncated&&<p role="alert" className="bg-red-50 p-4">数据达到查询上限，当前不是全量统计，请缩小范围后核对。</p>}
 <section className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['30天等待中位数',data.metrics.waitMedian===null?'暂无样本':data.metrics.waitMedian+' 分钟'],['30天等待P90',data.metrics.waitP90===null?'暂无样本':data.metrics.waitP90+' 分钟'],['过号顾客',data.metrics.missedBookings],['通知转电话',data.metrics.phoneFallbacks],['等待期间取消',data.metrics.waitingCancelled],['店内同档续费',data.metrics.renewalOperations],['通知待处理',data.metrics.pendingNotifications],['等待样本数',data.metrics.waitSamples]].map(([label,value])=><div key={label} className="rounded-xl border bg-white p-4"><p>{label}</p><strong className="text-xl">{value}</strong></div>)}</section>
 <p className="text-sm text-gray-600">等待统计为到店至开始服务的经过时间，包含暂离；“等待期间取消”不能直接推断为等待导致流失。续费数仅统计店内操作，不代表续费转化率。</p>
 <section className="rounded-xl border bg-white p-4 space-y-3"><h2 className="text-xl font-bold">会员收款待处理（{data.memberships.length}）</h2>{!data.memberships.length&&<p>暂无待处理订单</p>}{data.memberships.map(o=><div key={o.id} className="border-t py-3 flex flex-wrap justify-between gap-3"><div><strong>{o.status==='review'?'已收款，权益待人工核对':'支付结果待核对'} · ¥{o.amount}</strong><p className="break-all">原单 {o.id} · {o.level}</p><p>{new Date(o.created_at).toLocaleString('zh-CN')}</p></div>{o.status==='pending'?<button disabled={busy} onClick={()=>void check(o.id)} className="rounded-xl bg-orange-200 p-3 font-bold">核对原订单</button>:<button disabled={busy} onClick={()=>void openReview(o.id)} className="rounded-xl bg-amber-100 p-3 font-bold">核对并处理已收款订单</button>}</div>)}</section>
 <section className="rounded-xl border bg-white p-4"><h2 className="text-xl font-bold">服务待收款（{data.settlements.length}）</h2>{data.settlements.map(o=><div key={o.id} className="border-t py-3"><p className="break-all">{o.id} · ¥{o.total} · {o.payment_method}</p><Link className="inline-block rounded-lg bg-orange-100 p-3 font-bold" to="/shop/settlement">前往结算管理核对原单</Link></div>)}</section>
 <section className="rounded-xl border bg-white p-4"><h2 className="text-xl font-bold">待处理退款（服务 {data.refunds.length} / 商品 {data.productRefunds.length}）</h2><Link className="inline-block rounded-xl bg-orange-200 p-3 font-bold mr-3" to="/shop/refunds">服务退款与凭据</Link><Link className="inline-block rounded-xl border p-3 font-bold" to="/shop/product-orders">商品退款与原订单</Link></section>
 </> }</main></ShopLayout>;
}
