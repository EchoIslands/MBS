import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import customersRouter from './routes/customers.js';

const app = express();

app.use(cors());
app.use(express.json());

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