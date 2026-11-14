/** Run on a trusted always-on host; never embed this credential in the client. */
import dotenv from 'dotenv';
import { setTimeout as delay } from 'node:timers/promises';
dotenv.config({ quiet: true });
const endpoint = process.env.QUEUE_DISPATCH_URL;
const secret = process.env.QUEUE_DISPATCH_SECRET;
if (!endpoint || !secret || secret.length < 32 || new URL(endpoint).protocol !== 'https:') {
  console.error('需要 HTTPS QUEUE_DISPATCH_URL 和至少32位的 QUEUE_DISPATCH_SECRET');
  process.exitCode = 1;
} else {
  let stopped = false;
  const shutdown = new AbortController();
  const stop = () => { stopped = true; shutdown.abort(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const once = process.argv.includes('--once');
  do {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + secret }, signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (!response.ok) throw new Error('DISPATCH_NOT_CONFIRMED');
      const body = await response.json() as {success?: boolean; data?: {processed?: number}};
      if (!body.success) throw new Error('DISPATCH_NOT_CONFIRMED');
      console.log(new Date().toISOString(), '通知任务核对完成', Number(body.data?.processed) || 0);
    } catch {
      console.error(new Date().toISOString(), '通知任务未确认，请检查 worker 与电话待办；不在客户端重发');
      if (once) process.exitCode = 1;
    }
    if (!once && !stopped) await delay(5000, undefined, { signal: shutdown.signal }).catch(() => {});
  } while (!once && !stopped);
}
