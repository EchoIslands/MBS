export const displayLoginNameHint = '账号名需为 4–32 个字符，可用英文字母、数字、下划线或短横线，至少含一个字母。';

export function normalizeDisplayLoginName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(value) || !/[a-zA-Z]/.test(value)) return null;
  return value.toLowerCase();
}
