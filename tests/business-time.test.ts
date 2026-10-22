import assert from 'node:assert/strict';
import {test} from 'node:test';
import {businessDate,businessDayRange,businessPeriods} from '../backend/lib/businessTime.js';

test('北京时间跨日、跨年和周起点不依赖部署时区',()=>{
  const p=businessPeriods(new Date('2026-12-31T16:05:00Z'));
  assert.equal(p.today.toISOString(),'2026-12-31T16:00:00.000Z');
  assert.equal(p.yearStart.toISOString(),'2026-12-31T16:00:00.000Z');
  assert.equal(businessDate(new Date('2026-12-31T16:05:00Z')),'2027-01-01');
  assert.equal(businessDate(p.weekStart),'2026-12-27');
  assert.equal(businessDayRange('2026-10-22')?.start.toISOString(),'2026-10-21T16:00:00.000Z');
  assert.equal(businessDayRange('2026-10-22')?.end.toISOString(),'2026-10-22T16:00:00.000Z');
  for(const bad of ['2026-02-30','2026-13-01','invalid','2026-1-01']) assert.equal(businessDayRange(bad),null);
});
