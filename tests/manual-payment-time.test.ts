import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { beijingDateTimeInput, manualPaymentTimeIso } from '../shared/lib/manualPaymentTime.js';

test('退款与非微信回执输入按北京时间往返，支持跨年与闰日', () => {
  for (const [iso, input] of [
    ['2026-10-25T07:34:31Z', '2026-10-25T15:34'],
    ['2026-12-31T16:05:00Z', '2027-01-01T00:05'],
    ['2024-02-28T16:00:00Z', '2024-02-29T00:00'],
  ]) {
    assert.equal(beijingDateTimeInput(Date.parse(iso)), input);
    assert.equal(manualPaymentTimeIso(input, Date.parse(iso), '退款发生时间'), new Date(iso).toISOString().replace(/:\d{2}\.000Z$/, ':00.000Z'));
  }
  const now = Date.parse('2026-10-25T07:34:31Z');
  for (const input of ['2026-02-30T12:00', '2026-10-25T15:40', 'invalid', '2026-10-25T15:34Z']) {
    assert.throws(() => manualPaymentTimeIso(input, now, '退款发生时间'), /退款发生时间/);
  }
  assert.equal(manualPaymentTimeIso(''), undefined);
});

test('退款输入在UTC、北京和纽约进程时区下均不产生8小时偏移', () => {
  const code = `import {beijingDateTimeInput,manualPaymentTimeIso} from './shared/lib/manualPaymentTime.ts';
    const now=Date.parse('2026-10-25T07:34:31Z');
    console.log(JSON.stringify({input:beijingDateTimeInput(now),saved:manualPaymentTimeIso('2026-10-25T15:34',now,'退款发生时间')}));`;
  for (const TZ of ['UTC', 'Asia/Shanghai', 'America/New_York']) {
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      cwd: new URL('../', import.meta.url), encoding: 'utf8', env: { ...process.env, TZ },
    });
    assert.deepEqual(JSON.parse(output.trim()), {input:'2026-10-25T15:34',saved:'2026-10-25T07:34:00.000Z'});
  }
});
