import { createHmac, randomInt } from 'node:crypto';
import Dysmsapi, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import { Config } from '@alicloud/openapi-client';
import { supabase } from '../db/index.js';
import { getJwtSecret } from '../lib/tokens.js';

export const smsReady = () => Boolean(process.env.SMS_ACCESS_KEY_ID && process.env.SMS_ACCESS_KEY_SECRET && process.env.SMS_SIGN_NAME && process.env.SMS_TEMPLATE_CODE);
const digest = (label: string, value: string) => createHmac('sha256', getJwtSecret()).update(label + ':' + value).digest('hex');
export const smsPhoneKey = (phone: string) => digest('customer-sms-phone', phone);
export const smsIpKey = (ip: string) => digest('customer-sms-ip', ip);
export const smsCodeKey = (phone: string, code: string) => digest('customer-sms-code', phone + ':' + code);
export const generateSmsCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export async function reserveSmsCode(phone: string, ip: string, code: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { data, error } = await supabase.rpc('begin_customer_sms_code', {
    p_phone_hash: smsPhoneKey(phone), p_ip_hash: smsIpKey(ip), p_code_hash: smsCodeKey(phone, code),
  });
  if (error || !Array.isArray(data) || data.length !== 1 || typeof data[0]?.allowed !== 'boolean') throw new Error('验证码安全组件不可用，请先完成数据库迁移');
  return { allowed: data[0].allowed, retryAfterSeconds: data[0].retry_after_seconds || 60 };
}

export async function cancelSmsCode(phone: string, code: string): Promise<void> {
  await supabase.rpc('cancel_customer_sms_code', { p_phone_hash: smsPhoneKey(phone), p_code_hash: smsCodeKey(phone, code) });
}

export async function verifySmsCode(phone: string, code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_customer_sms_code', { p_phone_hash: smsPhoneKey(phone), p_code_hash: smsCodeKey(phone, code) });
  if (error || typeof data !== 'boolean') throw new Error('验证码安全组件不可用');
  return data;
}

export async function sendSmsCode(phone: string, code: string): Promise<void> {
  if (!smsReady()) throw new Error('短信服务尚未配置');
  const ClientCtor = (Dysmsapi as unknown as { default?: typeof Dysmsapi }).default || Dysmsapi;
  const client = new ClientCtor(new Config({
    accessKeyId: process.env.SMS_ACCESS_KEY_ID, accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET,
    endpoint: 'dysmsapi.aliyuncs.com',
  }));
  const response = await client.sendSms(new SendSmsRequest({
    phoneNumbers: phone, signName: process.env.SMS_SIGN_NAME, templateCode: process.env.SMS_TEMPLATE_CODE,
    templateParam: JSON.stringify({ code }),
  }));
  if (response.body?.code !== 'OK') throw new Error('短信发送失败');
}
