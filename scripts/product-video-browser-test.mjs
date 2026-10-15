import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';import{resolve,relative,extname}from'node:path';import{build}from'esbuild';import{chromium,expect}from'@playwright/test';
import{localDatabase,workerFunctions}from'./lib/worker-fixture.mjs';import{storeProductVideo,serveProductVideo}from'../src/product-video.js';
const worker=await workerFunctions(['createProduct','updateProduct','formatProduct']);
const {db,env}=localDatabase(),owner={email:'local-owner@example.com',role:'admin',is_owner:true};let uploads=0,saves=0,playbackRequests=0;
const files=new Map();env.PRODUCT_IMAGES={async put(key,bytes,options){files.set(key,{bytes:Uint8Array.from(bytes),size:bytes.length,httpEtag:'"fixture"',...options});},async head(key){return files.get(key)||null;},async get(key,options){const f=files.get(key);if(!f)return null;const r=options?.range;return{...f,body:r?f.bytes.slice(r.offset,r.offset+r.length):f.bytes};}};
const bundle=await build({entryPoints:['react-app/src/lib/compressProductVideo.js'],bundle:true,format:'iife',globalName:'VideoTools',write:false});
const browser=await chromium.launch(),errors=[],root=resolve('public'),mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.html':'text/html'},results=[];
mkdirSync('test-results/product-video',{recursive:true});mkdirSync('tmp',{recursive:true});
try{
 const generation=await browser.newContext();await generation.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Local video encoding fixture</title>'}));
 const gen=await generation.newPage();await gen.goto('https://glamiastore.com/video-fixture');await gen.addScriptTag({content:bundle.outputFiles[0].text});
 const generated=await gen.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=480;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(24),ac=new AudioContext(),tone=ac.createOscillator(),dest=ac.createMediaStreamDestination();tone.connect(dest);tone.start();dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'}),chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const end=new Promise(r=>recorder.onstop=r);recorder.start();let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#c6f65a':'#00c8ff';ctx.fillRect(0,0,320,480);ctx.fillStyle='#0d120b';ctx.font='36px sans-serif';ctx.fillText('Local tee',50,220);},40);await new Promise(r=>setTimeout(r,1800));recorder.stop();await end;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());await ac.close();
  const source=new File(chunks,'fixture.webm',{type:'video/webm'}),progress=[];
  const compressed=await VideoTools.compressProductVideo(source,{onProgress:p=>progress.push(p)});
  const v=document.createElement('video');v.src=URL.createObjectURL(compressed);document.body.append(v);await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(Error('Invalid encoded output'));});
  const metadata={duration:v.duration,width:v.videoWidth,height:v.videoHeight};v.remove();URL.revokeObjectURL(v.src);
  const abort=new AbortController();abort.abort();let cancelled=false;try{await VideoTools.compressProductVideo(source,{signal:abort.signal});}catch(e){cancelled=e.name==='AbortError';}
  // A legal EBML Void element creates a >40 MB input without changing its media.
  const padding=41_000_000,header=new Uint8Array(6);header[0]=0xec;header[1]=0x08;new DataView(header.buffer).setUint32(2,padding);
  const large=new File([source,header,new Uint8Array(padding)],'large-fixture.webm',{type:'video/webm'});
  const optimized=await VideoTools.compressProductVideo(large);
  window.originalVideo=source;
  return{source:Array.from(new Uint8Array(await source.arrayBuffer())),compressed:Array.from(new Uint8Array(await compressed.arrayBuffer())),type:compressed.type,metadata,progress:progress.at(-1),cancelled,largeBytes:large.size,largeOutputBytes:optimized.size};
 });
 assert.ok(generated.metadata.duration>1&&generated.metadata.width===320&&generated.metadata.height===480);assert.equal(generated.progress,100);assert.equal(generated.cancelled,true);assert.ok(generated.largeBytes>40_000_000&&generated.largeOutputBytes<40_000_000);writeFileSync('tmp/product-video-fixture.webm',Buffer.from(generated.source));
 results.push({compression:{inputBytes:generated.source.length,outputBytes:generated.compressed.length,type:generated.type,metadata:generated.metadata,largeBytes:generated.largeBytes,largeOutputBytes:generated.largeOutputBytes,cancelled:generated.cancelled}});await generation.close();
 const image='/favicon.png';let lastProduct=null;
 for(const brand of ['glamia','wibrawl']){
  const origin=`https://${brand==='wibrawl'?'wibrawl.':''}glamiastore.com`,width=brand==='glamia'?1440:390;
  const context=await browser.newContext({viewport:{width,height:950},timezoneId:'America/Los_Angeles'});await context.addInitScript(()=>{localStorage.setItem('glamia-theme','light');localStorage.setItem('wibrawl-theme','gaming');});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();try{
   if(url.pathname==='/api/uploads/video'){
    const result=await storeProductVideo(new Request(req.url(),{method:'POST',headers:req.headers(),body:req.postDataBuffer()}),env,owner,{ownerKey:'a'.repeat(32),reserve:async()=>{},release:async()=>{}});uploads++;return route.fulfill({json:result});
   }
   if(url.pathname.startsWith('/api/assets/product-videos/')){playbackRequests++;const res=await serveProductVideo(new Request(req.url(),{method:req.method(),headers:req.headers()}),env,url.pathname.slice('/api/assets/'.length));return route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});}
   if(url.pathname==='/api/products'&&req.method()==='POST'){
    const res=await worker.createProduct(new Request(req.url(),{method:'POST',body:req.postData()}),env,owner);if(res.ok){saves++;lastProduct=(await res.clone().json()).product;}return route.fulfill({status:res.status,json:await res.json()});
   }
   if(url.pathname.startsWith('/api/admin/products/')&&req.method()==='PATCH'){
    const id=url.pathname.split('/').at(-1),res=await worker.updateProduct(new Request(req.url(),{method:'PATCH',body:req.postData()}),env,id,owner);if(res.ok){saves++;lastProduct=(await res.clone().json()).product;}return route.fulfill({status:res.status,json:await res.json()});
   }
   if(/^\/api\/products\/[^/]+$/.test(url.pathname))return route.fulfill({json:{product:lastProduct,colourways:[]}});
   if(url.pathname==='/api/products')return route.fulfill({json:{products:lastProduct?[lastProduct]:[]}});
   if(url.pathname==='/api/categories')return route.fulfill({json:{categories:['Accessories'],subcategories:[]}});
   if(url.pathname==='/api/session')return route.fulfill({json:{user:owner,needs_profile_completion:false}});
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:{stats:{},products:[],categories:['Accessories'],subcategories:[],slides:[],events:[],orders:[],notifications:[],unread_count:0}});
   let file=resolve(root,'.'+decodeURIComponent(url.pathname));if(relative(root,file).startsWith('..'))return route.abort();if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');return route.fulfill({body:readFileSync(file),contentType:mime[extname(file)]||'application/octet-stream'});
  }catch(e){console.error('Fixture route',url.pathname,e);return route.fulfill({status:e.status||500,json:{error:e.message}});}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/admin/add-product');
  await expect(page.locator('.product-video-field')).toBeVisible();await expect(page.locator('.product-video-field input')).not.toHaveAttribute('required');assert.equal(await page.getByText(/Saved to R2|uploaded R2/).count(),0);
  for(const [name,value]of Object.entries({name:`Local ${brand} video tee`,brand:'Fixture',material:'Cotton',price:'500',mrp:'600',sizes:'M',what_in_box:'1 tee',description:'A local test tee.'}))await page.locator(`form [name="${name}"]`).fill(value);
  await page.locator('[name="category"]').selectOption('Accessories');await page.locator('[name="storefront_visibility"]').selectOption('both');
  // Colour picker is a text input using the shared component.
  await page.locator('input[name="color"]').fill('Black');
  for(let i=0;i<4;i++){await page.getByLabel('Add image URL',{exact:true}).fill(`${origin}${image}?view=${i}`);await page.getByRole('button',{name:'Add URL',exact:true}).click();}
  await page.locator('.product-video-field input').setInputFiles('tmp/product-video-fixture.webm');
  await expect(page.locator('.product-video-field [role="status"]')).toContainText('Video ready',{timeout:60000});
  const before=await page.locator('.product-video-field video').getAttribute('src');assert.ok(before);
  await page.screenshot({path:`test-results/product-video/${brand}-add.png`,fullPage:true});
  await page.getByRole('button',{name:'Create listing',exact:true}).click();await expect(page.getByText('Listing created and placed on hold for review.',{exact:true})).toBeVisible();assert.equal(lastProduct.video_url,before);
  await page.goto(origin+'/admin/products');await page.getByRole('button',{name:'Edit',exact:true}).first().click();await expect(page.locator('.product-video-field video')).toHaveAttribute('src',before);
  await page.locator('.product-video-field input').setInputFiles({name:'broken.mp4',mimeType:'video/mp4',buffer:Buffer.from('not a video')});
  await expect(page.locator('.product-video-field [role="alert"]')).toBeVisible();await expect(page.locator('.product-video-field video')).toHaveAttribute('src',before);await expect(page.getByRole('button',{name:'Save listing',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Remove video',exact:true}).click();await page.getByRole('button',{name:'Save listing',exact:true}).click();await expect.poll(()=>lastProduct.video_url).toBe('');
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();await page.locator('.product-video-field input').setInputFiles('tmp/product-video-fixture.webm');await expect(page.locator('.product-video-field [role="status"]')).toContainText('Video ready',{timeout:60000});await page.getByRole('button',{name:'Save listing',exact:true}).click();await expect.poll(()=>lastProduct.video_url).not.toBe('');
  // Public gallery has no video request until a shopper opens and plays it.
  const countBefore=playbackRequests;await page.goto(origin+'/product/'+lastProduct.id);await expect(page.getByRole('button',{name:'Show product video',exact:true})).toBeVisible();assert.equal(playbackRequests,countBefore);
  await page.getByRole('button',{name:'Show product video',exact:true}).click();const video=page.locator('.detail-gallery video');await expect(video).toHaveAttribute('preload','none');assert.equal(await video.getAttribute('autoplay'),null);assert.equal(playbackRequests,countBefore);
  await video.evaluate(async el=>{await el.play();});await expect.poll(()=>video.evaluate(el=>el.currentTime)).toBeGreaterThan(0.1);await video.evaluate(el=>{el.pause();el.currentTime=0.7;});await expect.poll(()=>video.evaluate(el=>el.currentTime)).toBeGreaterThan(0.6);
  await page.screenshot({path:`test-results/product-video/${brand}-gallery.png`,fullPage:true});await page.getByRole('button',{name:/Show product image 1 of/}).click();await expect(video).toHaveCount(0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  results.push({brand,width,add:true,edit:true,remove:true,publicPlayback:true,initialVideoRequests:0});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,uploads,saves,playbackRequests,errors},null,2));
}finally{await browser.close();db.close();}
