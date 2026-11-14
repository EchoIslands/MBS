import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDurationEstimator, describeQueue, type QueueRow } from '../shared/lib/liveQueue';
const now = Date.parse('2026-11-14T06:00:00Z');
const row = (patch: Partial<QueueRow> = {}): QueueRow => ({ id: 'b', shop_id: 's', customer_id: 'c', status: 'confirmed', scheduled_time: new Date(now).toISOString(), stylist_id: 'a', service_id: 'cut', planned_duration_minutes: 40, ...patch });
const sample = (minutes: number, patch: Partial<QueueRow> = {}) => row({ actual_start_time: new Date(now - 86400000 - minutes * 60000).toISOString(), actual_end_time: new Date(now - 86400000).toISOString(), ...patch });
test('等待范围只使用同发型师同服务有效样本，不混入取消/未来/陈旧/无效时间', () => {
  const history = [20,25,30,35,40,45,50,55].map(n => sample(n));
  history.push(sample(400, {stylist_id:'other'}), sample(400,{service_id:'dye'}), sample(400,{status:'cancelled'}), sample(400,{actual_end_time:new Date(now+86400000).toISOString()}), sample(400,{actual_end_time:new Date(now-100*86400000).toISOString()}), sample(2), sample(500), sample(40,{actual_start_time:'invalid'}));
  const estimate = createDurationEstimator(history,now);
  assert.deepEqual(estimate(row()), {low:35,high:50,source:'该发型师同类服务历史范围',samples:8});
  assert.deepEqual(estimate(row({stylist_id:'new'})), {low:30,high:60,source:'服务参考时长，历史样本不足',samples:0});
});
test('服务中估计复用同一快照时钟和预编译样本，人工剩余时间优先，不自动结束服务', () => {
  const mine=row({queue_state:'arrived',arrived_at:new Date(now-600000).toISOString()});
  const current=row({id:'serving',queue_state:'serving',actual_start_time:new Date(now-600000).toISOString(),progress_remaining_minutes:10,progress_updated_at:new Date(now).toISOString()});
  const result=describeQueue(mine,[mine,current],[],now);
  assert.equal(result.waitLow,5);assert.equal(result.waitHigh,20);assert.equal(result.aheadCount,1);
  assert.equal(current.queue_state,'serving');
});
