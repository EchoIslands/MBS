import assert from 'node:assert/strict';
import {test} from 'node:test';
import {imageReference,restoreImageReference,sendStoredImage} from '../backend/lib/imageData.js';

test('图片地址取代截断base64，完整图片可读，编辑回写保留原图，拒绝SVG',()=>{
  const original='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
  const url='/api/shops/s/media/0';
  assert.equal(imageReference(original,url),url);
  assert.equal(restoreImageReference(url,original,url),original);
  assert.equal(imageReference('https://images.example/test.png',url),'https://images.example/test.png');
  const headers:Record<string,string>={};let body:any;let status=200;
  const res:any={setHeader(k:string,v:string){headers[k]=v},send(b:any){body=b;return this},status(n:number){status=n;return this},end(){return this}};
  sendStoredImage(res,original);assert.equal(headers['Content-Type'],'image/png');assert.ok(Buffer.isBuffer(body));assert.equal(body.toString('base64'),original.split(',')[1]);
  sendStoredImage(res,'data:image/svg+xml;base64,PHN2Zz4=');assert.equal(status,404);
});
