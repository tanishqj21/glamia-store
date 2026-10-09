// Real website components, isolated local API fixtures. No external requests/payments.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
const base='http://127.0.0.1:5197';
const output=new URL('../test-results/customer-improvements/',import.meta.url);mkdirSync(output,{recursive:true});
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2kAAAAASUVORK5CYII=';
const product=(id,name,price=500)=>({id,name,category:'Women',brand:'Glamia',description:'Soft cotton.',color:'Sage Green',status:'live',price,mrp:600,stock:10,sizes:['M','L'],size_stock:{M:5,L:5},image_url:image,thumbnail_url:image,images:[image],rating:0,review_count:0});
const products=[product('piece-a','First piece'),product('piece-b','Second piece')];
const order={id:'cx-order',order_number:'GM-LOCAL-CX',customer_email:'buyer@example.com',customer_name:'Local buyer',status:'delivered',payment_status:'paid',payment_method:'razorpay',total:500,created_at:'2026-10-01T10:00:00Z',delivered_at:'2026-10-03T10:00:00Z',items:[{id:'piece-a',name:'First piece',color:'Sage Green',size:'M',quantity:1}]};
const ticket=id=>({id,ticket_number:`GM-SUPPORT-${id}`,subject:`Question ${id}`,status:'open',priority:'normal',created_at:'2026-09-01 10:00:00',updated_at:'2026-09-01 10:00:00'});
const browser=await chromium.launch();const errors=[];
try{
  for(const [width,theme]of [[1440,'light'],[390,'dark'],[320,'light']]){
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    const state={catalog:[],tickets:0,messages:0,mutations:[],reply:'Initial customer question',delayMessages:false};
    await context.addInitScript(({theme})=>{
      localStorage.setItem('glamia-theme',theme);
      localStorage.setItem('glamia-recently-viewed',JSON.stringify(['piece-b']));
      localStorage.setItem('glamia-react-cart',JSON.stringify([{id:'piece-a',size:'M',quantity:1}]));
      localStorage.setItem('glamia-saved-sync-user','buyer@example.com');
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden||false});
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__hidden?'hidden':'visible'});
    },{theme});
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==base)return route.abort();
      if(!url.pathname.startsWith('/api/'))return route.continue();
      let data={products:[],orders:[],requests:[],tickets:[],messages:[],categories:[],slides:[],balance:0};
      if(req.method()!=='GET'&&url.pathname!=='/api/analytics/track')state.mutations.push({path:url.pathname,body:req.postDataJSON()});
      if(url.pathname==='/api/session')data={user:{email:'buyer@example.com',name:'Local buyer',role:'buyer'},needs_profile_completion:false};
      else if(url.pathname==='/api/storefront-settings')data={announcement:{visible:false},trust_strip:{visible:false},customer_experience:{dispatch_min:2,dispatch_max:4,delhi_min:3,delhi_max:6,india_min:5,india_max:9,support_hours:24},payments:{methods:[{id:'razorpay'}]}};
      else if(url.pathname==='/api/categories')data={categories:[{name:'Women'}]};
      else if(url.pathname==='/api/products'){
        state.catalog.push(url.searchParams.toString());
        const ids=url.searchParams.get('ids'),filtered=url.searchParams.get('max_price')==='1';
        const page=Number(url.searchParams.get('page')||1);
        data={products:ids?products.filter(p=>ids.split(',').includes(p.id)):filtered?[]:url.searchParams.get('facets')==='1'?[products[page===2?1:0]]:products,facets:{colors:['Sage Green'],sizes:['M','L']},pagination:{page,total:filtered?0:2,has_more:!filtered&&!ids&&page===1}};
      }else if(url.pathname==='/api/products/piece-a')data={product:products[0],colourways:[]};
      else if(url.pathname==='/api/orders')data={orders:[order]};
      else if(url.pathname==='/api/saved-items'||url.pathname==='/api/saved-items/merge')data={cart:[{id:'piece-a',size:'M',quantity:1}],wishlist:[],saved_for_later:[]};
      else if(url.pathname==='/api/orders/cx-order/returns')data={eligible:true,refund_available:true,exchange_available:true,original_refund_available:true,items:[{line_id:'line-a',product_id:'piece-a',product_name:'First piece',size:'M',quantity:1,returnable:true,amount_paise:50000,available_sizes:[{size:'L',stock:5}]}]};
      else if(url.pathname==='/api/support/tickets'){state.tickets++;data={tickets:[ticket('a'),ticket('b')]};}
      else if(url.pathname.endsWith('/messages')){
        state.messages++;const id=url.pathname.includes('/a/')?'a':'b';
        if(state.delayMessages)await new Promise(resolve=>setTimeout(resolve,350));
        data={messages:[{id:'message-'+id,sender_role:'customer',message:id==='a'?state.reply:'Different conversation',created_at:'2026-09-01 10:00:00'}]};
      }
      return route.fulfill({json:data});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.install();
    try{
      await page.goto(base+'/just-arrived');
      await expect(page.locator('.product-grid')).toContainText('First piece');
      await page.getByRole('button',{name:'Load more pieces',exact:true}).click();
      await expect(page.locator('.product-grid')).toContainText('Second piece');
      await page.getByLabel('Sort',{exact:true}).selectOption('price_low');
      await expect.poll(()=>state.catalog.some(q=>q.includes('sort=price_low')&&q.includes('page=1'))).toBe(true);
      await page.getByLabel('Max price',{exact:true}).fill('1');
      await expect(page.getByRole('heading',{name:'No pieces match these filters'})).toBeVisible();
      await page.getByRole('button',{name:'Clear filters',exact:true}).click();
      await expect(page.locator('.product-grid')).toContainText('First piece');
      await expect(page.getByRole('heading',{name:'Recently viewed',exact:true})).toBeVisible();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'catalogue overflow');
      await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-catalogue.png`,output))});

      await page.goto(base+'/support');
      await expect(page.getByText('Initial customer question',{exact:true})).toBeVisible();
      await expect(page.getByText(/Reply target: 24 hours/)).toBeVisible();
      await expect(page.getByRole('button',{name:'Request priority review',exact:true})).toBeVisible();
      const reads=state.tickets;state.reply='Care thread updated';await page.clock.fastForward(31000);
      await expect.poll(()=>state.tickets).toBeGreaterThan(reads);
      await expect(page.getByText('Care thread updated',{exact:true})).toBeVisible();
      await page.evaluate(()=>{window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
      const hidden=state.tickets;await page.clock.fastForward(90000);assert.equal(state.tickets,hidden);
      await page.evaluate(()=>{window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
      await expect.poll(()=>state.tickets).toBeGreaterThan(hidden);
      state.delayMessages=true;
      await page.getByRole('button',{name:/Question b/}).click();
      await expect(page.getByText('Care thread updated',{exact:true})).toHaveCount(0);
      await expect(page.getByText('Different conversation',{exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Start a return or exchange',exact:true}).click();
      await page.getByRole('button',{name:'Choose order GM-LOCAL-CX',exact:true}).click();
      await expect(page.getByRole('region',{name:'Selected order'})).toContainText('First piece');
      await page.getByRole('button',{name:'Choose items and refund / exchange',exact:true}).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByLabel('Quantity to return: First piece M')).toBeVisible();
      await page.getByRole('button',{name:'Close',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'support overflow');
      await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-support.png`,output))});

      await page.goto(base+'/checkout');
      await expect(page.locator('.checkout-summary')).toContainText('Sage Green');
      await expect(page.locator('.checkout-summary')).toContainText('Free');
      await expect(page.locator('.checkout-summary')).toContainText('2–4 business days');
      await expect(page.locator('.checkout-item-thumb')).toHaveCount(1);
      const before=await page.evaluate(()=>document.querySelector('.checkout-summary').getBoundingClientRect().top<document.querySelector('.payment-methods').getBoundingClientRect().top);assert.equal(before,true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'checkout overflow');
      await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-checkout.png`,output)),fullPage:true});
      assert.deepEqual(state.mutations.filter(x=>!x.path.startsWith('/api/saved-')&&x.path!=='/api/coupons/available'),[],'No financial/support writes are made by browsing or opening a form');
      console.log(`PASS customer improvements ${width}/${theme}: full-catalogue pagination/filter/sort, empty/reset, recents, live/hidden support, ticket isolation, actual request dialog, pre-payment review, no overflow`);
    }catch(error){await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-failure.png`,output))});console.error(await page.locator('body').innerText());throw error;}
    finally{await context.close();}
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
