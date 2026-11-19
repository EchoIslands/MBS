
import { useEffect, useState } from 'react';
import { CustomerHeader } from '../../components/CustomerPage';
import { useAppStore } from '../../store';
import { getApiBase, http } from '../../../shared/api-base';

interface InviteDetails { inviteUrl: string; qrCodeDataUrl: string; referrerName: string }

export default function Invite() {
  const customer = useAppStore(state => state.currentCustomer);
  const customerId = customer?.id;
  const shopId = customer?.shopId || 'shop1';
  const [attempt, setAttempt] = useState(0);
  const key = customerId + '/' + shopId + '/' + attempt;
  const [result, setResult] = useState<{ key: string; invite?: InviteDetails; error?: string }>();
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    setMessage('');
    http<{ data: InviteDetails }>(getApiBase() + '/referrals/invite', { method: 'POST', body: JSON.stringify({ shopId, customerId }) }).then(response => {
      if (!response?.data?.qrCodeDataUrl || !response.data.inviteUrl) throw new Error('生成邀请码失败');
      if (active) setResult({ key, invite: response.data });
    }).catch(error => { if (active) setResult({ key, error: error instanceof Error ? error.message : '生成邀请码失败' }); });
    return () => { active = false; };
  }, [customerId, shopId, key]);

  const current = result?.key === key ? result : undefined;
  const invite = current?.invite;
  const name = invite?.referrerName || customer?.name || '会员';

  async function copyInvite() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setMessage('网页版邀请链接已复制');
    } catch { setMessage('请长按下方链接复制'); }
  }

  async function shareInvite() {
    if (!invite) return;
    try {
      const blob = await fetch(invite.qrCodeDataUrl).then(response => response.blob());
      const file = new File([blob], '皓诗形象邀请二维码.png', { type: blob.type });
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: '皓诗形象 · 邀请好友', files: [file] });
      else setMessage('请保存二维码，再发送给好友');
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') setMessage('请保存二维码，再发送给好友');
    }
  }

  return <>
    <CustomerHeader title="邀请好友" backTo="/customer/profile" />
    <main className="customer-body space-y-3">
      <section className="customer-card space-y-4">
        <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#ffe7ce] font-bold text-[#805536]">{name[0]}</span>
          <div><h2 className="font-bold">{name}</h2><p className="text-sm text-gray-600">邀请您体验皓诗形象服务</p></div></div>
        {!current && <p className="py-16 text-center text-sm" role="status">正在生成邀请码…</p>}
        {current?.error && <div className="py-10 text-center"><p role="alert" className="mb-3 text-sm text-red-800">{current.error}</p>
          <button type="button" className="customer-primary" onClick={() => setAttempt(value => value + 1)}>重试</button></div>}
        {invite && <>
          <button type="button" className="mx-auto block" onClick={() => setPreview(true)} aria-label="放大邀请二维码">
            <img className="mx-auto h-48 w-48 object-contain" src={invite.qrCodeDataUrl} alt="邀请二维码" /></button>
          <p className="text-center text-sm text-gray-600">微信扫码直接进入小程序，登录领取新人优惠券</p>
          <div className="grid grid-cols-2 gap-2">
            <a download="皓诗形象邀请二维码.png" href={invite.qrCodeDataUrl} className="customer-primary text-center">保存二维码</a>
            <button type="button" onClick={() => void shareInvite()} className="customer-secondary">分享给好友</button>
          </div>
          <details><summary className="cursor-pointer text-sm text-[#805536]">备用网页版链接</summary><div className="mt-2 flex gap-2">
            <input className="min-w-0 flex-1 rounded-xl border border-[#ecdfd1] p-2 text-xs" aria-label="备用网页版链接" readOnly value={invite.inviteUrl} />
            <button type="button" className="customer-secondary" onClick={() => void copyInvite()}>复制</button></div></details>
          {message && <p role="status" className="text-sm">{message}</p>}
        </>}
      </section>
      <section className="customer-card space-y-2"><h2 className="font-bold">邀请规则</h2><ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-gray-600">
        <li>成为会员后即可生成专属邀请二维码</li><li>好友微信扫码进入小程序，验证码登录后领取新人优惠券</li>
        <li>好友首次消费成功后，你可获得消费金额 {((customer?.referralBonusRate || .1) * 100).toFixed(0)}% 的奖励金</li>
        <li>奖励金进入可消费余额，可用于店铺内消费抵扣</li></ol></section>
    </main>
    {preview && invite && <div role="dialog" aria-modal="true" aria-label="邀请二维码" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-5">
      <div className="customer-card space-y-3"><img src={invite.qrCodeDataUrl} alt="邀请二维码" className="w-64 max-w-full" />
        <button type="button" className="customer-secondary w-full" onClick={() => setPreview(false)}>关闭</button></div>
    </div>}
  </>;
}
