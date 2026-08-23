import { randomUUID } from 'crypto';

export type PaymentChannel = 'wechat_h5' | 'wechat_mini' | 'wechat_native' | 'alipay' | 'cash' | 'balance';

export interface CreatePaymentInput {
  shopId: string;
  customerId: string;
  settlementId: string;
  amount: number;
  channel: PaymentChannel;
  description?: string;
  // 小程序/JSAPI 支付需要 openid
  openid?: string;
}

export interface PaymentResult {
  paymentId: string;
  status: 'pending' | 'paid' | 'failed';
  amount: number;
  // Native 支付二维码链接
  codeUrl?: string;
  // JSAPI/小程序调起参数
  prepayId?: string;
  // JSAPI 调起参数（H5）
  jsapiParams?: {
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
  };
  // 小程序调起参数
  miniProgramParams?: {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
  };
  message?: string;
}

// TODO: 商户号、API 证书到位后，用真实微信 SDK 替换此处 mock
const WECHAT_PAY_MOCK = process.env.WECHAT_PAY_MOCK !== 'false';

function isWechatChannel(channel: PaymentChannel): boolean {
  return ['wechat_h5', 'wechat_mini', 'wechat_native'].includes(channel);
}

/**
 * 创建支付订单
 * 当前阶段：未拿到微信商户号/证书，默认走 mock 模式，生成占位二维码/参数。
 * 设置环境变量 WECHAT_PAY_MOCK=false 并配置 WECHAT_MCH_ID 等后，再调真实接口。
 */
export async function createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
  const { shopId, customerId, settlementId, amount, channel, description } = input;

  if (!isWechatChannel(channel)) {
    throw new Error(`createPayment 暂不支持非微信渠道: ${channel}`);
  }

  const paymentId = `pay_${randomUUID().replace(/-/g, '')}`;

  if (WECHAT_PAY_MOCK) {
    // mock 模式：返回一个可识别的占位二维码，前端提示"配置中"
    return {
      paymentId,
      status: 'pending',
      amount,
      codeUrl: `https://mock.wechat.qrcode/pay/${paymentId}?amount=${amount}`,
      prepayId: `mock_prepay_${paymentId}`,
      message: '微信支付配置未完成（mock 模式），请使用余额/现金支付或确认收款后继续',
    };
  }

  // ===== 真实微信接口接入点（商户号/证书到位后实现） =====
  // const mchId = process.env.WECHAT_MCH_ID;
  // const appId = channel === 'wechat_mini' ? process.env.WECHAT_MINI_APP_ID : process.env.WECHAT_APP_ID;
  // if (!mchId || !appId) throw new Error('缺少微信支付配置');
  //
  // const params = await wechatUnifiedOrder({
  //   mchId, appId, amount, description, outTradeNo: paymentId, openid: input.openid
  // });
  // return { paymentId, status: 'pending', amount, ...params };

  throw new Error('真实微信支付接口尚未接入，请先设置 WECHAT_PAY_MOCK=true 或完成证书配置');
}

/**
 * 查询支付状态
 * mock 模式下直接返回 pending，真实环境调微信订单查询接口。
 */
export async function queryPaymentStatus(paymentId: string): Promise<Pick<PaymentResult, 'status' | 'message'>> {
  if (WECHAT_PAY_MOCK) {
    return { status: 'pending', message: 'mock 模式：请手动确认收款' };
  }

  // ===== 真实微信接口接入点 =====
  // return await wechatOrderQuery(paymentId);

  throw new Error('真实微信支付接口尚未接入');
}

/**
 * 处理微信支付回调
 * 真实环境验证签名后更新 settlements.payment_status = 'completed'。
 */
export async function handleWechatCallback(xmlBody: string): Promise<{ success: boolean; message: string }> {
  if (WECHAT_PAY_MOCK) {
    return { success: true, message: 'mock 回调已忽略' };
  }

  // ===== 真实微信接口接入点 =====
  // const result = await parseWechatCallback(xmlBody);
  // if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
  //   await updateSettlementPaymentStatus(result.out_trade_no, 'completed', result.transaction_id);
  // }
  // return { success: true, message: 'OK' };

  throw new Error('真实微信支付回调处理尚未接入');
}
