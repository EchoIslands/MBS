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

test('transient timeout retries the failed page and preserves completed pages', async () => {
  const reads: number[] = [];
  let failed = false;
  const rows = await readCustomerDirectory(async page => {
    reads.push(page);
    if (page === 1 && !failed) { failed = true; throw Object.assign(new Error('timeout'), { code: 'REQUEST_TIMEOUT' }); }
    return { success: true, data: [{ id: 'customer-' + page }] as Customer[], hasMore: page === 0 };
  });
  assert.deepEqual(reads, [0, 1, 1]);
  assert.equal(rows.length, 2);
});

test('permanent failure, unauthorized and cancelled reads do not loop or expose partial totals', async () => {
  for (const status of [401, 403, 409, 503]) {
    let calls = 0;
    await assert.rejects(readCustomerDirectory(async () => { calls++; throw Object.assign(new Error('failed'), { status }); }), /failed/);
    assert.equal(calls, status === 503 ? 2 : 1);
  }
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(readCustomerDirectory(async () => {
    calls++; controller.abort(); throw new TypeError('cancelled network request');
  }, undefined, controller.signal));
  assert.equal(calls, 1);
});

test('remaining directory pages run concurrently in bounded batches, with ordered complete results',async()=>{
  let active=0,peak=0;
  const result=await readCustomerDirectory(async page=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,5));
    active--;
    return {success:true,data:[{id:'page-'+page}] as Customer[],hasMore:page<6,...(page===0?{total:7,pageSize:1}:{})};
  });
  assert.equal(peak,3);
  assert.deepEqual(result.map(row=>row.id),Array.from({length:7},(_,i)=>'page-'+i));
});
