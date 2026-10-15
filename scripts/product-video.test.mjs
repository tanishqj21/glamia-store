import test from 'node:test';
import {timingSafeEqual} from 'node:crypto';
import assert from 'node:assert/strict';
import {storeProductVideo,validateProductVideo,serveProductVideo,MAX_PRODUCT_VIDEO_BYTES} from '../src/product-video.js';
import {localDatabase,workerFunctions} from './lib/worker-fixture.mjs';
const subtle=new Proxy(crypto.subtle,{get(target,property){if(property==='timingSafeEqual')return timingSafeEqual;const value=target[property];return typeof value==='function'?value.bind(target):value;}});
const worker=await workerFunctions(['routeApi','signSession','createProduct','updateProduct','formatProduct','formatProductCard','referencedR2Keys','authorizeEmployeeWebsiteRequest'],{crypto:{subtle,randomUUID:()=>crypto.randomUUID()}});
const owner={email:'owner@example.com',role:'admin',is_owner:true}, seller={email:'seller@example.com',role:'seller'};
const hash='a'.repeat(32), key=`product-videos/${hash}/12345678-1234-1234-1234-123456789abc.mp4`,url=`/api/assets/${key}`;
const mp4=Uint8Array.from([0,0,0,24,...Buffer.from('ftypisom'),0,0,0,0,...Buffer.from('isommp42')]);
function bucket(){const files=new Map();return{files,async put(key,bytes,options){files.set(key,{bytes:Uint8Array.from(bytes),size:bytes.length,httpEtag:'"etag"',...options});},async head(key){return files.get(key)||null;},async get(key,options){const file=files.get(key);if(!file)return null;const r=options?.range;return {...file,body:r?file.bytes.slice(r.offset,r.offset+r.length):file.bytes};}};}
const request=(bytes=mp4,type='video/mp4',headers={})=>new Request('https://glamiastore.com/api/uploads/video',{method:'POST',headers:{'Content-Type':type,Origin:'https://glamiastore.com','X-Requested-With':'Glamia',...headers},body:bytes});
const options={ownerKey:hash,reserve:async()=>{},release:async()=>{}};
function fixture(t){const local=localDatabase();t.after(()=>local.db.close());local.env.PRODUCT_IMAGES=bucket();local.env.ADMIN_EMAILS=owner.email;return local;}

test('video upload stores supported bytes and metadata, validates the saved URL',async()=>{
 const env={PRODUCT_IMAGES:bucket()};let reserved=0;
 const result=await storeProductVideo(request(),env,seller,{...options,reserve:async n=>reserved+=n});assert.equal(reserved,mp4.length);
 assert.equal(result.bytes,mp4.length);assert.match(result.videoUrl,/^\/api\/assets\/product-videos\/a{32}\/.*\.mp4$/);
 assert.equal(await validateProductVideo(result.videoUrl,env,seller),result.videoUrl);
 await assert.rejects(validateProductVideo(result.videoUrl,env,{email:'other@example.com'}),{status:403});
 assert.equal(await validateProductVideo(result.videoUrl,env,owner),result.videoUrl);
});
test('oversized, spoofed, empty and unsupported uploads never reach storage or quota',async()=>{
 let writes=0,reserves=0;const env={PRODUCT_IMAGES:{put:async()=>writes++}},opts={...options,reserve:async()=>reserves++};
 for(const r of [request(new Uint8Array(30)),request(mp4,'text/html'),request(new Uint8Array()),request(mp4,'video/mp4',{'Content-Length':String(MAX_PRODUCT_VIDEO_BYTES+1)})]) await assert.rejects(storeProductVideo(r,env,seller,opts));
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_PRODUCT_VIDEO_BYTES));c.enqueue(new Uint8Array(1));c.close();}});
 await assert.rejects(storeProductVideo(new Request('https://glamiastore.com/api/uploads/video',{method:'POST',headers:{'Content-Type':'video/mp4'},body:stream,duplex:'half'}),env,seller,opts),{status:413});
 assert.equal(writes,0);assert.equal(reserves,0);
});
test('failed uploads release quota, and quota rejection cannot write storage',async()=>{
 let released=0,written=0;const env={PRODUCT_IMAGES:{put:async()=>{written++;throw Error('storage failure');}}};
 await assert.rejects(storeProductVideo(request(),env,seller,{...options,release:async n=>released+=n}),/storage failure/);assert.equal(released,mp4.length);
 await assert.rejects(storeProductVideo(request(),env,seller,{...options,reserve:async()=>{throw Error('quota');}}),/quota/);assert.equal(written,1);
});
test('optional values clear cleanly; external, forged and missing videos are rejected',async()=>{
 const env={PRODUCT_IMAGES:bucket()};for(const value of [undefined,null,''])assert.equal(await validateProductVideo(value,env,seller),'');
 for(const value of ['https://example.com/video.mp4','javascript:alert(1)','/api/assets/products/not-video.mp4',url,{},4])await assert.rejects(validateProductVideo(value,env,seller));
});
test('public serving supports full playback, HEAD, bounded/suffix/open-ended ranges and If-Range',async()=>{
 const env={PRODUCT_IMAGES:bucket()};await env.PRODUCT_IMAGES.put(key,mp4,{customMetadata:{kind:'product-video'}});
 for(const [range,status,expected] of [[null,200,mp4],['bytes=4-7',206,mp4.slice(4,8)],['bytes=-4',206,mp4.slice(-4)],['bytes=16-',206,mp4.slice(16)],['bytes=0-999',206,mp4]]){
  const res=await serveProductVideo(new Request('https://glamiastore.com'+url,{headers:range?{Range:range}:{}}),env,key);assert.equal(res.status,status);assert.deepEqual(new Uint8Array(await res.arrayBuffer()),expected);assert.equal(res.headers.get('Content-Length'),String(expected.length));assert.equal(res.headers.get('Accept-Ranges'),'bytes');
 }
 const head=await serveProductVideo(new Request('https://glamiastore.com'+url,{method:'HEAD'}),env,key);assert.equal(head.body,null);assert.equal(head.headers.get('Content-Length'),String(mp4.length));
 for(const range of ['bytes=999-','bytes=-0','bytes=8-2','bytes=0-1,3-4','banana'])assert.equal((await serveProductVideo(new Request('https://glamiastore.com'+url,{headers:{Range:range}}),env,key)).status,416);
 assert.equal((await serveProductVideo(new Request('https://glamiastore.com'+url,{headers:{Range:'bytes=1-2','If-Range':'"old"'}}),env,key)).status,200);
});
test('anonymous upload is rejected, product editors are authorized and unrelated employees cannot upload videos',async t=>{
 const {env}=fixture(t);await assert.rejects(worker.routeApi(request(),env,new URL(request().url),null),{status:401});
 const actor={employee_permissions:{hero:true}};await assert.rejects(worker.authorizeEmployeeWebsiteRequest(request(),new URL(request().url),actor),{status:403});
 for(const permission of ['products','add_product'])await worker.authorizeEmployeeWebsiteRequest(request(),new URL(request().url),{employee_permissions:{[permission]:true}});
});
test('add, keep, replace and remove videos preserve optional listings and public image/card behavior',async t=>{
 const {env,db}=fixture(t);await env.PRODUCT_IMAGES.put(key,mp4,{customMetadata:{kind:'product-video',uploadedBy:owner.email}});
 const category=db.prepare('SELECT name FROM categories LIMIT 1').get().name;
 const product={name:'Local tee',category,brand:'Fixture',price:500,mrp:600,stock:3,color:'Black',material:'Cotton',sizes:['M'],size_stock:{M:3},images:Array.from({length:4},(_,i)=>`https://example.com/${i}.webp`),description:'A local fixture tee.',what_in_box:'1 tee',storefront_visibility:'both'};
 for(const video of ['',url]){
  const res=await worker.createProduct(new Request('https://glamiastore.com/api/products',{method:'POST',body:JSON.stringify({...product,video_url:video})}),env,owner);assert.equal(res.status,201,await res.clone().text());const created=await res.json(),id=created.product?.id||created.id;assert.ok(id);
  assert.equal(db.prepare('SELECT video_url FROM products WHERE id=?').get(id).video_url,video);
  const patch=async body=>worker.updateProduct(new Request('https://glamiastore.com/api/admin/products/'+id,{method:'PATCH',body:JSON.stringify(body)}),env,id,owner);
  assert.equal((await patch({featured:true})).status,200);assert.equal(db.prepare('SELECT video_url FROM products WHERE id=?').get(id).video_url,video);
  assert.equal((await patch({video_url:url})).status,200);assert.equal(worker.formatProduct(db.prepare('SELECT * FROM products WHERE id=?').get(id)).video_url,url);
  const keys=await worker.referencedR2Keys(env);assert.ok(keys.has(key));
  assert.equal((await patch({video_url:''})).status,200);assert.equal(db.prepare('SELECT video_url FROM products WHERE id=?').get(id).video_url,'');
 }
});

test('both storefront routes authenticate the real upload/save/seek path with the production key format',async t=>{
 const {db,env}=fixture(t);env.SESSION_SECRET='isolated-product-video-secret';db.prepare('INSERT INTO users(email,google_sub,name) VALUES(?,?,?)').run(owner.email,'local-video-owner','Local owner');
 const token=await worker.signSession({...owner,sub:'local-video-owner'},env);
 for(const host of ['glamiastore.com','wibrawl.glamiastore.com']){
  const origin='https://'+host,req=new Request(origin+'/api/uploads/video',{method:'POST',body:mp4,headers:{'Content-Type':'video/mp4',Origin:origin,'X-Requested-With':'Glamia',Cookie:'__Secure-mm_shared_session='+token}});
  const res=await worker.routeApi(req,env,new URL(req.url),{});assert.equal(res.status,200);const result=await res.json();
  assert.equal(await validateProductVideo(result.videoUrl,env,owner),result.videoUrl);
  const seek=new Request(origin+result.videoUrl,{headers:{Range:'bytes=4-7'}}),media=await worker.routeApi(seek,env,new URL(seek.url),{});assert.equal(media.status,206);assert.equal(await media.text(),'ftyp');
 }
});
