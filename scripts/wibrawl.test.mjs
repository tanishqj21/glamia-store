// Real migrations and checkout functions; no live payments, inventory or users.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { isWibrawlUrl, preferredWibrawlTheme, WIBRAWL_ORIGIN } from '../src/storefront-identity.js';

const worker = await workerFunctions(['listProducts', 'getProduct', 'validateCoupon', 'listAvailableCoupons', 'createCoupon', 'createOrder', 'renderPublicPage', 'getSitemap', 'getRobots', 'withSecurityHeaders', 'canonicalProductPath', 'formatProduct']);
const buyer = { email: 'buyer@example.com', name: 'Buyer', role: 'seller' };
const req = (origin, body, path = '/api/orders') => new Request(origin + path, { method: 'POST', body: JSON.stringify(body) });
function fixture(t) {
  const local = localDatabase(); t.after(() => local.db.close());
  local.db.exec("UPDATE products SET status='hold'");
  for (const [id, visibility] of [['wb', 'wibrawl'], ['gm', 'glamia'], ['shared', 'both']]) {
    local.db.prepare(`INSERT INTO products(id,seller_email,name,category,brand,price,mrp,stock,color,sizes_json,image_url,description,status,storefront_visibility,variant_group)
      VALUES(?, 'seller@example.com', ?, 'Custom admin category', 'Fixture', 100, 100, 50, 'Black', '[]', '/fixture.png', 'Local fixture', 'live', ?, 'scope-fixture')`).run(id, id, visibility);
  }
  local.db.prepare('INSERT INTO users(email,google_sub,name) VALUES(?,?,?)').run(buyer.email, buyer.email, buyer.name);
  local.db.prepare("INSERT INTO store_credit_ledger(id,user_email,amount,kind,description,idempotency_key) VALUES('opening',?,1000,'opening','Fixture','opening')").run(buyer.email);
  local.env.ASSETS = { fetch: async () => new Response(readFileSync('public/index.html', 'utf8')) };
  return local;
}

test('only the registered host and local preview select Wibrawl', () => {
  assert.equal(isWibrawlUrl(WIBRAWL_ORIGIN), true);
  assert.equal(isWibrawlUrl('https://glamiastore.com/?wibrawl-preview=1'), false);
  assert.equal(isWibrawlUrl('https://wibrawl.glamiastore.com.attacker.test'), false);
  assert.equal(isWibrawlUrl('http://127.0.0.1:5174/?wibrawl-preview=1'), true);
  assert.equal(preferredWibrawlTheme(null, true), 'gaming');
  assert.equal(preferredWibrawlTheme(null, false), 'sports');
  assert.equal(preferredWibrawlTheme('gaming', false), 'gaming');
  assert.equal(preferredWibrawlTheme('sports', true), 'sports');
});

test('catalog and colourways obey admin storefront visibility', async t => {
  const {env} = fixture(t);
  const params = new URLSearchParams('view=cards&include_stock=1&limit=24');
  const wb = await (await worker.listProducts(env, null, '', params, 'wibrawl')).json();
  const gm = await (await worker.listProducts(env, null, '', params, 'glamia')).json();
  assert.deepEqual(wb.products.map(p => p.id).sort(), ['shared', 'wb']);
  assert.deepEqual(gm.products.map(p => p.id).sort(), ['gm', 'shared']);
  const product = await (await worker.getProduct(env, null, 'wb', null, 'wibrawl')).json();
  assert.deepEqual(product.colourways.map(p => p.id).sort(), ['shared', 'wb']);
  assert.equal((await worker.getProduct(env, null, 'gm', null, 'wibrawl')).status, 404);
});

test('coupons validate and list against Wibrawl inventory', async t => {
  const {env} = fixture(t);
  assert.equal((await worker.createCoupon(req(WIBRAWL_ORIGIN, {code:'TEST',type:'flat',value:10,allow_store_credits:true,usage_limit:null}), env)).status, 201);
  const body = {code:'TEST',items:[{id:'wb',quantity:1}]};
  const response = await worker.validateCoupon(req(WIBRAWL_ORIGIN, body), env, buyer);
  assert.equal(response.status, 200); assert.equal((await response.json()).discount, 10);
  const offers = await (await worker.listAvailableCoupons(req(WIBRAWL_ORIGIN, body),env,buyer)).json();
  assert.ok(offers.coupons.some(coupon => coupon.code === 'TEST'));
  assert.equal((await worker.validateCoupon(req('https://glamiastore.com',body),env,buyer)).status,400);
});

test('real credit checkout creates VB orders and keeps GM orders separate', async t => {
  const {db,env} = fixture(t);
  const purchase = (origin,id,token) => worker.createOrder(req(origin, {
    items:[{id,quantity:1}], payment_method:'store_credit',credits_used:100,
    checkout_token:`wibrawl-checkout-fixture-${token}`,
    address:{name:'Buyer',phone:'+919876543210',line1:'123 Test Road',city:'New Delhi',state:'Delhi',pin:'110001',country:'India'}
  }), env, buyer);
  const wbResponse = await purchase(WIBRAWL_ORIGIN,'wb','wb');
  assert.equal(wbResponse.status,201,await wbResponse.clone().text());
  assert.match((await wbResponse.json()).order.order_number,/^VB-/);
  const gmResponse = await purchase('https://glamiastore.com','gm','gm');
  assert.equal(gmResponse.status,201);
  assert.match((await gmResponse.json()).order.order_number,/^GM-/);
  await assert.rejects(purchase(WIBRAWL_ORIGIN,'gm','wrong-store'),/no longer available/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,2);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id='wb'").get().stock,49);
  assert.equal(db.prepare('SELECT balance FROM store_credit_accounts WHERE user_email=?').get(buyer.email).balance,800);
});

test('public sharing metadata and about copy identify Wibrawl', async t => {
  const {env} = fixture(t);
  for (const path of ['/', '/about', '/best-sellers']) {
    const response = await worker.renderPublicPage(new Request(WIBRAWL_ORIGIN+path,{headers:{'User-Agent':'Googlebot'}}),env,new URL(WIBRAWL_ORIGIN+path));
    assert.equal(response.status,200);
    const html = await response.text();
    assert.match(html, /og:site_name" content="Wibrawl/);
    assert.ok(html.includes(`rel="canonical" href="${WIBRAWL_ORIGIN}${path}"`));
    assert.ok(html.includes('/wibrawl/streetwear-campaign-1440.webp'));
    if(path==='/about')assert.match(html,/Your vibe. Your identity./);
    if(path==='/best-sellers')assert.match(html,/Current Meta/);
  }
});

test('sitemaps contain only products assigned to their storefront', async t => {
  const {db,env} = fixture(t);
  const path = id => worker.canonicalProductPath(worker.formatProduct(db.prepare('SELECT * FROM products WHERE id=?').get(id)));
  const wb = await (await worker.getSitemap(new Request(WIBRAWL_ORIGIN+'/sitemap.xml'),env)).text();
  assert.ok(wb.includes(path('wb'))); assert.ok(wb.includes(path('shared'))); assert.ok(!wb.includes(path('gm')));
  const gm = await (await worker.getSitemap(new Request('https://glamiastore.com/sitemap.xml'),env)).text();
  assert.ok(gm.includes(path('gm'))); assert.ok(!gm.includes(path('wb')));
});

test('sitemaps exclude flagged samples and include them when reclassified as real listings', async t => {
  const {db,env} = fixture(t);
  for (const [id, visibility] of [['sample-wb','wibrawl'],['sample-gm','glamia'],['sample-shared','both']]) {
    db.prepare(`INSERT INTO products(id,seller_email,name,category,brand,price,mrp,stock,color,sizes_json,image_url,description,status,storefront_visibility)
      VALUES(?, 'seller@example.com', ?, 'Sample only category', 'Fixture', 100, 100, 10, 'Black', '[]', '/fixture.png', 'Sample fixture', 'live', ?)`).run(id,id,visibility);
    db.prepare('INSERT INTO merchant_product_details(product_id,metadata_json) VALUES(?,?)').run(id,JSON.stringify({isSample:true}));
  }
  // Unrelated or malformed Google metadata must not hide real catalog entries.
  db.prepare('INSERT INTO merchant_product_details(product_id,metadata_json) VALUES(?,?)').run('wb','invalid legacy metadata');
  const path = id => worker.canonicalProductPath(worker.formatProduct(db.prepare('SELECT * FROM products WHERE id=?').get(id)));
  for (const origin of [WIBRAWL_ORIGIN,'https://glamiastore.com']) {
    const xml=await (await worker.getSitemap(new Request(origin+'/sitemap.xml'),env)).text();
    assert.ok(xml.includes(path(origin===WIBRAWL_ORIGIN?'wb':'gm')));
    assert.ok(xml.includes(path('shared')));
    for(const id of ['sample-wb','sample-gm','sample-shared'])assert.ok(!xml.includes(path(id)));
    assert.ok(!xml.includes('/category/Sample%20only%20category'));
    const locations=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>match[1]);
    assert.ok(locations.every(loc=>loc.startsWith(origin+'/')));
  }
  db.prepare('UPDATE merchant_product_details SET metadata_json=? WHERE product_id=?').run(JSON.stringify({isSample:false}),'sample-wb');
  const xml=await (await worker.getSitemap(new Request(WIBRAWL_ORIGIN+'/sitemap.xml'),env)).text();
  assert.ok(xml.includes(path('sample-wb')));
  assert.ok(xml.includes('/category/Sample%20only%20category'));
});

test('each storefront advertises its own sitemap in robots.txt', async () => {
  for(const origin of [WIBRAWL_ORIGIN,'https://glamiastore.com']) {
    const robots=await (await worker.getRobots(new Request(origin+'/robots.txt'))).text();
    assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  }
});

test('production CSP permits the exact built theme scripts', () => {
  const html = readFileSync('public/index.html','utf8');
  const csp = worker.withSecurityHeaders(new Response(html)).headers.get('Content-Security-Policy');
  for(const [,attributes,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if(/\bsrc\s*=/.test(attributes)||!code.trim())continue;
    assert.ok(csp.includes(`'sha256-${createHash('sha256').update(code).digest('base64')}'`));
  }
  assert.ok(!csp.includes("'unsafe-inline'"));
  assert.ok(csp.includes('https://accounts.google.com/gsi/style'));
});

test('the homepage discovers its application and display font without preloading an inactive hero', async t => {
  const {env} = fixture(t);
  const html = await (await worker.renderPublicPage(new Request(WIBRAWL_ORIGIN),env)).text();
  assert.match(html, /rel="modulepreload"[^>]+\/assets\/main-/);
  assert.match(html, /href="\/fonts\/jost-[^"]+" as="font"/);
  assert.ok(!/<link[^>]+href="\/fonts\/cormorant[^>]+as="font"/.test(html));
  assert.doesNotMatch(html, /preload.imageSrcset/);
});

test('direct product links render the Wibrawl header and footer before JavaScript', async t => {
  const {db,env} = fixture(t);
  const path = worker.canonicalProductPath(worker.formatProduct(db.prepare("SELECT * FROM products WHERE id='wb'").get()));
  const response = await worker.renderPublicPage(new Request(WIBRAWL_ORIGIN+path),env);
  assert.equal(response.status,200);
  const html = await response.text();
  assert.match(html,/wibrawl-wordmark/); assert.match(html,/wibrawl-footer/);
  assert.ok(!html.includes('id="initial-loader"'));
  assert.match(html,/\/wibrawl\/favicon.svg/);
  assert.match(html,/\/wibrawl\/logo.svg/);
  assert.match(html,/<link rel="icon" type="image\/svg\+xml" sizes="any" href="\/wibrawl\/favicon.svg\?v=afterimage"/);
  assert.doesNotMatch(html,/<link[^>]+href="\/wibrawl\/(?:favicon|icon-192)\.png"/);
});
