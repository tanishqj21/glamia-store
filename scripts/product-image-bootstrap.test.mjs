import test from 'node:test';
import assert from 'node:assert/strict';
import { workerFunctions } from './lib/worker-fixture.mjs';
import { productMediaManifest } from '../react-app/src/lib/productMediaManifest.js';

const worker=await workerFunctions(['inlineProductImage']);
const source=Object.keys(productMediaManifest)[0];
test('only a bounded existing mobile image is embedded, without altering original or larger photos',async()=>{
  let fetched;
  const env={ASSETS:{fetch:async request=>{fetched=request.url;return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/webp'}});}}};
  const product={images:[source],image_url:source};
  const embedded=await worker.inlineProductImage(product,env,'https://glamiastore.com');
  assert.equal(embedded.source,source);
  assert.equal(embedded.data,'data:image/webp;base64,AQID');
  assert.equal(fetched,'https://glamiastore.com'+productMediaManifest[source][720]);
  assert.deepEqual(product,{images:[source],image_url:source});
});
test('missing, oversized, non-image or failing copies fall back to regular product URLs',async()=>{
  const product={images:[source]};
  for(const response of [new Response('not an image'),new Response(new Uint8Array(48*1024+1),{headers:{'Content-Type':'image/webp'}}),new Response('',{status:404}),new Response('',{headers:{'Content-Type':'image/webp'}})]){
    assert.equal(await worker.inlineProductImage(product,{ASSETS:{fetch:async()=>response}},'https://glamiastore.com'),null);
  }
  assert.equal(await worker.inlineProductImage(product,{ASSETS:{fetch:async()=>{throw Error('unavailable');}}},'https://glamiastore.com'),null);
  assert.equal(await worker.inlineProductImage({images:['https://untrusted.example/photo.webp']},{ASSETS:{fetch:async()=>{throw Error('must not be called');}}},'https://glamiastore.com'),null);
});
