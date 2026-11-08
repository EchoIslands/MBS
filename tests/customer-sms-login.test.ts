import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('短信验证码数据库限流、单次使用、五次错误锁定和重发冷却', async () => {
  const db = new PGlite();
  try {
    const sql = await readFile(new URL('../migrations/045_customer_sms_login.sql', import.meta.url), 'utf8');
    // Standalone PGlite lacks Supabase roles; setup-db integration covers deployment grants.
    await db.exec(sql.replaceAll(/REVOKE ALL ON [^;]+;/g, '').replaceAll(/GRANT (?:ALL|EXECUTE) ON [^;]+;/g, ''));
    const p = 'a'.repeat(64), ip = 'b'.repeat(64), code = 'c'.repeat(64), wrong = 'd'.repeat(64);
    const send = () => db.query<{ allowed: boolean }>('SELECT * FROM public.begin_customer_sms_code($1,$2,$3)', [p, ip, code]);
    assert.equal((await send()).rows[0].allowed, true);
    assert.equal((await send()).rows[0].allowed, false);
    assert.equal((await db.query<{ ok: boolean }>('SELECT public.verify_customer_sms_code($1,$2) AS ok', [p, wrong])).rows[0].ok, false);
    assert.equal((await db.query<{ ok: boolean }>('SELECT public.verify_customer_sms_code($1,$2) AS ok', [p, code])).rows[0].ok, true);
    assert.equal((await db.query<{ ok: boolean }>('SELECT public.verify_customer_sms_code($1,$2) AS ok', [p, code])).rows[0].ok, false);
    await db.query("UPDATE public.customer_sms_challenges SET sent_at=now()-interval '61 seconds', expires_at=now()-interval '1 second' WHERE phone_hash=$1", [p]);
    assert.equal((await send()).rows[0].allowed, true);
    for (let i = 0; i < 5; i++) await db.query('SELECT public.verify_customer_sms_code($1,$2)', [p, wrong]);
    assert.equal((await db.query<{ ok: boolean }>('SELECT public.verify_customer_sms_code($1,$2) AS ok', [p, code])).rows[0].ok, false);
  } finally { await db.close(); }
});
