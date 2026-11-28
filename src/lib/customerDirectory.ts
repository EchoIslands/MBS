import type { Customer } from '../../shared/types';

export type CustomerDirectoryPage = { success: boolean; data: Customer[]; hasMore: boolean };

/** Keep partial results private until every page is verified; never show a truncated total. */
export async function readCustomerDirectory(
  readPage: (page: number) => Promise<CustomerDirectoryPage | null>,
  onProgress?: (loaded: number) => void,
): Promise<Customer[]> {
  const rows: Customer[] = [];
  const ids = new Set<string>();
  for (let page = 0; page < 1000; page++) {
    const result = await readPage(page);
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
