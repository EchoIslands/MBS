import { Customer, MembershipLevel, PurchaseVIPLevel, StoredValueLevel } from '../../shared/types';
import { getStoredValueLabel } from './membership';
import { beijingDateTimeInput, manualPaymentTimeIso } from '../../shared/lib/manualPaymentTime';

export type CustomerDraft = Record<string, string>;
export const customerTextFields = ['name','phone','wechat','gender','age','idCardNumber','hobbies','source','purchaseVIPLevel','storedValueLevel','storedValueBalance','points','lastStylist','totalSpent','referrerName','referrerPhone','referralConsumption','sharedFund','totalSharedFund','withdrawableAmount'] as const;
const numeric = new Set(['age','storedValueBalance','points','totalSpent','referralConsumption','sharedFund','totalSharedFund','withdrawableAmount']);
export function customerDraft(customer?: Customer): CustomerDraft {
  const draft: CustomerDraft = {};
  for (const key of customerTextFields) draft[key] = customer?.[key] == null ? '' : String(customer[key]);
  draft.gender ||= 'other';
  draft.purchaseVIPLevel ||= PurchaseVIPLevel.REGULAR;
  draft.storedValueLevel ||= StoredValueLevel.NONE;
  draft.birthday = customer?.birthday ? new Date(customer.birthday).toISOString().slice(0,10) : '';
  draft.lastVisitAt = customer?.lastVisitAt ? beijingDateTimeInput(new Date(customer.lastVisitAt).getTime()) : '';
  draft.lastServiceItems = customer?.lastServiceItems?.join('、') || '';
  for (const key of ['isStockholder','isReferred','hasBooking'] as const) draft[key] = customer?.[key] ? 'true' : 'false';
  return draft;
}

/** Compare form representations first; unchanged NULL/derived/date fields never become writes. */
export function customerPatch(draft: CustomerDraft, previous?: Customer): Partial<Customer> {
  const baseline = customerDraft(previous);
  const patch: Record<string, unknown> = {};
  if (!draft.name?.trim() || !/^1[3-9]\d{9}$/.test(draft.phone?.trim() || '')) throw new Error('请填写客户姓名和有效的11位手机号');
  for (const [key, value] of Object.entries(draft)) {
    if (value === baseline[key]) continue;
    if (numeric.has(key)) {
      if (value === '') { patch[key] = key === 'age' ? null : 0; continue; }
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || (['age','points'].includes(key) && !Number.isInteger(number))) throw new Error('金额、积分和年龄必须是有效非负数字；积分和年龄为整数');
      patch[key] = number;
    } else if (['isStockholder','isReferred','hasBooking'].includes(key)) patch[key] = value === 'true';
    else if (key === 'birthday') patch[key] = value || null;
    else if (key === 'lastVisitAt') patch[key] = manualPaymentTimeIso(value, Date.now(), '上次到店时间') || null;
    else if (key === 'lastServiceItems') patch[key] = value.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
    else patch[key] = ['name','phone'].includes(key) ? value.trim() : value;
  }
  // Preserve legacy compatibility only when an explicit membership control actually changes.
  if (['purchaseVIPLevel','storedValueLevel','isStockholder'].some(key => key in patch)) {
    const stockholder = draft.isStockholder === 'true';
    const member = stockholder || draft.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR || draft.storedValueLevel !== StoredValueLevel.NONE;
    patch.membershipLevel = stockholder ? MembershipLevel.STOCKHOLDER : member ? MembershipLevel.PREMIUM : MembershipLevel.REGULAR;
    patch.isMember = member;
    if ('storedValueLevel' in patch) {
      patch.hasRecharged = draft.storedValueLevel !== StoredValueLevel.NONE;
      patch.rechargeLevel = getStoredValueLabel(draft.storedValueLevel as StoredValueLevel);
    }
    if (stockholder && previous && !previous.isStockholder) patch.stockholderSince = new Date();
  }
  if (previous && 'storedValueBalance' in patch && Object.keys(patch).some(key => key !== 'storedValueBalance')) {
    throw new Error('余额调整请单独保存；其他资料请另一次修改，避免资金与资料部分保存');
  }
  if (!previous) return { name:draft.name.trim(), phone:draft.phone.trim(), gender:'other', tags:[], membershipLevel:MembershipLevel.REGULAR, purchaseVIPLevel:PurchaseVIPLevel.REGULAR, storedValueLevel:StoredValueLevel.NONE, ...patch } as Partial<Customer>;
  return patch as Partial<Customer>;
}
