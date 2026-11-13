import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { createTabSwipeHandlers, syncTabBarSelected } from '../mini-program/utils/tab-swipe.js';

const paths = ['/pages/index/index', '/pages/products/products', '/pages/booking/booking', '/pages/profile/profile'];

test('四个主入口的图标、顺序和页面手势保持一致', async () => {
  const app = JSON.parse(await readFile(new URL('../mini-program/app.json', import.meta.url), 'utf8'));
  assert.equal(app.tabBar.custom, true);
  assert.deepEqual(app.tabBar.list.map((item: any) => '/' + item.pagePath), paths);
  for (const item of app.tabBar.list) {
    for (const key of ['iconPath', 'selectedIconPath']) {
      const file = new URL('../mini-program/' + item[key], import.meta.url);
      const icon = await stat(file);
      assert.ok(icon.size > 100 && icon.size < 40_000);
    }
    const wxml = await readFile(new URL('../mini-program/' + item.pagePath + '.wxml', import.meta.url), 'utf8');
    assert.match(wxml, /bindtouchstart="onTabSwipeStart"/);
    assert.match(wxml, /bindtouchend="onTabSwipeEnd"/);
  }
});

test('放大的底栏点击只切换目标页，进入页面时同步选中项', async () => {
  const source = await readFile(new URL('../mini-program/custom-tab-bar/index.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../mini-program/custom-tab-bar/index.wxss', import.meta.url), 'utf8');
  assert.match(styles, /font-size: 26rpx/);
  assert.match(styles, /width: 52rpx; height: 52rpx/);
  const destinations: string[] = [];
  let component: any;
  vm.runInNewContext(source, {
    Component: (config: any) => { component = config; },
    getCurrentPages: () => [{ route: 'pages/booking/booking' }],
    wx: { switchTab: ({ url }: { url: string }) => destinations.push(url) },
  });
  const instance: any = { data: { ...component.data }, setData(patch: any) { Object.assign(this.data, patch); } };
  component.attached.call(instance);
  assert.equal(instance.data.selected, 2);
  component.methods.onSelect.call(instance, { currentTarget: { dataset: { index: 2 } } });
  assert.equal(destinations.length, 0);
  component.methods.onSelect.call(instance, { currentTarget: { dataset: { index: 3 } } });
  assert.deepEqual(destinations, ['/pages/profile/profile']);
  syncTabBarSelected({ getTabBar: () => instance, setData() {} }, 3);
  assert.equal(instance.data.selected, 3);
});

test('横滑切换相邻主页面；竖滑、短滑、边界和弹窗不会误跳', () => {
  const destinations: string[] = [];
  const oldWx = (globalThis as any).wx;
  (globalThis as any).wx = { switchTab: ({ url }: { url: string }) => destinations.push(url) };
  try {
    const page: any = { data: {}, ...createTabSwipeHandlers(1) };
    const swipe = (x: number, y: number) => {
      page.onTabSwipeStart({ touches: [{ pageX: 200, pageY: 200 }] });
      page.onTabSwipeEnd({ changedTouches: [{ pageX: x, pageY: y }] });
    };
    swipe(95, 206);
    assert.deepEqual(destinations, ['/pages/booking/booking']);
    swipe(300, 200);
    assert.equal(destinations.at(-1), '/pages/index/index');
    swipe(150, 200);
    swipe(90, 100);
    assert.equal(destinations.length, 2);
    page.data.showCoupons = true;
    swipe(90, 200);
    assert.equal(destinations.length, 2);
    const first: any = { data: {}, ...createTabSwipeHandlers(0) };
    first.onTabSwipeStart({ touches: [{ pageX: 200, pageY: 200 }] });
    first.onTabSwipeEnd({ changedTouches: [{ pageX: 300, pageY: 200 }] });
    assert.equal(destinations.length, 2);
  } finally {
    (globalThis as any).wx = oldWx;
  }
});
