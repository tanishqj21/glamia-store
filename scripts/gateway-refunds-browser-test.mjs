// Real website + real Worker/D1 refund flow with entirely mocked gateway traffic.
import assert from 'node:assert/strict';
import { chromium,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { localDatabase,workerFunctions } from './lib/worker-fixture.mjs';

const base=process.env.REFUND_PREVIEW_URL || 'http://127.0.0.1:5189';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const browser=await chromium.launch();
const errors=[];
try {
  for (const width of [1440,390]) {
    const {db,env}=localDatabase();
    env.ADMIN_EMAILS=['owner@example.com']; env.GATEWAY_REFUNDS_ENABLED='true'; env.RAZORPAY_KEY_ID='local_audit'; env.RAZORPAY_KEY_SECRET='local_audit_not_a_real_key'; env.DISABLE_OUTBOUND_PUSH='true';
    db.prepare(`INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,payment_gateway,gateway_order_id,gateway_payment_id,payable_total)
      VALUES('browser-order','GM-REFUND-BROWSER','refund@example.com','[]',500,500,'delivered','razorpay','paid','razorpay','order_browser','pay_browser',500)`).run();
    db.prepare(`INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination)
      VALUES('browser-return','browser-order','refund@example.com','refund','Website-only fixture','received',500,'original')`).run();
    let providerStatus='pending', mismatch=false,posts=0,logReads=0;
    const worker=await workerFunctions(['listReturns','handleGatewayRefund','updateReturnRequest'],{ fetch:async(input,init={})=>{
      const url=new URL(input);
      assert.equal(url.origin,'https://api.razorpay.com','All external traffic must be explicitly mocked');
      if (url.pathname==='/v1/payments/pay_browser') return Response.json({id:'pay_browser',order_id:'order_browser',currency:'INR',amount:50000,amount_refunded:0,status:'captured'});
      if (url.pathname==='/v1/payments/pay_browser/refund') { assert.equal(init.method,'POST'); posts++; return Response.json({id:'rfnd_browser',status:'processed'}); }
      if (url.pathname==='/v1/refunds/rfnd_browser') return Response.json({id:'rfnd_browser',entity:'refund',payment_id:'pay_browser',currency:'INR',amount:mismatch?1:20050,status:providerStatus});
      throw Error(`Unexpected external request: ${url.pathname}`);
    }});
    let actor={role:'admin',is_owner:true,email:'owner@example.com',name:'Local owner'};
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',dialog=>dialog.type()==='confirm'?dialog.accept():dialog.dismiss());
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(!url.pathname.startsWith('/api/')) return url.origin===new URL(base).origin?route.continue():route.abort();
      if(url.pathname==='/api/session') return route.fulfill({json:{user:actor,needs_profile_completion:false}});
      try {
        let response;
        if(url.pathname==='/api/returns') response=await worker.listReturns(env,actor,'admin');
        const refund=url.pathname.match(/^\/api\/admin\/returns\/([^/]+)\/refund(?:\/(\w+))?$/);
        if(refund) {
          if(request.method()==='GET') logReads++;
          response=await worker.handleGatewayRefund(new Request(request.url(),{method:request.method(),...(request.method()==='GET'?{}:{body:request.postData()})}),env,actor,refund[1],refund[2]);
        }
        if(url.pathname==='/api/admin/returns/browser-return') response=await worker.updateReturnRequest(new Request(request.url(),{method:'PATCH',body:request.postData()}),env,actor,'browser-return');
        if(response) return route.fulfill({status:response.status,json:await response.json()});
        return route.fulfill({json:{stats:{},products:[],slides:[],categories:[],notifications:[],orders:[],unread:0}});
      } catch(error) { return route.fulfill({status:error.status||500,json:{error:error.message}}); }
    });
    try {
      await page.goto(base+'/admin/returns');
      await expect(page.getByRole('button',{name:'Approve refund amount',exact:true})).toBeVisible();
      assert.equal(logReads,0,'Logs are loaded on demand, not with every return');
      await page.getByLabel('Refund amount (₹)').fill('200.50');
      await page.getByRole('button',{name:'Approve refund amount',exact:true}).click();
      await expect(page.getByText('Owner approved · not sent',{exact:true})).toBeVisible();
      assert.equal(posts,0,'Approval never sends money');
      await page.getByRole('button',{name:'Send approved refund',exact:true}).click();
      await expect(page.getByText('Provider processing',{exact:true})).toBeVisible();
      assert.equal(posts,1); assert.equal(db.prepare('SELECT status FROM return_requests').get().status,'received');
      mismatch=true;
      await page.getByRole('button',{name:'Check provider status',exact:true}).click();
      await expect(page.getByText('Needs reconciliation · do not create another refund',{exact:true})).toBeVisible();
      assert.equal(db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
      mismatch=false; providerStatus='processed';
      await page.getByRole('button',{name:'Check provider status',exact:true}).click();
      await expect(page.getByText('Payment provider confirmed',{exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'Send approved refund',exact:true})).toHaveCount(0);
      await page.getByRole('button',{name:'View refund log',exact:true}).click();
      await expect(page.getByRole('list',{name:'Refund audit log'})).toBeVisible();
      assert.ok(logReads>0); assert.equal(posts,1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
      actor={...actor,is_owner:false,employee_id:'return-staff',employee_permissions:{returns:true}};
      await page.goto(base+'/admin/returns');
      await expect(page.getByRole('button',{name:'View refund log',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'Approve refund amount',exact:true})).toHaveCount(0);
      await assert.rejects(worker.handleGatewayRefund(new Request(base+'/api/admin/returns/browser-return/refund/execute',{method:'POST',body:'{}'}),env,actor,'browser-return','execute'),e=>e.status===403);
      console.log(`PASS refund approval, pending/mismatch/confirmation, log, role protection, accessibility width=${width}`);
    } finally { await context.close();db.close(); }
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
