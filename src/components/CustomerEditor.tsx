import { useState } from 'react';
import { X } from 'lucide-react';
import { Customer, PurchaseVIPLevel, StoredValueLevel } from '../../shared/types';
import { getPurchaseVIPLabel, getStoredValueLabel } from '../lib/membership';
import { customerDraft, customerPatch } from '../lib/customerEditor';
import { useCustomerFormSave } from '../hooks/useCustomerFormSave';

type Props = {
  customer?: Customer;
  latest?: Customer;
  enabled: boolean;
  onClose: () => void;
  onReload: () => void;
  onSave: (patch: Partial<Customer>) => Promise<void>;
};
export default function CustomerEditor({customer, latest, enabled, onClose, onReload, onSave}: Props) {
  const [draft, setDraft] = useState(() => customerDraft(customer));
  const { saveCustomer, saving, saveError } = useCustomerFormSave(customer?.id || 'add');
  const changedElsewhere = !!customer && !!latest && JSON.stringify(customer) !== JSON.stringify(latest);
  const field = (key: string, label: string, type = 'text') => <label className="block text-sm text-gray-700" key={key} htmlFor={'customer-'+key}>
    {label}
    <input id={'customer-'+key} type={type} min={type==='number' ? '0' : undefined} step={type==='number' ? (['age','points'].includes(key) ? '1' : '0.01') : undefined}
      value={draft[key] || ''} onChange={event => setDraft({...draft,[key]:event.target.value})}
      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 bg-white" />
  </label>;
  const select = (key: string, label: string, options: [string,string][]) => <label className="block text-sm text-gray-700" key={key} htmlFor={'customer-'+key}>
    {label}<select id={'customer-'+key} value={draft[key]} onChange={event => setDraft({...draft,[key]:event.target.value})} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 bg-white">
      {options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  </label>;
  const yesNo: [string,string][] = [['false','否'],['true','是']];
  const section = (title: string, children: React.ReactNode) => <section className="mb-6"><h3 className="font-bold text-gray-800 mb-3 border-b pb-2">{title}</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div></section>;
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label={customer ? '编辑客户信息' : '添加新客户'}>
    <form className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-3xl my-6" onSubmit={event => {
      event.preventDefault();
      if (enabled) void saveCustomer(async () => { await onSave(customerPatch(draft, customer)); });
    }}>
      <div className="flex items-center justify-between mb-5"><h2 className="text-xl font-bold">{customer ? '编辑客户信息' : '添加新客户'}</h2><button type="button" aria-label="关闭编辑" disabled={saving} onClick={onClose}><X /></button></div>
      {!enabled && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">客户数据尚未同步成功，请先关闭窗口并刷新核对。</p>}
      {changedElsewhere && <div role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-800">服务端档案已有更新。当前输入保留；保存仍校验修改前的值。
        <button type="button" disabled={saving} className="ml-2 underline" onClick={() => { if(window.confirm('重新载入会放弃本次未保存的输入，继续？')) onReload(); }}>重新载入最新资料</button>
      </div>}
      <fieldset disabled={saving || !enabled}>
        {section('基本资料', <>
          {field('name','客户称呼 *')}{field('phone','联系方式 *','tel')}
          {field('wechat','微信')}{field('source','客户来源')}
          {select('gender','性别',[['other','其他'],['male','男'],['female','女']])}{field('age','年龄','number')}
          {field('birthday','生日','date')}{field('idCardNumber','身份证号（选填）')}{field('hobbies','爱好及其他')}
        </>)}
        {section('会员资料', <>
          {select('purchaseVIPLevel','购买型 VIP 等级',Object.values(PurchaseVIPLevel).map(value=>[value,getPurchaseVIPLabel(value)]))}
          {select('storedValueLevel','储值会员等级',Object.values(StoredValueLevel).map(value=>[value,getStoredValueLabel(value)]))}
          {select('isStockholder','股东身份',[['false','非股东'],['true','股东']])}
        </>)}
        {section('余额调整（单独保存）', <>
          <div className="md:col-span-2 text-sm text-amber-800 rounded-lg bg-amber-50 p-3">修改余额会按实际差额记账，不代表微信或现金充值到账。余额与其他资料请分开保存。</div>
          {field('storedValueBalance','储值余额（元）','number')}
          <div className="text-sm self-end py-2">原余额：¥{Number(customer?.storedValueBalance || 0).toFixed(2)}<br/>本次差额：{Number.isFinite(Number(draft.storedValueBalance)) ? '¥'+(Number(draft.storedValueBalance)-Number(customer?.storedValueBalance || 0)).toFixed(2) : '请填写有效金额'}</div>
        </>)}
        <details className="mb-6"><summary className="cursor-pointer font-bold text-gray-800 mb-3">历史资料与人工纠错</summary>
          <p className="text-sm text-gray-500 mb-3">保留原有人工维护能力；没有修改的字段不会提交。累计消费与上次到店不等于本次收款。</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('points','积分','number')}{field('totalSpent','累计消费金额（元）','number')}
            {field('lastStylist','上次服务设计师')}{field('lastServiceItems','上次消费项目（用、分隔）')}
            {field('lastVisitAt','上次到店时间（北京时间）','datetime-local')}{select('hasBooking','是否有预约',yesNo)}
            {select('isReferred','是否转介绍',yesNo)}{field('referrerName','转介绍人员姓名')}{field('referrerPhone','转介绍人员电话','tel')}
            {field('referralConsumption','转介绍带来的消费（元）','number')}{field('sharedFund','共享基金（元）','number')}
            {field('totalSharedFund','合计共享基金（元）','number')}{field('withdrawableAmount','可消费金额（元）','number')}
          </div>
        </details>
      </fieldset>
      {saveError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{saveError}</p>}
      <div className="flex gap-3 justify-end border-t pt-4"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl bg-gray-100 px-5 py-2.5">取消</button><button type="submit" disabled={saving || !enabled} className="rounded-xl bg-orange-500 text-white px-5 py-2.5 disabled:opacity-50">{saving ? '保存中…' : '保存'}</button></div>
    </form>
  </div>;
}
