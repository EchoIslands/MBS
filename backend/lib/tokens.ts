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
export const CUSTOMER_SESSION_SECONDS = 2 * 60 * 60;
export function signCustomerToken(id: string, shopId: string, passwordHash: string, mustChangePassword = false): string {
  return jwt.sign({ id, shopId, kind: 'customer', mustChangePassword, passwordVersion: passwordVersion(passwordHash) }, getJwtSecret(), {
    algorithm: 'HS256', audience: 'customer', issuer: 'mbs', expiresIn: CUSTOMER_SESSION_SECONDS,
  });
}

export function verifyCustomerToken(token: string) {
  const value = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'], audience: 'customer', issuer: 'mbs' });
  if (typeof value === 'string' || value.kind !== 'customer' || typeof value.id !== 'string' || typeof value.shopId !== 'string' || typeof value.passwordVersion !== 'string') {
    throw new Error('无效顾客凭证');
  }
  return { id: value.id, shopId: value.shopId, passwordVersion: value.passwordVersion, mustChangePassword: value.mustChangePassword === true };
}
