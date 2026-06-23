/**
 * 本地开发服务器入口
 * Vercel 部署时不会用到这个文件（Vercel 用 api/index.ts 作为入口）
 * 本地开发用：npm run server:dev (nodemon) 或 npm run server:api (tsx)
 */
import app from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[server] API 服务已启动: http://localhost:${PORT}`);
  console.log(`[server] 健康检查: http://localhost:${PORT}/api/health`);
});