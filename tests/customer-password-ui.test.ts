import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('小程序实际守卫：普通页面、深链、返回受限；改密与退出后恢复', async () => {
 const storage=new Map();const routes:string[]=[];let page:any;let loaded=0;let shown=0;
 const context=vm.createContext({
  wx:{getStorageSync:(k:string)=>storage.get(k),setStorageSync:(k:string,v:any)=>storage.set(k,v),removeStorageSync:(k:string)=>storage.delete(k),reLaunch:(o:any)=>{routes.push(o.url);o.complete?.();}},
  Page:(config:any)=>{page=config;},App:()=>{},console,
 });
 for(const file of ['utils/storage.js','utils/password-gate.js','app.js']) {
  let code=await readFile(new URL('../mini-program/'+file,import.meta.url),'utf8');
  code=code.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  vm.runInContext(code,context,{filename:file});
 }
 vm.runInContext("setToken('synthetic-token'); setCustomerId('synthetic'); setPasswordChangeRequired(true);",context);
 context.callbacks={onLoad:()=>{loaded++;},onShow:()=>{shown++;}};
 vm.runInContext('Page(callbacks)',context);
 page.onLoad.call({route:'pages/profile/profile'});page.onShow.call({route:'pages/index/index'});
 assert.equal(loaded,0);assert.equal(shown,0);assert.equal(routes.length,2);assert.ok(routes.every(r=>r==='/pages/change-password/change-password'));
 page.onLoad.call({route:'pages/change-password/change-password'});assert.equal(loaded,1);
 vm.runInContext('setPasswordChangeRequired(false)',context);page.onShow.call({route:'pages/index/index'});assert.equal(shown,1);
 vm.runInContext('setPasswordChangeRequired(true); clearCustomerId();',context);page.onShow.call({route:'pages/login/login'});assert.equal(shown,2);
});

test('小程序真实改密表单：六位校验、确认、防重复提交、成功清理输入',async()=>{
 let page:any;let changes=0;let hidden=0;const routes:string[]=[];
 const context=vm.createContext({Page:(config:any)=>{page=config;},
  getCustomerId:()=> 'synthetic',getToken:()=> 'synthetic',clearCustomerId:()=>{},
  changeCustomerPassword:async(current:string,next:string,confirm:string)=>{changes++;assert.equal(current,'123456');assert.equal(next,'246810');assert.equal(confirm,next);},
  wx:{reLaunch:(o:any)=>routes.push(o.url),hideHomeButton:()=>hidden++},
 });
 let code=await readFile(new URL('../mini-program/pages/change-password/change-password.js',import.meta.url),'utf8');
 code=code.split(String.fromCharCode(10)).filter(line=>!line.startsWith('import ')).join(String.fromCharCode(10));vm.runInContext(code,context);
 page.setData=(patch:any)=>Object.assign(page.data,patch);page.onShow();assert.equal(hidden,1);
 page.onInput({currentTarget:{dataset:{field:'newPassword'}},detail:{value:'24x6810'}});assert.equal(page.data.newPassword,'246810');
 Object.assign(page.data,{currentPassword:'123456',newPassword:'123456',confirmPassword:'123456'});await page.onSubmit();assert.equal(changes,0);assert.ok(page.data.error);
 Object.assign(page.data,{newPassword:'246810',confirmPassword:'246811'});await page.onSubmit();assert.equal(changes,0);
 Object.assign(page.data,{newPassword:'246810',confirmPassword:'246810'});await Promise.all([page.onSubmit(),page.onSubmit()]);
 assert.equal(changes,1);assert.equal(page.data.saving,false);assert.equal(page.data.currentPassword,'');assert.equal(page.data.newPassword,'');assert.equal(page.data.confirmPassword,'');
 assert.deepEqual(routes,['/pages/index/index']);
});
