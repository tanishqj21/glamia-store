// Expo web rendering of the native screens. All API requests are intercepted;
// this does not authenticate against production or initiate real refunds.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
const root=resolve(process.env.SHOPPER_AFTER_SALES_EXPORT||fileURLToPath(new URL('../test-results/shopper-after-sales-web/',import.meta.url)));
const screenshots=fileURLToPath(new URL('../test-results/native-after-sales/',import.meta.url));
await mkdir(screenshots,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const file=path===root?resolve(root,'index.html'):path;
    res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();const errors=[];
const order={id:'local-native-order',order_number:'GM-NATIVE-LOCAL',status:'delivered',payment_status:'paid',payment_method:'razorpay',payment_gateway:'razorpay',total:600,created_at:'2026-10-01 10:00:00',updated_at:'2026-10-03 10:00:00',delivered_at:'2026-10-03 10:00:00',items:[{product_id:'same-product',name:'Night suit',size:'M',quantity:2},{product_id:'same-product',name:'Night suit',size:'L',quantity:1}]};
const initial={id:'native-local-return',order_id:order.id,type:'refund',status:'received',returned_at:'2026-10-03 10:00:00',refund_destination:'original',refund_amount:200,created_at:'2026-10-03 10:00:00',gateway_refund:{state:'pending',total:200,gateway_amount:150,credit_amount:50,provider:'razorpay'},logistics_json:JSON.stringify({pickup_status:'collected',carrier:'Local courier',tracking_number:'LOCAL-TRACKING',inspection_note:'Condition verified'})};
const items=[{line_id:'purchased-M',product_id:'same-product',product_name:'Night suit',size:'M',quantity:2,amount_paise:40000,returnable:true,available_sizes:[{size:'XL',stock:1}]},{line_id:'purchased-L',product_id:'same-product',product_name:'Night suit',size:'L',quantity:1,amount_paise:20000,returnable:true,available_sizes:[{size:'XL',stock:2}]}];
const piece={id:'same-product',name:'Local test piece',category:'Women',brand:'Glamia',color:'Sage Green',description:'Soft cotton.',specifications:'Colour: Sage Green\nMaterial: Cotton',status:'live',price:500,mrp:600,stock:8,sizes:['M','L'],size_stock:{M:4,L:4},rating:0,review_count:0};
try{
  for(const [width,theme] of [[390,'light'],[320,'dark']]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.addInitScript(theme=>localStorage.setItem('glamia_store_theme',theme),theme);
    const state={requests:[structuredClone(initial)],writes:[],failCreate:true,reads:0,catalog:[],bag:[]};
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(!url.pathname.startsWith('/api/'))return url.origin===base?route.continue():route.abort();
      const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,PUT,OPTIONS'};
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      let data={};let status=200;
      if(url.pathname==='/api/session')data={user:{email:'local-buyer@example.com',name:'Local buyer',role:'buyer'},needs_profile_completion:false};
      else if(url.pathname==='/api/orders')data={orders:state.replacement?[state.replacement,order]:[order]};
      else if(url.pathname==='/api/returns'){state.reads++;data={requests:state.requests};}
      else if(url.pathname===`/api/orders/${order.id}/returns`){
        if(req.method()==='GET')data={eligible:true,original_refund_available:true,refund_available:true,exchange_available:true,items};
        else{
          const payload=req.postDataJSON();state.writes.push(payload);
          if(state.failCreate){status=409;data={error:'Please recheck the order before submitting.'};state.failCreate=false;}
          else{
            const exchange=payload.type==='exchange';
            if(exchange)state.replacement={...order,id:'native-replacement',order_number:'GM-NATIVE-REPLACEMENT',status:'pending',total:0,payment_method:'replacement',payment_status:'not_required',isReplacement:true,order_type:'replacement',original_order_id:order.id,replacement_fulfilment_mode:'immediate',items:[{name:'Night suit',size:'XL',quantity:1}]};
            state.requests=[{...initial,status:exchange?'approved':'requested',gateway_refund:null,returned_at:null,type:payload.type,refund_destination:payload.refund_destination,refund_amount:200,selected_items_json:JSON.stringify(payload.items),...(exchange?{replacement_fulfilment_mode:'immediate',replacement_order_id:'native-replacement',replacement_order_number:'GM-NATIVE-REPLACEMENT',replacement_status:'pending'}:{})}];data={request:state.requests[0]};
          }
        }
      }
      else if(url.pathname==='/api/products'){state.catalog.push(url.searchParams.toString());data={products:url.searchParams.get('max_price')==='1'?[]:[piece],facets:{colors:['Sage Green'],sizes:['M','L']},pagination:{has_more:false,page:1,total:url.searchParams.get('max_price')==='1'?0:1}};}
      else if(url.pathname==='/api/products/same-product')data={product:piece,colourways:[]};
      else if(url.pathname==='/api/hero')data={slides:[]};
      else if(url.pathname==='/api/categories')data={categories:[]};
      else if(url.pathname==='/api/storefront-settings')data={announcement:{visible:false},active_event:null,customer_experience:{dispatch_min:2,dispatch_max:4,india_min:5,india_max:9},payments:{methods:[{id:'razorpay'}]}};
      else if(url.pathname==='/api/saved-items'||url.pathname==='/api/saved-items/merge'){
        if(req.method()!=='GET')state.bag=req.postDataJSON()?.cart||state.bag;
        data={cart:state.bag,wishlist:[],saved_for_later:[]};
      }
      else if(url.pathname==='/api/credits')data={balance:0};
      return route.fulfill({status,headers,json:data});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install();
    try{
      await page.goto(base);await page.getByRole('tab',{name:'Orders',exact:true}).click();
      await expect(page.getByText('Provider processing',{exact:true})).toBeVisible();
      await expect(page.getByText('Inspection: Condition verified')).toBeVisible();
      await expect(page.getByText(/LOCAL-TRACKING/)).toBeVisible();
      await expect(page.getByText('Return / exchange',{exact:true})).toHaveCount(0);
      const initialReads=state.reads;
      await page.clock.fastForward(60001);
      await expect.poll(()=>state.reads).toBeGreaterThan(initialReads);
      state.requests=[{...initial,refund_state:'review_required',gateway_refund:null}];
      await page.getByText('Refresh',{exact:true}).click();
      await expect(page.getByText('Refund needs review',{exact:true})).toBeVisible();
      state.requests=[{...initial,status:'refunded',refund_processed_at:'2026-10-03 10:00:00',gateway_refund:{...initial.gateway_refund,state:'processed',provider_refund_id:'rfnd_local'}}];
      await page.getByText('Refresh',{exact:true}).click();
      await expect(page.getByRole('button',{name:'Download refund receipt',exact:true})).toBeVisible();
      const terminalReads=state.reads;
      await page.clock.fastForward(60001);
      assert.equal(state.reads,terminalReads,'Verified terminal requests must stop polling');
      await page.screenshot({path:resolve(screenshots,`${theme}-${width}-confirmed.png`)});
      state.requests=[{...initial,status:'cancelled',gateway_refund:null}];
      await page.getByText('Refresh',{exact:true}).click();
      await page.getByText('Return / exchange',{exact:true}).click();
      await expect(page.getByRole('button',{name:'Original payment',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Return one fewer Night suit M',exact:true}).click();
      await page.getByRole('button',{name:'Return one fewer Night suit L',exact:true}).click();
      await page.getByRole('textbox',{name:'Reason for return or exchange'}).fill('This one item does not fit.');
      await expect(page.getByText(/Requested: INR 200.00/)).toBeVisible();
      await page.getByRole('button',{name:'Submit request',exact:true}).click();
      await expect(page.getByText('Please recheck the order before submitting.')).toBeVisible();
      await expect(page.getByRole('textbox',{name:'Reason for return or exchange'})).toHaveValue('This one item does not fit.');
      assert.deepEqual(state.writes[0].items,[{line_id:'purchased-M',quantity:1}]);
      assert.equal(state.writes[0].refund_destination,'original');
      await page.getByRole('button',{name:'Exchange size',exact:true}).click();
      await page.getByRole('button',{name:'Night suit · L',exact:true}).click();
      await page.getByRole('button',{name:'XL',exact:true}).click();
      await expect(page.getByText(/immediately places your ₹0 replacement for normal packing and delivery/)).toBeVisible();
      await page.screenshot({path:resolve(screenshots,`${theme}-${width}-exchange.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
      await page.getByRole('button',{name:'Submit request',exact:true}).click();
      assert.equal(state.writes[1].type,'exchange');
      assert.equal(state.writes[1].exchange_line_id,'purchased-L');
      assert.equal(state.writes[1].exchange_from_size,'L');
      assert.equal(state.writes[1].exchange_to_size,'XL');
      assert.deepEqual(state.writes[1].items,[{line_id:'purchased-L',quantity:1}]);
      await expect(page.getByText('Replacement placed · awaiting packing',{exact:true})).toBeVisible();
      await expect(page.getByText('Replacement Order (₹0)',{exact:true})).toBeVisible();
      await expect(page.getByText('Subtotal ₹0.00 · Tax ₹0.00 · Shipping ₹0.00 · Total ₹0.00',{exact:true})).toBeVisible();
      await page.screenshot({path:resolve(screenshots,`${theme}-${width}-immediate-replacement.png`),fullPage:true});
      await page.getByRole('tab',{name:'Explore',exact:true}).click();
      await page.getByRole('button',{name:'Low price first',exact:true}).click();
      await expect.poll(()=>state.catalog.some(q=>q.includes('sort=price_low'))).toBe(true);
      await page.getByRole('textbox',{name:'Max price',exact:true}).fill('1');
      await expect(page.getByText('Nothing matched that search.',{exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Clear filters',exact:true}).click();
      await page.getByRole('button',{name:'View Local test piece',exact:true}).first().click();
      await expect(page.getByText('New to Glamia',{exact:true})).toBeVisible();
      await expect(page.getByText(/Dispatch normally takes 2–4 business days/)).toBeVisible();
      await expect(page.getByText('Product details',{exact:true})).toBeVisible();
      await page.getByText('M',{exact:true}).click();
      await page.getByRole('button',{name:'Add to bag',exact:true}).click();
      await page.getByRole('tab',{name:'Explore',exact:true}).click();
      await expect(page.getByText('Recently viewed',{exact:true})).toBeVisible();
      await page.getByRole('tab',{name:'Bag',exact:true}).click();
      await page.getByRole('button',{name:'Continue to payment · ₹500',exact:true}).click();
      await expect(page.getByText('Review your order',{exact:true})).toBeVisible();
      await expect(page.getByText('Sage Green · M · Qty 1',{exact:true})).toBeVisible();
      await expect(page.getByText(/Dispatch normally takes 2–4 business days/)).toBeVisible();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'native checkout has no overflow');
      const review=await page.getByText('Review your order',{exact:true}).boundingBox(),payment=await page.getByText('Payment method.',{exact:true}).boundingBox();assert.ok(review.y<payment.y,'order review appears before payment');
      await page.screenshot({path:resolve(screenshots,`${theme}-${width}-checkout-review.png`),fullPage:true});
      console.log(`PASS native UI ${width} ${theme}: tracking, review, receipt, retry, partial quantities, exchange line identity, inline failure and no overflow`);
    }catch(error){
      await page.screenshot({path:resolve(screenshots,`${theme}-${width}-failure.png`)});
      console.error('Native UI failure:',errors,await page.locator('body').innerText());throw error;
    }finally{await context.close();}
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
