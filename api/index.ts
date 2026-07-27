/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { default: app } = await import('./app.js');
    return app(req, res);
  } catch (err) {
    console.error('[handler] 启动失败:', err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    return res.status(500).json({
      error: 'FUNCTION_INVOCATION_FAILED',
      message,
      stack,
    });
  }
}
