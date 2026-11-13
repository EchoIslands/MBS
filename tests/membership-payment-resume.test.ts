import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

type MiniPage = {
  data: { error: string; checking: boolean; activeOrder: { id: string; status: string } | null };
  setData(patch: object): void;
  loadPlans(): Promise<void>;
};
type ElementNode = { type: unknown; props: { onClick?: () => void }; children: unknown[] };

test('小程序重进会员页立即核验原订单，查单成功清除旧错误', async () => {
  const source = await readFile(new URL('../mini-program/pages/membership/membership.js', import.meta.url), 'utf8');
  let config!: MiniPage;
  let checks = 0;
  vm.runInNewContext(source.replace(/^import .*;\r?\n/, ''), {
    Page: (value: MiniPage) => { config = value; },
    getMembershipPlans: async () => ({ vip: [], stored: [], activeOrder: { id: 'original', status: 'pending' } }),
    checkMembershipOrder: async (id: string) => { assert.equal(id, 'original'); checks++; return { id, status: 'pending' }; },
  });
  const page = { ...config, data: { ...config.data, error: '上次网络中断' }, setData(patch: object) { Object.assign(this.data, patch); } };
  await page.loadPlans();
  assert.equal(checks, 1);
  assert.equal(page.data.error, '');
  assert.equal(page.data.checking, false);
  assert.equal(page.data.activeOrder?.id, 'original');
});

for (const status of ['paid', 'review']) {
  test(`H5继续原单收到${status}时核验结果，不再索要支付链接`, async () => {
    const source = await readFile(new URL('../src/pages/customer/Membership.tsx', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    const original = { id: 'original', kind: 'vip', level: 'gold', amount: 79, status: 'pending', channel: 'wechat_h5' };
    const states: unknown[] = [null, original, false, '', ''];
    const errors: unknown[] = [], notices: unknown[] = [];
    let slot = 0, checks = 0;
    const react = {
      createElement: (type: unknown, props: ElementNode['props'], ...children: unknown[]) => ({ type, props: props || {}, children }),
      useEffect() {},
      useRef: (value: unknown) => ({ current: value }),
      useState: () => { const index = slot++; return [states[index], (v: unknown) => { if (index === 3) errors.push(v); if (index === 4) notices.push(v); }]; },
    };
    const exports = {} as { default: () => ElementNode };
    vm.runInNewContext(code, {
      exports, navigator: { userAgent: 'mobile browser' }, document: { visibilityState: 'visible' },
      window: { location: { assign() { assert.fail('已处理订单不能跳转付款'); } } },
      require: (name: string) => name === 'react' ? react : name === 'react-router-dom' ? { useNavigate: () => () => {} }
        : name === '../../store' ? { useAppStore: () => ({ currentCustomer: null }) }
          : { customerMembershipApi: {
            create: async () => ({ ...original, status }),
            check: async (id: string) => { assert.equal(id, original.id); checks++; return { ...original, status }; },
            plans: async () => ({ activeOrder: null }),
          } },
    });
    const tree = exports.default();
    const find = (node: unknown): ElementNode | null => {
      if (!node || typeof node !== 'object') return null;
      const element = node as ElementNode;
      if (element.type === 'button' && element.children.includes('继续支付原订单')) return element;
      for (const child of element.children || []) { const found = find(child); if (found) return found; }
      return null;
    };
    const button = find(tree);
    assert.ok(button);
    button.props.onClick!();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(checks, 1);
    assert.ok(notices.some(v => String(v).includes(status === 'paid' ? '权益已生效' : '勿重复支付')));
    assert.ok(!errors.some(Boolean), String(errors));
  });
}
