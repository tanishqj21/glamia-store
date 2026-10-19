// Actual Worker SQL and checkout with in-memory migrations. No network or live money.
import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase,workerFunctions} from './lib/worker-fixture.mjs';
import {productStoreUrl} from '../react-app/src/lib/commerce.js';
const functions=await workerFunctions(['listProducts','getProduct','createOrder','changeCustomerSavedItems','getCustomerSavedItems','renderPublicPage','canonicalProductPath']);
const buyer={email:'shared-buyer@example.com',name:'Buyer',role:'customer'};
const origins=['https://glamiastore.com','https://wibrawl.glamiastore.com'];
const address={name:'Buyer',phone:'+919876543210',line1:'123 Test Road',city:'New Delhi',state:'Delhi',pin:'110001',country:'India'};
function fixture(t){const local=localDatabase();t.after(()=>local.db.close());local.db.exec("UPDATE products SET status='hold'");
 for(const [id,visibility,price,status] of [['gm','glamia',300,'live'],['wb','wibrawl',200,'live'],['both','both',50,'live'],['draft','glamia',10,'hold']])local.db.prepare("INSERT INTO products(id,seller_email,name,category,subcategory,price,mrp,stock,sizes_json,status,storefront_visibility,image_url,brand,color,description) VALUES(?,'seller@example.com',?,'Tees','Graphic',?,?,5,'[\"M\"]',?,?, '/fixture.png','Fixture','Black','Fixture tee')").run(id,id,price,price,status,visibility);
 for(const id of ['gm','wb','both','draft'])local.db.prepare('INSERT INTO product_sizes(product_id,size,stock) VALUES(?,?,5)').run(id,'M');
 local.db.prepare('INSERT INTO users(email,google_sub,name) VALUES(?,?,?)').run(buyer.email,buyer.email,buyer.name);
 local.db.prepare("INSERT INTO store_credit_ledger(id,user_email,amount,kind,description,idempotency_key) VALUES('opening',?,2000,'opening','Fixture','opening')").run(buyer.email);return local;}
const request=(origin,body,path='/api/orders')=>new Request(origin+path,{method:'POST',body:JSON.stringify(body)});
test('explicit bag lookups span both stores; catalogues, hidden products and private fields remain protected',async t=>{
 const {env}=fixture(t);const params=new URLSearchParams('scope=cart&view=cards&include_stock=1&ids=gm,wb,both,draft');
 for(const store of ['glamia','wibrawl']){
  const bag=await(await functions.listProducts(env,null,'cart',params,store)).json();assert.deepEqual(bag.products.map(p=>p.id).sort(),['both','gm','wb']);assert.ok(bag.products.every(p=>p.size_stock.M===5&&!Object.hasOwn(p,'seller_email')));
  const catalog=await(await functions.listProducts(env,null,'public',new URLSearchParams('view=cards'),store)).json();assert.deepEqual(catalog.products.map(p=>p.id).sort(),['both',store==='glamia'?'gm':'wb']);
 }
 await assert.rejects(functions.listProducts(env,null,'cart',new URLSearchParams(),'wibrawl'),/Provide product IDs/);
 assert.equal((await functions.getProduct(env,null,'draft',null,'all')).status,404);
 assert.equal((await functions.getProduct(env,null,'gm',null,'all')).status,200);
});
test('one account merges products from both origins without erasing unrelated selections',async t=>{
 const {env}=fixture(t);for(const [origin,id]of [[origins[0],'gm'],[origins[1],'wb']]){const r=await functions.changeCustomerSavedItems(request(origin,{cart:[{id,size:'M',quantity:1}],wishlist:[]}),env,buyer,true);assert.equal(r.status,200);}
 const result=await(await functions.getCustomerSavedItems(env,buyer)).json();assert.deepEqual(result.cart.map(p=>p.id).sort(),['gm','wb']);
 const other=await(await functions.getCustomerSavedItems(env,{email:'other@example.com'})).json();assert.deepEqual(other.cart,[]);
 await functions.changeCustomerSavedItems(request(origins[1],{cart:[{id:'gm',size:'M',quantity:0}],wishlist:[]}),env,buyer,false);
 const after=await(await functions.getCustomerSavedItems(env,buyer)).json();assert.deepEqual(after.cart.map(p=>p.id),['wb']);
});
for(const origin of origins)test(`mixed checkout validates server prices, size stock and idempotency at ${origin}`,async t=>{
 const {db,env}=fixture(t);const body={items:[{id:'gm',size:'M',quantity:1,price:1},{id:'wb',size:'M',quantity:1,price:1}],payment_method:'store_credit',credits_used:500,checkout_token:'shared-bag-checkout-fixture-unique',address};
 const r=await functions.createOrder(request(origin,body),env,buyer);assert.equal(r.status,201,await r.clone().text());const order=(await r.json()).order;
 assert.match(order.order_number,origin===origins[0]?/^GM-/:/^WB-/);assert.equal(order.total,500);assert.equal(order.items.length,2);assert.equal(db.prepare("SELECT stock FROM products WHERE id='gm'").get().stock,4);assert.equal(db.prepare("SELECT stock FROM product_sizes WHERE product_id='wb' AND size='M'").get().stock,4);
 const again=await functions.createOrder(request(origin,body),env,buyer);assert.equal((await again.json()).idempotent,true);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);assert.equal(db.prepare('SELECT balance FROM store_credit_accounts WHERE user_email=?').get(buyer.email).balance,1500);
 for(const items of [[{id:'draft',size:'M',quantity:1}],[{id:'gm',size:'XXL',quantity:1}],[{id:'gm',size:'M',quantity:6}]])await assert.rejects(functions.createOrder(request(origin,{...body,checkout_token:crypto.randomUUID(),items}),env,buyer),e=>e.status===400);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
});
test('exclusive product links point to their store; shared products stay on the current store',()=>{
 const product={id:'tee',name:'Graphic tee',category:'Tees',subcategory:'Graphic'};
 assert.ok(productStoreUrl({...product,storefront_visibility:'glamia'},origins[1]).startsWith(origins[0]+'/'));
 assert.ok(productStoreUrl({...product,storefront_visibility:'wibrawl'},origins[0]).startsWith(origins[1]+'/'));
 assert.ok(productStoreUrl({...product,storefront_visibility:'both'},origins[1]).startsWith('/'));
});

test('wrong-store product pages redirect to the owning domain and preserve selected size',async t=>{
 const {db,env}=fixture(t);env.ASSETS={fetch:async()=>new Response('<html><head></head><body></body></html>')};
 for(const [id,from,to] of [['gm',origins[1],origins[0]],['wb',origins[0],origins[1]]]){
  const path=functions.canonicalProductPath(db.prepare('SELECT * FROM products WHERE id=?').get(id));
  const url=new URL(from+path+'?size=M');const r=await functions.renderPublicPage(new Request(url),env,url);
  assert.equal(r.status,302);assert.equal(r.headers.get('location'),to+path+'?size=M');
 }
});
