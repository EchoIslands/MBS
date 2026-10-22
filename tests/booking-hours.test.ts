import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bookingSlots,startsDuringOpening} from '../shared/lib/bookingHours.js';

test('三端按门店营业配置展示和校验；休息日、边界、缺配置兼容',async()=>{
  const hours={thursday:{isOpen:true,open:'10:15',close:'19:00'},friday:{isOpen:false,open:'09:00',close:'21:00'}};
  assert.equal(bookingSlots('2026-10-22',hours)[0],'10:30');
  assert.equal(bookingSlots('2026-10-22',hours).at(-1),'18:30');
  assert.deepEqual(bookingSlots('2026-10-23',hours),[]);
  assert.equal(startsDuringOpening(new Date('2026-10-22T10:14:00+08:00'),hours),false);
  assert.equal(startsDuringOpening(new Date('2026-10-22T10:15:00+08:00'),hours),true);
  assert.equal(startsDuringOpening(new Date('2026-10-22T19:00:00+08:00'),hours),false);
  assert.equal(startsDuringOpening(new Date('2026-10-23T11:00:00+08:00'),hours),false);
  assert.equal(bookingSlots('2026-10-24').length,24);
  const source=(await readFile(new URL('../mini-program/utils/booking-hours.js',import.meta.url),'utf8')).replace('export function','function');
  const context=vm.createContext({});vm.runInContext(source,context);
  for(const date of ['2026-10-22','2026-10-23','2026-10-24']) {
    context.date=date;context.hours=hours;
    assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('bookingSlots(date,hours)',context))),bookingSlots(date,hours));
  }
});
