// Real local SQLite/Worker functions; no production writes or external network.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { adminReturnsFixture, customer, staff } from './lib/admin-returns-fixture.mjs';
import { workerFunctions } from './lib/worker-fixture.mjs';

const base = 'http://127.0.0.1:5193';
const output = new URL('../test-results/support-return-access/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const care = { ...staff, employee_permissions: { support: true } };
async function audit(page, scope) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'no horizontal overflow');
  const result = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(result.violations.filter(v => ['serious','critical'].includes(v.impact)).map(v => ({ id:v.id, nodes:v.nodes.map(n=>n.failureSummary) })), []);
}
try {
  for (const [width, theme] of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark']]) {
    const f = await adminReturnsFixture();
    f.db.prepare("DELETE FROM order_items WHERE id='manual-line'").run();
    f.db.prepare('UPDATE products SET returnable=0 WHERE id=?').run(f.productId);
    f.db.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES('manual-line','manual-order',?,'Ivory linen shirt',949.5,1,'M')").run(f.productId);
    const worker = await workerFunctions(['createSupportTicket','supportTicketOrderContext','updateSupportReturnAccess','customerOrderReturnOptions','supportOrderContextData','listSupportTickets','listSupportMessages','createSupportMessage','listOrders','listReturns','createReturnRequest']);
    const customerContext = await browser.newContext({ viewport:{ width,height:1000 },reducedMotion:'reduce' });
    const adminContext = await browser.newContext({ viewport:{ width,height:1000 },reducedMotion:'reduce' });
    let ticket;
    async function routeContext(context, actor) {
      await context.addInitScript(theme => localStorage.setItem('glamia-theme',theme),theme);
      await context.route('**/*', async route => {
        const req=route.request(), url=new URL(req.url());
        if(url.origin!==base)return route.abort();
        if(!url.pathname.startsWith('/api/'))return route.continue();
        try {
          let response;
          const request=new Request(req.url(),{method:req.method(),...(req.postData()?{body:req.postData()}: {})});
          if(url.pathname==='/api/session')response=Response.json({user:actor,needs_profile_completion:false});
          if(url.pathname==='/api/orders')response=await worker.listOrders(f.env,actor,url.searchParams.get('scope'),url.searchParams);
          if(url.pathname==='/api/returns')response=await worker.listReturns(f.env,actor,url.searchParams.get('scope'));
          if(url.pathname==='/api/admin/support/tickets'||url.pathname==='/api/support/tickets') {
            if(req.method()==='POST') {response=await worker.createSupportTicket(request,f.env,actor);const data=await response.clone().json();ticket=data.ticket;}
            else response=await worker.listSupportTickets(f.env,actor,url.pathname.startsWith('/api/admin')?'admin':undefined);
          }
          if(url.pathname==='/api/orders/manual-order/support-context')response=Response.json(await worker.supportOrderContextData(f.env,f.db.prepare("SELECT * FROM orders WHERE id='manual-order'").get()));
          if(url.pathname==='/api/orders/manual-order/returns')response=req.method()==='POST'?await worker.createReturnRequest(request,f.env,actor,'manual-order'):await worker.customerOrderReturnOptions(f.env,actor,'manual-order');
          const messages=url.pathname.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
          if(messages)response=req.method()==='POST'?await worker.createSupportMessage(request,f.env,actor,messages[1]):await worker.listSupportMessages(f.env,actor,messages[1]);
          const contextRoute=url.pathname.match(/^\/api\/admin\/support\/tickets\/([^/]+)\/(order-context|return-access)$/);
          if(contextRoute)response=contextRoute[2]==='order-context'?await worker.supportTicketOrderContext(f.env,actor,contextRoute[1]):await worker.updateSupportReturnAccess(request,f.env,actor,contextRoute[1]);
          if(response)return route.fulfill({status:response.status,json:await response.json()});
          return route.fulfill({json:{stats:{},orders:[],products:[],categories:[],notifications:[],unread:0,balance:0,tickets:[],messages:[]}});
        } catch(error) {return route.fulfill({status:error.status||500,json:{error:error.message}});}
      });
    }
    try {
      await routeContext(customerContext,customer);await routeContext(adminContext,care);
      const buyer=await customerContext.newPage(),admin=await adminContext.newPage();
      await buyer.clock.install();
      for(const page of [buyer,admin])page.on('pageerror',error=>errors.push(error.message));
      await buyer.goto(base+'/support?order=GM-MANUAL-LOCAL&topic=return_exchange&item=manual-line');
      // The selected order is displayed automatically when the linked reference matches.
      const choose=buyer.getByRole('button',{name:'Choose order GM-MANUAL-LOCAL',exact:true});
      if(await choose.count())await choose.click();
      await expect(buyer.getByRole('checkbox',{name:'I need help with this product'})).toBeVisible();
      await expect(buyer.getByRole('checkbox',{name:'I need help with this product'})).toBeChecked();
      await buyer.getByRole('checkbox',{name:'I need help with this product'}).check();
      await buyer.getByLabel('Message',{exact:true}).fill('The purchased product arrived damaged. Please review an exception.');
      await buyer.getByRole('button',{name:'Send request',exact:true}).click();
      await expect(buyer.getByText('Your request is with the Glamia care team.')).toBeVisible();
      assert.deepEqual(ticket.referenced_line_ids,['manual-line']);
      await buyer.goto(base+'/orders');
      await buyer.getByRole('button',{name:'Return / Refund',exact:true}).click();
      await expect(buyer.getByText('Why you can’t submit yet')).toBeVisible();
      await expect(buyer.getByRole('button',{name:'Submit request',exact:true})).toBeDisabled();
      await expect(buyer.getByRole('button',{name:'Close',exact:true})).toBeFocused();
      await buyer.keyboard.press('Shift+Tab');
      await expect(buyer.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
      await buyer.keyboard.press('Tab');
      await expect(buyer.getByRole('button',{name:'Close',exact:true})).toBeFocused();
      assert.equal(await buyer.getByRole('option',{name:'Keep this item',exact:true}).count(),0);
      await expect(buyer.getByRole('link',{name:'Contact care about this order'})).toHaveAttribute('href',/order=GM-MANUAL-LOCAL.*topic=return_exchange/);
      await expect(buyer.getByRole('textbox',{name:'Reason',exact:true})).toHaveCount(0);
      await expect(buyer.getByRole('combobox',{name:'Refund destination'})).toHaveCount(0);
      await audit(buyer,'.after-sales-dialog');
      await buyer.screenshot({path:fileURLToPath(new URL(`customer-blocked-${width}-${theme}.png`,output)),fullPage:true});
      await admin.goto(base+'/admin/support');
      await expect(admin.getByText('Customer is asking about this item')).toBeVisible();
      await expect(admin.getByText('Non-returnable under standard policy')).toBeVisible();
      await admin.getByRole('checkbox',{name:'Select for an order-specific exception'}).check();
      await expect(admin.getByRole('button',{name:'Enable return for selected items'})).toBeDisabled();
      await admin.getByLabel('Internal reason',{exact:true}).fill('Damaged product confirmed in this customer conversation.');
      await admin.getByRole('button',{name:'Enable return for selected items'}).click();
      await expect(admin.getByText('Return access enabled. No refund or chat message was sent.')).toBeVisible();
      assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM support_messages').get().n,1);
      assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n,0);
      await admin.getByRole('button',{name:'Draft an update in chat'}).click();
      await expect(admin.getByRole('textbox',{name:'Reply',exact:true})).toHaveValue(/We’ve enabled a return exception/);
      assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM support_messages').get().n,1,'draft is not a message');
      await audit(admin,'.care-workspace');
      await admin.screenshot({path:fileURLToPath(new URL(`support-enabled-${width}-${theme}.png`,output)),fullPage:true});
      await buyer.clock.runFor(31000);
      await expect(buyer.getByText('Care enabled a return exception for this order')).toBeVisible();
      await buyer.getByRole('textbox',{name:'Reason',exact:true}).fill('Please retain my reason during the live update.');
      await buyer.getByRole('button',{name:'Refresh return eligibility'}).click();
      await expect(buyer.getByRole('textbox',{name:'Reason',exact:true})).toHaveValue('Please retain my reason during the live update.');
      await buyer.getByLabel('Quantity to return: Ivory linen shirt M').selectOption('1');
      await expect(buyer.getByRole('button',{name:'Submit request',exact:true})).toBeEnabled();
      await audit(buyer,'.after-sales-dialog');
      await buyer.getByRole('button',{name:'Submit request',exact:true}).click();
      await expect(buyer.getByText(/Return \/ refund request submitted/)).toBeVisible();
      assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n,1);
      assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gateway_refunds').get().n,0);
      console.log(`PASS customer context → care grant/manual draft → refresh and normal submission ${width}/${theme}`);
    } finally {await customerContext.close();await adminContext.close();f.db.close();}
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
