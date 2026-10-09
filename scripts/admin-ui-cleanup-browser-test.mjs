// Actual local React screens, with all API traffic intercepted. No live data or payouts.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base = process.env.ADMIN_UI_URL || 'http://127.0.0.1:5193';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = 'test-results/admin-ui-cleanup';
await mkdir(output, { recursive: true });
const routes = process.env.ADMIN_UI_ROUTES ? process.env.ADMIN_UI_ROUTES.split(',') : ['', 'storefront', 'about', 'events', 'hero', 'tax', 'coupons', 'credits', 'labels', 'employees', 'manage-store', 'add-product', 'products', 'bulk-listing', 'inventory', 'orders', 'completed-orders', 'categories', 'customers', 'reviews', 'questions', 'deals', 'returns', 'support', 'system', 'notifications'];
const product = { id: 'demo-product', product_code: 'GM-GLA-WOM-NIG-001', name: 'Night suit — Sage green', category: 'Women', subcategory: 'Nightsuits', brand: 'Glamia', color: 'Sage green', price: 949, mrp: 1299, stock: 17, status: 'live', sizes: ['M','L'], size_stock: { M: 9, L: 8 }, images: [], description: 'Soft everyday nightwear.', returnable: true, created_at: '2026-10-01T08:00:00Z' };
const order = { id: 'demo-order', order_number: 'GM-DEMO-001', customer_name: 'Meera Shah', customer_email: 'buyer@example.com', status: 'delivered', payment_status: 'paid', payment_method: 'razorpay', packing_status: 'packed', total: 949, created_at: '2026-10-01T08:00:00Z', items: [{ product_id: product.id, id: product.id, name: product.name, size: 'M', quantity: 1 }], shipping: { name:'Meera Shah', line1:'Demo address', city:'New Delhi', state:'Delhi', pin:'110001' } };
const customer = { id:'demo-customer', name: 'Meera Shah', email:'buyer@example.com', phone:'+919000000000', order_count:1, total_spent:949, created_at:'2026-10-01T08:00:00Z' };
const returnRequest = { id:'demo-return', order_id:order.id, order, customer_name:customer.name, customer_email:customer.email, type:'refund', status:'approved', reason:'The fit was not right for me.', refund_destination:'original', refund_amount:949, created_at:'2026-10-02T08:00:00Z', selected_items_json:JSON.stringify([{product_name:product.name,size:'M',quantity:1}]), logistics_json:JSON.stringify({carrier:'Demo courier', instructions:'Pack securely and attach the label.', pickup_status:'scheduled', pickup_at:'2026-10-04T04:30:00Z'}), label_available:true };
const ticket = { id:'demo-ticket', ticket_number:'SUP-DEMO-001', subject:'Help with my return', customer_name:customer.name, customer_email:customer.email, status:'open', priority:'normal', created_at:order.created_at };
const permissions = Object.fromEntries(['packing','dashboard','storefront','hero','cinematic_reel','events','tax','coupons','credits','labels','employees','manage_store','orders','products','add_product','bulk_listing','inventory','customers','reviews','questions','deals','categories','returns','support','system','notifications'].map(key=>[key,true]));
const findings = [], errors = [], writes = [], unknown = new Set();
const browser = await chromium.launch();
function dataFor(path) {
  if(path==='/api/session') return {user:{id:'demo-owner',email:'owner@example.com',name:'Demo owner',role:'admin',is_owner:true},needs_profile_completion:false};
  if(path==='/api/products') return {products:[product],pagination:{page:1,total:1,total_pages:1,has_more:false}};
  if(path==='/api/orders') return {orders:[order],pagination:{page:1,total:1,total_pages:1,has_more:false}};
  if(path==='/api/categories') return {categories:['Women','Kids'],subcategories:[{category:'Women',name:'Nightsuits'}]};
  if(path==='/api/returns') return {requests:[returnRequest],gateway_refunds_enabled:true,automatic_gateway_refunds_enabled:true};
  if(path==='/api/admin/about') return {eyebrow:'Our story',title:'Made for everyday life.',intro:'The Glamia story.',signoff:'With care, Glamia',timeline:[{id:'moment-demo',period:'2026',title:'The first collection',body:'Thoughtful pieces for everyday wardrobes.'}]};
  if(path==='/api/admin/credits') return {authority:{whitelisted:true,remaining:null,daily_limit:null,granted:150},settings:{referral_reward:50,referred_reward:100},approvals:[],ledger:[],referrals:[],leaderboard:[],customers:[{...customer,balance:100}]};
  if(path==='/api/admin/employees') return {management:{can_create_admin:true,permissions,positions:[{id:'manager',label:'Manager'},{id:'packing_staff',label:'Packing staff'}]},employees:[{id:'demo-employee',employee_code:'GM_PACK_01',employee_email:'packer@example.com',name:'Asha Mehta',position:'packing_staff',active:true,can_manage:true,permissions:{packing:true},created_at:order.created_at}]};
  if(path==='/api/admin/customers') return {customers:[customer]};
  if(path==='/api/admin/coupon-recipients') return {recipients:[customer]};
  if(path==='/api/admin/reviews') return {reviews:[{id:'review-demo',product_name:product.name,user_name:customer.name,rating:5,comment:'Comfortable fit and fabric.',status:'visible',created_at:order.created_at}]};
  if(path==='/api/admin/questions') return {questions:[{id:'question-demo',product_name:product.name,customer_name:customer.name,question:'Is this machine washable?',answer:'Use a gentle wash.',status:'visible',created_at:order.created_at}]};
  if(path==='/api/admin/support/tickets') return {tickets:[ticket]};
  if(path==='/api/support/tickets/demo-ticket/messages') return {messages:[{id:'message-demo',sender_role:'customer',message:'Can you help me arrange a return?',created_at:order.created_at}]};
  if(path==='/api/admin/tax-compliance') return {settings:{},summary:{},products:[],sales:[],orders:[]};
  if(path==='/api/health') return {ok:true,email_delivery:'configured',latency_ms:11};
  if(path==='/api/admin/hero/insights') return {recommendations:{},return_note:'Demo store activity.'};
  if(path==='/api/admin/storefront-settings'||path==='/api/storefront-settings') return {announcement:{visible:true,text:'Shipping across India.',items:[]},fulfillment:{warehouse_address:'Glamia warehouse'},seo:{title:'Glamia',description:'Everyday pieces.'},socials:{instagram:'https://www.instagram.com/_glamiastore/'}};
  const emptyPaths = ['/api/admin/hero','/api/hero','/api/admin/cinematic-reel','/api/admin/events','/api/events','/api/admin/coupons','/api/admin/dashboard','/api/admin/notifications','/api/admin/notifications/count','/api/admin/email-events','/api/profile','/api/auth/config','/api/credits'];
  if(!emptyPaths.includes(path)) unknown.add(path);
  return {stats:{},totals:{},products:[],categories:[],slides:[],events:[],coupons:[],notifications:[],unread_count:0,tickets:[],requests:[],balance:0,transactions:[],recommendations:{},health:{ok:true},settings:{}};
}
try {
  for(const [width,theme] of [[1440,'light'],[390,'light'],[320,'dark']]) {
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    context.setDefaultTimeout(12000);
    await context.addInitScript(theme=>localStorage.setItem('glamia-theme',theme),theme);
    let failMutation=false,failOrders=false,lastLogistics=null;
    await context.route('**/*', async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==new URL(base).origin)return route.abort();
      if(!url.pathname.startsWith('/api/'))return route.continue();
      if(!['GET','HEAD'].includes(request.method())) {
        if(url.pathname==='/api/analytics/track')return route.fulfill({json:{ok:true}});
        writes.push(url.pathname);
        if(url.pathname.endsWith('/logistics'))lastLogistics=request.postDataJSON();
        if(failMutation)return route.fulfill({status:500,json:{error:'Demo save failed. Your inputs are preserved.'}});
        if(url.pathname.endsWith('/logistics'))return route.fulfill({json:{request:{...returnRequest,logistics_json:request.postData()}}});
        return route.fulfill({status:409,json:{error:'Demo action blocked.'}});
      }
      if(failOrders&&url.pathname==='/api/orders')return route.fulfill({status:500,json:{error:'Demo orders temporarily unavailable'}});
      return route.fulfill({json:dataFor(url.pathname)});
    });
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    for(const section of routes) {
      const path='/admin'+(section?'/'+section:'');
      await page.goto(base+path);
      await expect(page.locator('.admin-react-page')).toBeVisible();
      await expect(page.locator('#initial-loader')).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      if(section==='returns') {
        await page.getByText('Pickup, label and customer instructions',{exact:true}).click();
        const widths=await page.locator('.return-logistics-grid input:not([type=file]), .return-logistics-grid select, .return-logistics-grid textarea').evaluateAll(nodes=>nodes.map(node=>({label:node.closest('label')?.firstChild?.textContent,width:node.getBoundingClientRect().width})));
        assert.ok(widths.every(field=>field.width>=160),`Return fields must remain usable: ${JSON.stringify(widths)}`);
      }
      if(section==='orders')await page.locator('.admin-order-card-summary').first().click();
      const overflow=await page.evaluate(()=>({body:document.documentElement.scrollWidth>innerWidth+2,nodes:[...document.querySelectorAll('.admin-react-page *')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+2||r.left< -2)&&getComputedStyle(n).position!=='absolute';}).slice(0,8).map(n=>({tag:n.tagName,cls:n.className}))}));
      if(overflow.body)findings.push({path,width,theme,...overflow});
      if(['returns','storefront','employees','orders','coupons','hero'].includes(section)&&width!==390)await page.locator('.admin-react-page').screenshot({path:`${output}/${section}-${width}-${theme}.png`,animations:'disabled'});
      console.log(`${overflow.body?'FAIL':'PASS'} layout ${path} ${width}/${theme}`);
    }
    await page.goto(base+'/admin/returns');
    await page.getByLabel('Browse more admin sections').click();
    await page.getByLabel('Find a section',{exact:true}).fill('Employees');
    await expect(page.locator('.admin-nav-menu').getByRole('button',{name:'Employees',exact:true})).toBeVisible();
    const bounds=await page.locator('.admin-nav-menu').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,'Section menu stays inside viewport');
    await page.keyboard.press('Escape');
    await expect(page.locator('.admin-nav-more')).not.toHaveAttribute('open','');
    await page.getByLabel('Browse more admin sections').click();
    await page.getByLabel('Find a section',{exact:true}).fill('not-a-section');
    await expect(page.getByText('No matching sections. Try another search.')).toBeVisible();
    await page.getByLabel('Find a section',{exact:true}).fill('returns');
    await page.locator('.admin-nav-menu').getByRole('button',{name:'Returns',exact:true}).click();
    if(!await page.locator('.return-logistics').evaluate(node=>node.open)) await page.getByText('Pickup, label and customer instructions',{exact:true}).click();
    const instruction=page.getByRole('textbox',{name:'Return instructions',exact:true});
    const labelUpload=page.locator('.return-logistics input[type=file]');
    await labelUpload.setInputFiles({name:'courier-label.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nDemo local label')});
    await expect(page.getByText('courier-label.pdf selected; upload when you save.')).toBeVisible();
    await labelUpload.setInputFiles({name:'invalid-label.txt',mimeType:'text/plain',buffer:Buffer.from('Not a PDF')});
    await expect(page.getByRole('alert').filter({hasText:'Choose a PDF label up to 2 MB'})).toBeVisible();
    await instruction.fill('Keep these instructions after a failed save.');
    failMutation=true;
    await page.getByRole('button',{name:'Save return instructions',exact:true}).click();
    await expect(page.getByText('Demo save failed. Your inputs are preserved.')).toBeVisible();
    await expect(instruction).toHaveValue('Keep these instructions after a failed save.');
    failMutation=false;
    await page.getByRole('button',{name:'Save return instructions',exact:true}).click();
    await expect(page.locator('.admin-save-toast')).toBeVisible();
    assert.equal(lastLogistics.label_base64,undefined,'Invalid replacement must never upload the previously selected PDF');
    await page.goto(base+'/admin/support');
    await page.getByRole('textbox',{name:'Reply',exact:true}).fill('A demo reply that should remain after failure.');
    failMutation=true;
    await page.getByRole('button',{name:'Send reply',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:'Demo save failed'})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'Reply',exact:true})).toHaveValue('A demo reply that should remain after failure.');
    console.log(`PASS navigation search, menu bounds, Escape, failed-save preservation and feedback ${width}/${theme}`);
    const axe=await new AxeBuilder({page}).include('.admin-react-page').withTags(['wcag2a','wcag2aa']).analyze();
    const serious=axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));
    if(serious.length)findings.push({path:'/admin/support',width,accessibility:serious});
    failOrders=true;
    await page.goto(base+'/admin/orders');
    await expect(page.getByRole('alert').filter({hasText:'Demo orders temporarily unavailable'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Open admin sign-in'})).toHaveCount(0);
    failOrders=false;
    await page.getByRole('button',{name:'Retry loading',exact:true}).click();
    await expect(page.locator('.admin-order-card-summary')).toHaveCount(1);
    console.log(`PASS invalid PDF preservation and failed-load retry ${width}/${theme}`);
    await context.close();
  }
  await writeFile(`${output}/audit.json`,JSON.stringify({findings,errors,writes,unknown:[...unknown]},null,2));
  assert.deepEqual(errors,[],'No React runtime errors');
  assert.deepEqual(findings,[],'No overflow or serious accessibility failures');
  console.log(`PASS ${routes.length*3} route layouts and local interactive checks; no live API was accessed.`);
} finally {await browser.close();}
