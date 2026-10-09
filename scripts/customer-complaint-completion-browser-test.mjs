// Built release + isolated customer fixtures. No production traffic or payouts.
import assert from 'node:assert/strict';
import { readFileSync,existsSync,mkdirSync } from 'node:fs';
import { resolve,relative,extname } from 'node:path';
import { chromium,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base='https://glamia-customer-completion.test',root=resolve('public');
const output='test-results/admin-complaint-completion';mkdirSync(output,{recursive:true});
const order={id:'local-order',order_number:'GM-LOCAL-CLOSED',status:'delivered',payment_status:'paid',payment_method:'phonepe',total:949,created_at:'2026-10-01T10:00:00Z',items:[{id:'local-product',name:'Night suit',size:'M',quantity:1}]};
const browser=await chromium.launch(),errors=[];
try {
  for(const [width,theme] of [[1440,'dark'],[390,'light'],[320,'dark']]) {
    let reads=0;
    const record={id:'local-return',order_id:order.id,type:'refund',status:'received',reason:'The fit was not right.',refund_destination:'original',refund_amount:949,created_at:'2026-10-02T10:00:00Z',returned_at:'2026-10-03T10:00:00Z',case_completed_at:'2026-10-07T12:30:00Z',gateway_refund:{state:'reconciliation_required',provider:'phonepe',total:949,gateway_amount:949,credit_amount:0},logistics_json:'{}',selected_items_json:'[]'};
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    await context.addInitScript(theme=>localStorage.setItem('glamia-theme',theme),theme);
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==base)return route.abort();
      if(url.pathname.startsWith('/api/')) {
        assert.ok(req.method()==='GET'||url.pathname==='/api/analytics/track','No customer financial mutation');
        let data={products:[],categories:[],slides:[],notifications:[],balance:0,items:[],orders:[],requests:[]};
        if(url.pathname==='/api/session')data={user:{id:'local-user',email:'buyer@example.test',name:'Meera Shah',role:'buyer'},needs_profile_completion:false};
        if(url.pathname==='/api/orders')data={orders:[order]};
        if(url.pathname==='/api/returns'){reads++;data={requests:[record]};}
        return route.fulfill({json:data});
      }
      let file=resolve(root,'.'+decodeURIComponent(url.pathname));
      if(relative(root,file).startsWith('..'))return route.abort();
      if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');
      return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png'}[extname(file)]||'application/octet-stream',body:readFileSync(file)});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
    await page.goto(base+'/orders');
    const tracker=page.locator('.refund-tracker');
    await expect(tracker.getByRole('heading',{name:'Refund being verified',exact:true})).toBeVisible();
    await expect(tracker.getByText('Complaint completed by Glamia care',{exact:true})).toBeVisible();
    await expect(tracker.getByText(/This does not confirm a refund/)).toBeVisible();
    assert.doesNotMatch(await tracker.innerText(),/owner@example|Internal completion reason/);
    await expect(tracker.getByRole('heading',{name:'Refund confirmed',exact:true})).toHaveCount(0);
    await expect(tracker.locator('.refund-step-done').filter({hasText:'Refund confirmed'})).toHaveCount(0);
    const before=reads;await page.clock.fastForward(65000);await expect.poll(()=>reads).toBeGreaterThan(before);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
    const axe=await new AxeBuilder({page}).include('.refund-tracker').withTags(['wcag2a','wcag2aa']).analyze();
    assert.deepEqual(axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
    await tracker.screenshot({path:`${output}/customer-${width}-${theme}.png`});
    record.type='exchange';record.status='approved';record.replacement_fulfilment_mode='immediate';record.replacement_status='pending';record.replacement_order_number='GM-LOCAL-REPLACEMENT';record.gateway_refund=null;
    await page.reload();
    await expect(page.getByRole('heading',{name:'Replacement placed · awaiting packing',exact:true})).toBeVisible();
    await expect(page.getByText(/Your replacement and return shipping progress remain tracked separately/)).toBeVisible();
    console.log(`PASS customer closure ${width}/${theme}: truthful pending refund, continued refresh, exchange unchanged, no staff fields, accessibility and no overflow`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
