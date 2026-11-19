import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function bookingPage(now?: string) {
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
  if (now) vm.runInContext(`const RealDate = Date; Date = class extends RealDate { constructor(...args) { if(args.length) super(...args); else super('${now}'); } static now() { return new RealDate('${now}').getTime(); } };`, context);
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
  return { page, calls, notifications, navigation, context };
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


test('未来日期含跨年北京时间，日历切换刷新对应档期，迟到请求不能覆盖新日期', async () => {
 const {page, context} = await bookingPage('2026-12-31T16:30:00Z');
 assert.equal(page.data.dates[0].value,'2027-01-01');
 assert.equal(page.data.dates[0].label,'1月1日');
 assert.equal(page.data.dates[0].weekDay,'周五');
 assert.equal(page.data.dates[14].value,'2027-01-15');
 const requests: {date:string;resolve:(rows:unknown[])=>void}[]=[];
 context.getBookingsByShop=(_shop:string,date:string)=>new Promise(resolve=>requests.push({date,resolve}));
 page.data.selectedService='ordinary';
 const first=page.onCalendarChange({detail:{value:'2027-01-02'}});
 assert.equal(page.data.selectedDate,'2027-01-02');assert.equal(page.data.bookingsError,true);
 const second=page.onDateSelect({currentTarget:{dataset:{value:'2027-01-03'}}});
 assert.deepEqual(requests.map(r=>r.date),['2027-01-02','2027-01-03']);
 requests[1].resolve([]); await second;
 assert.equal(page.data.bookingsError,false);
 requests[0].resolve([{id:'old',status:'confirmed',stylistId:'normal',scheduledTime:'2027-01-02T02:00:00Z'}]);await first;
 assert.equal(page.data.selectedDate,'2027-01-03');assert.equal(page.data.existingBookings.length,0);
 assert.equal(page.data.timeSlots.length,2);
 page.onCalendarChange({detail:{value:'2027-01-16'}});assert.equal(requests.length,2);
});

test('未来日期预约按北京时间提交，不随设备时区偏移', async()=>{
 const {page,calls}=await bookingPage('2026-12-31T16:30:00Z');
 page.data.selectedDate='2027-01-02';page.data.selectedTime='10:00';page.data.selectedService='ordinary';
 page.updateStylists(page.data.shop.employees);await page.doBooking();
 assert.equal((calls[0] as {scheduledTime:string}).scheduledTime,'2027-01-02T02:00:00.000Z');
});

test('预约页并行读取门店、档期和会员价，档期先返回时也能正确生成可选时段', async () => {
 const {page,context,notifications,calls}=await bookingPage('2026-11-02T00:00:00Z');
 context.takeRouteParams=()=>null;context.getCustomerId=()=> 'customer';context.trackBookingStart=()=>{};
 const shop = page.data.shop;
 page.data.shop = null;
 page.data.selectedService = 'ordinary';
 let finishShop!: () => void;
 let finishCustomer!: () => void;
 let finishBookings!: (rows: unknown[]) => void;
 page.loadShop=()=>new Promise<void>(resolve=>{finishShop=()=> {
   page.setData({shop, loading:false});
   page.updateStylists(shop.employees);
   page.updateTimeSlots();
   resolve();
 };});
 page.loadCustomer=()=>new Promise<void>(resolve=>{finishCustomer=resolve});
 context.getBookingsByShop=()=>new Promise(resolve=>{finishBookings=resolve;});
 page.refreshServicesWithCustomer=()=>{};
 const pending=page.onLoad({});
 assert.equal(typeof finishBookings,'function');
 assert.equal(typeof finishCustomer,'function');
 assert.equal(page.data.loading,true);
 assert.equal(page.data.bookingsLoading,true);
 finishBookings([]);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.data.bookingsLoading,false);
 finishShop();
 assert.equal(page.data.loading,false);
 assert.equal(page.data.selectedTime,'10:00');
 await page.handleBooking();assert.equal(calls.length,0);assert.match(notifications.at(-1),/核对会员价格/);
 finishCustomer();await pending;
});
