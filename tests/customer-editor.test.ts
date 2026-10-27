import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customerDraft, customerPatch } from '../src/lib/customerEditor.js';
import { Customer, PurchaseVIPLevel, StoredValueLevel } from '../shared/types.js';
import { customerValuesEqual, mapCustomerBodyToDB } from '../backend/utils/customerMapper.js';

const customer = {
  id:'synthetic',name:'Synthetic',phone:'13800000001',tags:[],gender:'other',
  purchaseVIPLevel:PurchaseVIPLevel.REGULAR,storedValueLevel:StoredValueLevel.NONE,
  storedValueBalance:0,balance:0,points:0,totalSpent:126,isStockholder:false,
  lastVisitAt:new Date('2026-09-24T08:36:33.685Z'),age:null,
  sharedFund:null,totalSharedFund:null,withdrawableAmount:null,rechargeLevel:'',
} as unknown as Customer;

test('统一表单：仅余额0改35，不携带旧日期、空值、兼容会员或展示占位字段',()=>{
  const draft=customerDraft(customer);draft.storedValueBalance='35';
  assert.deepEqual(customerPatch(draft,customer),{storedValueBalance:35});
  assert.deepEqual(customerPatch(customerDraft(customer),customer),{});
  assert.equal(customer.lastVisitAt?.toISOString(),'2026-09-24T08:36:33.685Z');
});

test('统一表单：空值清除、0和false明确提交；不能静默把无效金额当0',()=>{
  const previous={...customer,age:20,isReferred:true,storedValueBalance:35};
  const draft=customerDraft(previous);draft.age='';draft.isReferred='false';
  assert.deepEqual(customerPatch(draft,previous),{age:null,isReferred:false});
  const money=customerDraft(previous);money.storedValueBalance='0';
  assert.deepEqual(customerPatch(money,previous),{storedValueBalance:0});
  money.storedValueBalance='NaN';assert.throws(()=>customerPatch(money,previous),/有效非负/);
  money.storedValueBalance='-1';assert.throws(()=>customerPatch(money,previous),/有效非负/);
});

test('统一表单：余额与资料分开保存，拒绝形成资金已改但资料失败的请求',()=>{
  const draft=customerDraft(customer);draft.name='Edited';draft.storedValueBalance='35';
  assert.throws(()=>customerPatch(draft,customer),/单独保存/);
});

test('统一表单：只在主动修改到店时间时写北京时间，不损失未改原始时刻',()=>{
  const previousZone=process.env.TZ;process.env.TZ='America/New_York';
  try {
    const draft=customerDraft(customer);
    assert.equal(draft.lastVisitAt,'2026-09-24T16:36');
    draft.lastVisitAt='2026-09-24T16:37';
    assert.deepEqual(customerPatch(draft,customer),{lastVisitAt:'2026-09-24T08:37:00.000Z'});
    draft.lastVisitAt='';assert.deepEqual(customerPatch(draft,customer),{lastVisitAt:null});
  }finally{if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;}
});

test('服务端日期映射：只截生日，账户timestamp保留原始时分秒并等价比较时区',()=>{
  const mapped=mapCustomerBodyToDB({birthday:'2000-01-01T00:00:00Z',lastVisitAt:'2026-09-24T08:36:33.685Z',stockholderSince:'2026-09-24T08:36:33.685Z'});
  assert.equal(mapped.birthday,'2000-01-01');
  assert.equal(mapped.last_visit_at,'2026-09-24T08:36:33.685Z');
  assert.equal(mapped.stockholder_since,'2026-09-24T08:36:33.685Z');
  assert.equal(customerValuesEqual('last_visit_at',mapped.last_visit_at,'2026-09-24T16:36:33.685+08:00'),true);
  assert.equal(customerValuesEqual('last_visit_at',mapped.last_visit_at,'2026-09-24'),false);
});

test('上次服务：门店新增、修改、清除三项；不改字段保持原精度且不提交',()=>{
  const draft=customerDraft();
  Object.assign(draft,{name:'合成顾客',phone:'13800000005',lastStylist:'历史发型师',lastVisitAt:'2026-09-23T15:20',lastServiceItems:'洗剪吹、染发，护理'});
  const patch=customerPatch(draft);
  assert.equal(patch.lastStylist,'历史发型师');
  assert.equal(String(patch.lastVisitAt),'2026-09-23T07:20:00.000Z');
  assert.deepEqual(patch.lastServiceItems,['洗剪吹','染发','护理']);
  const saved={...customer,...patch} as Customer;
  assert.deepEqual(customerPatch(customerDraft(saved),saved),{});
  const edit=customerDraft(saved);edit.lastStylist='新发型师';
  assert.deepEqual(customerPatch(edit,saved),{lastStylist:'新发型师'});
  Object.assign(edit,{lastStylist:'',lastVisitAt:'',lastServiceItems:''});
  assert.deepEqual(customerPatch(edit,saved),{lastStylist:'',lastVisitAt:null,lastServiceItems:[]});
  const mapped=mapCustomerBodyToDB(patch as Record<string,unknown>);
  assert.equal(mapped.last_stylist,'历史发型师');
  assert.equal(mapped.last_visit_at,'2026-09-23T07:20:00.000Z');
  assert.deepEqual(mapped.last_service_items,['洗剪吹','染发','护理']);
});
