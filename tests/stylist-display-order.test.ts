import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { sortStylistsByRank as sortH5 } from '../shared/lib/stylistOrder';

test('小程序与 H5 同样按店长、金牌、普通排序且保留同级原顺序', async () => {
  const people = [
    { id: 'normal-a', role: 'stylist' },
    { id: 'gold-a', role: 'stylist', isGoldStylist: true },
    { id: 'manager', role: 'shop_manager', isGoldStylist: true },
    { id: 'normal-b', role: 'stylist' },
    { id: 'gold-b', role: 'stylist', isGoldStylist: true },
  ];
  const expected = ['manager', 'gold-a', 'gold-b', 'normal-a', 'normal-b'];
  const source = await readFile(new URL('../mini-program/utils/stylist-order.js', import.meta.url), 'utf8');
  const context = vm.createContext({ people });
  const miniResult = vm.runInContext(source.replace('export function', 'function') + '\nsortStylistsByRank(people).map(p => p.id)', context);
  assert.deepEqual(sortH5(people).map(p => p.id), expected);
  assert.deepEqual(Array.from(miniResult), expected);
  assert.equal(people[0].id, 'normal-a', '不修改服务器返回的原数组');
});
