// Vercel 部署完成后、上传小程序体验版前运行：验证顾客资料接口已上线。
// 只发送无凭证的无效请求；预期会在身份校验处被拒绝，不会修改资料或上传图片。
const base = new URL(process.argv[2] || 'https://www.hsxx8888.cn');
const checks = [
  { path: '/api/customers/invalid-profile-check/self', method: 'PUT', error: '请使用本人登录凭证重新登录' },
  { path: '/api/upload/customer-avatar', method: 'POST', error: '请先登录' },
];

for (const check of checks) {
  const response = await fetch(new URL(check.path, base), {
    method: check.method,
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status !== 401 || result.error !== check.error) {
    console.error(`${check.path} 未就绪：HTTP ${response.status}，${result.error || '无有效 JSON 响应'}`);
    console.error('请先确认 Vercel Production 部署包含顾客资料与头像接口，再上传小程序体验版。');
    process.exitCode = 1;
  } else {
    console.log(`${check.path} 已就绪`);
  }
}
