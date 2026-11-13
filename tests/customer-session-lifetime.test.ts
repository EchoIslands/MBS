import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import vm from 'node:vm';
import {signCustomerToken,CUSTOMER_SESSION_SECONDS,CUSTOMER_RESTRICTED_SESSION_SECONDS} from '../backend/lib/tokens';
test('customer normal session lasts 30 days; restricted password-change session remains two hours',()=>{
 for(const restricted of [false,true]){const p=jwt.decode(signCustomerToken('synthetic','shop','hash',restricted)) as jwt.JwtPayload;assert.equal(p.exp!-p.iat!,restricted?7200:2592000);}
 assert.equal(CUSTOMER_SESSION_SECONDS,2592000);assert.equal(CUSTOMER_RESTRICTED_SESSION_SECONDS,7200);
});
test('H5 restore preserves session on network/503/invalid body, clears only 401 and ignores old-account responses',async()=>{
 const source=fs.readFileSync('src/store.ts','utf8');const body=source.slice(source.indexOf('export const restoreCustomerSession = async () => {')+'export const restoreCustomerSession = async () => {'.length,source.indexOf('// 顾客登录：真实模式')) .trim().replace(/};$/,'');
 for(const kind of ['network','503','badbody','401','success','old401']){
 let cached:any={id:'a'},state:any={};const response={status:kind==='401'||kind==='old401'?401:kind==='503'?503:200,ok:!['401','old401','503'].includes(kind),json:async()=>kind==='badbody'?{}:{success:true,data:{id:'a',name:'fresh'}}};
 const context:any={loadCustomerSession:()=>cached,saveCustomerSession:(v:any)=>cached=v,isRealApi:()=>true,getApiBase:()=>'/api',encodeURIComponent,UserRole:{CUSTOMER:'customer'},useAppStore:{setState:(v:any)=>Object.assign(state,v),getState:()=>({setCurrentCustomer:(v:any)=>{state.currentCustomer=v;cached=v;}})},fetch:async()=>{if(kind==='old401')cached={id:'b'};if(kind==='network')throw Error('offline');return response;}};
 await vm.runInNewContext('(async()=>{'+body+'})()',context);
 if(kind==='401')assert.equal(cached,null);else if(kind==='old401'){assert.equal(cached.id,'b');assert.equal(state.currentCustomer,undefined);}else{assert.equal(cached.id,'a');assert.equal(state.currentCustomer.id,'a');}
 }
});
