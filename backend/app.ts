import express, { Request, Response, NextFunction } from 'express';
import apiRouter from './routes/index.js';
import analyticsRoutes from '../server/routes/analytics.js';
import uploadRoutes from '../server/routes/upload.js';
import groupBuyRoutes from './routes/groupBuy.js';
import { randomUUID } from 'node:crypto';

// express 内部属性 _body 未在类型定义中暴露
interface RequestWithBody extends Request {
  _body?: boolean;
  rawBody?: string;
}

const app = express();

// Correlate customer failures without recording bodies, identities, cookies or query strings.
app.use((req,res,next) => {
  if (!req.path.startsWith('/api/customers')) return next();
  const requestId = randomUUID();
  const started = performance.now();
  res.setHeader('X-MBS-Request-ID',requestId);
  res.on('finish',() => {
    const duration = Math.round(performance.now()-started);
    if (res.statusCode >= 500 || duration >= 3000) console.warn(`[customer-request] id=${requestId} method=${req.method} status=${res.statusCode} duration_ms=${duration}`);
  });
  next();
});

// 网页和 API 同源；小程序请求不受浏览器 CORS 限制。跨站网页不开放读取 API 响应。
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// 兼容 Vercel Runtime 的自定义 JSON body parser
// 原因：在部分 Vercel Node Runtime 版本里 express.json() 读不到流，
//      导致 req.body 为 {}，客户姓名/电话等字段丢失。
const MAX_JSON_BYTES = 3 * 1024 * 1024; // 兼容现有2MB图片的base64载荷。
const getRawBody = (req: Request): Promise<string> => {
  if (req.readableEnded) {
    if (Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding']) {
      return Promise.reject(new Error('请求正文已被读取，无法安全执行保存'));
    }
    return Promise.resolve('');
  }
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    let exceeded = false;
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      if (exceeded) return;
      size += Buffer.byteLength(chunk);
      if (size > MAX_JSON_BYTES) {
        exceeded = true;
        data = '';
        reject(Object.assign(new Error('请求内容过大'), { status: 413 }));
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('aborted',()=>reject(new Error('请求已中断')));
    req.on('error', (err: unknown) => {
      reject(err);
    });
  });
};

const jsonBodyParser = async (req: RequestWithBody, _res: Response, next: NextFunction): Promise<void> => {
  // Read requests carry no JSON body. In a serverless invocation the stream may
  // already be ended; waiting for its next 'end' event would never reach a route.
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  // 已经解析过就不再处理
  if (req._body || (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body))) {
    return next();
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return next();
  }

  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : await getRawBody(req);
    if (Buffer.byteLength(raw) > MAX_JSON_BYTES) throw Object.assign(new Error('请求内容过大'),{status:413});
    req.rawBody = raw;
    req.body = raw ? JSON.parse(raw) : {};
    if(!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new Error('JSON须为对象');
    req._body = true;
    next();
  } catch (err: unknown) {
    console.error('[body-parser] JSON 请求解析失败');
    const status = (err as { status?: number }).status === 413 ? 413 : 400;
    _res.status(status).json({ success: false, error: status === 413 ? '请求内容过大' : 'JSON请求格式不正确' });
  }
};

app.use(jsonBodyParser);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ok' });
});

// 挂载路由
app.use('/api', apiRouter);

// 埋点路由（server/routes 下独立维护，便于三端复用）
app.use('/api/analytics', analyticsRoutes);

// 图片上传路由
app.use('/api/upload', uploadRoutes);

// 团购券路由
app.use('/api/group-buy', groupBuyRoutes);

// 未匹配的 /api/* 返回 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API 端点不存在' });
});

export default app;
