import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { invitationMiniProgramCode } from '../backend/services/miniProgramCode';

test('邀请生成微信原生码，保留 scene，拒绝微信错误响应且不退回网页二维码', async () => {
  const original = globalThis.fetch;
  const oldId = process.env.WECHAT_MINI_APP_ID, oldSecret = process.env.WECHAT_MINI_APP_SECRET;
  process.env.WECHAT_MINI_APP_ID = 'synthetic-app'; process.env.WECHAT_MINI_APP_SECRET = 'synthetic-secret';
  const bodies: Record<string, unknown>[] = [];
  let fail = false;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/cgi-bin/token?')) return Response.json({ access_token: 'synthetic-token', expires_in: 7200 });
    assert.match(String(url), /\/wxa\/getwxacodeunlimit\?/);
    bodies.push(JSON.parse(String(options?.body)));
    if (fail) return Response.json({ errcode: 41030 });
    return new Response(Buffer.from([137,80,78,71,13,10,26,10,0]));
  };
  try {
    assert.match(await invitationMiniProgramCode('ref_123_abc'), /^data:image\/png;base64,/);
    assert.deepEqual(bodies[0], { scene: 'ref_123_abc', page: 'pages/invite/claim', env_version: 'release', check_path: true, width: 430, auto_color: true });
    await assert.rejects(invitationMiniProgramCode('https://website'), /格式/);
    fail = true;
    await assert.rejects(invitationMiniProgramCode('ref_123_def'), /尚未发布/);
  } finally {
    globalThis.fetch = original;
    if (oldId === undefined) delete process.env.WECHAT_MINI_APP_ID; else process.env.WECHAT_MINI_APP_ID = oldId;
    if (oldSecret === undefined) delete process.env.WECHAT_MINI_APP_SECRET; else process.env.WECHAT_MINI_APP_SECRET = oldSecret;
  }
});

test('微信扫码 scene 解码后保留邀请码，新人登录返回领取页，朋友圈入口重定向至领取页', async () => {
  let page!: vm.Context;
  let modal: { content: string; success: (r: {confirm: boolean}) => void } | undefined;
  let path = '', checked = '';
  const context = vm.createContext({ Page: (p: vm.Context) => { page = p; }, getToken: () => '',
    checkInviteCode: async (ref: string) => { checked = ref; return { success: true, data: {} }; },
    wx: { showModal: (options: typeof modal) => { modal = options; }, navigateTo: ({url}: {url: string}) => { path = url; } } });
  vm.runInContext((await readFile(new URL('../mini-program/pages/invite/claim.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, ''), context);
  page.setData = (patch: object) => Object.assign(page.data, patch);
  await page.onLoad({ scene: 'ref%5F123%5Fabc' });
  assert.equal(checked, 'ref_123_abc');
  await page.onClaim();
  assert.match(modal!.content, /无需/); modal!.success({confirm: true});
  assert.equal(path, '/pages/login/login?inviteRef=ref_123_abc');
  let redirect = '';
  const sender = vm.createContext({ Page: (p: vm.Context) => { page = p; }, wx: { redirectTo: ({url}: {url: string}) => { redirect = url; } } });
  vm.runInContext((await readFile(new URL('../mini-program/pages/invite/invite.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, ''), sender);
  await page.onLoad({ ref: 'ref_123_abc' });
  assert.equal(redirect, '/pages/invite/claim?ref=ref_123_abc');
});

test('邀请领取遇到过期会话或强制改密，跳转仍保留邀请码且不携带任意外部地址',async()=>{
 let path='',token='expired',customerId='c';
 const wx={reLaunch:({url,complete}:{url:string;complete?:()=>void})=>{path=url;complete?.();}};
 const context=vm.createContext({wx,getToken:()=>token,getCustomerId:()=>customerId,clearCustomerId:()=>{token='';customerId='';},currentPaymentOrderNumber:()=>'',getCurrentPages:()=>[{route:'pages/invite/claim',options:{scene:'ref%5F123%5Fabc'}}]});
 vm.runInContext((await readFile(new URL('../mini-program/utils/auth.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace(/export /g,''),context);
 vm.runInContext("handleExpiredCustomerSession('expired','c')",context);
 assert.equal(path,'/pages/login/login?reason=session_expired&inviteRef=ref_123_abc');
 const gate=vm.createContext({wx,getToken:()=> 'restricted',getPasswordChangeRequired:()=>true,paymentOrderNumber:()=>'',currentPaymentOrderNumber:()=>''});
 vm.runInContext((await readFile(new URL('../mini-program/utils/password-gate.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace(/export /g,''),gate);
 vm.runInContext("enforcePasswordChange('pages/invite/claim',{scene:'ref%5F123%5Fabc'})",gate);
 assert.equal(path,'/pages/change-password/change-password?inviteRef=ref_123_abc');
});
