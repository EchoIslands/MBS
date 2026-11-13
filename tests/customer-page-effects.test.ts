import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual effect callback in isolation so deferred responses and browser
// return events can be ordered deterministically, without duplicating its logic.
async function effect(file: string, index: number, globals: Record<string, unknown>) {
  const source = await readFile(new URL('../src/pages/customer/' + file, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks: ts.Expression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect') callbacks.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(callbacks[index]);
  const code = ts.transpileModule('(' + callbacks[index].getText(tree) + ')', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(code, globals) as () => undefined | (() => void);
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('H5资料刷新：迟到响应不恢复已退出账号，合并时保留最新本地字段', async () => {
  let resolve!: (data: Record<string, unknown>) => void;
  let current: Record<string, unknown> | null = { id: 'a', name: 'old', phone: 'new-phone' };
  const run = await effect('Profile.tsx', 0, {
    customerId: 'a', isRealApi: () => true,
    customerApi: { getMyProfile: () => new Promise(r => { resolve = r; }) },
    useAppStore: { getState: () => ({ currentCustomer: current }) },
    setCurrentCustomer: (value: Record<string, unknown>) => { current = value; },
  });
  const cleanup = run();
  resolve({ name: 'updated' }); await flush();
  assert.equal(current?.name, 'updated'); assert.equal(current?.phone, 'new-phone');
  run(); current = null;
  resolve({ name: 'must-not-restore' }); await flush();
  assert.equal(current, null);
  run(); current = { id: 'b', name: 'other' };
  resolve({ name: 'must-not-overwrite' }); await flush();
  assert.equal(current.name, 'other');
  cleanup?.();
  current = { id: 'a', name: 'unmounted' };
  const cancel = run(); cancel?.();
  resolve({ name: 'must-not-update' }); await flush();
  assert.equal(current.name, 'unmounted');
});

test('H5个人中心：离页后迟到的门店和权益响应不覆盖当前页面', async () => {
  let resolve!: (value: unknown) => void;
  const shops: unknown[] = [], benefits: unknown[] = [];
  const run = await effect('Profile.tsx', 1, {
    customerId: 'a', customerShopId: 's', isRealApi: () => true,
    shopApi: { getShop: () => new Promise(r => { resolve = r; }) },
    memberBenefitApi: { getOwn: async () => ['old-benefit'] },
    setShop: (value: unknown) => shops.push(value),
    setMyBenefits: (value: unknown) => benefits.push(value), setLoadError: () => {},
  });
  const cleanup = run(); cleanup?.(); resolve({ id: 'old-shop' }); await flush();
  assert.deepEqual(shops, [null]); assert.equal(benefits.length, 1);
  assert.equal((benefits[0] as unknown[]).length, 0);
  run(); resolve({ id: 'current-shop' }); await flush();
  assert.equal((shops.at(-1) as { id: string }).id, 'current-shop');
  assert.equal((benefits.at(-1) as string[])[0], 'old-benefit');
});

test('H5会员查单：返回前台使用最新回调，离页移除监听，非待付款不自动查询', async () => {
  const listeners = new Map<string, () => void>(); let calls = 0;
  const events = {
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  const order = { id: 'o', status: 'pending' };
  const checkRef = { current: () => { calls++; } };
  const document = { ...events, visibilityState: 'visible' };
  const run = await effect('Membership.tsx', 1, { order, checkRef, document, window: events });
  const cleanup = run(); assert.equal(calls, 1);
  checkRef.current = () => { calls += 10; };
  listeners.get('focus')?.(); assert.equal(calls, 11);
  document.visibilityState = 'hidden'; listeners.get('visibilitychange')?.(); assert.equal(calls, 11);
  cleanup?.(); assert.equal(listeners.size, 0);
  order.status = 'review'; run(); assert.equal(calls, 11); assert.equal(listeners.size, 0);
});
