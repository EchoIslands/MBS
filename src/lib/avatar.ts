const colors = ['#6366f1','#8b5cf6','#d946ef','#ec4899','#f43f5e','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6'];

export function getAvatarUrl(name: string): string {
  const initials = name.slice(0, 2) || '?';
  const color = colors[Math.abs(hashCode(name)) % colors.length];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" fill="' + color + '"/><text x="40" y="52" text-anchor="middle" fill="white" font-size="32" font-family="Arial,sans-serif" font-weight="bold">' + initials + '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return hash;
}