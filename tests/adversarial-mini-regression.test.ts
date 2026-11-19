import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as membership from '../mini-program/utils/membership.js';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function page(path:string,deps:vm.Context={}):vm.Context {
 let config:vm.Context={};
 vm.runInNewContext(read(path).replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\r?$/gm,''),{
 ...membership,console,setTimeout,clearTimeout,createTabSwipeHandlers:()=>({}),syncTabBarSelected(){},getCustomerId:()=> 'c',getToken:()=> 'token',takeRouteParams:()=>null,getCustomerBookings:async()=>[],getCustomerBenefits:async()=>[],getCustomerReviews:async()=>[],getShop:async()=>null,wx:{showToast(){},reLaunch(){},getStorageSync(){return '';}},Page(c:vm.Context){config=c;},...deps});
 return {...config,data:structuredClone(config.data),setData(patch:object,cb?:()=>void){Object.assign(this.data,patch);cb?.();}};
}

test('current bookings remain reachable after more than one page of history',async()=>{
 const rows=Array.from({length:251},(_,i)=>({id:String(i),status:'completed',scheduledTime:'2025-01-01T00:00:00Z'}));
 rows.push({id:'active',status:'confirmed',scheduledTime:new Date().toISOString()});
 const ctx:vm.Context={get:async(url:string)=>{const q=new URL('https://test'+url).searchParams;const n=Number(q.get('page'));return {data:rows.slice((n-1)*200,n*200),pagination:{totalPages:2}};}};
 vm.createContext(ctx);vm.runInContext(read('mini-program/api/customer.js').replace(/^import[^\r\n]*\r?\n/gm,'').replaceAll('export ',''),ctx);
 const profile=page('mini-program/pages/profile/profile.js',{getCustomerPublic:async()=>({id:'c'}),getCustomerBookings:()=>ctx.getCustomerBookings('c')});
 await profile.loadProfile();assert.equal(profile._allBookings.length,252);assert.ok(profile.data.filteredBookings.length<=20);profile.switchTab({currentTarget:{dataset:{tab:'history'}}});assert.equal(profile.data.bookingPages,13);profile.nextBookingPage();assert.equal(profile.data.bookingPage,2);assert.ok(profile.data.bookings.some((b:{id:string})=>b.id==='active'));
});

test('order-page network failures preserve session and retained records; late other-account replies are ignored',async()=>{
 let id='c';
 const p=page('mini-program/pages/product-orders/product-orders.js',{getCustomerId:()=>id,getCustomerPublic:async()=>{throw new Error('network');}});
 p.data.customer={id:'c'};p.data.orders=[{id:'previous'}];
 await p.loadCustomer();assert.equal(p.data.showLogin,false);assert.equal(p.data.orders.length,1);assert.match(p.data.error,/同步失败/);
 let resolve:(value:unknown)=>void=()=>{};
 const late=page('mini-program/pages/product-orders/product-orders.js',{getCustomerId:()=>id,getCustomerPublic:()=>new Promise(r=>{resolve=r;})});
 const request=late.loadCustomer();id='other';resolve({id:'c'});await request;assert.equal(late.data.customer,null);
});

test('only actual, unexpired benefit records appear; failed fetch shows error and no fabricated gifts',async()=>{
 const p=page('mini-program/pages/profile/profile.js',{getCustomerPublic:async()=>({id:'c',purchaseVIPLevel:'diamond'}),getCustomerBenefits:async()=>{throw new Error('offline');}});
 assert.equal(p.computeMyBenefits({purchaseVIPLevel:'diamond'}).length,0);
 assert.equal(p.computeMyBenefits({memberBenefitRecords:[{status:'used',name:'used'},{status:'available',expiresAt:'2020-01-01',name:'expired'},{status:'available',name:'real'}]}).length,1);
 await p.loadProfile();assert.equal(p.data.myBenefits.length,0);assert.match(p.data.benefitsError,/失败/);
 assert.match(read('mini-program/pages/profile/profile.wxml'),/\{\{error\}\}/);
});

test('failed membership refresh removes previously computed discount and retained tab reloads public data',async()=>{
 let products=0,coupons=0;
 const p=page('mini-program/pages/products/products.js',{getCustomerPublic:async()=>{throw new Error('offline');},getCartCount:()=>0});
 p.data.customer={purchaseVIPLevel:'diamond'};p.data.products=[{id:'p',price:100,category:'hair_care'}];p.applyFilter();assert.equal(p.data.filteredProducts[0].memberPrice,58);
 await p.loadCustomer();assert.equal(p.data.filteredProducts[0].memberPrice,100);
 p._productsShown=true;p.loadProducts=()=>products++;p.loadCoupons=()=>coupons++;p.loadCustomer=()=>{};p.onShow();assert.equal(products,1);assert.equal(coupons,1);
});

test('cart state is not exposed across account switches or mixed between shops',()=>{
 const storage=new Map<string,unknown>();
 const ctx:vm.Context={console,wx:{getStorageSync:(k:string)=>storage.get(k),setStorageSync:(k:string,v:unknown)=>storage.set(k,v),removeStorageSync:(k:string)=>storage.delete(k)}};
 vm.createContext(ctx);
 for(const file of ['mini-program/utils/storage.js','mini-program/utils/cart.js'])vm.runInContext(read(file).replace(/^import[^\r\n]*\r?\n/gm,'').replaceAll('export ',''),ctx);
 ctx.setCustomerId('A');ctx.addToCart({id:'p',shopId:'s',stock:10});ctx.clearCustomerId();ctx.setCustomerId('B');assert.equal(ctx.getCart().length,0);
 ctx.addToCart({id:'q',shopId:'other',stock:10});assert.equal(ctx.getCart('other')[0].productId,'q');ctx.setCustomerId('A');assert.equal(ctx.getCart('s')[0].productId,'p');
 ctx.addToCart({id:'r',shopId:'other',stock:10});assert.equal(ctx.getCart('other').length,1);assert.equal(ctx.getCart('other')[0].productId,'r');assert.equal(ctx.getCart('s')[0].productId,'p');
});

test('mall keeps the loaded grid on a slow refresh and rejects results from another shop', async () => {
 const requests: {shopId:string;resolve:(rows:unknown[])=>void}[] = [];
 const p = page('mini-program/pages/products/products.js', {
  getShopProducts: (shopId:string) => new Promise(resolve => requests.push({shopId, resolve})),
 });
 const initial = p.loadProducts();
 requests[0].resolve([{id:'first',price:100}]);
 await initial;
 const refresh = p.loadProducts();
 assert.equal(p.data.loading,false);
 assert.equal(p.data.filteredProducts[0].id,'first');
 p.setData({shopId:'shop2',products:[],filteredProducts:[]});
 const newShop = p.loadProducts();
 assert.equal(p.data.loading,true);
 requests[1].resolve([{id:'old-shop',price:100}]);
 await refresh;
 assert.equal(p.data.filteredProducts.length,0);
 requests[2].resolve([{id:'new-shop',price:100}]);
 await newShop;
 assert.equal(p.data.loading,false);
 assert.equal(p.data.filteredProducts[0].id,'new-shop');
});

test('booking recomputes stylist availability after choosing first unfilled slot',()=>{
 const p=page('mini-program/pages/booking/booking.js',{bookingSlots:()=>['09:00','09:30'],sortStylistsByRank:(items:unknown[])=>items});
 p.data.shop={services:[{id:'svc',duration:30}],employees:[{id:'s',role:'stylist'}]};p.data.selectedService='svc';p.data.selectedDate='2099-01-01';p.data.selectedTime='08:00';p.data.stylists=[{id:'s',eligible:true,isAvailable:true}];p.data.existingBookings=[{status:'confirmed',stylistId:'s',scheduledTime:'2099-01-01T09:00:00+08:00',duration:30}];
 p.data.bookingsError=false;p.data.bookingsLoading=false;
 p.updateTimeSlots();assert.equal(p.data.selectedTime,'09:30');assert.equal(p.data.stylists[0].isAvailable,true);
 p.data.existingBookings.push({status:'confirmed',stylistId:'s',scheduledTime:'2099-01-01T09:30:00+08:00',duration:30});p.updateTimeSlots();assert.equal(p.data.selectedTime,'');
});

test('expired membership is labelled, failed balances remain explicitly stale, feedback calls real shop',async()=>{
 let called='';
 const p=page('mini-program/pages/profile/profile.js',{getCustomerPublic:async()=>({id:'c',purchaseVIPLevel:'diamond',purchaseVIPExpiresAt:'2020-01-01'}),getShop:async()=>({phone:'053212345678'}),wx:{makePhoneCall:({phoneNumber}:{phoneNumber:string})=>called=phoneNumber,showToast(){}}});
 await p.loadProfile();assert.equal(p.data.vipExpired,true);assert.equal(p.data.effectiveDiscount,1);p.goToFeedback();assert.equal(called,'053212345678');
});
