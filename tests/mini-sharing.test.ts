import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function sharingHarness() {
  let page: vm.Context;
  const menus: {type:string;menus?:string[]}[] = [];
  let blocked = false;
  const context = vm.createContext({
    Page: (config: vm.Context) => { page = config; }, App: () => {}, console: { warn() {} },
    enforcePasswordChange: () => blocked,
    wx: {
      showShareMenu: (options: {menus?:string[]}) => menus.push({ type: 'show', ...options }),
      hideShareMenu: (options: {menus?:string[]}) => menus.push({ type: 'hide', ...options }),
    },
  });
  async function load(file: string) {
    const code = (await readFile(new URL('../mini-program/' + file, import.meta.url), 'utf8'))
      .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(code, context, { filename: file });
  }
  await load('utils/share.js'); await load('utils/tab-swipe.js'); await load('app.js');
  return {
    context, menus, load, get page() { return page; },
    register(config: vm.Context) { context.config = config; vm.runInContext('Page(config)', context); return page; },
    block(value: boolean) { blocked = value; },
  };
}

test('所有私密页面可以发送店铺卡片，但不带个人数据、当前路径或截图；菜单可用', async () => {
  const h = await sharingHarness();
  const app = JSON.parse(await readFile(new URL('../mini-program/app.json', import.meta.url), 'utf8'));
  const dedicated = new Set(['pages/index/index', 'pages/products/products', 'pages/product-detail/product-detail', 'pages/invite/invite', 'pages/invite/claim']);
  for (const route of app.pages.filter((route: string) => !dedicated.has(route))) {
    const page = h.register({});
    const instance = { route, options: { outTradeNo: 'PRIVATE_ORDER', token: 'PRIVATE_TOKEN' }, data: { phone: '13900000001', name: 'PRIVATE_NAME', balance: 100 } };
    page.onShow.call(instance);
    const card = JSON.parse(JSON.stringify(page.onShareAppMessage.call(instance)));
    assert.deepEqual(card, { title: '皓诗形象设计 · 预约与商城', path: '/pages/index/index', imageUrl: '/assets/share/shop-card.png' });
    assert.equal(page.onShareTimeline, undefined);
    const last = h.menus.slice(-2);
    assert.deepEqual(Array.from(last[0].menus), ['shareAppMessage']);
    assert.equal(last[1].type, 'hide');
    assert.deepEqual(Array.from(last[1].menus), ['shareTimeline']);
  }
});

test('分享包装保留 Page 生命周期参数、this、异步结果及强制改密守卫', async () => {
  const h = await sharingHarness(); let shown = 0; let loaded = 0;
  const instance = { route: 'pages/profile/profile' };
  const promise = Promise.resolve('original result');
  const page = h.register({
    onShow(this: unknown, value: string) { shown++; assert.equal(this, instance); assert.equal(value, 'show'); return promise; },
    onLoad(this: unknown, value: string) { loaded++; assert.equal(this, instance); assert.equal(value, 'load'); return 'loaded'; },
  });
  assert.equal(page.onLoad.call(instance, 'load'), 'loaded');
  assert.equal(page.onShow.call(instance, 'show'), promise);
  assert.equal(await promise, 'original result');
  h.block(true); page.onShow.call(instance, 'show'); page.onLoad.call(instance, 'load');
  assert.equal(shown, 1); assert.equal(loaded, 1);
  h.block(false);
  h.context.wx.showShareMenu = () => { throw new Error('synthetic unsupported'); };
  assert.equal(page.onShow.call(instance, 'show'), promise);
});

test('实际商城、商品与邀请分享保持原路径及邀请码，所有缺省封面不使用当前页截图', async () => {
  const h = await sharingHarness();
  for (const file of ['pages/products/products.js', 'pages/product-detail/product-detail.js', 'pages/invite/invite.js', 'pages/invite/claim.js']) {
    await h.load(file);
    const instance = { data: { shopId: 'shop1', productId: 'p1', product: { name: '合成商品' }, ref: 'synthetic_ref', inviteUrl: 'https://example.invalid/?ref=synthetic_ref', referrerName: '合成邀请人', qrCodeDataUrl: '' } };
    const card = h.page.onShareAppMessage.call(instance);
    const timeline = h.page.onShareTimeline.call(instance);
    assert.equal(card.imageUrl, '/assets/share/shop-card.png');
    assert.equal(timeline.imageUrl, '/assets/share/shop-card.png');
    if (file.includes('products/products')) assert.equal(card.path, '/pages/products/products');
    else if (file.includes('product-detail')) assert.equal(card.path, '/pages/product-detail/product-detail?shopId=shop1&productId=p1');
    else { assert.equal(card.path, '/pages/invite/claim?ref=synthetic_ref'); assert.equal(timeline.query, 'ref=synthetic_ref'); }
  }
  const page = h.register({ onShareTimeline: () => ({ title: '公开首页' }), onShareAppMessage: () => ({ title: '公开首页', path: '/pages/index/index' }) });
  page.onShow.call({ route: 'pages/index/index' });
  assert.deepEqual(Array.from(h.menus.at(-1).menus), ['shareAppMessage', 'shareTimeline']);
  assert.equal(page.onShareTimeline().query, '');
});

test('固定封面为有效小尺寸 PNG，显式打包，不包含网络图片依赖', async () => {
  const png = await readFile(new URL('../mini-program/assets/share/shop-card.png', import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1000); assert.equal(png.readUInt32BE(20), 800);
  assert.ok(png.length < 200 * 1024);
  const config = JSON.parse(await readFile(new URL('../mini-program/project.config.json', import.meta.url), 'utf8'));
  assert.ok(config.packOptions.include.some((rule: {type:string;value:string}) => rule.type === 'folder' && rule.value === 'assets/share'));
});
