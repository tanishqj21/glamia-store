// Records the real website UI with isolated Worker/D1 state, not a storyboard.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createDemoServer } from './after-sales-local-demo.mjs';

const out = resolve(process.env.DEMO_OUTPUT || 'test-results/after-sales-video');
await mkdir(out,{recursive:true});
const demo = await createDemoServer(5196);
const browser = await chromium.launch({slowMo:process.env.DEMO_FAST ? 0 : 100});
const errors = [], chapters = [];
const delay = process.env.DEMO_FAST ? 20 : 4000;
let page, context, flow, started;
async function caption(title,detail,hold=true) {
  await page.evaluate(({title,detail})=>{
    document.querySelector('#demo-title').textContent=title;
    document.querySelector('#demo-detail').textContent=detail;
  },{title,detail});
  chapters.push({flow,seconds:Math.round((Date.now()-started)/1000),title,detail});
  console.log(`${flow}: ${title}`);
  if(hold)await page.waitForTimeout(delay);
}
async function focus(locator) {
  await locator.first().scrollIntoViewIfNeeded();
  await locator.first().evaluate(el=>{el.style.outline='2px solid #ad8fd4';el.style.outlineOffset='5px';});
  await page.waitForTimeout(process.env.DEMO_FAST?20:450);
}
async function click(locator) {await focus(locator);await locator.first().click();await page.waitForTimeout(process.env.DEMO_FAST?20:350);}
async function go(role,path) {
  await page.goto(`${demo.base}/__demo/role?role=${role}&to=${encodeURIComponent(path)}`);
  await page.locator('#main-content').waitFor();
  await page.locator('#initial-loader').waitFor({state:'detached'});
  await page.evaluate(()=>document.fonts.ready);
}
async function start(name) {
  flow=name;started=Date.now();
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:resolve(out,'raw'),size:{width:1440,height:1000}},acceptDownloads:true,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('glamia-theme','light'));
  await context.route('**/*',route=>new URL(route.request().url()).origin===demo.base?route.continue():route.abort());
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
}
async function finish(name) {
  await page.screenshot({path:resolve(out,`${name}-final.png`),fullPage:true});
  const video=page.video();await context.close();await video.saveAs(resolve(out,`${name}-demo.webm`));await video.delete();
}
async function manage(orderNumber,title) {
  await go('admin','/admin/returns');
  const row=page.locator('.operations-list article').filter({hasText:orderNumber});
  await expect(row).toHaveCount(1);
  await focus(row);
  await caption(title,'Admin Returns connects the original order, customer request and return-pickup controls.');
  return row;
}
async function booking(modal,tracking) {
  await click(modal.getByText('Pickup, label and customer instructions',{exact:true}));
  await expect(modal.getByText('Label prepared — awaiting courier and tracking number.',{exact:true})).toBeVisible();
  await caption('Admin · Return label draft','The customer-to-warehouse draft exists already. Courier booking is manual; no pickup has been booked by Glamia.');
  await modal.getByLabel('Courier',{exact:true}).fill('Demo Courier');
  await modal.getByLabel('Return tracking number',{exact:true}).fill(tracking);
  await modal.getByLabel('Return instructions',{exact:true}).fill('Pack the shirt securely, attach this label, and hand it to the arranged courier. Keep your handover receipt.');
  await modal.getByLabel('Pickup status').selectOption('scheduled');
  await caption('Admin · Save courier and tracking',`${tracking} identifies the return parcel—not the outgoing replacement.`);
  await click(modal.getByRole('button',{name:'Save return instructions',exact:true}));
  await expect(modal.getByText('Return label ready',{exact:true})).toBeVisible();
  await caption('Admin · PDF label is ready','Saving tracking generated a real local PDF. Both admin and customer can now download or print it.');
  await click(modal.getByRole('button',{name:'Print return label',exact:true}));
  const print=page.getByRole('dialog',{name:'Glamia return label'});
  await expect(print.getByText(tracking,{exact:true})).toBeVisible();
  await caption('Admin · Printable return label','Customer address, warehouse address, courier and tracking. Barcode / QR is a non-scannable placeholder.');
  await click(print.getByRole('button',{name:'Close',exact:true}));
}
async function customerLabel(orderId,tracking,filename) {
  await go('customer','/orders');
  const order=page.locator(`#order-${orderId}`);
  await focus(order.locator('.return-status-card'));
  await expect(order.getByText(tracking,{exact:true})).toBeVisible();
  await caption('Customer · Tracking and label available','The order screen shows return tracking and the same printable label.');
  const downloadPromise=page.waitForEvent('download');
  await click(order.getByRole('link',{name:'Download return label (PDF)',exact:true}));
  const download=await downloadPromise;await download.saveAs(resolve(out,filename));
  await caption('Customer · Downloaded the return PDF','The downloaded label is ready to print and attach to the parcel. No refund is triggered by downloading.');
  await click(order.getByRole('button',{name:'Print return label',exact:true}));
  await expect(page.getByRole('dialog',{name:'Glamia return label'})).toBeVisible();
  await caption('Customer · Print preview','Admin and customer use the same saved addresses and tracking details.');
  await click(page.getByRole('dialog',{name:'Glamia return label'}).getByRole('button',{name:'Close',exact:true}));
}

try {
  await start('exchange');
  await go('customer','/orders');
  const original=page.locator('#order-manual-order');await focus(original);
  await caption('01 / EXCHANGE · Customer starts here','Delivered order GM-DEMO-EXCHANGE-001 · Ivory linen shirt · Size M · ₹949.50.');
  await click(original.getByRole('button',{name:'Return / Refund',exact:true}));
  const form=page.locator('.after-sales-dialog');await form.getByLabel('Request type').selectOption('exchange');
  await form.getByLabel('Replacement size').selectOption('L');
  await form.getByLabel('Reason',{exact:true}).fill('The size M shirt is too tight. Please exchange it for size L.');
  await caption('Customer · Select the replacement','The purchased item and current size are fixed to this order. The available replacement is size L.');
  await click(form.getByRole('button',{name:'Submit request',exact:true}));
  await expect(page.getByText('Replacement placed · awaiting packing',{exact:true})).toBeVisible();
  const exchange=demo.db.prepare("SELECT * FROM return_requests WHERE type='exchange'").get();
  assert.ok(exchange.replacement_order_id);assert.equal(exchange.status,'approved');
  const replacement=page.locator(`#order-${exchange.replacement_order_id}`);
  await expect(replacement.getByText('₹0.00',{exact:true})).toHaveCount(4);await focus(replacement);
  await caption('Customer · Replacement placed immediately','No admin approval or return receipt is needed. Subtotal, tax, shipping and total are all ₹0.00.');
  await go('admin','/admin/notifications');
  await focus(page.getByText('Arrange exchange return pickup',{exact:true}));
  await caption('Admin · Return-pickup notification','The ₹0 replacement already exists. Admin is notified to arrange collection of the original shirt separately.');
  await go('admin','/admin/orders');
  const adminReplacement=page.locator('.admin-order-card').filter({hasText:'Replacement Order (₹0)'});
  await expect(adminReplacement).toHaveCount(1);await focus(adminReplacement);
  await caption('Admin · Replacement in the normal order queue','Customer and admin see the replacement badge. Packing employees receive a normal job.');
  let modal=await manage('GM-DEMO-EXCHANGE-001','Admin · Arrange the original-item pickup');
  await expect(modal.getByRole('button',{name:'Approve request'})).toHaveCount(0);
  await booking(modal,'DEMO-EX-RETURN-001');
  await customerLabel('manual-order','DEMO-EX-RETURN-001','exchange-return-label.pdf');
  const packed=await demo.api.markEmployeeOrderPacked(demo.env,exchange.replacement_order_id,{employee:{id:'demo-packer',name:'Demo packer'}});
  assert.equal(packed.status,200);
  await go('admin','/admin/orders');
  const card=page.locator('.admin-order-card').filter({hasText:'Replacement Order (₹0)'});
  await click(card.locator('.admin-order-card-summary'));
  await caption('Admin · Packing confirmed','A local simulated packer used the real packing action. The replacement can ship before the original is collected.');
  await card.getByLabel('Tracking number',{exact:false}).fill('DEMO-OUTGOING-001');
  await click(card.getByRole('button',{name:'Save order',exact:true}));
  await expect(card.getByLabel('Fulfilment status')).toHaveValue('shipped');
  await caption('Admin · Replacement shipped normally','Outgoing tracking is DEMO-OUTGOING-001. The separate return tracking remains DEMO-EX-RETURN-001.');
  await card.getByLabel('Fulfilment status').selectOption('delivered');await click(card.getByRole('button',{name:'Save order',exact:true}));
  await go('customer','/orders');await focus(page.locator(`#order-${exchange.replacement_order_id}`));
  await caption('Customer · Replacement delivered','The ₹0 replacement is delivered. The original item still needs collecting, so the exchange pickup remains open.');
  modal=await manage('GM-DEMO-EXCHANGE-001','Admin · Finish the return leg');
  await click(modal.getByText('Pickup, label and customer instructions',{exact:true}));
  await click(modal.getByRole('button',{name:'Mark picked up by courier',exact:true}));
  await expect(modal.getByText('Picked up by courier',{exact:true})).toBeVisible();
  await caption('Admin · Courier collected the original','Physical collection is recorded separately from replacement delivery.');
  await click(modal.getByRole('button',{name:'Record warehouse receipt',exact:true}));
  assert.equal((await demo.api.getReturnRequest(demo.env,exchange.id)).status,'completed');
  await caption('Admin · Exchange complete','Replacement delivered + original received at the warehouse. Both legs are now complete.');
  await go('customer','/orders');await focus(page.locator('#order-manual-order').locator('.customer-exchange-tracker,.return-status-card').first());
  await caption('Customer · Completed exchange record','The original order and linked ₹0 replacement remain in order history. No second payment was collected.');
  await finish('exchange');

  await start('return');await go('customer','/orders');
  const returnOrder=page.locator('#order-return-order');await focus(returnOrder);
  await caption('02 / RETURN · Customer starts here','Delivered order GM-DEMO-RETURN-002 · Ivory linen shirt · Size M · ₹949.50.');
  await click(returnOrder.getByRole('button',{name:'Return / Refund',exact:true}));
  const refundForm=page.locator('.after-sales-dialog');await expect(refundForm.getByLabel('Refund destination')).toBeEnabled();
  await refundForm.getByLabel('Refund destination').selectOption('original');
  await refundForm.getByLabel('Reason',{exact:true}).fill('The fit is not right for me. Please return the shirt and refund the original payment.');
  await caption('Customer · Request an original-payment refund','Select the purchased item / quantity and refund destination. Submitting the request does not send money.');
  await click(refundForm.getByRole('button',{name:'Submit request',exact:true}));
  await expect(page.locator('#order-return-order').getByText('Return pickup — label being prepared',{exact:true})).toBeVisible();
  await focus(page.locator('#order-return-order').locator('.refund-tracker'));
  await caption('Customer · Return requested','The return is pending. Pickup and the label are being arranged; the refund has not started.');
  const returned=demo.db.prepare("SELECT * FROM return_requests WHERE type='refund'").get();
  await go('admin','/admin/notifications');await focus(page.getByText('Arrange return pickup',{exact:true}));
  await caption('Admin · Return-pickup notification','Admin receives the original order and customer context, then arranges the manual courier collection.');
  modal=await manage('GM-DEMO-RETURN-002','Admin · Prepare tracking before refund approval');
  await booking(modal,'DEMO-REF-RETURN-002');
  assert.equal((await demo.api.getReturnRequest(demo.env,returned.id)).status,'requested');
  await customerLabel('return-order','DEMO-REF-RETURN-002','refund-return-label.pdf');
  modal=await manage('GM-DEMO-RETURN-002','Admin · Approve the return request');
  await click(modal.getByRole('button',{name:'Manage request / approval'}));
  const approval=page.getByRole('dialog',{name:'Manage return'});
  await click(approval.getByRole('button',{name:'Approve request',exact:true}));
  await caption('Admin · Return approved','Approval allows the collection workflow. Saving a label or approving the request alone does not issue the refund.');
  await click(approval.getByRole('button',{name:'Close',exact:true}));
  await click(modal.getByText('Pickup, label and customer instructions',{exact:true}));
  await click(modal.getByRole('button',{name:'Mark picked up by courier',exact:true}));
  await expect(modal.getByText('Picked up by courier',{exact:true})).toBeVisible();
  await caption('Admin · Confirm physical courier pickup','An authorised owner may now process the refund. Courier pickup is not warehouse receipt.');
  const row=page.locator('.operations-list article').filter({hasText:'GM-DEMO-RETURN-002'});
  await focus(row.getByRole('button',{name:'Process refund',exact:true}));
  await caption('Admin · Process the approved refund','LOCAL SIMULATION: verify the original payment and submit exactly one ₹949.50 refund. No real gateway is contacted.');
  await click(row.getByRole('button',{name:'Process refund',exact:true}));
  await expect(row.getByText('Provider processing',{exact:true})).toBeVisible();
  assert.equal(demo.state.providerPosts,1);
  await caption('Admin · Provider processing','The simulated provider reports pending. Glamia does not mark the order refunded yet.');
  await go('customer','/orders');await focus(page.locator('#order-return-order').locator('.refund-tracker'));
  await caption('Customer · Track refund progress','Courier collection and provider processing are visible in the order’s refund tracker.');
  await go('admin','/admin/returns');
  await page.request.get(demo.base+'/__demo/provider-confirm');
  const refundRow=page.locator('.operations-list article').filter({hasText:'GM-DEMO-RETURN-002'});
  await focus(refundRow.getByRole('button',{name:'Check provider status',exact:true}));
  await caption('Admin · Check provider confirmation','The local provider fixture now reports processed. This check—not an optimistic UI change—confirms the refund.');
  await click(refundRow.getByRole('button',{name:'Check provider status',exact:true}));
  await expect(refundRow.getByText('Payment provider confirmed',{exact:true})).toBeVisible();
  await click(refundRow.getByRole('button',{name:'View refund log',exact:true}));
  await caption('Admin · Refund audit log','Approval, submission and verified provider outcome are recorded. The create request was sent only once.');
  assert.equal((await demo.api.getReturnRequest(demo.env,returned.id)).status,'refunded');
  await go('customer','/orders');const tracker=page.locator('#order-return-order').locator('.refund-tracker');
  await focus(tracker);await expect(tracker.getByRole('heading',{name:'Refund confirmed',exact:true})).toBeVisible();
  await caption('Customer · Refund confirmed','₹949.50 confirmed by the simulated provider. Actual bank posting time can differ.');
  const receipt=tracker.getByRole('link',{name:/Download refund receipt/});
  if(await receipt.count()) {const downloadPromise=page.waitForEvent('download');await click(receipt);await (await downloadPromise).saveAs(resolve(out,'refund-receipt.pdf'));}
  await caption('Customer · Keep the refund record','The request, return tracking and refund reference stay visible. All money in this recording is simulated.');
  await finish('return');
  assert.deepEqual(errors,[]);assert.deepEqual(demo.state.errors,[]);
  await writeFile(resolve(out,'chapters.json'),JSON.stringify(chapters,null,2));
  await writeFile(resolve(out,'verification.json'),JSON.stringify({browserErrors:errors,apiErrors:demo.state.errors,simulatedRefundSubmissions:demo.state.providerPosts,exchangeStatus:(await demo.api.getReturnRequest(demo.env,exchange.id)).status,refundStatus:(await demo.api.getReturnRequest(demo.env,returned.id)).status,productionRequests:0},null,2));
  console.log('PASS recorded both real-UI flows; one simulated refund; zero production traffic');
} catch(error) {
  if(page&&!page.isClosed())await page.screenshot({path:resolve(out,'recording-error.png'),fullPage:true});
  console.error('Local API errors:',JSON.stringify(demo.state.errors));throw error;
} finally {await browser.close();await demo.close();}
