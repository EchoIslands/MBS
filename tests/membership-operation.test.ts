import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipOperation } from '../shared/lib/membershipOperation.js';
const now = Date.parse('2026-11-14T00:00:00Z');
const expiry = '2027-01-01T00:00:00.000Z';
test('same tier renewal charges full annual fee and extends from expiry', () => {
  const q = membershipOperation('gold', expiry, 'gold', now);
  assert.equal(q.amount, 79);
  assert.equal(q.expiresAt, '2028-01-01T00:00:00.000Z');
});
test('upgrade preserves expiry and grants only incremental benefits', () => {
  const q = membershipOperation('silver', expiry, 'gold', now);
  assert.equal(q.amount, 20); assert.equal(q.expiresAt, expiry);
  assert.deepEqual(q.grantedBenefits, ['redo']);
});
test('expired membership earns no credit and starts a fresh annual term', () => {
  const q = membershipOperation('diamond', '2025-01-01', 'bronze', now);
  assert.equal(q.action, 'open'); assert.equal(q.amount, 29);
  assert.equal(Date.parse(q.expiresAt!) - now, 365 * 86400000);
});
test('downgrade and cancellation never imply a refund or new gifts', () => {
  const q = membershipOperation('diamond', expiry, 'bronze', now);
  assert.equal(q.amount, 0); assert.equal(q.expiresAt, expiry); assert.deepEqual(q.grantedBenefits, []);
  assert.equal(membershipOperation('gold', expiry, 'regular', now).expiresAt, null);
});
test('legacy perpetual tier changes do not invent an expiry', () => {
  assert.equal(membershipOperation('bronze', null, 'gold', now).expiresAt, null);
  assert.throws(() => membershipOperation('gold', expiry, 'invalid', now));
});
