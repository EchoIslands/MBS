import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function bookingPage() {
  const notifications: string[] = [];
  const calls: unknown[] = [];
  const navigation: string[] = [];
  let page: vm.Context;
  const context = vm.createContext({
    Page(config: vm.Context) { page = config; },
    bookingSlots() { return ['10:00', '10:30']; },
    wx: { showToast(options: {title?:string;url?:string}) { notifications.push(options.title); }, navigateTo(options: {title?:string;url?:string}) { navigation.push(options.url); } },
    createBooking(options: unknown) { calls.push(options); return Promise.resolve({ id: 'booking' }); },
    setRouteParams() {}, trackBookingComplete() {}, console,
  });
  const order = (await readFile(new URL('../mini-program/utils/stylist-order.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
  vm.runInContext(order, context);
  const swipe = (await readFile(new URL('../mini-program/utils/tab-swipe.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
  vm.runInContext(swipe, context);
  const source = (await readFile(new URL('../mini-program/pages/booking/booking.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(source, context);
  page.setData = (changes: Record<string, unknown>) => Object.assign(page.data, changes);
  page.data.shop = {
    id: 'shop1', services: [
      { id: 'ordinary', name: '设计师洗剪吹', duration: 30 },
      { id: 'gold', name: '金牌发型师洗剪吹', duration: 30, requiresGoldStylist: true },
      { id: 'manager', name: '店长/总监发型设计（含洗剪吹）', duration: 30, requiresShopManager: true },
    ],
    employees: [
      { id: 'normal', name: '普通设计师', role: 'stylist', isGoldStylist: false },
      { id: 'gold', name: '金牌设计师', role: 'stylist', isGoldStylist: true },
      { id: 'manager', name: '店长', role: 'shop_manager', isGoldStylist: false },
    ],
  };
  page.data.selectedDate = '2026-11-01';
  page.data.selectedTime = '10:00';
  page.data.customerId = 'customer';
  return { page, calls, notifications, navigation };
}

test('小程序切换限定服务重置旧人选，智能匹配及提交只用对应级别', async () => {
  const { page, calls, notifications, navigation } = await bookingPage();
  page.data.selectedService = 'ordinary';
  page.updateStylists(page.data.shop.employees);
  page.data.selectionMode = 'specific';
  page.data.selectedBarberId = 'normal';
  page.onServiceSelect({ currentTarget: { dataset: { id: 'gold' } } });
  assert.equal(page.data.selectionMode, 'fastest');
  assert.equal(page.data.selectedBarberId, '');
  assert.equal(page.data.stylists.find((s: {id:string;eligible:boolean}) => s.id === 'normal').eligible, false);
  assert.notEqual(page.data.fastest.id, 'normal');
  page.data.selectionMode = 'specific';
  page.data.selectedBarberId = 'normal';
  await page.doBooking();
  assert.equal(calls.length, 0);
  assert.match(notifications.at(-1)!, /对应级别/);
  page.onServiceSelect({ currentTarget: { dataset: { id: 'manager' } } });
  assert.deepEqual(Array.from(page.data.stylists.filter((s: {id:string;eligible:boolean}) => s.eligible).map((s: {id:string;eligible:boolean}) => s.id)), ['manager']);
  assert.equal(page.data.fastest.id, 'manager');
  await page.doBooking();
  assert.equal((calls[0] as {stylistId:string}).stylistId, 'manager');
  assert.deepEqual(navigation, ['/pages/queue/queue']);
  assert.equal(notifications.length, 1);
});
