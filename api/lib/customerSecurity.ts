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

export async function beginCustomerAuthAttempt(ip: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('begin_customer_auth_attempt', { p_ip_hash: customerAuthIpKey(ip) });
  if (error) throw new Error('登录安全组件暂不可用，请联系门店确认数据库迁移');
  return Array.isArray(data) && data[0]?.allowed === true;
}

export async function finishCustomerAuthAttempt(ip: string, succeeded: boolean): Promise<void> {
  const { error } = await supabase.rpc('finish_customer_auth_attempt', { p_ip_hash: customerAuthIpKey(ip), p_succeeded: succeeded });
  if (error) throw new Error('登录安全组件暂不可用');
}
