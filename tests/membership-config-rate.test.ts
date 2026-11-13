import assert from 'node:assert/strict';
import test from 'node:test';
import { membershipConfigRate } from '../backend/lib/membershipConfigRate';

test('缺失或损坏的会员倍率读取为基础倍率，保留有效折扣、倍数和零值', () => {
  for (const value of [undefined, null, '', ' ', 'invalid', NaN, Infinity, -1, true, {}, []]) {
    assert.equal(membershipConfigRate(value), 1, String(value));
  }
  for (const [value, expected] of [[0, 0], ['0', 0], [0.58, 0.58], ['0.88', 0.88], [2, 2]] as const) {
    assert.equal(membershipConfigRate(value), expected);
  }
});
