import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import routes from './routes/index.js';
import analyticsRouter from '../server/routes/analytics.js';

const app = express();

/**
 * CORS & 基础中间件
 */
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * 健康检查
 */
app.use('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'ok',
  });
});

/**
 * 图片上传接口（内置，不依赖外部路由文件）
 * POST /api/upload/image
 * POST /api/uploads/image
 */
const handleImageUpload = (req: express.Request, res: express.Response) => {
  try {
    const file = req.body?.file;
    if (!file) {
      res.status(400).json({ success: false, error: '未提供文件' });
      return;
    }
    // 这里可以扩展为上传到云存储，目前先返回一个模拟的 URL
    // 实际项目中应该上传到 Vercel Blob / OSS / Supabase Storage
    const ext = file.name?.split('.').pop() || 'jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const url = `/uploads/${filename}`;
    res.json({ success: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
};

app.post('/api/upload/image', handleImageUpload);
app.post('/api/uploads/image', handleImageUpload);

/**
 * 业务路由
 */
app.use('/api', routes);
app.use('/api/analytics', analyticsRouter);

/**
 * 404 兜底
 */
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'API 端点不存在',
  });
});

/**
 * 错误处理
 */
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('API 错误:', err);
    res.status(500).json({
      success: false,
      error: message,
    });
  },
);

export default app;