import { hashPassword, verifyPassword } from './password.js';

export const isCustomerPassword = (value: unknown): value is string => typeof value === 'string' && /^\d{6}$/.test(value);

export async function hashCustomerPassword(value: unknown): Promise<string> {
  if (!isCustomerPassword(value)) throw new Error('顾客密码必须为六位数字');
  return hashPassword(value);
}

export async function verifyCustomerPassword(value: unknown, stored: unknown): Promise<boolean> {
  return isCustomerPassword(value) && verifyPassword(value, stored);
}
