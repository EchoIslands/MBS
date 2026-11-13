import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

type MiniRequest = {method:string;header:Record<string,string>;success:(result:{statusCode:number;data:object})=>void;fail:(error:{errMsg:string})=>void};

async function load(context: vm.Context, file: string) {
  const source = (await readFile(new URL('../mini-program/' + file, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?$/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(source, context, { filename: file });
}

async function harness(route = 'pages/index/index') {
  const storage = new Map<string, unknown>();
  const requests: MiniRequest[] = [];
  const redirects: {url:string}[] = [];
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    getCurrentPages: () => [{ route }],
    wx: {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      reLaunch: (options: {url:string}) => redirects.push(options),
      request: (options: MiniRequest) => { requests.push(options); return { abort() {} }; },
      showModal() {}, showToast() {},
    },
    Page: (config: vm.Context) => { context.page = config; },
  });
  for (const file of ['utils/storage.js', 'utils/payment-order-link.js', 'utils/password-gate.js', 'utils/auth.js', 'utils/api.js', 'utils/tab-swipe.js']) await load(context, file);
  const setSession = (token = 'synthetic-old', id = 'synthetic-customer') => {
    context.setToken(token); context.setCustomerId(id);
  };
  return { context, storage, requests, redirects, setSession };
}

test('登录按钮并发点击仅发一次请求；429原因原样展示且不自动重试', async () => {
  const h = await harness('pages/login/login');
  await load(h.context, 'api/customer.js');
  await load(h.context, 'pages/login/login.js');
  const page = h.context.page; page.setData = (patch: object) => Object.assign(page.data, patch);
  Object.assign(page.data,{phone:'13900000001',password:'246810'});
  const first=page.onLogin(); const second=page.onLogin();
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].method,'POST');
  const message='当前网络今日密码错误次数已达上限，请于北京时间明日00:00后重试。本次尚未验证密码。';
  h.requests[0].success({statusCode:429,data:{success:false,error:message,code:'CUSTOMER_AUTH_DAILY_LIMIT',retryAfterSeconds:60}});
  await Promise.all([first,second]);
  assert.equal(page.data.error,message); assert.equal(page.data.loggingIn,false);
  assert.equal(h.requests.length,1); assert.equal(h.redirects.length,0);
});

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

test('资料接口误入员工鉴权时提示服务未更新，不清除顾客登录态', async () => {
  const h = await harness(); h.setSession();
  const saving = assert.rejects(h.context.put('/customers/synthetic-customer/self', { name: '新昵称' }), /资料服务尚未更新/);
  h.requests[0].success({ statusCode: 401, data: { error: '登录已过期，请重新登录' } });
  await saving;
  assert.equal(h.context.getToken(), 'synthetic-old');
  assert.equal(h.context.getCustomerId(), 'synthetic-customer');
  assert.equal(h.redirects.length, 0);
});

test('个人资料只提交实际变更，头像提示文字可点击', async () => {
  const h = await harness('pages/profile/profile');
  Object.assign(h.context, {
    PurchaseVIPLevel: { REGULAR: 'regular' }, StoredValueLevel: { NONE: 'none' }, BenefitType: {},
    purchaseVIPPlans: [], storedValuePlans: [], getPurchaseVIPLabel: () => '', getStoredValueLabel: () => '',
  });
  await load(h.context, 'pages/profile/profile.js');
  const page = h.context.page; page.setData = (patch: object) => Object.assign(page.data, patch);
  page.loadProfile = async () => {};
  page.data.customer = { id: 'synthetic-customer', name: '旧昵称', avatar: 'https://old.example/avatar.jpg', gender: 'female', birthday: '1990-01-01' };
  page.openProfileEdit();
  page.onEditName({ detail: { value: '新昵称' } });
  let sent!: {id:string;fields:Record<string,unknown>};
  h.context.updateMyProfile = async (id: string, fields: Record<string,unknown>) => { sent = { id, fields }; return {}; };
  await page.saveProfileEdit();
  assert.equal(sent.id, 'synthetic-customer');
  assert.deepEqual(Object.keys(sent.fields), ['name']);
  assert.equal(sent.fields.name, '新昵称');
  const view = await readFile(new URL('../mini-program/pages/profile/profile.wxml', import.meta.url), 'utf8');
  assert.match(view, /class="profile-edit-avatar-hint" bindtap="chooseProfileAvatar"/);
  let picker!: {mediaType:string[];success:(result:{tempFiles:{tempFilePath:string;size:number}[]})=>void}; let uploadedImage = '';
  h.context.wx.chooseMedia = (options: typeof picker) => { picker = options; };
  h.context.wx.getFileSystemManager = () => ({ readFile: ({ success }: {success:(result:{data:string})=>void}) => success({ data: '/9j/AA==' }) });
  h.context.uploadMyAvatar = async (image: string) => { uploadedImage = image; return 'https://avatars.example/new.jpg'; };
  page.openProfileEdit(); page.chooseProfileAvatar();
  assert.equal(picker.mediaType[0], 'image');
  picker.success({ tempFiles: [{ tempFilePath: 'wxfile://avatar', size: 4 }] });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(uploadedImage, 'data:image/jpeg;base64,/9j/AA==');
  assert.equal(page.data.editAvatar, 'https://avatars.example/new.jpg');
  assert.equal(page.data.editAvatarUploading, false);
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
  page.setData = (patch: object) => Object.assign(page.data, patch);
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
  const page = h.context.page; page.setData = (patch: object) => Object.assign(page.data, patch);
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
    trackPageView() {}, getShopReviews: async () => [], vipBenefits: [], storedBenefits: [],
    getShop: async () => { throw new Error('合成店铺故障'); },
  });
  await load(h.context, 'utils/stylist-order.js');
  await load(h.context, 'pages/index/index.js');
  const page = h.context.page; page.setData = (patch: object) => Object.assign(page.data, patch);
  await page.loadShop(); assert.equal(page.data.loading, false); assert.match(page.data.error, /合成店铺故障/);
  let finishShop: (value: unknown) => void = () => {};
  let customerStarted = false;
  h.context.getShop = () => new Promise(resolve => { finishShop = resolve; });
  h.context.getCustomerPublic = async () => { customerStarted = true; throw Object.assign(new Error('expired'), { statusCode: 401 }); };
  const pending = page.onLoad();
  assert.equal(customerStarted, true);
  finishShop(null); await pending;
  assert.equal(page.data.loading, false); assert.equal(page.data.customer, null);
});


test('个人中心保持登录门槛，门店与通用权益集中在首页', async () => {
  const h = await harness('pages/profile/profile');
  let shopRequests = 0;
  Object.assign(h.context, {
    PurchaseVIPLevel: { REGULAR: 'regular' }, StoredValueLevel: { NONE: 'none' }, BenefitType: {},
    purchaseVIPPlans: [], storedValuePlans: [], vipBenefits: [], storedBenefits: [],
    getPurchaseVIPLabel: () => '', getStoredValueLabel: () => '',
    getShop: async () => { shopRequests++; return { name: '实际门店' }; },
  });
  await load(h.context, 'pages/profile/profile.js');
  const page = h.context.page;
  page.setData = (patch: object) => Object.assign(page.data, patch);
  await page.onLoad();
  assert.equal(h.redirects.length, 1);
  assert.equal(h.redirects[0].url, '/pages/login/login');
  assert.equal(shopRequests, 0);
  assert.equal(page.data.customer, null);
  const view = await readFile(new URL('../mini-program/pages/profile/profile.wxml', import.meta.url), 'utf8');
  const home = await readFile(new URL('../mini-program/pages/index/index.wxml', import.meta.url), 'utf8');
  assert.equal(view.includes('public-shop-gallery'), false);
  assert.equal(view.includes('membership-system-card'), false);
  assert.ok(view.includes('myBenefits'));
  assert.ok(view.includes('vipHeaderClass'));
  assert.equal(home.includes('member-stats-grid'), false);
  assert.ok(home.indexOf('home-shop-gallery') < home.indexOf('home-membership'));
  assert.ok(home.indexOf('home-membership') < home.indexOf('index-invite-card'));
  assert.ok(home.lastIndexOf('<!-- 商品商城 -->') > home.indexOf('<!-- 顾客评价 -->'));
  assert.ok(home.includes('vipBenefits'));
  assert.ok(home.includes('storedBenefits'));
  for (const section of ['服务与价格', '门店在售商品', '会员权益简介']) assert.equal(view.includes(section), false);
  for (const photo of ['storefront.jpg', 'service.jpg']) {
    const bytes = await readFile(new URL('../mini-program/assets/shop/' + photo, import.meta.url));
    assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8);
    assert.ok(bytes.length < 200 * 1024);
    assert.ok(home.includes('/assets/shop/' + photo));
    assert.equal(view.includes('/assets/shop/' + photo), false);
  }
});

test('短信复制填充：仅当前请求空输入框可自动填入，不覆盖手输或跨手机号回调', async () => {
  const h = await harness('pages/login/login');
  await load(h.context, 'pages/login/login.js');
  const page = h.context.page;
  page.setData = (patch: object) => Object.assign(page.data, patch);
  let clipboard!: {success:(result:{data:string})=>void;complete:()=>void;fail:()=>void};
  let reads = 0;
  h.context.wx.getClipboardData = (options: typeof clipboard) => { reads++; clipboard = options; };
  Object.assign(page.data, { loginMode: 'sms', phone: '13900000001' });
  page.onShow(); assert.equal(reads, 0);
  page.smsRequestedPhone = page.data.phone; page.smsRequestedAt = Date.now();
  page.onSmsCodeFocus();
  clipboard.success({ data: ' 246810 ' }); clipboard.complete();
  assert.equal(page.data.smsCode, '246810');
  page.onShow(); assert.equal(reads, 1);
  page.setData({ smsCode: '' }); page.onShow();
  page.onSmsCodeInput({ detail: { value: '12' } });
  clipboard.success({ data: '246810' }); clipboard.complete();
  assert.equal(page.data.smsCode, '12');
  page.setData({ smsCode: '' }); page.onShow();
  page.onPhoneInput({ detail: { value: '13900000002' } });
  clipboard.success({ data: '246810' }); clipboard.complete();
  assert.equal(page.data.smsCode, '');
  page.onPasteSmsCode(); clipboard.success({ data: '13900000001' }); clipboard.complete();
  assert.equal(page.data.smsCode, '');
  page.onPasteSmsCode(); clipboard.fail(); clipboard.complete();
  assert.equal(page.data.smsCode, '');
});
