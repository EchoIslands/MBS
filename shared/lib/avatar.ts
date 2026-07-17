// 使用 ui-avatars.com 生成头像，替代被墙的 dicebear
export function getAvatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=80`;
}
