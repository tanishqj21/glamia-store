// Guest-only production smoke. All non-read API traffic is blocked.
import { chromium,expect } from '@playwright/test';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { productUrl } from '../react-app/src/lib/commerce.js';
const output='tmp/wibrawl-arena-review';mkdirSync(output,{recursive:true});
const entry=Object.values(JSON.parse(readFileSync('public/.vite/manifest.json','utf8'))).find(e=>e.isEntry).file;
const catalog=await fetch('https://wibrawl.glamiastore.com/api/products?view=cards&include_stock=1&limit=1').then(r=>r.json());
const product=catalog.products?.[0],report={release:process.env.WIBRAWL_RELEASE||'current',entry,errors:[],checks:[],blocked:[]},browser=await chromium.launch();
try {
 for(const file of ['logo.svg','favicon.svg']) {
  const response=await fetch('https://wibrawl.glamiastore.com/wibrawl/'+file+'?v=master-a');
  assert.equal(response.status,200,file);assert.match(response.headers.get('content-type'),/image\/svg\+xml/);
  assert.equal((await response.text()).replaceAll('\r',''),readFileSync('public/wibrawl/'+file,'utf8').replaceAll('\r',''),file+' matches release');
 }
 for(const width of [390,1440]) {
  const ctx=await browser.newContext({viewport:{width,height:960},colorScheme:'light',reducedMotion:'reduce'});
  await ctx.route('**/api/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){report.blocked.push(new URL(route.request().url()).pathname);return route.fulfill({status:204});}return route.continue();});
  const page=await ctx.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|Content Security Policy|storefront_application_load_failed/i.test(m.text()))report.errors.push(m.text());});
  const goto=async path=>{const response=await page.goto('https://wibrawl.glamiastore.com'+path+(path.includes('?')?'&':'?')+'release='+report.release);assert.equal(response.status(),200,path);await page.locator('.wb-account-trigger:not(:disabled)').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,path+' overflow');return response;};
  const home=await goto('/');assert.ok((await home.text()).includes(entry));await page.locator('.wb-arena-hero').waitFor();await expect(page.locator('link[rel=icon]')).toHaveAttribute('href','/wibrawl/favicon.svg?v=master-a');await expect(page.locator('.wb-command-brand img')).toHaveAttribute('src','/wibrawl/logo.svg?v=master-a');await expect(page.locator('.wb-storefront')).toHaveAttribute('data-wibrawl-mode','gaming');await page.locator('.wb-home-hubs').getByRole('link',{name:/JUST SPAWNED/}).waitFor();await page.screenshot({path:output+'/live-gaming-home-'+width+'.png'});
  await page.getByRole('button',{name:'SPORTS MODE // Light Mode',exact:true}).click();await expect(page.locator('.wb-storefront')).toHaveAttribute('data-wibrawl-mode','sports');assert.equal(await page.locator('.wb-command-brand .wb-logo-badge').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(15, 15, 18)');assert.equal(await page.evaluate(()=>localStorage.getItem('wibrawl_mode')),'sports');
  for(const [path,title] of [['/just-arrived','NEW SIGNING'],['/best-sellers','TABLE LEADERS'],['/offers','LOCKER ROOM DEALS']]){await goto(path);await page.getByRole('heading',{name:title,exact:true}).waitFor();}
  if(product){await goto(productUrl(product));await page.locator('.wb-product-spec-grid').waitFor();await page.locator('.wb-loadout-header h1').waitFor();await page.screenshot({path:output+'/live-product-'+width+'.png'});}
  await page.getByRole('button',{name:/Open cart, 0 items/}).click();await page.getByRole('dialog',{name:'Your bag.'}).getByRole('heading',{name:'Your next fit starts here.',exact:true}).waitFor();await page.keyboard.press('Escape');
  for(const [path,title] of [['/cart','Shopping bag'],['/checkout','Your bag comes first.'],['/credits','Your locker room.'],['/orders','Your drops.'],['/returns','Returns & exchanges'],['/support','We’ve got your back.']]){const response=await goto(path);if(path!=='/support')assert.match(response.headers()['cache-control'],/no-store/);await page.getByRole('heading',{name:title,exact:true}).waitFor();}
  for(const [path,title] of [['/cart','Shopping bag'],['/checkout','Delivery details'],['/credits','Store credits']]){await page.goto('https://glamiastore.com'+path+'?release='+report.release);await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await page.locator('.wb-command-bar,.wb-command-dock,.wb-commerce').count(),0);}
  report.checks.push({width,personas:'pass',hero:'new layout',collections:'all three names',product:product?'pass':'no published product',commerce:'all six routes',glamia:'original views'});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await browser.close();writeFileSync(output+'/live-report.json',JSON.stringify(report,null,2));}
