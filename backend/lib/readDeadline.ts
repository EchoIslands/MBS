/** Read-only deadlines also cancel the underlying database fetch. Never wrap writes. */
export async function withReadDeadline<T>(read: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => read(controller.signal)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error('DATABASE_READ_TIMEOUT'), { code: 'DATABASE_READ_TIMEOUT' }));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
