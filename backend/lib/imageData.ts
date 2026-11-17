import type {Response} from 'express';

/** 大图留在图片请求里；业务JSON只携带同源URL，不截坏base64。 */
export function isTrustedStorageImage(value: unknown, storageUrl = process.env.SUPABASE_URL): value is string {
  if (typeof value !== 'string' || !storageUrl) return false;
  try {
    const image = new URL(value);
    const storage = new URL(storageUrl);
    return image.protocol === 'https:' && !image.username && !image.password &&
      image.origin === storage.origin && image.pathname.startsWith('/storage/v1/object/public/');
  } catch { return false; }
}

export function imageReference(value:unknown,url:string):unknown {
  return typeof value==='string' && (value.startsWith('data:') || isTrustedStorageImage(value)) ? url : value;
}

// 旧商品图片仍在本项目Storage中。由同域提供给小程序，避免直连旧域名失败。
// 仅能读取数据库中的本项目公开图片，不接受客户端URL或跳转到其他主机。
export async function sendShopImage(res: Response, value: unknown, fetchImage = fetch) {
  if (!isTrustedStorageImage(value)) return sendStoredImage(res, value);
  const maxBytes = 8 * 1024 * 1024;
  try {
    const response = await fetchImage(value, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return res.status(response.status === 404 ? 404 : 502).end();
    const mime = response.headers.get('content-type')?.split(';')[0].trim();
    if (!mime || !/^image\/(png|jpeg|jpg|webp|gif)$/.test(mime) || Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel();
      return res.status(502).end();
    }
    const reader = response.body?.getReader();
    if (!reader) return res.status(502).end();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return res.status(502).end(); }
      chunks.push(part.value);
    }
    return sendStoredImage(res, `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`);
  } catch {
    return res.status(502).end();
  }
}
export function restoreImageReference(value:unknown,existing:unknown,url:string) {
  return value===url ? existing : value;
}
export function sendStoredImage(res:Response,value:unknown) {
  if(typeof value!=='string' || value.length>12*1024*1024) return res.status(404).end();
  const match=value.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match) return res.status(404).end();
  const bytes=Buffer.from(match[2],'base64');
  const ext=match[1];
  const valid=ext==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    :ext==='jpg'||ext==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255
    :ext==='webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
    :['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6));
  if(!valid || bytes.toString('base64')!==match[2]) return res.status(404).end();
  res.setHeader('Content-Type','image/'+(ext==='jpg'?'jpeg':ext));
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','public, max-age=300');
  return res.send(bytes);
}
