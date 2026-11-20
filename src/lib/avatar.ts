/**
 * 生成本地可渲染的兜底头像。
 *
 * 头像字段有真实图片时优先使用真实图片。没有头像或图片加载失败时，使用
 * 内联 SVG，避免依赖外部头像站点、跨域策略或网络状况，保证显示屏一定有可见头像。
 */
export function getAvatarUrl(name: string): string {
  const safeName = (name || '员工').trim() || '员工';
  const initials = Array.from(safeName).slice(0, 2).join('');
  let hash = 0;
  for (const char of safeName) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="hsl(${hue} 65% 45%)"/><text x="80" y="92" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial,sans-serif" font-size="52" font-weight="700">${escapeXml(initials)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] || char);
}
