// Local UI fixtures only. No production API or payment provider may be contacted.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base='http://127.0.0.1:5197';
mkdirSync('test-results/cancellation-refunds',{recursive:true});
const original={id:'cancel-local',order_number:'GM-CANCEL-LOCAL',customer_email:'buyer@example.com',customer_name:'Meera Shah',status:'confirmed',payment_status:'paid',payment_method:'razorpay',total:400,credits_used:100,payable_total:300,created_at:new Date().toISOString(),items:[{id:'shirt',name:'Ivory linen shirt',size:'M',quantity:1}]};
const refund={id:'gmcr_local',state:'pending',total:400,gateway_amount:300,credit_amount:100,credits_restored:true,provider:'razorpay',provider_refund_id:'rfnd_local',checked_at:'2026-10-04 08:30:00',recovery_available:false};
const browser=await chromium.launch();const errors=[];
async function fixture(width,theme,{admin=false,cancelled=false}={}) {
  const state={order:structuredClone(original),reads:0,posts:[]};
  if(cancelled)state.order={...state.order,status:'cancelled',cancellation_refund:{...refund}};
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(theme=>{localStorage.setItem('glamia-theme',theme);Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__visibility||'visible'});},theme);
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==base)return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    if(request.method()!=='GET'&&url.pathname!=='/api/analytics/track')state.posts.push(url.pathname);
    if(url.pathname==='/api/session')return route.fulfill({json:{user:{id:admin?'owner':'customer',name:'Meera Shah',email:admin?'owner@example.com':'buyer@example.com',role:admin?'admin':'buyer',is_owner:admin},needs_profile_completion:false}});
    if(url.pathname==='/api/orders'){state.reads++;return route.fulfill({json:{orders:[state.order]}});}
    if(url.pathname==='/api/orders/cancel-local/cancel'){state.order={...state.order,status:'cancelled',cancellation_refund:{...refund}};return route.fulfill({json:{order:state.order}});}
    if(url.pathname.startsWith('/api/admin/orders/cancel-local/cancellation-refund/')){state.order.payment_status='refunded';state.order.cancellation_refund={...refund,state:'processed'};return route.fulfill({json:{order:state.order,refund:state.order.cancellation_refund}});}
    if(url.pathname==='/api/order-tracking')return route.fulfill({json:{order:state.order}});
    return route.fulfill({json:{products:[],categories:[],slides:[],requests:[],tickets:[],notifications:[],orders:[],balance:0,transactions:[],settings:{},stats:{}}});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.install();
  await page.goto(base+(admin?'/admin/orders':'/orders'));
  return {page,state,context};
}
try {
  for(const [width,theme] of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark'],[320,'light']]) {
    const {page,state,context}=await fixture(width,theme);
    try {
      await expect(page.getByRole('button',{name:'Cancel order',exact:true})).toBeVisible();page.once('dialog',dialog=>dialog.accept());
      await page.getByRole('button',{name:'Cancel order',exact:true}).click();
      const card=page.locator('.cancellation-refund-card');await expect(card.getByRole('heading',{name:'Provider processing',exact:true})).toBeVisible();
      await expect(card.getByText('₹400',{exact:true})).toBeVisible();await expect(card.getByText('₹300',{exact:true})).toBeVisible();await expect(card.getByText('₹100',{exact:true})).toBeVisible();
      await expect(card.getByText('Store credits restored',{exact:true})).toBeVisible();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,`overflow ${width}/${theme}`);
      const axe=await new AxeBuilder({page}).include('.cancellation-refund-card').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(axe.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>item.id),[],`accessibility ${width}/${theme}`);
      await card.screenshot({path:`test-results/cancellation-refunds/${width}-${theme}.png`});
      state.order.cancellation_refund={...refund,state:'reconciliation_required',last_error:'secret-provider-error',evidence_json:'secret-internal-evidence'};
      await page.getByRole('button',{name:'Refresh cancellation refunds',exact:true}).click();await expect(card.getByRole('heading',{name:'Refund needs review',exact:true})).toBeVisible();
      assert.doesNotMatch(await card.innerText(),/secret-provider-error|secret-internal-evidence/);
      await page.evaluate(()=>{window.__visibility='hidden';document.dispatchEvent(new Event('visibilitychange'));});const before=state.reads;
      await page.clock.fastForward(180000);assert.equal(state.reads,before,'Hidden tab must pause cancellation reads');
      state.order.payment_status='refunded';state.order.cancellation_refund={...refund,state:'processed'};
      await page.evaluate(()=>{window.__visibility='visible';document.dispatchEvent(new Event('visibilitychange'));});
      await expect(card.getByRole('heading',{name:'Cancellation refund confirmed',exact:true})).toBeVisible();const settled=state.reads;
      await page.clock.fastForward(180000);assert.equal(state.reads,settled,'Terminal refund must stop automatic polling');
      assert.deepEqual(state.posts,['/api/orders/cancel-local/cancel'],'Customer browser never submits provider refunds');
      console.log(`PASS customer cancel, refund split, review/confirmation, polling and accessibility ${width}/${theme}`);
    }finally{await context.close();}
  }
  {
    const {page,state,context}=await fixture(1440,'light',{admin:true,cancelled:true});
    try {
      await page.getByRole('button',{name:/GM-CANCEL-LOCAL/}).click();const card=page.locator('.cancellation-refund-card');await expect(card).toBeVisible();
      await card.getByRole('button',{name:'Check provider status',exact:true}).click();await expect(card.getByRole('heading',{name:'Cancellation refund confirmed',exact:true})).toBeVisible();
      assert.ok(state.posts.includes('/api/admin/orders/cancel-local/cancellation-refund/reconcile'));console.log('PASS owner order detail refund management');
    }finally{await context.close();}
  }
  {
    const {page,context}=await fixture(390,'light',{cancelled:true});
    try {
      await page.goto(base+'/track-order');await page.getByLabel('Order number',{exact:true}).fill('GM-CANCEL-LOCAL');await page.getByLabel('Checkout email',{exact:true}).fill('buyer@example.com');await page.getByRole('button',{name:'Track order',exact:true}).click();
      await expect(page.locator('.tracking-result .cancellation-refund-card')).toBeVisible();console.log('PASS public order lookup includes safe cancellation status');
    }finally{await context.close();}
  }
  assert.deepEqual(errors,[],'No React runtime errors');
}finally{await browser.close();}
