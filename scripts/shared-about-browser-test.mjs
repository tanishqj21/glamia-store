// Both storefronts and one shared editor, using local fixtures only.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {localDatabase} from './lib/worker-fixture.mjs';
import {readAboutPage,saveAboutPage} from '../src/about.js';
const {db,env}=localDatabase(),browser=await chromium.launch(),errors=[],views=[];
const root=resolve('public'),mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.html':'text/html'};
let saves=0;mkdirSync('test-results/shared-about',{recursive:true});
try{
 const initial=await readAboutPage(env);
 for(const brand of ['glamia','wibrawl'])for(const width of [390,1440]){
  const origin=`https://${brand==='wibrawl'?'wibrawl.':''}glamiastore.com`,theme=width===390?'dark':'light';
  const context=await browser.newContext({viewport:{width,height:950},colorScheme:theme});
  await context.addInitScript(theme=>{localStorage.setItem('glamia-theme',theme);localStorage.setItem('wibrawl-theme',theme==='dark'?'gaming':'sports');},theme);
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(['/api/about','/api/admin/about'].includes(url.pathname)){
    try{
     const data=route.request().method()==='PUT'?await saveAboutPage(env,route.request().postDataJSON(),'owner@example.com'):await readAboutPage(env);
     if(route.request().method()==='PUT')saves++;
     return route.fulfill({json:data});
    }catch(error){return route.fulfill({status:error.status||500,json:{error:error.message}});}
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/session'?{user:{role:'admin',is_owner:true,email:'owner@example.com',name:'Local owner'},needs_profile_completion:false}:{stats:{},products:[],slides:[],categories:[],orders:[],notifications:[],unread_count:0}});
   let file=resolve(root,'.'+decodeURIComponent(url.pathname));if(relative(root,file).startsWith('..'))return route.abort();if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');
   return route.fulfill({body:readFileSync(file),contentType:mime[extname(file)]||'application/octet-stream'});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/about');
  await expect(page.locator('.about-story-intro h1')).toHaveText(initial.headline);
  await expect(page.locator('.about-moment')).toHaveCount(initial.timeline.length);
  await expect(page).toHaveTitle(initial.headline+' | '+(brand==='wibrawl'?'Wibrawl':'Glamia'));
  views.push({brand,width,origin,context,page,initial:await page.locator('.about-story').textContent()});
 }
 for(const view of views)assert.equal(view.initial,views[0].initial);
 const editor=views.find(v=>v.brand==='wibrawl'&&v.width===1440);
 await editor.page.goto(editor.origin+'/admin/about');
 await expect(editor.page.getByText('Shared · Glamia + WiBrawl',{exact:true})).toBeVisible();
 await expect(editor.page.getByRole('link',{name:'View live page'})).toHaveAttribute('href','/about');
 await editor.page.getByLabel('Headline',{exact:true}).fill('One story, two storefronts.');
 await editor.page.getByLabel(/^Introduction/).fill('A shared story, saved once and shown on both websites.');
 await editor.page.getByRole('button',{name:'Move moment 2 up',exact:true}).click();
 await editor.page.getByRole('button',{name:'Save About us page',exact:true}).click();
 await expect(editor.page.locator('.form-success')).toHaveText('About us page saved and published.');assert.equal(saves,1);
 const updated=await readAboutPage(env),copies=[];
 for(const view of views){
  await view.page.goto(view.origin+'/about');
  await expect(view.page.locator('.about-story-intro h1')).toHaveText(updated.headline);
  assert.deepEqual(await view.page.locator('.about-moment h2').allTextContents(),updated.timeline.map(m=>m.title));
  assert.equal(await view.page.locator('.wibrawl-about').count(),0);
  assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  copies.push(await view.page.locator('.about-story').textContent());
  await view.page.screenshot({path:`test-results/shared-about/${view.brand}-${view.width}.png`,fullPage:true});
 }
 for(const copy of copies)assert.equal(copy,copies[0]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({publicViews:views.map(({brand,width})=>({brand,width})),sharedSaveCount:saves,contentEqual:true,timelineOrderEqual:true,pageErrors:errors},null,2));
}finally{await browser.close();db.close();}
