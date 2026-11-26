import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { passwordVersion } from './password.js';

// 本地缺配置使用进程级随机值；生产缺配置必须拒绝启动，禁止固定开发密钥。
const localSecret = randomBytes(48).toString('hex');
export function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured && configured.length >= 32 && configured !== 'mbs-dev-secret-2024') return configured;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    throw new Error('生产 JWT_SECRET 必须配置为至少 32 字符的独立随机密钥');
  }
  return localSecret;
}

export const CUSTOMER_COOKIE = 'mbs_customer_auth';
export const CUSTOMER_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const CUSTOMER_DEVICE_COOKIE_SECONDS = 365 * 24 * 60 * 60;
export const CUSTOMER_RESTRICTED_SESSION_SECONDS = 2 * 60 * 60;
export function signCustomerToken(id: string, shopId: string, passwordHash: string, mustChangePassword = false, smsVerified = false, sessionId?: string): string {
  return jwt.sign({ id, shopId, kind: 'customer', smsVerified, mustChangePassword, passwordVersion: passwordVersion(passwordHash), ...(sessionId ? { sessionId } : {}) }, getJwtSecret(), {
    algorithm: 'HS256', audience: 'customer', issuer: 'mbs',
    // Device credentials expire server-side after idle time and can be revoked individually.
    ...(sessionId && !mustChangePassword ? {} : { expiresIn: mustChangePassword ? CUSTOMER_RESTRICTED_SESSION_SECONDS : CUSTOMER_SESSION_SECONDS }),
  });
}

export function verifyCustomerToken(token: string) {
  const value = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'], audience: 'customer', issuer: 'mbs' });
  if (typeof value === 'string' || value.kind !== 'customer' || typeof value.id !== 'string' || typeof value.shopId !== 'string' || typeof value.passwordVersion !== 'string') {
    throw new Error('无效顾客凭证');
  }
  if (value.sessionId !== undefined && (typeof value.sessionId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.sessionId))) {
    throw new Error('无效顾客会话');
  }
  return { id: value.id, shopId: value.shopId, passwordVersion: value.passwordVersion, mustChangePassword: value.mustChangePassword === true, smsVerified: value.smsVerified === true, sessionId: value.sessionId as string | undefined };
}

const passwordChallengeAudience = 'customer-password-sms';
export function signCustomerPasswordChallenge(id: string, shopId: string, passwordHash: string): string {
  return jwt.sign({ id, shopId, passwordVersion: passwordVersion(passwordHash) }, getJwtSecret(), {
    algorithm: 'HS256', audience: passwordChallengeAudience, issuer: 'mbs', expiresIn: '15m',
  });
}

export function verifyCustomerPasswordChallenge(challenge: unknown) {
  if (typeof challenge !== 'string' || challenge.length > 2048) return null;
  try {
    const value = jwt.verify(challenge, getJwtSecret(), { algorithms: ['HS256'], audience: passwordChallengeAudience, issuer: 'mbs' });
    if (typeof value === 'string' || typeof value.id !== 'string' || typeof value.shopId !== 'string' || typeof value.passwordVersion !== 'string') return null;
    return { id: value.id as string, shopId: value.shopId as string, passwordVersion: value.passwordVersion as string };
  } catch { return null; }
}
