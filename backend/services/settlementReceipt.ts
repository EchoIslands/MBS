import { supabase } from '../db/index.js';
import type { WechatReceipt } from '../lib/wechatReceipt.js';

export async function recordWechatReceipt(receipt: WechatReceipt, shopId: string, employeeId: string, employeeName: string) {
  const { data, error } = await supabase.rpc('finalize_wechat_attempt', {
    p_order_no: receipt.paymentId, p_shop_id: shopId, p_transaction_id: receipt.transactionId,
    p_paid_at: receipt.paidAt, p_amount: receipt.amount, p_employee_id: employeeId, p_employee_name: employeeName,
  });
  if (error) {
    console.error('[wechat-receipt] 原子登记失败 code=%s', error.code || 'UNKNOWN');
    throw new Error(error.code === 'PGRST202' || error.code === '42703'
      ? '微信收款登记组件未就绪，请检查037、038迁移；请勿重新收款'
      : '微信收款登记未完成，请核对原订单后重试；请勿重新收款');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('微信收款登记结果暂不可用，请核对原单');
  return row as Record<string, unknown>;
}
