import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Vercel api 目录只暴露统一入口，业务代码不再生成独立函数', async () => {
  const files = await readdir(new URL('../api/', import.meta.url), { recursive: true });
  assert.deepEqual(files.filter(file => /\.(?:[cm]?[jt]s|py|go|rb)$/.test(file)), ['index.ts']);
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(config.functions), ['api/index.ts']);
  assert.equal(config.rewrites[0].destination, '/api/index');
  assert.equal(config.functions['api/index.ts'].includeFiles, '{backend,shared,server}/**');
  const entry = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');
  assert.ok(entry.includes("import('../backend/app.js')"));
});
