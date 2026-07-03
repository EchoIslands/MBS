import express from 'express';
import cors from 'cors';
import apiRouter from './routes/index.js';

const app = express();

app.use(cors());

// 兼容 Vercel Runtime 的自定义 JSON body parser
// 原因：在部分 Vercel Node Runtime 版本里 express.json() 读不到流，
//      导致 req.body 为 {}，客户姓名/电话等字段丢失。
const getRawBody = (req: any): Promise<string> => {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', (err: any) => {
      reject(err);
    });
  });
};

const jsonBodyParser = async (req: any, _res: any, next: any) => {
  // 已经解析过就不再处理
  if (req._body) {
    return next();
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return next();
  }

  try {
    const raw = await getRawBody(req);
    console.log('[body-parser] raw body:', raw);
    req.body = raw ? JSON.parse(raw) : {};
    req._body = true;
    next();
  } catch (err: any) {
    console.error('[body-parser] parse error:', err.message);
    next(err);
  }
};

app.use(jsonBodyParser);

// 调试：打印 customers 路由收到的请求体和请求头
app.use('/api/customers', (req, _res, next) => {
  console.log('[customers] 收到请求体:', JSON.stringify(req.body));
  console.log('[customers] 收到请求头 content-type:', req.headers['content-type']);
  next();
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ok' });
});

// 挂载路由
app.use('/api', apiRouter);

// 未匹配的 /api/* 返回 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API 端点不存在' });
});

export default app;