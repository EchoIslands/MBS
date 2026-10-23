import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Settlement, Booking } from '../shared/types.js';
import { businessDateKey, buildOwnerDashboard, buildStylistPerformances } from '../shared/lib/dashboardStats.js';
const now = new Date('2026-10-23T12:00:00+08:00');
const row = (overrides: Partial<Settlement> = {}): Settlement => ({
 id:'old-paid',shopId:'s1',customerId:'c1',customerName:'合成顾客',createdAt:new Date('2024-01-01T00:00:00Z'),total:33.64,
 paymentMethod:'wechat',paymentStatus:'completed',paymentId:'pay',transactionId:'wx',paymentAmount:33.64,paymentRecordStatus:'paid',
 paidAt:'2026-10-23T00:01:00+08:00',paidAtSource:'wechat_success_time',subtotal:58,discount:24.36,tax:0,discountDetail:{} as Settlement['discountDetail'],
 items:[{id:'svc',name:'洗剪吹',type:'service',quantity:2,originalPrice:58,discountedPrice:16.82,total:33.64,employeeId:'stylist',employeeName:'合成设计师'}],...overrides,
});
const emp = [{id:'stylist',name:'合成设计师',title:'设计师'},{id:'other',name:'其他设计师'}];
test('经营看板：旧单今天付款跨北京时间午夜，金额和本月服务次数一致，历史不再累加进本月',()=>{
 const records=[row(),row({id:'last-month',paidAt:'2026-09-30T10:00:00+08:00'}),row({id:'missing',paidAtSource:undefined}),row({id:'draft',paymentStatus:'pending'})];
 const [p,other]=buildStylistPerformances(records,emp,[{stylistId:'stylist',score:4},{stylistId:'stylist',score:5}],now);
 assert.equal(p.revenue.today,33.64);assert.equal(p.revenue.month,33.64);assert.equal(p.revenue.year,67.28);
 assert.equal(p.services.total,2);assert.deepEqual(p.services.byType,{'洗剪吹':2});assert.equal(p.averageRating,4.5);
 assert.equal(p.excluded?.count,1);assert.equal(p.excluded?.amount,33.64);assert.match(p.commissionNote!,/门店确认/);assert.equal(other.revenue.year,0);
 const owner=buildOwnerDashboard(records,[],{id:'s1',name:'店铺'},4,[],now);
 assert.equal(owner.totalRevenue.today,33.64);assert.equal(owner.totalServices.month,2);assert.equal(owner.excluded?.count,1);
 assert.equal(owner.periodDetails?.today.shopStats[0].revenue,33.64);assert.equal(owner.shopStats[0].employees,4);
 assert.equal(owner.periodDetails?.today.topStylists[0].revenue,33.64);assert.equal(owner.topStylists[0].rating,0);
 assert.equal(businessDateKey('2026-10-22T16:01:00Z'),'2026-10-23');assert.equal(businessDateKey('bad'),'');
});
test('经营看板：各周期明细与排名同步切换，预约人数有结束边界且排除取消/他店/空客户',()=>{
 const booking=(date:string,status='confirmed',customerId='c1',shopId='s1')=>({scheduledTime:date,status,customerId,shopId}) as Booking;
 const bookings=[booking('2026-10-23T20:00:00+08:00'),booking('2026-10-23T21:00:00+08:00'),booking('2026-10-24T09:00:00+08:00','confirmed','c2'),
 booking('2026-11-01T00:00:00+08:00','confirmed','future'),booking('2026-10-23T09:00:00+08:00','cancelled','cancelled'),
 booking('2026-10-23T09:00:00+08:00','confirmed','foreign','s2'),booking('2026-10-23T09:00:00+08:00','confirmed','')];
 const records=[row(),row({paidAt:'2026-10-01T12:00:00+08:00'})];
 const owner=buildOwnerDashboard(records,bookings,{id:'s1',name:'店铺'},2,[],now);
 assert.equal(owner.totalCustomers.today,1);assert.equal(owner.totalCustomers.month,2);assert.equal(owner.totalCustomers.year,3);
 assert.equal(owner.totalRevenue.month,67.28);assert.equal(owner.periodDetails?.today.shopStats[0].revenue,33.64);
 assert.equal(owner.periodDetails?.week.topStylists[0].services,2);assert.equal(owner.periodDetails?.month.topStylists[0].services,4);
});
test('经营看板：无业绩、无评分和未来支付不造出经营结果；跨月周与非微信登记口径',()=>{
 const date=new Date('2026-10-02T12:00:00+08:00');
 const cash=row({paymentMethod:'cash',createdAt:new Date('2026-09-30T00:10:00+08:00')});
 const future=row({paidAt:'2026-10-03T00:00:00+08:00'});
 const owner=buildOwnerDashboard([cash,future],[],{id:'s1',name:'店铺'},0,[],date);
 assert.equal(owner.totalRevenue.today,0);assert.equal(owner.totalRevenue.week,33.64);assert.equal(owner.totalRevenue.month,0);assert.equal(owner.periodDetails?.week.topStylists[0].revenue,33.64);assert.equal(owner.excluded?.count,1);
 const empty=buildStylistPerformances([],emp,[],date)[0];assert.equal(empty.averageRating,0);assert.equal(empty.estimatedCommission,0);
 assert.deepEqual(empty.services,{total:0,byType:{}});assert.equal(owner.periodDetails?.today.topStylists.length,0);
});
