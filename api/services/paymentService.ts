import {
  randomUUID,
  createVerify,
  createSign,
  createDecipheriv,
  X509Certificate,
  randomBytes,
} from 'crypto';
import WxPay from 'wechatpay-node-v3';

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

const WECHAT_PAY_MOCK = process.env.WECHAT_PAY_MOCK !== 'false';

function isWechatChannel(channel: PaymentChannel): boolean {
  return ['wechat_h5', 'wechat_mini', 'wechat_native'].includes(channel);
}

function getWxPayInstance(): WxPay | null {
  if (WECHAT_PAY_MOCK) return null;

  const mchid = process.env.WECHAT_MCH_ID;
  const appid = process.env.WECHAT_APP_ID;
  const apiv3Key = process.env.WECHAT_API_V3_KEY;
  const cert = process.env.WECHAT_API_CERT;
  const key = process.env.WECHAT_API_KEY;

  if (!mchid || !appid || !apiv3Key || !cert || !key) {
    console.error('[wechatpay] 缺少微信支付配置:', {
      hasMchId: !!mchid,
      hasAppId: !!appid,
      hasApiV3Key: !!apiv3Key,
      hasCert: !!cert,
      hasKey: !!key,
    });
    return null;
  }

  return new WxPay({
    appid,
    mchid,
    publicKey: Buffer.from(cert),
    privateKey: Buffer.from(key),
    key: apiv3Key,
  });
}

function getNotifyUrl(): string {
  return (
    process.env.WECHAT_NOTIFY_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/webhook/wechat-pay` : '')
  );
}

/** 从 PEM 证书中提取微信支付要求的序列号（大写十六进制，无冒号） */
function getCertSerialNumber(certPem: string): string {
  try {
    const cert = new X509Certificate(certPem);
    return cert.serialNumber.replace(/:/g, '').toUpperCase();
  } catch (err) {
    console.error('[wechatpay] 解析证书序列号失败:', err);
    return '';
  }
}

/** AES-256-GCM 解密（微信支付 v3 回调 / 平台证书） */
function decryptAesGcm(ciphertext: string, associatedData: string, nonce: string, key: string): string {
  const encrypted = Buffer.from(ciphertext, 'base64');
  const tag = encrypted.slice(-16);
  const data = encrypted.slice(0, -16);

  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce));
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from(associatedData));
  let decrypted = decipher.update(data, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** 验证微信支付回调签名 */
function verifyWechatSignature(params: {
  rawBody: string;
  signature: string;
  timestamp: string;
  nonce: string;
  publicKey: string;
}): boolean {
  const { rawBody, signature, timestamp, nonce, publicKey } = params;
  const signStr = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const verifier = createVerify('RSA-SHA256');
  verifier.update(signStr);
  return verifier.verify(publicKey, signature, 'base64');
}

/** 手动拉取微信平台证书，避免 wechatpay-node-v3 在 serverless 环境缓存失败 */
async function fetchWechatPlatformCerts(): Promise<Record<string, string> | null> {
  const mchid = process.env.WECHAT_MCH_ID;
  const apiv3Key = process.env.WECHAT_API_V3_KEY;
  const cert = process.env.WECHAT_API_CERT;
  const key = process.env.WECHAT_API_KEY;

  if (!mchid || !apiv3Key || !cert || !key) {
    console.error('[wechatpay] 缺少拉取平台证书的配置');
    return null;
  }

  const serial = getCertSerialNumber(cert);
  if (!serial) return null;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const method = 'GET';
  const urlPath = '/v3/certificates';
  const body = '';

  const signStr = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = createSign('RSA-SHA256').update(signStr).sign(key, 'base64');
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serial}"`;

  try {
    console.log('[wechatpay] 正在拉取微信平台证书...');
    const res = await fetch('https://api.mch.weixin.qq.com/v3/certificates', {
      method,
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Accept-Language': 'zh-CN',
      },
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error('[wechatpay] 拉取平台证书失败:', data);
      return null;
    }

    const certs = (data.data || []) as Array<Record<string, unknown>>;
    if (!certs.length) {
      console.error('[wechatpay] 平台证书返回为空');
      return null;
    }

    const result: Record<string, string> = {};
    for (const certInfo of certs) {
      const serialNo = certInfo.serial_no as string;
      const encCert = certInfo.encrypt_certificate as Record<string, string> | undefined;
      if (!serialNo || !encCert) continue;

      try {
        const certPem = decryptAesGcm(
          encCert.ciphertext,
          encCert.associated_data,
          encCert.nonce,
          apiv3Key
        );
        const platformCert = new X509Certificate(certPem);
        const publicKey = platformCert.publicKey.export({ type: 'spki', format: 'pem' }).toString();
        result[serialNo] = publicKey;
      } catch (decryptErr) {
        console.error('[wechatpay] 解密平台证书失败:', serialNo, decryptErr);
      }
    }

    if (Object.keys(result).length === 0) {
      console.error('[wechatpay] 没有成功解析任何平台证书');
      return null;
    }

    console.log('[wechatpay] 平台证书拉取成功, serials:', Object.keys(result).join(', '));
    return result;
  } catch (err) {
    console.error('[wechatpay] 拉取平台证书异常:', err);
    return null;
  }
}

/**
 * 创建支付订单
 * mock 模式返回占位二维码；真实模式调用微信支付 v3 接口。
 */
export async function createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
  const { shopId, customerId, settlementId, amount, channel, description } = input;

  if (!isWechatChannel(channel)) {
    throw new Error(`createPayment 暂不支持非微信渠道: ${channel}`);
  }

  // 微信支付要求 out_trade_no 长度 6~32 位，只能用字母/数字/-/_；
  // 去掉横杠的 UUID 正好 32 位，满足要求。
  const paymentId = randomUUID().replace(/-/g, '');

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

  const wxpay = getWxPayInstance();
  if (!wxpay) {
    throw new Error('微信支付配置不完整，请检查 Vercel 环境变量');
  }

  const notifyUrl = getNotifyUrl();
  if (!notifyUrl) {
    throw new Error('缺少微信支付回调地址，请设置 WECHAT_NOTIFY_URL 环境变量');
  }

  const appid = process.env.WECHAT_APP_ID!;
  const mchid = process.env.WECHAT_MCH_ID!;

  try {
    const body = {
      appid,
      mchid,
      description: description || 'MBS 门店结算',
      out_trade_no: paymentId,
      notify_url: notifyUrl,
      amount: {
        total: Math.round(amount * 100), // 微信金额单位为分
        currency: 'CNY',
      },
    };

    console.log('[wechatpay] 创建支付订单:', { channel, paymentId, amount, notifyUrl });

    if (channel === 'wechat_native') {
      // Native 支付：返回二维码链接
      const result = await wxpay.transactions_native(body);
      console.log('[wechatpay] Native 支付结果:', result);

      const codeUrl = result?.data?.code_url as string | undefined;
      if (!codeUrl) {
        throw new Error(`微信支付未返回二维码链接: ${JSON.stringify(result?.error || result?.data)}`);
      }

      return {
        paymentId,
        status: 'pending',
        amount,
        codeUrl,
        message: '请顾客使用微信扫描二维码完成支付',
      };
    }

    if (channel === 'wechat_h5') {
      // H5 支付：返回跳转链接
      const h5Body = {
        ...body,
        scene_info: {
          payer_client_ip: '0.0.0.0',
          h5_info: { type: 'Wap', app_name: 'MBS', app_url: 'https://mbs.vercel.app' },
        },
      };
      const result = await wxpay.transactions_h5(h5Body);
      console.log('[wechatpay] H5 支付结果:', result);

      const h5Url = result?.data?.h5_url as string | undefined;
      if (!h5Url) {
        throw new Error(`微信支付未返回 H5 链接: ${JSON.stringify(result?.error || result?.data)}`);
      }

      return {
        paymentId,
        status: 'pending',
        amount,
        codeUrl: h5Url,
        message: '请顾客在微信浏览器或手机浏览器中完成支付',
      };
    }

    // JSAPI / 小程序支付暂未实现
    throw new Error('JSAPI/小程序支付暂未实现，请先使用 Native 支付');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[wechatpay] 创建支付订单失败:', message);
    throw new Error(`微信支付下单失败: ${message}`);
  }
}

/**
 * 查询支付状态
 * mock 模式下直接返回 pending，真实环境调微信订单查询接口。
 */
export async function queryPaymentStatus(paymentId: string): Promise<Pick<PaymentResult, 'status' | 'message'>> {
  if (WECHAT_PAY_MOCK) {
    return { status: 'pending', message: 'mock 模式：请手动确认收款' };
  }

  const wxpay = getWxPayInstance();
  if (!wxpay) {
    return { status: 'pending', message: '微信支付配置不完整' };
  }

  try {
    const result = await wxpay.query({ out_trade_no: paymentId });
    console.log('[wechatpay] 查询订单状态:', paymentId, result);

    const state = result?.data?.trade_state as string | undefined;
    if (state === 'SUCCESS') return { status: 'paid', message: '支付成功' };
    if (state === 'NOTPAY') return { status: 'pending', message: '等待支付' };
    if (state === 'CLOSED') return { status: 'failed', message: '订单已关闭' };
    if (state === 'REVOKED') return { status: 'failed', message: '订单已撤销' };
    return { status: 'pending', message: state || '未知状态' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[wechatpay] 查询订单状态失败:', message);
    return { status: 'pending', message: `查询失败: ${message}` };
  }
}

/**
 * 处理微信支付回调
 * 真实环境验证签名后更新 settlements.payment_status = 'completed'。
 */
export async function handleWechatCallback(params: {
  rawBody: string;
  parsedBody: Record<string, unknown>;
  serial: string;
  signature: string;
  timestamp: string;
  nonce: string;
}): Promise<{ success: boolean; message: string; paymentId?: string; transactionId?: string }> {
  if (WECHAT_PAY_MOCK) {
    return { success: true, message: 'mock 回调已忽略' };
  }

  const apiv3Key = process.env.WECHAT_API_V3_KEY;
  if (!apiv3Key) {
    throw new Error('缺少 WECHAT_API_V3_KEY，无法处理回调');
  }

  try {
    console.log('[wechatpay-webhook] 开始手动拉取平台证书并验签...');
    const platformCerts = await fetchWechatPlatformCerts();
    if (!platformCerts) {
      return { success: false, message: '拉取平台证书失败' };
    }

    const publicKey = platformCerts[params.serial];
    if (!publicKey) {
      console.error('[wechatpay-webhook] 找不到对应 serial 的平台证书:', params.serial);
      return { success: false, message: '找不到对应平台证书' };
    }

    const valid = verifyWechatSignature({
      rawBody: params.rawBody,
      signature: params.signature,
      timestamp: params.timestamp,
      nonce: params.nonce,
      publicKey,
    });

    if (!valid) {
      console.error('[wechatpay-webhook] 回调签名验证失败');
      return { success: false, message: '签名验证失败' };
    }

    const resource = (params.parsedBody.resource || {}) as Record<string, unknown>;
    const ciphertext = resource.ciphertext as string;
    const nonce = resource.nonce as string;
    const associatedData = (resource.associated_data as string) || '';

    if (!ciphertext || !nonce) {
      return { success: false, message: '回调数据格式不正确' };
    }

    const decryptedRaw = decryptAesGcm(ciphertext, associatedData, nonce, apiv3Key);
    const decrypted = JSON.parse(decryptedRaw) as Record<string, unknown>;
    console.log('[wechatpay-webhook] 回调解密结果:', decrypted);

    if (decrypted.trade_state !== 'SUCCESS') {
      return { success: true, message: `交易状态: ${decrypted.trade_state}` };
    }

    return {
      success: true,
      message: 'OK',
      paymentId: decrypted.out_trade_no as string,
      transactionId: decrypted.transaction_id as string,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[wechatpay-webhook] 处理回调异常:', message);
    return { success: false, message: `处理异常: ${message}` };
  }
}
