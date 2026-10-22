/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Express自行解析；阻止Vercel helpers预先消费原文，微信签名必须使用原始字节。
export const config = { helpers: false };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { default: app } = await import('../backend/app.js');
    return app(req, res);
  } catch (err) {
    console.error('[handler] 启动失败:', err);
    const body = {
      error: 'FUNCTION_INVOCATION_FAILED',
      message: '服务暂不可用，请联系门店或管理员',
    };
    if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(500).json(body);
    res.statusCode = 500;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }
}
