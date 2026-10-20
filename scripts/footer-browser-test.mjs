// Local browser fixtures only. Social URLs are never visited.
import {chromium,expect}from'@playwright/test';import AxeBuilder from'@axe-core/playwright';
import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';
const out='tmp/footer-review';mkdirSync(out,{recursive:true});const browser=await chromium.launch();const report={audits:[],checks:[],errors:[]};const sizes=[360,390,768,1440];
async function fixture(brand,theme,width,socials){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
 await context.addInitScript(({theme})=>{localStorage.setItem('glamia-theme',theme);localStorage.setItem('wibrawl_mode',theme==='dark'?'gaming':'sports');},{theme});
 await context.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let data={};
 if(path==='/api/session')data={user:null};
 else if(path==='/api/storefront-settings')data={announcement:{visible:false},trust_strip:{visible:false},socials:socials||{instagram:`https://instagram.com/${brand}-footer`,x:`https://x.com/${brand}-footer`},customer_experience:{}};
 else if(path==='/api/hero')data={slides:[]};else if(path==='/api/products')data={products:[],pagination:{total:0,has_more:false}};
 else if(path==='/api/categories')data={categories:[]};return route.fulfill({json:data});});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:5174/'+(brand==='wibrawl'?'?wibrawl-preview=1':''));
 await page.getByRole('contentinfo',{name:`${brand==='wibrawl'?'Wibrawl':'Glamia'} footer`}).waitFor();
 const footer=page.locator('.footer-shell');await footer.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
 await footer.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
 return{page,context,footer};
}
try{
 for(const brand of ['glamia','wibrawl'])for(const width of sizes){let geometry;
  for(const theme of ['light','dark']){
   const {page,context,footer}=await fixture(brand,theme,width);
   await expect(footer.locator('.footer-socials a')).toHaveCount(2);
   assert.equal(await footer.locator(`a[href="https://instagram.com/${brand==='wibrawl'?'glamia':'wibrawl'}-footer"]`).count(),0,'brand socials stay separate');
   for(const path of ['/just-arrived','/best-sellers','/offers','/about','/orders','/track-order','/support','/contact','/profile','/terms-and-conditions','/privacy-policy','/shipping-policy','/return-policy','/refund-cancellation-policy'])await expect(footer.locator(`a[href="${path}"]`)).toHaveCount(1);
   await expect(footer.locator('.footer-policies a')).toHaveCount(5);assert.equal(await footer.locator('button').count(),0);
   const external=footer.locator(brand==='wibrawl'?'.footer-parent a':'.footer-sibling');await expect(external).toHaveAttribute('href',brand==='wibrawl'?'https://glamiastore.com':'https://wibrawl.glamiastore.com');
   const bounds=await footer.boundingBox(),nav=await footer.locator('.footer-navigation').boundingBox();
   if(geometry){assert.ok(Math.abs(bounds.height-geometry.height)<1,'identical footer geometry across themes');assert.ok(Math.abs(nav.width-geometry.navWidth)<1);}else geometry={height:bounds.height,navWidth:nav.width};
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal overflow');
   const small=await footer.locator('a.footer-link').evaluateAll(links=>links.filter(a=>a.getBoundingClientRect().height<39).map(a=>a.textContent));assert.deepEqual(small,[],'links have comfortable hit targets');
   const axe=await new AxeBuilder({page}).include('.footer-shell').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();const issues=axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));report.audits.push({brand,width,theme,issues});assert.deepEqual(issues,[]);
   await footer.screenshot({path:`${out}/${brand}-${width}-${theme}.png`});
   if(width===390){const target=footer.locator('.footer-policies a').first();await target.focus();assert.equal(await target.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');await footer.locator('a[href="/contact"]').click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/contact');await expect(page.locator('.footer-shell')).toHaveCount(1);}
   await context.close();
  }
  report.checks.push(`${brand} ${width}px: footer links, policy routes, brand socials, sibling link, touch targets, theme geometry and overflow`);
 }
 for(const socials of [{},{instagram:'javascript:alert(1)',facebook:'not a url',x:'data:text/html,hi'},{instagram:'https://instagram.com/full',facebook:'https://facebook.com/full',youtube:'https://youtube.com/full',tiktok:'https://tiktok.com/full',pinterest:'https://pinterest.com/full',x:'https://x.com/full',linkedin:'https://linkedin.com/full'}]){
  const {page,context,footer}=await fixture('wibrawl','dark',360,socials);await expect(footer.locator('.footer-socials a')).toHaveCount(Object.keys(socials).length===7?7:0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await context.close();
 }
 report.checks.push('Empty, invalid and all-seven-social configurations; no placeholders or unsafe links');
 const {page,context,footer}=await fixture('glamia','light',1440);await page.emulateMedia({reducedMotion:'no-preference'});const link=footer.locator('a[href="/offers"]');const before=await link.boundingBox();await link.hover();await page.waitForTimeout(240);const after=await link.boundingBox();assert.deepEqual(after,before,'hover does not shift layout');const transform=await link.locator('.footer-link-label').evaluate(el=>getComputedStyle(el,'::after').transform);assert.equal(transform,'matrix(1, 0, 0, 1, 0, 0)');await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await link.locator('.footer-link-label').evaluate(el=>getComputedStyle(el,'::after').transitionDuration),'0s');await context.close();
 report.checks.push('Underline hover uses transform with no layout movement; reduced motion disables transitions');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
