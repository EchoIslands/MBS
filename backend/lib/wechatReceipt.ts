export interface WechatReceipt {
  paymentId: string;
  transactionId: string;
  amount: number;
  paidAt: string;
}

// Accept only an explicit RFC3339 timezone. Missing/invalid gateway time must never become “now”.
export function wechatSuccessReceipt(data: Record<string, any>, expected: { mchid?: string; appid?: string; paymentId?: string }): WechatReceipt {
  if (!expected.mchid || !expected.appid || data.mchid !== expected.mchid || data.appid !== expected.appid ||
      data.trade_state !== 'SUCCESS' || data.amount?.currency !== 'CNY' ||
      !Number.isSafeInteger(data.amount?.total) || data.amount.total <= 0 ||
      typeof data.out_trade_no !== 'string' || !/^[A-Za-z0-9_-]{6,32}$/.test(data.out_trade_no) ||
      (expected.paymentId && data.out_trade_no !== expected.paymentId) ||
      typeof data.transaction_id !== 'string' || !/^\d{1,64}$/.test(data.transaction_id)) {
    throw new Error('微信支付商户、订单或金额信息不匹配');
  }
  const time = data.success_time;
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(time) ||
      !Number.isFinite(Date.parse(time)) || Date.parse(time) > Date.now() + 300_000) {
    throw new Error('微信未返回有效支付成功时间，不能登记为已核对收款');
  }
  return { paymentId: data.out_trade_no, transactionId: data.transaction_id, amount: data.amount.total / 100, paidAt: new Date(time).toISOString() };
}
