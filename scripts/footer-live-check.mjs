// Read-only production check; background API mutations are blocked in the browser.
import{chromium,expect}from'@playwright/test';import AxeBuilder from'@axe-core/playwright';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
const manifest=JSON.parse(readFileSync('public/.vite/manifest.json','utf8')),entry=Object.values(manifest).find(item=>item.isEntry).file;
const sites=[['Glamia','https://glamiastore.com'],['Wibrawl','https://wibrawl.glamiastore.com']],checks=[],errors=[];mkdirSync('tmp/footer-review',{recursive:true});
for(const [brand,origin]of sites){
 const response=await fetch(origin+'/?footer-review=1f83311',{headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200);const html=await response.text();
 assert.ok(html.includes('/'+entry),'live page uses the reviewed build');
 const footer=html.match(new RegExp('<footer[^>]+aria-label="'+brand+' footer">([^]*?)</footer>'))?.[1];assert.ok(footer);assert.ok(footer.includes('footer-navigation')&&footer.includes('footer-policies'));checks.push({brand,ssr:true,reviewedBuild:true});
}
const browser=await chromium.launch();try{
 for(const [brand,origin]of sites)for(const [width,theme]of [[1440,'light'],[390,'dark']]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(({theme})=>{localStorage.setItem('glamia-theme',theme);localStorage.setItem('wibrawl_mode',theme==='dark'?'gaming':'sports');},{theme});
  await context.route('**/api/**',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.fulfill({json:{ok:true}}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/?footer-review=1f83311',{waitUntil:'domcontentloaded'});
  const footer=page.getByRole('contentinfo',{name:brand+' footer'});await footer.scrollIntoViewIfNeeded();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await page.evaluate(()=>document.fonts.ready);
  await expect.poll(()=>footer.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0&&img.currentSrc===new URL(img.getAttribute('src'),document.baseURI).href))).toBe(true);
  await footer.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  const audit=await new AxeBuilder({page}).include('.footer-shell').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(audit.violations,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  for(const link of await footer.locator('.footer-socials a').all())await expect(link).toHaveAttribute('rel','noopener noreferrer');
  await footer.screenshot({path:`tmp/footer-review/live-${brand.toLowerCase()}-${width}-${theme}.png`});checks.push({brand,width,theme,a11y:true,overflow:false});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();writeFileSync('tmp/footer-review/live-report.json',JSON.stringify({checks,errors},null,2));}
