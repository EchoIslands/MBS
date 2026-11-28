import test from 'node:test';
import assert from 'node:assert/strict';
import { withReadDeadline } from '../backend/lib/readDeadline';
import { verifyCustomerSave } from '../src/lib/customerSave';
import type { Customer } from '../shared/types';

test('a stalled database read terminates and aborts its fetch; completed reads are not cancelled',async()=>{
  let stalledSignal:AbortSignal|undefined;
  await assert.rejects(withReadDeadline(signal=>{stalledSignal=signal;return new Promise(()=>{});},20),{code:'DATABASE_READ_TIMEOUT'});
  assert.equal(stalledSignal?.aborted,true);
  let completedSignal:AbortSignal|undefined;
  assert.equal(await withReadDeadline(async signal=>{completedSignal=signal;return 'done';},100),'done');
  assert.equal(completedSignal?.aborted,false);
});

test('a lost customer save response is verified by reading, never by repeating the write',async()=>{
  let writes=0,reads=0;
  const actual={id:'synthetic',name:'Saved',storedValueBalance:25} as Customer;
  const result=await verifyCustomerSave(async()=>{writes++;throw Object.assign(new Error('lost'),{code:'REQUEST_TIMEOUT'});},async()=>{reads++;return actual;},{name:'Saved',storedValueBalance:25});
  assert.equal(result,actual);assert.equal(writes,1);assert.equal(reads,1);
});

test('unconfirmed save and failed read stay unknown; conflicts and rejected authorization are not replayed',async()=>{
  for(const read of [async()=>null,async()=>{throw new Error('offline');},async()=>({id:'synthetic',name:'Other'} as Customer)]){
    let writes=0;
    await assert.rejects(verifyCustomerSave(async()=>{writes++;throw new TypeError('network');},read,{name:'Expected'}),{code:'SAVE_RESULT_UNCONFIRMED'});
    assert.equal(writes,1);
  }
  let reads=0;
  await assert.rejects(verifyCustomerSave(async()=>{throw Object.assign(new Error('conflict'),{status:409});},async()=>{reads++;return null;},{}),/conflict/);
  assert.equal(reads,0);
});
