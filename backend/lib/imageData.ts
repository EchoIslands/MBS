import type {Response} from 'express';

/** 大图留在图片请求里；业务JSON只携带同源URL，不截坏base64。 */
export function imageReference(value:unknown,url:string):unknown {
  return typeof value==='string' && value.startsWith('data:') ? url : value;
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
