import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/api.ts', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  define: { 'import.meta.env': JSON.stringify({ PROD: true }) }, logLevel: 'silent',
});

function client(failSecondPage = false) {
  const pages: number[] = [];
  const module = { exports: {} as typeof import("../src/api.js") };
  const context = vm.createContext({
    module, exports: module.exports, console, AbortController, URLSearchParams, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: async (url: string) => {
      const params = new URL(url, 'https://example.test').searchParams;
      assert.equal(params.get('shopId'), 'shop1');
      assert.equal(params.get('pageSize'), '1000');
      const page = Number(params.get('page'));
      pages.push(page);
      if (page === 2 && failSecondPage) return { ok: false, status: 503, json: async () => ({ success: false, error: '第二页不可用' }) };
      const count = page === 1 ? 1000 : 3;
      return { ok: true, status: 200, json: async () => ({ success: true, pagination: { totalPages: 2 }, data: Array.from({ length: count }, (_, i) => ({ id: `booking-${page}-${i}`, shopId: 'shop1' })) }) };
    },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { api: module.exports.bookingApi, pages };
}

test('预约导出读取所有分页，不截断在首批1000条', async () => {
  const { api, pages } = client();
  const bookings = await api.getAllBookingsByShop('shop1');
  assert.equal(bookings.length, 1003);
  assert.deepEqual(pages, [1, 2]);
});

test('预约导出后续分页失败时拒绝生成不完整结果', async () => {
  const { api, pages } = client(true);
  await assert.rejects(api.getAllBookingsByShop('shop1'), /第二页不可用/);
  assert.deepEqual(pages, [1, 2]);
});
