import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { mapCustomerBodyToDB } from '../backend/utils/customerMapper.js';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/api.ts', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  define: { 'import.meta.env': JSON.stringify({ PROD: true }) }, logLevel: 'silent',
});

function client(failure?: string, browserGlobals: Record<string, unknown> = {}) {
  const requests: Record<string, any>[] = [];
  const module = { exports: {} as any };
  const context = vm.createContext({
    module, exports: module.exports, console, AbortController, setTimeout, clearTimeout, ...browserGlobals,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: async (url: string, options: RequestInit) => {
      assert.equal(url, '/api/customers/synthetic-customer');
      assert.equal(options.method, 'PUT');
      const body = JSON.parse(String(options.body));
      requests.push(body);
      const mapped = mapCustomerBodyToDB(body);
      const error = failure || (Object.keys(mapped).length ? '' : '请求体为空或无有效字段');
      return { ok: !error, status: error ? 400 : 200, json: async () => error
        ? { success: false, error } : { success: true, data: { id: 'synthetic-customer', ...mapped } } };
    },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { api: module.exports.customerApi, requests };
}

const previous = { id: 'synthetic-customer', name: 'Synthetic', phone: '13800000001', age: null, birthday: undefined, storedValueBalance: 10 };

test('实际客户API：NULL年龄与undefined表单空值不产生空PUT', async () => {
  const { api, requests } = client();
  const result = await api.update(previous.id, { ...previous, age: undefined }, previous);
  assert.equal(requests.length, 0);
  assert.equal(result, previous);
});

test('实际客户API：余额10改0仅发送真实差异及旧值，不带空年龄', async () => {
  const { api, requests } = client();
  await api.update(previous.id, { ...previous, age: undefined, storedValueBalance: 0 }, previous);
  assert.deepEqual(requests, [{ storedValueBalance: 0, _expected: { storedValueBalance: 10 } }]);
});

test('实际客户API：日期按JSON内容比较，显式null和false仍可提交', async () => {
  const { api, requests } = client();
  const before = { ...previous, age: 30, isStockholder: true, birthday: new Date('2000-01-01T00:00:00Z') };
  await api.update(before.id, { ...before, birthday: new Date(before.birthday), age: null, isStockholder: false }, before);
  assert.deepEqual(requests, [{ age: null, isStockholder: false, _expected: { age: 30, isStockholder: true } }]);
});

test('实际客户API：服务端拒绝仍抛出原错误，不伪装成功', async () => {
  const { api, requests } = client('客户余额或会员资料已变化，请刷新后重新核对修改');
  await assert.rejects(api.update(previous.id, { ...previous, storedValueBalance: 0 }, previous), /客户余额或会员资料已变化/);
  assert.equal(requests.length, 1);
});

test('实际客户API：浏览器禁用跨标签广播不影响已成功保存，广播不包含客户资料', async () => {
  const events: string[] = [];
  const {api,requests} = client(undefined, {
    window: {dispatchEvent: (event: Event) => {events.push(event.type);}}, Event,
    BroadcastChannel: class {constructor() {throw new Error('Synthetic SecurityError');}},
  });
  await api.update(previous.id, {storedValueBalance:0}, previous);
  assert.equal(requests.length,1);
  assert.deepEqual(events,['mbs:customers-changed']);
});
