/**
 * 本地开发服务器入口
 * Vercel 部署时不会用到这个文件（Vercel 用 api/index.ts 作为入口）
 * 本地开发用：npm run server:dev (nodemon) 或 npm run server:api (tsx)
 */
import app from './app.js';

const PORT = Number(process.env.PORT) || 3001;

// 开发环境默认只在本机监听；需要手机局域网调试时显式设置 HOST。
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`[server] API 服务已启动: http://${HOST}:${PORT}`);
  console.log(`[server] 健康检查: http://${HOST}:${PORT}/api/health`);
});