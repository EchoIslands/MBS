import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

test('H5短信接口使用Cookie会话；错误不得伪装登录成功或回退演示用户', async () => {
  const source = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
  const methods = source.slice(source.indexOf('  sendSmsCode: async'), source.indexOf('  resetPassword: async'));
  const calls: any[] = [];
  let payload: any = { success: true };
  let ok = true;
  const context = vm.createContext({ USE_REAL_API: true, API_BASE: '/api', normalizeCustomerDates: (v: any) => v,
    fetch: async (url: string, options: any) => { calls.push({ url, options }); return { ok, json: async () => payload }; },
  });
  const js = ts.transpile(`globalThis.smsApi = {${methods}}`, { target: ts.ScriptTarget.ES2022 });
  vm.runInContext(js, context);
  await context.smsApi.sendSmsCode('13900000001');
  assert.equal(calls[0].url, '/api/customers/sms/send');
  assert.equal(calls[0].options.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[0].options.body), { phone: '13900000001' });
  payload = { success: true, data: { id: 'synthetic', name: '新顾客' } };
  assert.equal((await context.smsApi.loginWithSms('13900000001', '246810')).id, 'synthetic');
  assert.equal(calls[1].url, '/api/customers/sms/login');
  assert.equal(calls[1].options.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[1].options.body), { phone: '13900000001', code: '246810' });
  ok = false; payload = { success: false, error: '验证码错误或已过期' };
  await assert.rejects(context.smsApi.loginWithSms('13900000001', '000000'), /验证码错误或已过期/);
  payload = { success: false, error: '发送太频繁，请稍后再试' };
  await assert.rejects(context.smsApi.sendSmsCode('13900000001'), /发送太频繁/);
  ok = true; payload = { success: true, data: {} };
  await assert.rejects(context.smsApi.loginWithSms('13900000001', '246810'), /验证码登录失败/);
  context.USE_REAL_API = false;
  const previousCalls = calls.length;
  await assert.rejects(context.smsApi.sendSmsCode('13900000001'), /正式服务/);
  assert.equal(calls.length, previousCalls);
});
