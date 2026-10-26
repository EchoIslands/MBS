import { createHmac } from 'crypto';
import { supabase } from '../db/index.js';
import { getJwtSecret } from './tokens.js';

export const FIRST_USE_MESSAGE = '首次使用需由门店核实身份';

export async function isCustomerVerified(customerId: string, shopId: string): Promise<boolean> {
  const { data, error } = await supabase.from('customers').select('identity_verified, is_weak_password')
    .eq('id', customerId).eq('shop_id', shopId).maybeSingle();
  // 缺失迁移、未知客户、查询故障均不能被解释为已核实。
  return !error && data?.identity_verified === true && data?.is_weak_password !== true;
}

export function customerAuthIpKey(ip: string): string {
  return createHmac('sha256', getJwtSecret()).update('customer-auth-ip:' + ip).digest('hex');
}

export type CustomerAuthAttempt = { ipKey: string; attemptId: string };
type AuthDecision = { allowed: true; attempt: CustomerAuthAttempt } | {
  allowed: false; code: string; error: string; retryAfterSeconds: number; retryAt: string;
};
export const CUSTOMER_AUTH_UNAVAILABLE = '登录安全组件暂不可用，请联系门店确认043数据库更新';

export async function beginCustomerAuthAttempt(ip: string): Promise<AuthDecision> {
  if (!ip || ip === 'unknown') throw new Error(CUSTOMER_AUTH_UNAVAILABLE);
  const ipKey = customerAuthIpKey(ip);
  const { data, error } = await supabase.rpc('begin_customer_auth_attempt_v2', { p_ip_hash: ipKey });
  if (error) throw new Error(CUSTOMER_AUTH_UNAVAILABLE);
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (row?.allowed === true && typeof row.attempt_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.attempt_id)) {
    return { allowed: true, attempt: { ipKey, attemptId: row.attempt_id } };
  }
  const reason = row?.reason;
  const retryAfterSeconds = row?.retry_after_seconds;
  if (row?.allowed !== false || !Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 1 || retryAfterSeconds > 86400 ||
      !['temporary_lock', 'daily_limit', 'verification_busy'].includes(reason)) throw new Error(CUSTOMER_AUTH_UNAVAILABLE);
  const retryAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
  const time = new Date(retryAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const label = reason === 'daily_limit' ? '当前网络今日密码错误次数已达上限' :
    reason === 'temporary_lock' ? '当前网络连续输错密码，已暂时锁定' : '当前网络正在验证的请求较多';
  return { allowed: false, code: 'CUSTOMER_AUTH_' + reason.toUpperCase(), retryAfterSeconds, retryAt,
    error: `${label}，请于北京时间 ${time} 后重试。本次尚未验证密码。` };
}

export async function finishCustomerAuthAttempt(attempt: CustomerAuthAttempt, outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
  const { data, error } = await supabase.rpc('finish_customer_auth_attempt_v2', {
    p_ip_hash: attempt.ipKey, p_attempt_id: attempt.attemptId, p_outcome: outcome,
  });
  if (error || data !== true) throw new Error(CUSTOMER_AUTH_UNAVAILABLE);
}
