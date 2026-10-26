import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

async function load(context: vm.Context, file: string) {
  const source = (await readFile(new URL('../mini-program/' + file, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?$/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(source, context, { filename: file });
}

async function harness(route = 'pages/index/index') {
  const storage = new Map<string, unknown>();
  const requests: any[] = [];
  const redirects: any[] = [];
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    getCurrentPages: () => [{ route }],
    wx: {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      reLaunch: (options: any) => redirects.push(options),
      request: (options: any) => { requests.push(options); return { abort() {} }; },
      showModal() {}, showToast() {},
    },
    Page: (config: any) => { context.page = config; },
  });
  for (const file of ['utils/storage.js', 'utils/payment-order-link.js', 'utils/password-gate.js', 'utils/auth.js', 'utils/api.js']) await load(context, file);
  const setSession = (token = 'synthetic-old', id = 'synthetic-customer') => {
    context.setToken(token); context.setCustomerId(id);
  };
  return { context, storage, requests, redirects, setSession };
}

test('当前会话并发401：清缓存及改密标记，仅跳转一次', async () => {
  const h = await harness(); h.setSession(); h.context.setPasswordChangeRequired(true);
  const first = assert.rejects(h.context.get('/customers/synthetic-customer/public'), { statusCode: 401 });
  const second = assert.rejects(h.context.get('/refunds/customer/synthetic-customer'), { statusCode: 401 });
  for (const request of h.requests) {
    assert.equal(request.header.Authorization, 'Bearer synthetic-old');
    request.success({ statusCode: 401, data: { error: '请使用本人登录凭证重新登录' } });
  }
  await Promise.all([first, second]);
  assert.equal(h.context.getCustomerId(), ''); assert.equal(h.context.getToken(), '');
  assert.equal(h.context.getPasswordChangeRequired(), false);
  assert.equal(h.redirects.length, 1);
  assert.equal(h.redirects[0].url, '/pages/login/login?reason=session_expired');
});

test('旧请求401晚到不清除新账号或新令牌', async () => {
  const h = await harness(); h.setSession();
  const pending = assert.rejects(h.context.get('/customers/synthetic-customer/public'), { statusCode: 401 });
  h.setSession('synthetic-new', 'synthetic-new-customer');
  h.requests[0].success({ statusCode: 401, data: { error: 'expired' } }); await pending;
  assert.equal(h.context.getToken(), 'synthetic-new');
  assert.equal(h.context.getCustomerId(), 'synthetic-new-customer');
  assert.equal(h.redirects.length, 0);
});

test('登录失败401和登录页自动恢复401不反复跳转', async () => {
  const h = await harness('pages/login/login'); h.setSession();
  const invalidPassword = assert.rejects(h.context.post('/customers/login', { password: '000000' }), { statusCode: 401 });
  h.requests[0].success({ statusCode: 401, data: { error: '手机号或密码错误' } }); await invalidPassword;
  assert.equal(h.context.getToken(), 'synthetic-old'); assert.equal(h.redirects.length, 0);
  const restore = assert.rejects(h.context.get('/customers/synthetic-customer/public'), { statusCode: 401 });
  h.requests[1].success({ statusCode: 401, data: { error: 'expired' } }); await restore;
  assert.equal(h.context.getToken(), ''); assert.equal(h.redirects.length, 0);
});

test('网络故障、503和外部请求401保留当前会话', async () => {
  const h = await harness(); h.setSession();
  const unavailable = assert.rejects(h.context.get('/customers/synthetic-customer/public'), { statusCode: 503 });
  h.requests[0].success({ statusCode: 503, data: { error: '身份验证暂不可用' } }); await unavailable;
  const timeout = assert.rejects(h.context.get('/shops/shop1'), /超时/);
  h.requests[1].fail({ errMsg: 'request:fail timeout' }); await timeout;
  const external = assert.rejects(h.context.get('https://synthetic.invalid/public'), { statusCode: 401 });
  assert.equal(h.requests[2].header.Authorization, undefined);
  h.requests[2].success({ statusCode: 401, data: {} }); await external;
  assert.equal(h.context.getToken(), 'synthetic-old'); assert.equal(h.redirects.length, 0);
});

test('403仍执行强制改密，旧会话403不影响新账号', async () => {
  const h = await harness(); h.setSession();
  const forbidden = assert.rejects(h.context.get('/customers/synthetic-customer/public'), { statusCode: 403 });
  h.requests[0].success({ statusCode: 403, data: { code: 'PASSWORD_CHANGE_REQUIRED' } }); await forbidden;
  assert.equal(h.context.getPasswordChangeRequired(), true);
  assert.equal(h.redirects[0].url, '/pages/change-password/change-password');
  h.context.setPasswordChangeRequired(false);
  const stale = assert.rejects(h.context.get('/customers/synthetic-customer/public'), { statusCode: 403 });
  h.setSession('synthetic-new');
  h.requests[1].success({ statusCode: 403, data: { code: 'PASSWORD_CHANGE_REQUIRED' } }); await stale;
  assert.equal(h.context.getPasswordChangeRequired(), false); assert.equal(h.redirects.length, 1);
});

test('密码独立显隐保留六位输入，首次设密和离开页面恢复隐藏', async () => {
  const h = await harness('pages/login/login');
  h.context.loginCustomer = async () => ({ setupRequired: true });
  await load(h.context, 'pages/login/login.js');
  const page = h.context.page;
  page.setData = (patch: any) => Object.assign(page.data, patch);
  assert.equal(page.data.showPassword, false); assert.equal(page.data.showConfirmPassword, false);
  page.onPasswordInput({ detail: { value: '24x6810' } });
  page.onConfirmPasswordInput({ detail: { value: '246810' } });
  page.togglePasswordVisibility();
  assert.equal(page.data.showPassword, true); assert.equal(page.data.showConfirmPassword, false);
  page.toggleConfirmPasswordVisibility();
  assert.equal(page.data.password, '246810'); assert.equal(page.data.confirmPassword, '246810');
  page.onHide(); assert.equal(page.data.showPassword, false); assert.equal(page.data.showConfirmPassword, false);
  page.togglePasswordVisibility(); page.data.phone = '13900000002'; await page.onLogin();
  assert.equal(page.data.setupRequired, true); assert.equal(page.data.showPassword, false);
  assert.equal(page.data.password, ''); assert.equal(page.data.confirmPassword, '');
});

test('登录页恢复遇网络错误保留凭证；401显示重新登录提示', async () => {
  const h = await harness('pages/login/login'); h.setSession();
  h.context.restoreCustomerSession = async () => { throw new Error('网络超时'); };
  await load(h.context, 'pages/login/login.js');
  const page = h.context.page; page.setData = (patch: any) => Object.assign(page.data, patch);
  await page.onLoad();
  assert.equal(h.context.getToken(), 'synthetic-old'); assert.match(page.data.error, /超时/);
  assert.equal(page.data.restoringSession, false);
  h.context.restoreCustomerSession = async () => { throw Object.assign(new Error('expired'), { statusCode: 401 }); };
  await page.onLoad();
  assert.equal(h.context.getToken(), ''); assert.match(page.data.error, /重新登录/);
});

test('首页店铺失败结束loading，本人资料请求不等待慢店铺', async () => {
  const h = await harness(); h.setSession();
  Object.assign(h.context, {
    PurchaseVIPLevel: { REGULAR: 'regular' }, StoredValueLevel: { NONE: 'none' },
    trackPageView() {}, getShopReviews: async () => [],
    getShop: async () => { throw new Error('合成店铺故障'); },
  });
  await load(h.context, 'pages/index/index.js');
  const page = h.context.page; page.setData = (patch: any) => Object.assign(page.data, patch);
  await page.loadShop(); assert.equal(page.data.loading, false); assert.match(page.data.error, /合成店铺故障/);
  let finishShop: (value: any) => void = () => {};
  let customerStarted = false;
  h.context.getShop = () => new Promise(resolve => { finishShop = resolve; });
  h.context.getCustomerPublic = async () => { customerStarted = true; throw Object.assign(new Error('expired'), { statusCode: 401 }); };
  const pending = page.onLoad();
  assert.equal(customerStarted, true);
  finishShop(null); await pending;
  assert.equal(page.data.loading, false); assert.equal(page.data.customer, null);
});
