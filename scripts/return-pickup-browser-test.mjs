// Local React + real in-memory Worker mutations. All remote requests are blocked.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
import { adminReturnsFixture,owner,customer } from './lib/admin-returns-fixture.mjs';
import { saveReturnLogistics,returnDocument } from '../src/return-logistics.js';

const base='http://127.0.0.1:5193',output='test-results/return-pickup-lifecycle';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();const errors=[];
try {
  for(const width of [1440,390]) {
    const f=await adminReturnsFixture();let actor=owner;
    const objects=new Map();f.env.RETURN_DOCUMENTS={put:async(key,data)=>objects.set(key,data),get:async key=>objects.has(key)?{body:objects.get(key)}:null};
    const shipping={name:'Meera Shah',line1:'12 Sample Street',city:'New Delhi',state:'Delhi',pin:'110002'};
    f.db.prepare('UPDATE orders SET shipping_json=? WHERE id=?').run(JSON.stringify(shipping),'manual-order');
    f.db.prepare("UPDATE storefront_settings SET value_json=? WHERE setting_key='fulfillment'").run(JSON.stringify({warehouse_address:'Glamia returns warehouse, New Delhi 110001'}));
    const initial=(await (await f.create()).json()).request;
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(()=>localStorage.setItem('glamia-theme','dark'));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url()),method=route.request().method();
      if(url.origin!==base)return route.abort();
      if(!url.pathname.startsWith('/api/'))return route.continue();
      const incoming=new Request(url,{method,headers:{'content-type':'application/json'},...(!['GET','HEAD'].includes(method)?{body:route.request().postData()||'{}'}:{})});
      try {
        let response;
        if(url.pathname==='/api/session')return route.fulfill({json:{user:{...actor,id:actor.email},needs_profile_completion:false}});
        if(url.pathname==='/api/orders')response=await f.worker.listOrders(f.env,actor,actor===owner?'admin':'own',url.searchParams);
        else if(url.pathname==='/api/returns')response=await f.worker.listReturns(f.env,actor,actor===owner?'admin':'own');
        else if(url.pathname===`/api/admin/returns/${initial.id}`)response=await f.worker.updateReturnRequest(incoming,f.env,actor,initial.id);
        else if(url.pathname.endsWith('/logistics')) {
          await saveReturnLogistics(incoming,f.env,await f.worker.getReturnRequest(f.env,initial.id),actor.email,{warehouse_address:'Glamia returns warehouse, New Delhi 110001',shipping,customer_name:'Meera Shah'});
          response=Response.json({request:await f.worker.getReturnRequest(f.env,initial.id)});
        } else if(url.pathname.endsWith('/pickup'))response=await f.worker.confirmReturnPickup(incoming,f.env,actor,initial.id);
        else if(url.pathname.endsWith('/label'))response=await returnDocument(f.env,await f.worker.getReturnRequest(f.env,initial.id),'label');
        else if(url.pathname.endsWith('storefront-settings'))return route.fulfill({json:{announcement:{visible:true,text:'Shipping across India.',items:[]},fulfillment:{warehouse_address:'Glamia warehouse'},seo:{title:'Glamia'},socials:{}}});
        else if(url.pathname==='/api/products')return route.fulfill({json:{products:[],pagination:{has_more:false}}});
        else return route.fulfill({json:{balance:0,transactions:[],notifications:[],unread_count:0,requests:[],orders:[],addresses:[],categories:[],events:[],slides:[],tickets:[],user:actor,needs_profile_completion:false}});
        const contentType=response.headers.get('content-type')||'application/json';
        if(url.pathname==='/api/returns') {const data=await response.json();return route.fulfill({status:response.status,json:{...data,gateway_refunds_enabled:true}});}
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),contentType,body:Buffer.from(await response.arrayBuffer())});
      }catch(error){return route.fulfill({status:error.status||500,json:{error:error.message}});}
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
    try {
      await page.goto(base+'/admin/returns');
      await expect(page.getByRole('heading',{name:'Returns and exchanges'})).toBeVisible();
      await expect(page.getByRole('button',{name:'Process refund',exact:true})).toHaveCount(0);
      await page.getByRole('button',{name:'Manage request / approval'}).click();
      const modal=page.getByRole('dialog',{name:'Manage return'});
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('heading',{name:'Pickup, label and customer instructions',exact:true})).toBeVisible();
      await expect(modal.getByText('Label prepared — awaiting courier and tracking number.',{exact:true})).toBeVisible();
      await modal.getByLabel('Courier',{exact:true}).fill('Local courier');
      await modal.getByLabel('Return tracking number',{exact:true}).fill('RETURN-0001');
      await modal.getByRole('button',{name:'Save return instructions',exact:true}).click();
      await expect(modal.getByText('Return label ready',{exact:true})).toBeVisible();
      assert.equal((await f.worker.getReturnRequest(f.env,initial.id)).status,'requested','Label publishing does not approve a refund');
      await modal.getByRole('button',{name:'Close',exact:true}).click();
      actor=customer;await page.goto(base+'/orders');
      await expect(page.getByText('Return label ready',{exact:true})).toBeVisible();
      await expect(page.getByRole('link',{name:'Download return label (PDF)'})).toBeVisible();
      actor=owner;await page.goto(base+'/admin/returns');
      await page.getByRole('button',{name:'Manage request / approval'}).click();
      await modal.getByRole('button',{name:'Approve request',exact:true}).click();
      await expect(modal.getByRole('heading',{name:'Pickup, label and customer instructions',exact:true})).toBeVisible();
      await modal.getByRole('button',{name:'Print return label',exact:true}).click();
      const label=page.getByRole('dialog',{name:'Glamia return label'});
      await expect(label.getByText('12 Sample Street, New Delhi, Delhi, 110002, India',{exact:true})).toBeVisible();
      await expect(label.getByText('Glamia returns warehouse, New Delhi 110001',{exact:true})).toBeVisible();
      await expect(label.getByText('Barcode / QR placeholder — not scannable')).toBeVisible();
      await page.screenshot({path:`${output}/print-label-${width}.png`});
      await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('#root').isVisible(),false,'Print hides storefront and admin UI');
      await expect(label).toBeVisible();await page.emulateMedia({media:'screen'});
      await label.getByRole('button',{name:'Close',exact:true}).click();
      await modal.getByRole('button',{name:'Mark picked up by courier'}).click();
      await expect(modal.getByText('Picked up by courier',{exact:true})).toBeVisible();
      await modal.getByRole('button',{name:'Close',exact:true}).click();
      await expect(page.getByRole('button',{name:'Process refund',exact:true})).toBeEnabled();
      await page.screenshot({path:`${output}/admin-collected-${width}.png`,fullPage:true});
      actor=customer;await page.goto(base+'/orders');
      await expect(page.getByRole('heading',{name:'Your purchases'})).toBeVisible();
      await expect(page.getByText('Picked up by courier',{exact:true})).toBeVisible();
      const link=page.getByRole('link',{name:'Download return label (PDF)'});
      await expect(link).toHaveAttribute('download','');
      // Chromium download-attribute navigation bypasses interception against
      // Vite. Exercise the authenticated document fetch and binary separately.
      const document=await page.evaluate(async href=>{const response=await fetch(href);return {status:response.status,type:response.headers.get('content-type'),disposition:response.headers.get('content-disposition'),bytes:[...new Uint8Array(await response.arrayBuffer())]};},await link.getAttribute('href'));
      assert.equal(document.status,200);assert.equal(document.type,'application/pdf');assert.match(document.disposition,/Glamia-return-label\.pdf/);
      assert.equal(Buffer.from(document.bytes).subarray(0,5).toString(),'%PDF-');await writeFile(`${output}/download-${width}.pdf`,Buffer.from(document.bytes));
      assert.equal(f.db.prepare('SELECT COUNT(*) n FROM gateway_refunds').get().n,0,'Browser test never sends money');
      await page.screenshot({path:`${output}/customer-collected-${width}.png`,fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal mobile overflow');
      // A separate local exchange verifies replacement identity in actual React.
      await f.worker.updateReturnRequest(new Request(base,{method:'PATCH',body:JSON.stringify({status:'cancelled'})}),f.env,owner,initial.id);
      const exchange=(await (await f.create({type:'exchange',exchange_line_id:'manual-line',exchange_product_id:f.productId,exchange_from_size:'M',exchange_to_size:'L'})).json()).request;
      const approved=exchange;
      await page.reload();
      const replacement=page.locator(`#order-${approved.replacement_order_id}`);
      await expect(replacement.getByText('Replacement Order (₹0)',{exact:true})).toBeVisible();
      await expect(replacement.getByText('₹0.00',{exact:true})).toHaveCount(4);
      await expect(replacement.getByText(/Your replacement follows normal packing and delivery/)).toBeVisible();
      await expect(page.getByText('Replacement placed · awaiting packing',{exact:true})).toBeVisible();
      await page.screenshot({path:`${output}/immediate-exchange-${width}.png`,fullPage:true});
      await replacement.getByRole('button',{name:'View original order'}).click();
      await expect(page).toHaveURL(new RegExp(`order=${'manual-order'}#order-manual-order$`));
      await f.worker.updateReturnRequest(new Request(base,{method:'PATCH',body:JSON.stringify({status:'received'})}),f.env,owner,exchange.id);
      f.db.prepare("UPDATE orders SET packing_status='packed',status='delivered' WHERE id=?").run(approved.replacement_order_id);
      actor=owner;await page.goto(base+'/admin/completed-orders');
      const record=page.locator('.completed-order-list article').filter({has:page.getByText('Replacement Order (₹0)',{exact:true})});
      await expect(record).toBeVisible();await expect(record.getByText('₹0.00',{exact:true})).toBeVisible();
      await expect(record.getByText('No payment required',{exact:false})).toBeVisible();
      await expect(record.getByRole('link',{name:'Download bill (PDF)'})).toHaveCount(0);
      await expect(record.getByRole('button',{name:'View original order'})).toBeEnabled();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Completed replacement records fit mobile');
      await page.screenshot({path:`${output}/completed-replacement-${width}.png`,fullPage:true});
      console.log(`PASS pending-return label publishing, customer download, print isolation, pickup/refund eligibility and immediate replacement identity at ${width}px`);
    } finally {await context.close();f.db.close();}
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
