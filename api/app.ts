// 只保留健康检查，其他 /api/* 返回 404（不干扰前端 mock fallback）
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'not found' });
});
