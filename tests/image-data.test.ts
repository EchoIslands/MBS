import assert from 'node:assert/strict';
import {test} from 'node:test';
import {imageReference,restoreImageReference,sendStoredImage,isTrustedStorageImage,sendShopImage} from '../backend/lib/imageData.js';

test('图片地址取代截断base64，完整图片可读，编辑回写保留原图，拒绝SVG',()=>{
  const original='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
  const url='/api/shops/s/media/0';
  assert.equal(imageReference(original,url),url);
  assert.equal(restoreImageReference(url,original,url),original);
  assert.equal(imageReference('https://images.example/test.png',url),'https://images.example/test.png');
  const headers:Record<string,string>={};let body:unknown;let status=200;
  const res={setHeader(k:string,v:string){headers[k]=v},send(b:unknown){body=b;return this},status(n:number){status=n;return this},end(){return this}};
  sendStoredImage(res as Parameters<typeof sendStoredImage>[0],original);assert.equal(headers['Content-Type'],'image/png');assert.ok(Buffer.isBuffer(body));assert.equal(body.toString('base64'),original.split(',')[1]);
  sendStoredImage(res as Parameters<typeof sendStoredImage>[0],'data:image/svg+xml;base64,PHN2Zz4=');assert.equal(status,404);
});

test('旧Storage图片走同域读取，拒绝外部主机、重定向、非图片和超大响应', async () => {
  const oldOrigin = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
  const source = process.env.SUPABASE_URL + '/storage/v1/object/public/products/one.png';
  const reference = '/api/shops/s/products/p/images/0';
  const original = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
  const headers: Record<string,string> = {};
  let status = 200; let body: Buffer;
  const res = { setHeader(k:string,v:string){headers[k]=v}, status(n:number){status=n;return this}, send(b:Buffer){body=b;return this}, end(){return this} } as unknown as Parameters<typeof sendShopImage>[0];
  try {
    assert.equal(imageReference(source,reference),reference);
    assert.equal(restoreImageReference(reference,source,reference),source);
    for (const url of ['https://evil.example/storage/v1/object/public/x', 'http://synthetic.supabase.co/storage/v1/object/public/x', 'https://synthetic.supabase.co@evil.example/storage/v1/object/public/x', 'https://synthetic.supabase.co/rest/v1/customers']) assert.equal(isTrustedStorageImage(url),false);
    await sendShopImage(res,source,async (url,options) => {
      assert.equal(url,source); assert.equal(options.redirect,'error');
      return new Response(Buffer.from(original,'base64'),{headers:{'content-type':'image/png'}});
    });
    assert.equal(status,200);assert.equal(body.toString('base64'),original);assert.equal(headers['Content-Type'],'image/png');
    let calls=0;
    await sendShopImage(res,'https://evil.example/image.png',async()=>{calls++;throw Error('must not fetch')});
    assert.equal(calls,0);assert.equal(status,404);
    await sendShopImage(res,source,async()=>new Response('error',{status:404}));assert.equal(status,404);
    await sendShopImage(res,source,async()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}));assert.equal(status,502);
    await sendShopImage(res,source,async()=>new Response('x',{headers:{'content-type':'image/png','content-length':String(9*1024*1024)}}));assert.equal(status,502);
    await sendShopImage(res,source,async()=>{throw Error('redirect or timeout')});assert.equal(status,502);
  } finally {
    if (oldOrigin === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldOrigin;
  }
});
