import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import customersRouter from './routes/customers.js';

const app = express();

app.use(cors());
app.use(express.json());

// Vercel 环境下 express.json() 可能不生效，加一个兜底 body parser
app.use((req: any, _res: any, next: any) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    let raw = '';
    req.on('data', (chunk: any) => { raw += chunk; });
    req.on('end', () => {
      try { req.body = JSON.parse(raw || '{}'); } catch { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ok' });
});

// 挂载路由
app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);

// 未匹配的 /api/* 返回 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API 端点不存在' });
});

export default app;