// Both real hostnames are fully intercepted. Assets come from the local build;
// all API/payment requests are fixtures. Nothing reaches production.
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {productUrl} from '../react-app/src/lib/commerce.js';
const gm='https://glamiastore.com',wb='https://wibrawl.glamiastore.com',hosts=[gm,wb],out='tmp/shared-cart-review';mkdirSync(out,{recursive:true});
const products=[{id:'gm',name:'Glamia Cotton Tee',storefront_visibility:'glamia',price:300},{id:'wb',name:'Wibrawl Graphic Tee',storefront_visibility:'wibrawl',price:200}].map(p=>({...p,category:'Tees',subcategory:'Graphic',brand:p.id==='gm'?'Glamia':'Wibrawl',status:'live',mrp:p.price,stock:8,sizes:['M'],size_stock:{M:8},color:'Black',image_url:'/fixture.svg',description:'Local fixture cotton tee',hsn_sac_code:'6109',gst_rate:5,gst_tax_inclusive:true}));
const address={id:'home',name:'Buyer',phone:'+919876543210',line1:'123 Test Road',city:'New Delhi',state:'Delhi',pin:'110001',country:'India',isDefault:true};
const order={id:'fixture-order',order_number:'WB-2026-0001',status:'shipped',payment_status:'paid',packing_status:'packed',created_at:'2026-10-17T09:10:25+05:30',packed_at:'2026-10-18T11:24:08+05:30',total:500,items:products.map(p=>({id:p.id,name:p.name,size:'M',quantity:1,price:p.price,image:p.image_url}))};
let saved={cart:[],wishlist:[],saved_for_later:[]},paymentRequests=[],errors=[],events=[],audits=[];
const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(!hosts.includes(url.origin))return route.fulfill({status:204,body:''});
  if(url.pathname.startsWith('/api/')){
   let data={},status=200,body=req.postData()?JSON.parse(req.postData()):{};
   if(url.pathname==='/api/session')data={user:{email:'buyer@example.com',name:'Buyer',role:'customer'},profile_complete:true};
   else if(url.pathname.startsWith('/api/saved-items')){
    events.push({kind:req.method()==='GET'?'read':'write-start',origin:url.origin,cart:saved.cart.map(p=>p.id)});
    if(req.method()!=='GET'){
     await new Promise(resolve=>setTimeout(resolve,180));
     for(const key of ['cart','saved_for_later'])for(const line of body[key]||[]){const old=saved[key].find(p=>p.id===line.id&&p.size===line.size);saved[key]=saved[key].filter(p=>!(p.id===line.id&&p.size===line.size));if(line.quantity>0)saved[key].push({...line,quantity:url.pathname.endsWith('/merge')?Math.max(old?.quantity||0,line.quantity):line.quantity});}
     events.push({kind:'write-complete',origin:url.origin,cart:saved.cart.map(p=>p.id)});
    }data=structuredClone(saved);
   }
   else if(url.pathname==='/api/products'){
    const store=url.origin===wb?'wibrawl':'glamia',ids=url.searchParams.get('ids')?.split(',');
    const rows=products.filter(p=>(url.searchParams.get('scope')==='cart'||p.storefront_visibility===store)&&(!ids||ids.includes(p.id)));
    data={products:rows,pagination:{total:rows.length,has_more:false}};
   }
   else if(/\/api\/products\/[^/]+$/.test(url.pathname)){
    const ref=decodeURIComponent(url.pathname.split('/').at(-1)),p=products.find(p=>ref===p.id||ref.endsWith('-'+p.id));
    if(!p){status=404;data={error:'Not found'};}else if(url.searchParams.get('scope')!=='cart'&&p.storefront_visibility!==(url.origin===wb?'wibrawl':'glamia')){status=409;data={redirect_url:(p.id==='gm'?gm:wb)+productUrl(p)};}else data={product:p,colourways:[p]};
   }
   else if(url.pathname.endsWith('/reviews'))data={reviews:[],count:0,average:0};
   else if(url.pathname.endsWith('/questions'))data={questions:[]};
   else if(url.pathname==='/api/storefront-settings')data={payments:{methods:[{id:'razorpay',label:'Razorpay'}]},customer_experience:{},announcement:{visible:false},trust_strip:{visible:false},socials:{}};
   else if(url.pathname==='/api/hero')data={slides:[]};
   else if(url.pathname==='/api/categories')data={categories:['Tees']};
   else if(url.pathname==='/api/addresses')data={addresses:[address]};
   else if(url.pathname==='/api/orders')data={orders:[order]};
   else if(url.pathname==='/api/returns')data={requests:[]};
   else if(url.pathname==='/api/loyalty')data={balance:0,ledger:[]};
   else if(url.pathname==='/api/coupons/available')data={coupons:[]};
   else if(url.pathname==='/api/payments/create'){paymentRequests.push({origin:url.origin,body});status=400;data={error:'Fixture: no real payment created.'};}
   return route.fulfill({status,json:data});
  }
  if(url.pathname==='/fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><path fill="#ddd" d="M0 0h600v800H0z"/></svg>'});
  for(const root of ['tmp/shared-cart-app-dist','public']){
   const base=resolve(root),file=resolve(base,'.'+decodeURIComponent(url.pathname));
   if(file.startsWith(base+sep)&&existsSync(file)&&extname(file)){
    const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.json':'application/json'}[extname(file)];
    if(mime)return route.fulfill({contentType:mime,body:readFileSync(file)});
   }
  }
  if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:readFileSync('tmp/shared-cart-app-dist/index.html','utf8')});
  return route.fulfill({status:204,body:''});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto(gm+'/product/gm');
 await page.getByRole('button',{name:'M',exact:true}).first().click();
 await page.getByRole('button',{name:'Add to bag',exact:true}).first().click();
 // Cross the origin immediately, before the normal 700ms save debounce.
 await page.locator('header a[href^="https://wibrawl.glamiastore.com"]').first().click();
 await page.waitForURL(wb+'/**');
 await expect.poll(()=>saved.cart.map(p=>p.id)).toContain('gm');
 await expect.poll(()=>events.some(e=>e.kind==='read'&&e.origin===wb)).toBe(true);
 const firstRead=events.find(e=>e.kind==='read'&&e.origin===wb);assert.ok(firstRead.cart.includes('gm'),'destination sees the just-added item on its first read');
 await page.goto(wb+'/product/wb');await page.getByRole('combobox',{name:'Choose size',exact:true}).selectOption('M');await page.getByRole('button',{name:'Add to bag',exact:true}).first().click();
 await expect.poll(()=>saved.cart.map(p=>p.id).sort()).toEqual(['gm','wb']);
 for(const origin of hosts){
  await page.goto(origin+'/cart');await expect(page.locator(origin===wb?'.wb-bag-line':'.cart-line')).toHaveCount(2);
  await expect(page.locator('main')).toContainText('Glamia Cotton Tee');await expect(page.locator('main')).toContainText('Wibrawl Graphic Tee');
  const foreign=origin===wb?products[0]:products[1],destination=(foreign.id==='gm'?gm:wb)+productUrl(foreign);
  const link=page.locator('main').getByRole('link',{name:foreign.name,exact:true}).last();await expect(link).toHaveAttribute('href',destination);
  await link.click();await page.waitForURL(destination);await expect(page.getByRole('heading',{name:foreign.name,exact:true}).first()).toBeVisible();
 }
 await page.goto(wb+'/cart');await page.getByRole('button',{name:'Continue to checkout',exact:true}).click();
 const pay=page.getByRole('button',{name:/Pay securely/});await expect(pay).toBeEnabled();await expect(pay).toContainText('500');
 await expect(page.locator('.wb-checkout-piece')).toHaveCount(2);await pay.click();
 await expect.poll(()=>paymentRequests.length).toBe(1);assert.equal(paymentRequests[0].origin,wb);assert.deepEqual(paymentRequests[0].body.items.map(p=>p.id).sort(),['gm','wb']);await expect(page.getByRole('alert')).toContainText('Fixture: no real payment created.');
 // A remote removal is picked up immediately on refocus, not after a minute.
 await page.goto(gm+'/cart');await expect(page.locator('.cart-line')).toHaveCount(2);saved.cart=saved.cart.filter(p=>p.id!=='gm');await page.waitForTimeout(280);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.cart-line')).toHaveCount(1);
 for(const width of [390,1440])for(const origin of hosts){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/orders');
  await expect(page.locator('.wb-order-timeline')).toHaveCount(1);await expect(page.locator('.wb-order-timeline [aria-current=step] strong')).toHaveText('In transit');
  for(const mode of ['light','dark']){
   if(mode==='dark')await page.evaluate(()=>{document.documentElement.dataset.theme='dark';const wb=document.querySelector('.wb-storefront');if(wb){wb.dataset.wibrawlMode='gaming';wb.dataset.wibrawlTheme='dark';}});
   const result=await new AxeBuilder({page}).include('.wb-order-timeline').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(result.violations,[]);
   audits.push({width,origin,mode,violations:[]});await page.locator('.wb-order-timeline').screenshot({path:`${out}/${origin===wb?'wb':'gm'}-${width}-${mode}.png`});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
 }
 assert.deepEqual(errors,[]);console.log('Cross-origin immediate handoff, mixed carts, native product links, combined Wibrawl checkout payload, refocus sync and both order timelines passed.');
 await context.close();
}finally{await browser.close();writeFileSync(`${out}/browser-report.json`,JSON.stringify({events,paymentRequests,audits,errors},null,2));}
