import type { Customer } from '../../shared/types';

export type CustomerDirectoryPage = { success: boolean; data: Customer[]; hasMore: boolean };

function transientReadFailure(error: unknown): boolean {
  const failure = error as { status?: number; code?: string } | null;
  return failure?.code === 'REQUEST_TIMEOUT' || error instanceof TypeError ||
    [408, 502, 503, 504].includes(failure?.status || 0);
}

function waitBeforeRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(new DOMException('Request aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, 400);
    if (signal?.aborted) aborted();
    else signal?.addEventListener('abort', aborted, { once: true });
  });
}

/** Keep partial results private until every page is verified; never show a truncated total. */
export async function readCustomerDirectory(
  readPage: (page: number) => Promise<CustomerDirectoryPage | null>,
  onProgress?: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<Customer[]> {
  const rows: Customer[] = [];
  const ids = new Set<string>();
  let retries = 0;
  for (let page = 0; page < 1000; page++) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    let result: CustomerDirectoryPage | null;
    try {
      result = await readPage(page);
    } catch (error) {
      // Retry reads only: never replay account creation, payment or a whole directory.
      if (signal?.aborted || !transientReadFailure(error) || retries >= 2) throw error;
      retries++;
      await waitBeforeRetry(signal);
      result = await readPage(page);
    }
    if (!result?.success || !Array.isArray(result.data) || typeof result.hasMore !== 'boolean' ||
        (result.hasMore && result.data.length === 0)) throw new Error('客户目录返回不完整，请刷新重试');
    for (const row of result.data) {
      if (!row?.id || ids.has(row.id)) throw new Error('客户目录在同步期间发生变化，请刷新重试');
      ids.add(row.id); rows.push(row);
    }
    onProgress?.(rows.length);
    if (!result.hasMore) return rows;
  }
  throw new Error('客户目录超出同步范围，请联系维护人员');
}
