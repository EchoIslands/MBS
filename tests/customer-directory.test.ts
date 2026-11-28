import test from 'node:test';
import assert from 'node:assert/strict';
import type { Customer } from '../shared/types';
import { readCustomerDirectory } from '../src/lib/customerDirectory';

test('directory reads every page and reports progress without publishing a partial result', async () => {
  const progress: number[] = [];
  const rows = await readCustomerDirectory(async page => ({
    success: true, data: [{ id: 'customer-' + page }] as Customer[], hasMore: page < 5,
  }), count => progress.push(count));
  assert.equal(rows.length, 6);
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6]);
});

test('directory rejects missing pages, transport errors and duplicate records instead of displaying incorrect totals', async () => {
  await assert.rejects(readCustomerDirectory(async page => page === 0
    ? { success: true, data: [{ id: 'first' }] as Customer[], hasMore: true } : null), /不完整/);
  await assert.rejects(readCustomerDirectory(async () => { throw new Error('offline'); }), /offline/);
  await assert.rejects(readCustomerDirectory(async () => ({ success: true, data: [{ id: 'same' }] as Customer[], hasMore: true })), /发生变化/);
});
