// The actual Wibrawl presentation and shared payment controller, with isolated providers.
import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const base='http://127.0.0.1:8788';let browser,html;
before(async()=>{
 const bundle=await build({stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Checkout from './react-app/src/components/WibrawlCheckoutPage.jsx';function App(){const [cart,setCart]=useState(window.fixture.cart);return <Checkout {...window.fixture} cart={cart} onNavigate={path=>window.navigation=path} onOrderPlaced={()=>{window.placed=(window.placed||0)+1;setCart([]);}} onCouponApplied={()=>{}} onCouponRemoved={()=>{}} />;}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
 html=`<!doctype html><html><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`;browser=await chromium.launch();
});
after(async()=>browser?.close());
async function mount(t,{pending=false,credits=false,bill=true}={}) {
 const context=await browser.newContext(),page=await context.newPage(),requests=[],errors=[];let checks=0;
 const product={id:'tee',name:'Wibrawl Tee',status:'live',price:500,stock:4,sizes:['M'],size_stock:{M:4}};
 const user={email:'buyer@example.com',name:'Buyer'};
 await context.addInitScript(({fixture,pending,credits})=>{window.fixture=fixture;if(pending)sessionStorage.setItem('glamia-checkout-pending',JSON.stringify({provider:'phonepe',orderId:'wb-order',checkoutToken:'existing-token'}));if(credits)sessionStorage.setItem('wibrawl-use-credits:buyer@example.com','1');},{fixture:{cart:pending?[]:[{id:'tee',size:'M',quantity:1}],products:[product],user,addresses:[{id:'home',name:'Buyer',phone:'+919876543210',line1:'10 Street',city:'Pune',state:'Maharashtra',country:'India',pin:'411001'}]},pending,credits});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());assert.equal(url.origin,base,'No external services permitted');
  if(url.pathname==='/__wb-checkout')return route.fulfill({contentType:'text/html',body:html});
  const body=request.postDataJSON();requests.push({path:url.pathname,body,search:url.search});let data={};
  if(url.pathname==='/api/products/tee')data={product};
  else if(url.pathname==='/api/storefront-settings')data={payments:{methods:[{id:'razorpay'},{id:'phonepe'}]}};
  else if(url.pathname==='/api/loyalty')data={balance:credits?500:0};
  else if(url.pathname==='/api/coupons/available')data={coupons:[]};
  else if(url.pathname==='/api/payments/create')data=credits?{order:{id:'wb-order',order_number:'WB-2026-9',status:'confirmed',payment_status:'paid',bill_available:bill,tracking_token:'private&token'}}:{order:{id:'wb-order',order_number:'WB-2026-9'},payment:{provider:'razorpay',key_id:'test-key',order_id:'gateway1',amount:50000,currency:'INR',checkout_script:`${base}/__razorpay.js`}};
  else if(url.pathname==='/__razorpay.js')return route.fulfill({contentType:'text/javascript',body:`window.Razorpay=class{constructor(options){window.razor=options;}on(){}open(){}}`});
  else if(url.pathname==='/api/payments/razorpay/verify')data={payment_status:'paid',order:{id:'wb-order',order_number:'WB-2026-9',status:'confirmed',payment_status:'paid',bill_available:bill,tracking_token:'private&token'}};
  else if(url.pathname==='/api/payments/phonepe/status')data=++checks<2?{payment_status:'pending'}:{payment_status:'paid',order:{id:'wb-order',order_number:'WB-2026-9',payment_status:'paid',status:'confirmed',bill_available:bill,tracking_token:'private&token'}};
  await route.fulfill({json:data});
 });
 page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});await page.goto(`${base}/__wb-checkout`);return {page,requests};
}
test('Wibrawl Razorpay callback verifies before clearing the bag and exposes guest-safe bill URL',async t=>{
 const {page,requests}=await mount(t);const pay=page.getByRole('button',{name:'Pay securely / ₹500',exact:true});await expect(pay).toBeEnabled();await pay.click();await page.waitForFunction(()=>!!window.razor);assert.equal(await page.evaluate(()=>window.placed||0),0);await page.evaluate(()=>window.razor.handler({razorpay_order_id:'gateway1',razorpay_payment_id:'payment1',razorpay_signature:'signature'}));await expect(page.getByRole('heading',{name:'Your drop is confirmed.',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Download bill (PDF)',exact:true})).toHaveAttribute('href','/api/orders/wb-order/bill?token=private%26token');assert.equal(await page.evaluate(()=>window.placed),1);assert.equal(requests.filter(r=>r.path==='/api/payments/create').length,1);
});
test('Wibrawl resumes PhonePe with an empty cart, locks payment and confirms the existing attempt',async t=>{
 const {page,requests}=await mount(t,{pending:true,bill:false});await expect(page.getByRole('button',{name:'Check payment status',exact:true})).toBeEnabled();await expect(page.locator('button[form="wb-checkout-form"]')).toBeDisabled();assert.equal(await page.evaluate(()=>window.placed||0),0);await page.getByRole('button',{name:'Check payment status',exact:true}).click();await expect(page.getByRole('heading',{name:'Your drop is confirmed.',exact:true})).toBeVisible();await expect(page.getByText(/Your bill is being prepared/)).toBeVisible();assert.equal(requests.filter(r=>r.path==='/api/payments/create').length,0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('glamia-checkout-pending')),null);
});
test('persisted credit choice covers checkout without opening a provider',async t=>{
 const {page,requests}=await mount(t,{credits:true});await expect(page.getByRole('checkbox',{name:/Apply ₹500 Wibrawl/})).toBeChecked();const submit=page.getByRole('button',{name:'Place order with credits',exact:true});await expect(submit).toBeEnabled();await submit.click();await expect(page.getByRole('heading',{name:'Your drop is confirmed.',exact:true})).toBeVisible();const payload=requests.find(r=>r.path==='/api/payments/create').body;assert.equal(payload.payment_method,'store_credit');assert.equal(payload.credits_used,500);assert.equal(await page.evaluate(()=>!!window.razor),false);
});
