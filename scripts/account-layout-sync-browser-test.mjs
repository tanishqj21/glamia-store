// Reviewed built assets with isolated data. No production/account mutations.
import assert from 'node:assert/strict';
import { readFileSync,existsSync,mkdirSync } from 'node:fs';
import { resolve,relative,extname } from 'node:path';
import { chromium,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base='https://glamia-account-layout.test',root=resolve('public');
const output='test-results/account-layout-sync';mkdirSync(output,{recursive:true});
const user={id:'local-buyer',email:'buyer@example.test',name:'Meera Shah',role:'buyer'};
const wallet={balance:137.5,referral_code:'6884401',referred_reward:100,referral_reward:50,referral_count:4,successful_referrals:2,ledger:[{id:'local-earned',kind:'referral',description:'Successful referral reward',amount:50,created_at:'2026-10-07T10:00:00Z'},{id:'local-spent',kind:'purchase',description:'Used at checkout',amount:-12.5,created_at:'2026-10-07T11:00:00Z'}]};
const order={id:'local-order',order_number:'GM-LOCAL-00006',status:'delivered',payment_status:'paid',payment_method:'phonepe',total:949,created_at:'2026-10-01T10:00:00Z',items:[{id:'local-product',name:'Night suit',size:'M',quantity:1}]};
const browser=await chromium.launch(),errors=[],writes=[];
async function geometry(page){return page.locator('.account-page').evaluate(el=>{
  const a=el.getBoundingClientRect(),h=el.querySelector('h1').getBoundingClientRect(),n=el.querySelector('nav').getBoundingClientRect();
  return {x:a.x,width:a.width,headingX:h.x,headingY:h.y-a.y,navX:n.x,navY:n.y-a.y,navWidth:n.width};
});}
try{
  for(const [width,theme] of [[1440,'dark'],[1440,'light'],[768,'dark'],[390,'dark'],[320,'light']]){
    let failure=false,signedIn=true,empty=false,reads=0;
    const context=await browser.newContext({viewport:{width,height:1050},reducedMotion:'reduce'});
    await context.addInitScript(theme=>{
      localStorage.setItem('glamia-theme',theme);
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedReferral=text;}}});
    },theme);
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==base)return route.abort();
      if(url.pathname.startsWith('/api/')){
        if(req.method()!=='GET'&&url.pathname!=='/api/analytics/track')writes.push(url.pathname);
        let data={products:[],categories:[],slides:[],events:[],notifications:[],items:[],orders:[],requests:[],balance:0};
        if(url.pathname==='/api/session')data={user:signedIn?user:null,needs_profile_completion:false};
        if(url.pathname==='/api/orders')data={orders:[order]};
        if(url.pathname==='/api/loyalty'){
          reads++;
          if(failure)return route.fulfill({status:500,json:{error:'Wallet refresh failed. Please try again.'}});
          data=empty?{...wallet,balance:0,ledger:[]}:wallet;
        }
        return route.fulfill({json:data});
      }
      let file=resolve(root,'.'+decodeURIComponent(url.pathname));
      if(relative(root,file).startsWith('..'))return route.abort();
      if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');
      return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png'}[extname(file)]||'application/octet-stream',body:readFileSync(file)});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/credits');
    const nav=page.getByRole('navigation',{name:'Account sections'});
    const active=nav.getByRole('button',{name:'Store credits',exact:true});
    await expect(active).toHaveAttribute('aria-current','page');
    await expect(nav.getByRole('button')).toHaveCount(6);
    await expect(page.locator('.credits-balance-panel > strong')).toHaveText('₹137.5');
    await expect(page.locator('.credits-referral-code strong')).toHaveText(wallet.referral_code);
    await expect(page.locator('.credits-reward-pair')).toContainText('₹100');await expect(page.locator('.credits-reward-pair')).toContainText('₹50');
    await expect(page.locator('.credits-activity article')).toHaveCount(2);
    const selectedBox=await active.boundingBox(),navBox=await nav.boundingBox();
    assert.ok(selectedBox.x>=navBox.x-2&&selectedBox.x+selectedBox.width<=navBox.x+navBox.width+2,'Active tab is visible on mobile');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'No horizontal page overflow');
    const copy=page.getByRole('button',{name:'Copy code',exact:true});await copy.click();
    await expect(page.getByRole('button',{name:'Copied',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__copiedReferral),wallet.referral_code);
    const creditsGeometry=await geometry(page);
    const axe=await new AxeBuilder({page}).include('.credits-wallet').withTags(['wcag2a','wcag2aa']).analyze();
    assert.deepEqual(axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
    await page.locator('.account-page').screenshot({path:`${output}/credits-${width}-${theme}.png`});
    await nav.getByRole('button',{name:'Your orders',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Your orders',exact:true})).toBeVisible();
    await expect(page.locator('.account-order-card')).toContainText(order.order_number);
    assert.deepEqual(await geometry(page),creditsGeometry,'Shared heading, container and navigation must align with Orders');
    const orderPanelY=await page.locator('.account-panel').first().evaluate(el=>el.getBoundingClientRect().top-el.closest('.account-page').querySelector('nav').getBoundingClientRect().bottom);
    await nav.getByRole('button',{name:'Store credits',exact:true}).click();
    await expect(page.locator('.credits-balance-panel > strong')).toHaveText('₹137.5');
    const creditPanelY=await page.locator('.credits-wallet-grid').evaluate(el=>el.getBoundingClientRect().top-el.closest('.account-page').querySelector('nav').getBoundingClientRect().bottom);
    assert.ok(Math.abs(creditPanelY-orderPanelY)<=1,'First panel uses the same vertical spacing');
    failure=true;await page.getByRole('button',{name:'Refresh balance',exact:true}).click();
    await expect(page.getByRole('alert')).toHaveText('Wallet refresh failed. Please try again.');
    await expect(page.locator('.credits-balance-panel > strong')).toHaveText('₹137.5');
    failure=false;empty=true;await page.getByRole('button',{name:'Refresh balance',exact:true}).click();
    await expect(page.locator('.credits-balance-panel > strong')).toHaveText('₹0');await expect(page.getByText('Your wallet is ready.',{exact:true})).toBeVisible();
    assert.ok(reads>=3);
    signedIn=false;await page.reload();
    await expect(nav).toBeVisible();await expect(page.locator('.account-panel').getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
    assert.equal(await page.locator('.credits-referral-code').count(),0);
    console.log(`PASS account layout ${width}/${theme}: aligned shell/nav/panel spacing, visible active tab, balance/referrals/history, copy, refresh failure/empty/sign-out, accessibility`);
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'No wallet/order mutation');
}finally{await browser.close();}
