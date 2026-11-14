/** Use WeChat's native code: an ordinary HTTPS QR only opens the website. */
let tokenCache: { appid: string; secret: string; value: string; until: number } | undefined;
let tokenRequest: Promise<string> | undefined;
export async function miniProgramAccessToken(): Promise<string> {
  const appid = process.env.WECHAT_MINI_APP_ID || process.env.WECHAT_APP_ID;
  const secret = process.env.WECHAT_MINI_APP_SECRET;
  if (!appid || !secret) throw new Error('小程序 AppID 或 AppSecret 尚未配置');
  if (tokenCache?.appid === appid && tokenCache.secret === secret && tokenCache.until > Date.now()) return tokenCache.value;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    const response = await fetch('https://api.weixin.qq.com/cgi-bin/token?' + new URLSearchParams({ grant_type: 'client_credential', appid, secret }), { signal: AbortSignal.timeout(5000) });
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!response.ok || !body.access_token) throw new Error('获取微信小程序凭证失败，请检查小程序配置及服务器 IP 白名单');
    tokenCache = { appid, secret, value: body.access_token, until: Date.now() + Math.max(0, Math.min(7000, (body.expires_in || 300) - 120)) * 1000 };
    return body.access_token;
  })();
  try { return await tokenRequest; } finally { tokenRequest = undefined; }
}

export async function invitationMiniProgramCode(ref: string): Promise<string> {
  if (!/^ref_[A-Za-z0-9_]{1,28}$/.test(ref) || ref.length > 32) throw new Error('邀请码格式无效');
  const envVersion = process.env.WECHAT_INVITE_ENV_VERSION || 'release';
  if (!['release', 'trial', 'develop'].includes(envVersion)) throw new Error('小程序邀请版本配置无效');
  const token = await miniProgramAccessToken();
  const response = await fetch('https://api.weixin.qq.com/wxa/getwxacodeunlimit?' + new URLSearchParams({ access_token: token }), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ scene: ref, page: 'pages/invite/claim', env_version: envVersion, check_path: true, width: 430, auto_color: true }),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!response.ok || (!png && !jpeg) || bytes.length > 2 * 1024 * 1024) {
    let code = '';
    try { code = String(JSON.parse(bytes.toString()).errcode || ''); } catch { /* Never expose provider response or access token. */ }
    throw new Error(code === '41030' ? '邀请领取页面尚未发布，请发布包含该页面的小程序版本' : '微信小程序码生成失败，请检查小程序配置及接口权限');
  }
  return `data:image/${png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
}
