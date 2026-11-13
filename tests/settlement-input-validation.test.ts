import assert from 'node:assert/strict';
import {test} from 'node:test';

process.env.SUPABASE_URL = 'https://synthetic.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
const {priceSettlement} = await import('../backend/lib/settlementPricing.js');

test('结算基础输入在任何数据库请求前拒绝错误项目和权益格式', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('禁止测试访问外网'); };
  const valid = {customerId:'c', items:[{id:'cut',type:'service',quantity:1}]};
  try {
    for (const input of [null, {}, {...valid,customerId:[]}, {...valid,items:[null]},
      {...valid,items:[[]]}, {...valid,items:[]}, {...valid,usedBenefitIds:'benefit'},
      {...valid,usedBenefitIds:[null]}, {...valid,usedBenefitIds:['b','b']}]) {
      await assert.rejects(priceSettlement('s', input as Parameters<typeof priceSettlement>[1]), /客户信息|结算项目|权益/);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
