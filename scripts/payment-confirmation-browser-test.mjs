// Production bundle, synthetic payment callbacks only. Never contacts gateways.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import {chromium,expect} from '@playwright/test';
const base='https://glamia-payment-confirmation.test',root=resolve('public');
const out='test-results/payment-confirmation';mkdirSync(out,{recursive:true});
const product={id:'local-product',name:'Night suit',status:'live',price:949,stock:5,sizes:['M'],size_stock:{M:5}};
const browser=await chromium.launch(),errors=[];
try {
  for(const [provider,width,theme] of [['phonepe',1440,'dark'],['phonepe',390,'light'],['razorpay',390,'dark']]) {
    let checks=0;const creates=[];
    const pending={provider,orderId:'local-order',checkoutToken:'local-checkout-token',response:{razorpay_order_id:'local-provider-order',razorpay_payment_id:'local-payment',razorpay_signature:'local-signature'}};
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    await context.addInitScript(({pending,theme})=>{
      sessionStorage.setItem('glamia-checkout-pending',JSON.stringify(pending));localStorage.setItem('glamia-theme',theme);
      localStorage.setItem('glamia-react-cart',JSON.stringify([{id:'local-product',size:'M',quantity:1}]));
    },{pending,theme});
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();
      if(url.pathname.startsWith('/api/')) {
        let data={products:[product],categories:[],slides:[],events:[],notifications:[],items:[],orders:[],requests:[],balance:0};
        if(url.pathname==='/api/session')data={user:null,needs_profile_completion:false};
        if(url.pathname==='/api/storefront-settings')data={payments:{methods:[{id:'phonepe'},{id:'razorpay'}]}};
        if(url.pathname.startsWith('/api/products/'))data={product};
        if(url.pathname==='/api/payments/create'){creates.push(url.pathname);return route.fulfill({status:500,json:{error:'No new payments permitted'}});}
        if(url.pathname==='/api/payments/phonepe/status'||url.pathname==='/api/payments/razorpay/verify') {
          assert.equal(provider==='phonepe'?url.searchParams.get('checkout_token'):req.postDataJSON().checkout_token,'local-checkout-token');
          checks++;data=checks===1?{payment_status:'pending'}:{payment_status:'paid',order:{id:'local-order',order_number:'GM-LOCAL-00001',status:'confirmed',payment_status:'paid',bill_available:true,tracking_token:'local-download-token'}};
          return route.fulfill({status:checks===1?202:200,json:data});
        }
        return route.fulfill({json:data});
      }
      let file=resolve(root,'.'+decodeURIComponent(url.pathname));if(relative(root,file).startsWith('..'))return route.abort();
      if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');
      return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png'}[extname(file)]||'application/octet-stream',body:readFileSync(file)});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/checkout');
    await expect(page.getByRole('region',{name:'Payment confirmation'})).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('still being confirmed');
    assert.equal(await page.getByRole('heading',{name:'Order placed'}).count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
    await page.screenshot({path:`${out}/${provider}-${width}-${theme}-pending.png`,fullPage:true});
    await expect(page.getByRole('heading',{name:'Order placed'})).toBeVisible({timeout:10000});
    assert.equal(checks,2);assert.equal(creates.length,0);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('glamia-checkout-pending')),null);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('glamia-react-cart')||'[]').length),0);
    await expect(page.getByRole('link',{name:'Download bill'})).toHaveAttribute('href',/token=local-download-token/);
    await page.screenshot({path:`${out}/${provider}-${width}-${theme}-confirmed.png`,fullPage:true});
    await context.close();console.log(`PASS ${provider} ${width}px ${theme}: automatic verification, no duplicate charge, bill, responsive layout`);
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
