import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base='http://127.0.0.1:5195';
const range=await fetch(base+'/__demo/video/full',{headers:{Range:'bytes=0-127'}});
assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'video/mp4');
assert.equal((await range.arrayBuffer()).byteLength,128);
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(base+'/__demo/videos');
  const video=page.locator('video');
  await page.waitForFunction(()=>{const video=document.querySelector('video');return video.readyState>=1||video.error;});
  const metadata=await video.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error?.message}));
  assert.equal(metadata.error,undefined);assert.equal(metadata.width,1440);assert.equal(metadata.height,1000);
  assert.ok(metadata.duration>230&&metadata.duration<240);
  await video.evaluate(v=>{v.muted=true;return v.play();});
  await page.waitForFunction(()=>document.querySelector('video').currentTime>0.5);
  await video.evaluate(v=>{v.currentTime=120;});
  await page.waitForFunction(()=>document.querySelector('video').currentTime>120.3);
  await video.evaluate(v=>{v.pause();});
  const orders=await (await fetch(base+'/api/orders')).json();
  assert.equal(orders.orders.length,2,'Interactive demo starts with fresh original orders');
  console.log(`PASS MP4 playback, seeking, range downloads and fresh interactive demo (${metadata.duration.toFixed(2)}s, ${metadata.width}x${metadata.height})`);
} finally {await browser.close();}
