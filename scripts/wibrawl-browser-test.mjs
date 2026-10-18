// Isolated browser fixtures exercise shared shopping UI without live writes.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.WIBRAWL_TEST_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const output = new URL('../tmp/wibrawl-review/',import.meta.url);
mkdirSync(output,{recursive:true});
const products = ['Lobby Tee','Courtside Tee','Manga Tee'].map((name,index)=>({id:`tee-${index}`,name,category:'Admin Custom Tees',subcategory:'Original Prints',brand:'Wibrawl',price:599,mrp:799,stock:10,sizes:['M','L'],size_stock:{M:5,L:5},color:'Black',image_url:'/wibrawl/gaming-campaign-640.webp',images:['/wibrawl/gaming-campaign-640.webp','/wibrawl/sports-campaign-640.webp'],description:'Local browser fixture',created_at:'2026-10-01',status:'live',rating:0,review_count:0}));
const errors=[],findings=[];
const browser = await chromium.launch();
async function context(viewport,{signedIn=false,empty=false,failure=false,...options}={}) {
  const ctx = await browser.newContext({viewport,reducedMotion:'reduce',colorScheme:'light',...options});
  await ctx.route('**/api/**',async route=>{
    const url=new URL(route.request().url()), path=url.pathname;
    let result={};
    if(path==='/api/session')result={user:signedIn?{email:'fixture@example.com',name:'Fixture Buyer',role:'customer'}:null};
    else if(path==='/api/storefront-settings')result={announcement:{visible:false},trust_strip:{visible:false},seo:{},customer_experience:{},socials:{instagram:'https://www.instagram.com/fixture'}};
    else if(path==='/api/categories')result={categories:['Admin Custom Tees'],subcategories:[{category:'Admin Custom Tees',name:'Original Prints'}]};
    else if(path==='/api/products'){
      assert.ok(url.searchParams.has('wibrawl-preview'),'Local API must keep storefront scope');
      if(failure)return route.fulfill({status:503,json:{error:'Fixture failure'}});
      const rows=empty?[]:products;
      result={products:rows,pagination:{page:1,total:rows.length,has_more:false},facets:{categories:['Admin Custom Tees'],colors:['Black'],sizes:['M','L']}};
    } else if(path.startsWith('/api/products/'))result={product:products.find(p=>path.includes(p.id))||products[0],colourways:[]};
    else if(path==='/api/loyalty')result={balance:1234};
    else if(path.startsWith('/api/saved-items'))result={cart:[],wishlist:[],saved_for_later:[]};
    else if(path==='/api/addresses')result={addresses:[]};
    else if(path==='/api/orders')result={orders:[]};
    else if(path.includes('reviews'))result={reviews:[],count:0,average:0};
    else if(path.includes('questions'))result={questions:[]};
    await route.fulfill({json:result});
  });
  return ctx;
}
async function ready(page,path='/') {
  await page.goto(`${base}${path}${path.includes('?')?'&':'?'}wibrawl-preview=1`);
  await page.locator('.wibrawl-shell').waitFor();
  await page.waitForFunction(()=>!document.getElementById('initial-loader')||document.getElementById('initial-loader').classList.contains('is-hidden'));
}
try {
  for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const ctx=await context(viewport),page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(`${label}: ${e.message}`));
    await ready(page);
    await page.locator('.product-card').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
    assert.equal(await page.evaluate(()=>localStorage.getItem('wibrawl-theme')),null);
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    assert.equal(await page.evaluate(()=>localStorage.getItem('wibrawl-theme')),null);
    await page.getByRole('button',{name:'Switch to Stadium Light',exact:true}).click();
    await page.emulateMedia({colorScheme:'light'});
    for(const theme of ['Stadium Light','Tunnel Dark']){
      const expected=theme==='Tunnel Dark'?'dark':'light';
      if(await page.evaluate(()=>document.documentElement.dataset.theme)!==expected)await page.getByRole('button',{name:`Switch to ${theme}`,exact:true}).click();
      await page.waitForFunction(value=>document.documentElement.dataset.theme===value,expected);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      findings.push({label,theme,overflow,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
      console.log(`${label} ${theme}: overflow=${overflow}, accessibility=${axe.violations.map(v=>v.id).join(',')||'pass'}`);
      // Scroll each lazy card into view before recording the complete page.
      for(const card of await page.locator('.product-card').all())await card.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>[...document.querySelectorAll('.product-image img')].every(img=>img.complete&&img.naturalWidth>0));
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:fileURLToPath(new URL(`${label}-${theme.toLowerCase()}.png`,output)),fullPage:true});
    }
    await page.reload();
    await page.locator('.wibrawl-home-gaming').waitFor();
    await page.emulateMedia({colorScheme:'light'});
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
    await page.getByRole('button',{name:'Open menu',exact:true}).click();
    const drawer=page.getByRole('dialog',{name:'Pick your side.'});
    await drawer.waitFor();
    await drawer.getByText('Admin Custom Tees',{exact:true}).waitFor();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.querySelector('.wb-menu-dialog').contains(document.activeElement)),true);
    await page.keyboard.press('Escape');
    assert.equal(await drawer.count(),0);
    assert.equal(await page.getByRole('button',{name:'Open menu',exact:true}).evaluate(e=>e===document.activeElement),true);
    await page.locator('.wb-account-trigger').click();
    await page.getByRole('link',{name:'Log in / Sign up',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.wb-card-preview').first().click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.wibrawl-navigation').getByRole('link',{name:'League Leaders'}).click();
    await page.getByRole('heading',{name:'League Leaders',exact:true}).waitFor();
    assert.equal(await page.title(),'League Leaders | Wibrawl');
    await ready(page,'/product/tee-0');
    await page.getByRole('heading',{name:'Lobby Tee',exact:true}).waitFor();
    assert.equal(await page.locator('.gallery-control svg').count(),0,'No gallery arrows in Wibrawl');
    await page.getByRole('button',{name:'M',exact:true}).click();
    await page.locator('.wb-main-add').click();
    await page.locator('.wb-pdp-message').getByText('Added to your cart.',{exact:true}).waitFor();
    await ready(page,'/cart');
    await page.getByRole('heading',{name:'Shopping bag',exact:true}).waitFor();
    await page.getByRole('button',{name:/Increase quantity/}).click();
    await page.locator('.wb-quantity output').filter({hasText:'2'}).waitFor();
    await ready(page,'/login');
    await page.getByRole('heading',{name:'YOUR PEOPLE. YOUR WORLD.'}).waitFor();
    await page.getByRole('button',{name:'Continue browsing as a guest',exact:true}).click();
    await page.locator('.wibrawl-home').waitFor();
    await ctx.close();
  }
  const small=await context({width:360,height:800},{signedIn:true}),page=await small.newPage();
  page.on('pageerror',e=>errors.push(`signed-in: ${e.message}`));
  await ready(page);
  await page.getByRole('button',{name:/Store credits, ₹1,234/}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.locator('.wb-account-trigger').click();
  await page.getByRole('link',{name:'Profile',exact:true}).waitFor();
  await page.screenshot({path:fileURLToPath(new URL('mobile-profile.png',output)),fullPage:true});
  await small.close();
  for(const state of ['empty','failure']){
    const ctx=await context({width:1280,height:900},{[state]:true}),p=await ctx.newPage();
    await ready(p);
    await p.getByText(state==='empty'?'The next drop is warming up.':'The collection could not be loaded. Please refresh to try again.',{exact:true}).waitFor();
    await p.screenshot({path:fileURLToPath(new URL(`${state}.png`,output)),fullPage:true});
    await ctx.close();
  }
} finally {
  writeFileSync(new URL('report.json',output),JSON.stringify({findings,errors},null,2));
  await browser.close();
}
assert.deepEqual(errors,[],'No browser exceptions');
assert.ok(findings.every(f=>!f.overflow),'No horizontal overflow');
assert.ok(findings.every(f=>!f.violations.length),'No accessibility violations');
console.log('Wibrawl shopping, themes, menus and empty/error states passed.');
