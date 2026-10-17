// Read-only production verification. Every non-GET/HEAD API request is blocked.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { productUrl } from '../react-app/src/lib/commerce.js';

const output='tmp/wibrawl-overhaul-review', release='645684c4-df25-442a-9862-177bb8d82ecb';
mkdirSync(output,{recursive:true});
const report={release,errors:[],checks:[],blockedWrites:[]};
const products=await fetch('https://wibrawl.glamiastore.com/api/products?view=cards&include_stock=1&limit=1').then(response=>response.json());
const product=products.products?.[0];
const browser=await chromium.launch();
try {
  for(const width of [390,1440]) {
    const context=await browser.newContext({viewport:{width,height:960},colorScheme:'dark',reducedMotion:'reduce'});
    await context.route('**/api/**',route=>{
      if(!['GET','HEAD'].includes(route.request().method())) {report.blockedWrites.push(new URL(route.request().url()).pathname);return route.fulfill({status:204});}
      return route.continue();
    });
    const page=await context.newPage();page.setDefaultTimeout(20000);
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&/storefront_hydration_failed|hydration|Content Security Policy/.test(message.text()))report.errors.push(message.text());});
    await page.goto(`https://wibrawl.glamiastore.com/?wb-release=${release}`);
    await page.locator('.wb-hero').waitFor();await page.locator('.wb-account-trigger:not(:disabled)').waitFor();
    await page.getByRole('button',{name:'Switch to Stadium Light',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.wibrawlTheme==='light');
    assert.equal(await page.evaluate(()=>localStorage.getItem('wibrawl-theme')),'light');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.wb-storefront')).getPropertyValue('--wb-bg-primary').trim()),'#f4f4f0');
    await page.getByRole('button',{name:'Switch to Tunnel Dark',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    await page.waitForFunction(()=>[...document.querySelectorAll('.wb-hero-media img')].every(image=>image.complete&&image.naturalWidth>0));
    await page.screenshot({path:`${output}/live-home-${width}.png`});
    await page.getByRole('button',{name:'Next hero slide',exact:true}).click();
    await page.getByRole('button',{name:'Previous hero slide',exact:true}).click();
    if(product){await page.goto(`https://wibrawl.glamiastore.com${productUrl(product)}?wb-release=${release}`);await page.locator('.wb-product-copy h1').waitFor();await page.locator('.wb-account-trigger:not(:disabled)').waitFor();await page.waitForFunction(()=>{const image=document.querySelector('.wb-product-main-image>img');return image?.complete&&image.naturalWidth>0;});await page.screenshot({path:`${output}/live-product-${width}.png`});}
    const returns=await page.goto(`https://wibrawl.glamiastore.com/returns?wb-release=${release}`);
    assert.equal(returns.status(),200);assert.match(returns.headers()['cache-control'],/no-store/);assert.match(returns.headers()['x-robots-tag'],/noindex/);
    await page.getByRole('heading',{name:'Returns & exchanges',exact:true}).waitFor();
    await page.goto(`https://glamiastore.com/?wb-release=${release}`);
    await page.locator('.site-header').waitFor();await page.locator('.site-header .theme-toggle:not(:disabled)').waitFor();
    assert.equal(await page.locator('.wb-header,.wb-bottom-nav,.wb-storefront').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-wibrawl-theme')),false);
    await page.screenshot({path:`${output}/live-glamia-${width}.png`});
    report.checks.push({width,wibrawl:'pass',product:product?'pass':'no live product',returns:'200/private',glamia:'pass'});
    await context.close();
  }
  assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report,null,2));
} finally {writeFileSync(`${output}/live-report.json`,JSON.stringify(report,null,2));await browser.close();}
