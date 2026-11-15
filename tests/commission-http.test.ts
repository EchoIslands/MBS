import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import express from 'express';
import type {AddressInfo} from 'node:net';
test('commission HTTP denies stylist access, binds shop/actor, strips forged fields and fails closed',async()=>{
 let role='stylist',broken=false;const calls:{name:string;args:Record<string,unknown>}[]=[];
 const scopes:string[]=[];
 const supabase={from:(table:string)=>({select(){return this;},eq(key:string,value:string){if(key==='shop_id')scopes.push(value);return this;},order(){return this;},async limit(){return{error:broken?{}:null,data:table==='employees'?[{id:'a',name:'Synthetic',commission_rate:.3}]:[]};}}),rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:{status:'accrued'},error:broken?{}:null};}};
 const source=(await readFile(new URL('../backend/routes/commissions.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const exports={} as {default:express.Router};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Router:express.Router,supabase,authMiddleware:(req:express.Request,_res:express.Response,next:express.NextFunction)=>{req.employee={id:'manager',shopId:'s',name:'Synthetic',phone:'',role};next();}});
 const app=express();app.use(express.json());app.use('/commissions',exports.default);const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/commissions';
 try{
 assert.equal((await fetch(url)).status,403);role='shop_manager';
 const response=await fetch(url+'?shopId=other');assert.equal(response.status,200);assert.ok(scopes.every(s=>s==='s'));
 const body={action:'rate',target:'a',requestId:'request_1234567890',reason:'核对员工计提比例',rate:.3,expectedRate:null,shopId:'other',actorId:'forged',password_hash:'forged'};
 const send=()=>fetch(url+'/operation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await send()).status,200);assert.equal(calls[0].args.p_shop,'s');assert.equal(calls[0].args.p_actor,'manager');assert.equal((calls[0].args.p_request as Record<string,unknown>).password_hash,undefined);
 broken=true;assert.equal((await send()).status,409);assert.equal((await fetch(url)).status,503);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
