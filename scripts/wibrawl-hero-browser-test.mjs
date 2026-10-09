import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const base=process.env.WIBRAWL_TEST_URL||'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const subtle=new Proxy(crypto.subtle,{get(target,key){if(key==='timingSafeEqual')return timingSafeEqual;const value=target[key];return typeof value==='function'?value.bind(target):value;}});
const worker=await workerFunctions(['routeApi','signSession','createHeroSlide'],{crypto:{subtle,randomUUID:()=>crypto.randomUUID()}});
const {db,env}=localDatabase();env.SESSION_SECRET='hero-browser-fixture';env.ADMIN_EMAILS=['hero-owner@example.com'];
const owner={sub:'hero-owner',email:env.ADMIN_EMAILS[0],name:'Hero Owner',role:'admin',is_owner:true};
db.prepare('INSERT INTO users(email,google_sub,name) VALUES(?,?,?)').run(owner.email,owner.sub,owner.name);
db.exec("UPDATE products SET status='hold'; DELETE FROM hero_slides;");
const products=[['gm','glamia','Glamia exclusive'],['wb','wibrawl','Wibrawl exclusive'],['both','both','Shared tee']].map(([id,storefront_visibility,name])=>({id,name,storefront_visibility,category:'Tees',brand:'Fixture',price:599,mrp:799,stock:10,color:'Black',sizes:['M'],size_stock:{M:10},image:'/wibrawl/gaming-campaign-640.webp',image_url:'/wibrawl/gaming-campaign-640.webp',status:'live'}));
for(const p of products)db.prepare(`INSERT INTO products(id,seller_email,name,category,brand,price,mrp,stock,color,sizes_json,image_url,description,status,storefront_visibility)
  VALUES(?,'seller@example.com',?,'Tees','Fixture',599,799,10,'Black','["M"]',?,'Fixture','live',?)`).run(p.id,p.name,p.image,p.storefront_visibility);
const token=await worker.signSession(owner,env);
const browser=await chromium.launch(),errors=[];
const output='tmp/wibrawl-hero-review';mkdirSync(output,{recursive:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;let data={};
    if(path==='/api/hero'||path.startsWith('/api/admin/hero')) {
      const headers=await route.request().allHeaders();headers.cookie=`mm_session=${token}`;
      const request=new Request(url,{method:route.request().method(),headers,...(route.request().postData()?{body:route.request().postData()}:{})});
      try {const response=await worker.routeApi(request,env,url,{});return route.fulfill({status:response.status,body:await response.text(),contentType:'application/json'});}
      catch(error){return route.fulfill({status:error.status||500,json:{error:error.message}});}
    }
    if(path==='/api/session')data={user:owner,profile_complete:true};
    else if(path==='/api/products')data={products:products.filter(p=>url.searchParams.get('scope')==='admin'||[url.searchParams.has('wibrawl-preview')?'wibrawl':'glamia','both'].includes(p.storefront_visibility)),pagination:{has_more:false,total:3}};
    else if(path==='/api/categories')data={categories:['Tees'],subcategories:[]};
    else if(path==='/api/storefront-settings')data={announcement:{visible:false},trust_strip:{visible:false},seo:{},customer_experience:{}};
    else if(path==='/api/loyalty')data={balance:0};
    else if(path==='/api/admin/cinematic-reel')data={cinematic_reel:{visible:false,product_ids:[]}};
    else if(path.startsWith('/api/saved-items'))data={cart:[],wishlist:[],saved_for_later:[]};
    await route.fulfill({json:data});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/admin/hero');
  await page.getByRole('heading',{name:'Hero Studio',exact:true}).waitFor();
  const selector=page.getByRole('combobox',{name:'Hero storefront'});
  await selector.selectOption('wibrawl');
  await page.locator('#hero-slide-form .merch-product-options').getByText('Wibrawl exclusive',{exact:true}).waitFor();
  assert.equal(await page.locator('#hero-slide-form .merch-product-options').getByText('Glamia exclusive',{exact:true}).count(),0);
  assert.equal(await page.locator('.merch-preview-arrow svg').count(),0,'Wibrawl controls are text only');
  await page.getByLabel('Headline',{exact:true}).fill('Your next favourite tee');
  await page.getByLabel('Tagline',{exact:true}).fill('A new drop for your world.');
  await page.getByLabel('CTA label',{exact:true}).fill('Shop the drop');
  await page.locator('select[name=cta_category]').selectOption('Tees');
  await page.locator('.merch-product-options label').filter({hasText:'Wibrawl exclusive'}).click();
  await page.getByRole('button',{name:'Publish slide',exact:true}).click();
  await page.locator('.merch-slide-row').filter({hasText:'Your next favourite tee'}).waitFor();
  assert.equal(db.prepare("SELECT storefront FROM hero_slides").get().storefront,'wibrawl');
  await page.locator('.merch-slide-row').getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Headline',{exact:true}).fill('Wear your world together');
  await page.getByRole('button',{name:'Save slide',exact:true}).click();
  await page.locator('.merch-slide-row').filter({hasText:'Wear your world together'}).waitFor();
  await selector.selectOption('glamia');
  await page.locator('#hero-slide-form .merch-product-options').getByText('Glamia exclusive',{exact:true}).waitFor();
  assert.equal(await page.locator('.merch-slide-row').count(),0);
  await selector.selectOption('wibrawl');
  await page.locator('.merch-slide-row').waitFor();
  await page.screenshot({path:output+'/admin-wibrawl.png',fullPage:true});
  await worker.createHeroSlide(new Request(base+'/api/admin/hero?storefront=wibrawl',{method:'POST',body:JSON.stringify({title:'An extra long headline for the fandoms the rivalries and every world that brings us together',tagline:'Your passions, your tees.',product_ids:['wb','both'],words:['Gaming','Anime'],cta_label:'Explore tees'})}),env);
  for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:360,height:800}]]) {
    await page.setViewportSize(viewport);
    await page.goto(base+'/?wibrawl-preview=1');
    await page.getByRole('heading',{name:'Wear your world together',exact:true}).waitFor();
    for(const theme of ['Gaming','Sports']) {
      await page.getByRole('button',{name:theme,exact:true}).click();
      await page.getByRole('button',{name:'Next hero slide',exact:true}).click();
      await page.getByRole('heading',{name:/An extra long headline/}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
      const result=await new AxeBuilder({page}).include('.wibrawl-carousel').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(result.violations.map(v=>v.id),[],`${label} ${theme} carousel accessibility`);
      assert.equal(await page.locator('.wibrawl-carousel button svg').count(),0);
      assert.equal(await page.getByRole('button',{name:'Pause carousel',exact:true}).count(),0,'Reduced motion disables autoplay');
      await page.screenshot({path:`${output}/${label}-${theme.toLowerCase()}.png`,fullPage:true});
      await page.getByRole('button',{name:'Previous hero slide',exact:true}).click();
      await page.getByRole('link',{name:'Shop the drop',exact:true}).click();
      await page.waitForURL('**/category/Tees');
      await page.goto(base+'/?wibrawl-preview=1');
      await page.getByRole('heading',{name:'Wear your world together',exact:true}).waitFor();
    }
  }
  assert.deepEqual(errors,[]);
  console.log('Hero Studio storefront switching, product filtering, create/edit, live display, CTA, mobile themes and carousel accessibility passed.');
} finally {await browser.close();db.close();}


