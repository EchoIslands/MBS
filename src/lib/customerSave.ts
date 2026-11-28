import type { Customer } from '../../shared/types';

function sameSavedValue(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' && typeof right === 'string' && /^\d{4}-\d\d-\d\dT/.test(left) && /^\d{4}-\d\d-\d\dT/.test(right)) {
    return new Date(left).getTime() === new Date(right).getTime();
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function verifyCustomerSave(write: () => Promise<Customer>, read: () => Promise<Customer | null>, expected: Partial<Customer>): Promise<Customer> {
  try { return await write(); }
  catch (error) {
    const failure = error as {code?:string;status?:number};
    if (!(error instanceof TypeError) && failure.code !== 'REQUEST_TIMEOUT' && ![500,502,504].includes(failure.status || 0)) throw error;
    try {
      const actual = await read();
      if (actual?.id && Object.entries(expected).every(([key,value]) => sameSavedValue(actual[key as keyof Customer],value))) return actual;
    } catch { /* A failed read cannot establish whether the write committed. */ }
    throw Object.assign(new Error('保存结果暂未确认。请关闭编辑窗口并刷新核对，不要重复提交。'), { code:'SAVE_RESULT_UNCONFIRMED' });
  }
}
