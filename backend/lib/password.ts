import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';

const PREHASH_PREFIX = 'mbs-sha256:';
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
export const isPasswordHash = (value: string): boolean => BCRYPT_PATTERN.test(value) || (value.startsWith(PREHASH_PREFIX) && BCRYPT_PATTERN.test(value.slice(PREHASH_PREFIX.length)));
export const passwordVersion = (value: string): string => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password: unknown, legacyMigration = false): Promise<string> {
  if (typeof password !== 'string' || !password || (!legacyMigration && (password.length < 6 || Buffer.byteLength(password, 'utf8') > 72))) {
    throw new Error('密码至少 6 位，且 UTF-8 长度不能超过 72 字节');
  }
  // 兼容历史超长密码，避免 bcrypt 截断 72 字节后不同密码被视为相同。
  if (Buffer.byteLength(password, 'utf8') > 72) return PREHASH_PREFIX + await bcrypt.hash(passwordVersion(password), 12);
  return bcrypt.hash(password, 12);
}

/** 旧明文只用于一次成功校验，调用方必须完成条件迁移后才签发会话。 */
export async function verifyPassword(password: unknown, stored: unknown): Promise<boolean> {
  if (typeof password !== 'string' || typeof stored !== 'string' || !password || !stored) return false;
  if (isPasswordHash(stored)) {
    if (stored.startsWith(PREHASH_PREFIX)) return bcrypt.compare(passwordVersion(password), stored.slice(PREHASH_PREFIX.length));
    if (Buffer.byteLength(password, 'utf8') > 72) return false;
    return bcrypt.compare(password, stored);
  }
  return timingSafeEqual(Buffer.from(passwordVersion(password)), Buffer.from(passwordVersion(stored)));
}
