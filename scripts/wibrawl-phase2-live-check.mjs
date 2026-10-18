// Read-only production verification: block all API writes, including analytics.
import { chromium,expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
const output='tmp/wibrawl-phase2-review';mkdirSync(output,{recursive:true});
const manifest=JSON.parse(readFileSync('public/.vite/manifest.json','utf8'));
const entry=Object.values(manifest).find(e=>e.isEntry).file;
const report={release:process.env.WIBRAWL_RELEASE || 'current',entry,errors:[],checks:[],blocked:[]};
const browser=await chromium.launch();
try {
 for(const width of [390,1440]) {
  const ctx=await browser.newContext({viewport:{width,height:960},colorScheme:'dark',reducedMotion:'reduce'});
  await ctx.route('**/api/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){report.blocked.push(new URL(route.request().url()).pathname);return route.fulfill({status:204});}return route.continue();});
  const page=await ctx.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|Content Security Policy|storefront_application_load_failed/i.test(m.text()))report.errors.push(m.text());});
  const home=await page.goto(`https://wibrawl.glamiastore.com/?release=${report.release}`);assert.equal(home.status(),200);assert.ok((await home.text()).includes(entry),'Current reviewed asset entry deployed');await page.locator('.wb-arena-hero').waitFor();await page.locator('.wb-account-trigger:not(:disabled)').waitFor();
  await page.getByRole('button',{name:/Open cart, 0 items/}).click();await page.getByRole('dialog',{name:'Your bag.'}).getByRole('heading',{name:'Your next fit starts here.',exact:true}).waitFor();await page.screenshot({path:`${output}/live-cart-drawer-${width}.png`});await page.keyboard.press('Escape');
  for(const [path,title] of [['/cart','Shopping bag'],['/checkout','Your bag comes first.'],['/credits','Your locker room.'],['/orders','Your drops.'],['/returns','Returns & exchanges'],['/support','We’ve got your back.']]){
   const response=await page.goto(`https://wibrawl.glamiastore.com${path}?release=${report.release}`);assert.equal(response.status(),200,`${path}: status`);if(path !== '/support')assert.match(response.headers()['cache-control'],/no-store/);await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,`${path}: overflow`);
  }
  await page.getByRole('button',{name:'New ticket',exact:true}).click();await page.getByLabel('Issue category').waitFor();await page.getByRole('button',{name:'SPORTS MODE // Light Mode',exact:true}).click();await expect(page.locator('.wb-storefront')).toHaveAttribute('data-wibrawl-theme','light');await page.screenshot({path:`${output}/live-support-${width}.png`});
  for(const [path,title] of [['/cart','Shopping bag'],['/checkout','Delivery details'],['/credits','Store credits']]){
   await page.goto(`https://glamiastore.com${path}?release=${report.release}`);await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await page.locator('.wb-storefront,.wb-commerce,.wb-bag-ui').count(),0,'Glamia retains default commerce');
  }
  report.checks.push({width,wibrawl:'all six commerce routes and drawer',glamia:'default cart, checkout and credits'});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{writeFileSync(`${output}/live-report.json`,JSON.stringify(report,null,2));await browser.close();}
