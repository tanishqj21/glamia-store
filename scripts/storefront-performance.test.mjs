import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

function fixture(t) {
  const result = localDatabase();
  t.after(() => result.db.close());
  result.env.ASSETS = { fetch: async () => new Response(readFileSync('public/index.html', 'utf8'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) };
  result.db.exec("UPDATE products SET thumbnail_url='/api/assets/products/thumbs/performance.webp' WHERE status='live'");
  return result;
}

test('versioned analytics scripts reach static assets without a product lookup', async () => {
  const worker = await workerFunctions([]);
  for (const origin of ['https://glamiastore.com', 'https://wibrawl.glamiastore.com']) {
    const assets = [];
    const env = { DB: { prepare() { throw Error('Analytics assets must not query products'); } }, ASSETS: { fetch: async request => {
      assets.push(request.url);
      return new Response('/* analytics fixture */', { headers: { 'Content-Type': 'text/javascript' } });
    } } };
    const url = origin + '/analytics/partytown-1.0.0/partytown.js';
    const response = await worker.default.fetch(new Request(url), env, {});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Content-Type'),'text/javascript');
    assert.deepEqual(assets,[url]);
  }
});

test('product first screen is server rendered using only public fields and safe bootstrap JSON', async t => {
  const { db, env } = fixture(t);
  const worker = await workerFunctions(['renderPublicPage', 'canonicalProductPath', 'formatProduct']);
  const row = db.prepare("SELECT * FROM products WHERE status='live' LIMIT 1").get();
  assert.ok(row);
  db.prepare("UPDATE products SET cost_price=12345, seller_email='private-seller@example.test' WHERE id=?").run(row.id);
  const path = worker.canonicalProductPath(worker.formatProduct(row));
  const response = await worker.renderPublicPage(new Request('https://glamiastore.com' + path), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  const serialized = html.match(/id="glamia-product-bootstrap">([^]*?)<\/script>/)?.[1];
  assert.ok(serialized);
  const data = JSON.parse(serialized);
  assert.equal(data.product.id, row.id);
  assert.equal(data.path, path);
  for (const field of ['seller_email', 'cost_price', 'image_key', 'image_keys', 'thumbnail_key', 'reorder_point']) assert.equal(data.product[field], undefined);
  assert.ok(!html.includes('private-seller@example.test'));
  assert.match(html, /class="detail-gallery"/);
  assert.match(html, /class="detail-copy"/);
  assert.match(html, /disabled="" data-glamia-pending-control/);
  assert.ok(!html.includes('id="initial-loader"'));
  assert.match(html, /id="glamia-product-styles"/);
  assert.match(html, /data-glamia-storefront-css/);
  assert.ok(!/<link[^>]+as="style"[^>]+href="\/assets\/RouteStyles-/.test(html), 'Product must not preload the full admin/account stylesheet');
  const manifest=JSON.parse(readFileSync('public/.vite/manifest.json','utf8'));
  const productStyles=readFileSync('public/'+manifest['glamia-product-styles.css'].file,'utf8');
  assert.ok(!productStyles.includes('.admin-panel'), 'Dedicated product stylesheet excludes admin panels');
  assert.ok(!productStyles.includes('.complaint-completion'), 'Return administration is not downloaded by product pages');
  for(const selector of ['.detail-gallery','.review-form','.question-form','.product-specifications']) assert.ok(productStyles.includes(selector),`Product styles retain ${selector}`);
  const css = html.match(/<style id="glamia-product-styles">([^]*?)<\/style>/)?.[1];
  const headersWorker = await workerFunctions(['withSecurityHeaders']);
  assert.ok(headersWorker.withSecurityHeaders(new Response(html)).headers.get('Content-Security-Policy').includes(`'sha256-${createHash('sha256').update(css).digest('base64')}'`));
});

test('catalogue first screen has real public cards and matching filter identity before JavaScript', async t => {
  const { env } = fixture(t);
  const worker = await workerFunctions(['renderPublicPage']);
  for (const path of ['/just-arrived', '/offers', '/best-sellers']) {
    const response = await worker.renderPublicPage(new Request('https://glamiastore.com' + path), env);
    assert.equal(response.status, 200);
    const html = await response.text();
    const data = JSON.parse(html.match(/id="glamia-catalogue-bootstrap">([^]*?)<\/script>/)?.[1] || 'null');
    assert.ok(data?.catalogue);
    assert.equal(data.path, path);
    assert.ok(data.catalogue.identity.includes(path === '/just-arrived' ? 'sort=newest' : 'sort=featured'));
    assert.ok(!html.includes('id="initial-loader"'));
    assert.match(html, /class="catalog-section catalog-page"/);
    if (data.catalogue.products.length) assert.match(html, /class="product-card /);
    assert.ok(data.catalogue.products.every(product => product.cost_price === undefined && product.seller_email === undefined));
  }
});

test('UUID-bearing public product links use a direct lookup but still enforce live status and canonical paths', async t => {
  const { db, env } = fixture(t);
  const row = db.prepare("SELECT * FROM products WHERE status='live' LIMIT 1").get();
  const copy = { ...row, id: 'f245fe31-dff4-4ca8-90ef-652f5f6a70b9', product_code: null };
  const columns = Object.keys(copy);
  db.prepare(`INSERT INTO products (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(key => copy[key]));
  const worker = await workerFunctions(['renderPublicPage', 'canonicalProductPath', 'formatProduct']);
  const path = worker.canonicalProductPath(worker.formatProduct(copy));
  const statements = [];
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { statements.push(sql); return prepare(sql); };
  assert.equal((await worker.renderPublicPage(new Request('https://glamiastore.com' + path), env)).status, 200);
  assert.ok(!statements.some(sql => /SELECT id FROM products WHERE id = \?/i.test(sql)));
  const legacy = await worker.renderPublicPage(new Request('https://glamiastore.com/product/' + copy.id.toUpperCase()), env);
  assert.equal(legacy.status, 301);
  assert.equal(legacy.headers.get('Location'), 'https://glamiastore.com' + path);
  db.prepare("UPDATE products SET status='archived' WHERE id=?").run(copy.id);
  assert.equal((await worker.renderPublicPage(new Request('https://glamiastore.com' + path), env)).status, 404);
});

test('public hero uses existing thumbnails and retains original images for the admin editor', async t => {
  const { env } = fixture(t);
  const worker = await workerFunctions(['listHeroSlides']);
  const publicSlides = await (await worker.listHeroSlides(env)).json();
  const adminSlides = await (await worker.listHeroSlides(env, true)).json();
  assert.ok(publicSlides.slides.length);
  assert.ok(publicSlides.slides.flatMap(slide => slide.frames).every(frame => frame.image === '/api/assets/products/thumbs/performance.webp'));
  assert.ok(adminSlides.slides.flatMap(slide => slide.frames).every(frame => frame.image !== '/api/assets/products/thumbs/performance.webp'));
});

test('homepage embeds only public settings and safely serializes administrator-authored text', async t => {
  const { db, env } = fixture(t);
  const text = '</script><img src=x onerror=alert(1)>\u2028';
  db.prepare("INSERT INTO storefront_settings(setting_key,value_json) VALUES('announcement',?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify({ text }));
  db.prepare("INSERT INTO storefront_settings(setting_key,value_json) VALUES('fulfillment',?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify({ warehouse_address: 'PRIVATE-WAREHOUSE' }));
  const worker = await workerFunctions(['renderPublicPage']);
  const response = await worker.renderPublicPage(new Request('https://glamiastore.com/'), env);
  const html = await response.text();
  const serialized = html.match(/<script type="application\/json" id="glamia-storefront-bootstrap">([^]*?)<\/script>/)?.[1];
  assert.ok(serialized);
  assert.ok(!serialized.includes('<'));
  const bootstrap = JSON.parse(serialized);
  assert.equal(bootstrap.settings.announcement.text, text.trim());
  assert.equal(bootstrap.settings.fulfillment, undefined);
  assert.ok(!html.includes('PRIVATE-WAREHOUSE'));
  assert.ok(!Object.hasOwn(bootstrap, 'user'));
  assert.match(html, /rel="preload" as="image" href="\/api\/assets\/products\/thumbs\/performance.webp"/);
  assert.match(html, /fonts\/jost-.*?woff2/);
  assert.ok(!/<link\b[^>]*\bas="font"/.test(html), 'Embedded common characters must not also preload the original fonts');
  assert.match(html, /data:font\/woff2;base64,/);
  assert.match(html, /<header class="site-header /);
  assert.match(html, /class="cinematic-copy"/);
  assert.ok(!html.includes('id="initial-loader"'));
  assert.ok(!html.includes('style="--promise-count'));
  const css = html.match(/<style id="glamia-storefront-styles">([^]*?)<\/style>/)?.[1];
  assert.ok(css);
  const cspWorker = await workerFunctions(['withSecurityHeaders']);
  assert.ok(cspWorker.withSecurityHeaders(new Response(html)).headers.get('Content-Security-Policy').includes(`'sha256-${createHash('sha256').update(css).digest('base64')}'`));
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html));
  assert.match(html, /rel="preload" as="style"[^>]+data-glamia-storefront-css/);
  assert.ok(!css.includes('.product-specifications'), 'Product detail rules should not inflate first-screen CSS');
});

test('only a small first hero image is embedded; oversized media keeps the original URL', async t => {
  const { env } = fixture(t);
  let size = 3;
  env.PRODUCT_IMAGES = { get: async () => ({ size, body: new Uint8Array([1, 2, 3]), httpEtag: '"hero-test"', writeHttpMetadata(headers) { headers.set('Content-Type', 'image/webp'); } }) };
  const worker = await workerFunctions(['renderPublicPage']);
  const render = async () => {
    const html = await (await worker.renderPublicPage(new Request('https://glamiastore.com/'), env)).text();
    if (size <= 32768) {
      assert.match(html, /decoding="sync" fetchPriority="high"|decoding="sync" fetchpriority="high"/);
      assert.equal((html.match(/data:image\/webp;base64,AQID/g) || []).length, 1, 'Photo bytes must not also be duplicated in startup JSON');
    }
    return JSON.parse(html.match(/id="glamia-storefront-bootstrap">([^]*?)<\/script>/)[1]);
  };
  let bootstrap = await render();
  assert.equal(bootstrap.hero.slides[0].frames[0].image, '/api/assets/products/thumbs/performance.webp');
  assert.equal(bootstrap.hero.first_image_from_dom, true);
  assert.ok(bootstrap.hero.slides[0].frames.slice(1).every(frame => frame.image.startsWith('/api/assets/')));
  size = 32769;
  bootstrap = await render();
  assert.equal(bootstrap.hero.slides[0].frames[0].image, '/api/assets/products/thumbs/performance.webp');
});

test('interactive homepage reuses its public SEO settings without a duplicate settings query', async t => {
  const { db, env } = fixture(t);
  const seo = { title: 'Glamia custom homepage', description: 'A considered collection.', image: 'https://glamiastore.com/glamia-social-banner.png' };
  db.prepare("INSERT INTO storefront_settings(setting_key,value_json) VALUES('seo',?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(seo));
  const statements = [];
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { statements.push(sql); return prepare(sql); };
  const worker = await workerFunctions(['renderPublicPage']);
  const html = await (await worker.renderPublicPage(new Request('https://glamiastore.com/'), env)).text();
  assert.ok(html.includes(`<title>${seo.title}</title>`));
  assert.equal(statements.filter(sql => /FROM storefront_settings/i.test(sql)).length, 1);
});

test('homepage can embed its first image from the immutable public media cache without an R2 read', async t => {
  const { env } = fixture(t);
  env.PRODUCT_IMAGES = { get: async () => { throw Error('A warm image must not read R2'); } };
  const cache = { match: async request => request.url.endsWith('/api/assets/products/thumbs/performance.webp')
    ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/webp', 'Content-Length': '3' } }) : null };
  const worker = await workerFunctions(['renderPublicPage'], { caches: { default: cache } });
  const html = await (await worker.renderPublicPage(new Request('https://glamiastore.com/'), env)).text();
  const bootstrap = JSON.parse(html.match(/id="glamia-storefront-bootstrap">([^]*?)<\/script>/)[1]);
  assert.equal(bootstrap.hero.slides[0].frames[0].image, '/api/assets/products/thumbs/performance.webp');
  assert.equal(bootstrap.hero.first_image_from_dom, true);
  assert.equal((html.match(/data:image\/webp;base64,AQID/g) || []).length, 1);
});

test('crawler HTML remains distinct and does not include interactive bootstrap or JavaScript', async t => {
  const { env } = fixture(t);
  const worker = await workerFunctions(['renderPublicPage']);
  const response = await worker.renderPublicPage(new Request('https://glamiastore.com/', { headers: { 'User-Agent': 'Googlebot' } }), env);
  const html = await response.text();
  assert.ok(!html.includes('glamia-storefront-bootstrap'));
  assert.ok(!/<script type="module"/.test(html));
  assert.match(html, /catalog-bot-list/);
});

test('private routes have no public bootstrap and Cloudflare analytics has narrow CSP allowances', async t => {
  const { env } = fixture(t);
  const worker = await workerFunctions(['renderPublicPage', 'withSecurityHeaders']);
  assert.equal(await worker.renderPublicPage(new Request('https://glamiastore.com/checkout'), env), null);
  const csp = worker.withSecurityHeaders(new Response('')).headers.get('Content-Security-Policy');
  assert.match(csp, /script-src [^;]*https:\/\/static.cloudflareinsights.com;/);
  assert.match(csp, /connect-src [^;]*https:\/\/cloudflareinsights.com;/);
  assert.ok(!csp.includes("'unsafe-inline'"));
});

test('private cart first paint never embeds customer data, totals or a false empty bag', async t => {
  const { db, env } = fixture(t);
  const statements = [];
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { statements.push(sql); return prepare(sql); };
  const worker = await workerFunctions([]);
  const response = await worker.default.fetch(new Request('https://glamiastore.com/cart', { headers: { Cookie: 'mm_session=not-a-valid-session' } }), env, { waitUntil() {} });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
  const html = await response.text();
  const data = JSON.parse(html.match(/id="glamia-cart-bootstrap">([^]*?)<\/script>/)?.[1] || 'null');
  assert.equal(data.path, '/cart');
  assert.deepEqual(Object.keys(data).sort(), ['path', 'settings']);
  assert.match(html, /Shopping bag/);
  assert.match(html, /Loading your bag and saved items/);
  assert.ok(!html.includes('Your bag is ready for something excellent'));
  assert.ok(!html.includes('id="initial-loader"'));
  assert.ok(!html.includes('RouteStyles-'));
  assert.ok(!statements.some(sql => /FROM (?:users|sessions|orders|saved_items)/i.test(sql)));
  const css = html.match(/<style id="glamia-cart-styles">([^]*?)<\/style>/)?.[1];
  assert.ok(response.headers.get('Content-Security-Policy').includes(`'sha256-${createHash('sha256').update(css).digest('base64')}'`));
});

test('a public cache hit never leaks Cloudflare default browser TTL or stale server timings', async () => {
  let produced = false;
  const worker = await workerFunctions(['cachedPublicResponse'], { caches: { default: {
    match: async () => new Response('public-only', { headers: { 'Cache-Control': 'public, max-age=14400', 'Server-Timing': 'total;dur=500' } }),
  } } });
  const response = await worker.cachedPublicResponse(new Request('https://glamiastore.com/'), {}, 60, async () => { produced = true; });
  assert.equal(produced, false);
  assert.equal(await response.text(), 'public-only');
  assert.match(response.headers.get('Cache-Control'), /max-age=0, must-revalidate, s-maxage=60/);
  assert.equal(response.headers.get('Server-Timing'), 'edge_cache;desc="HIT"');
});

test('only anonymous cacheable pages use the public read session', async t => {
  const { env } = fixture(t);
  const sessions = [];
  env.DB.withSession = constraint => { sessions.push(constraint); return env.DB; };
  const worker = await workerFunctions([]);
  const context = { waitUntil() {} };
  assert.equal((await worker.default.fetch(new Request('https://glamiastore.com/'), env, context)).status, 200);
  assert.deepEqual(sessions, ['first-unconstrained']);
  assert.equal((await worker.default.fetch(new Request('https://glamiastore.com/', { headers: { Cookie: 'unrelated=1' } }), env, context)).status, 200);
  assert.deepEqual(sessions, ['first-unconstrained']);
  await worker.default.fetch(new Request('https://glamiastore.com/api/profile'), env, context);
  assert.deepEqual(sessions, ['first-unconstrained']);
});

test('public product media is cached without reading sessions or changing immutable metadata', async t => {
  const { env } = fixture(t);
  const entries = new Map();
  const cache = {
    match: async request => entries.get(request.url)?.clone(),
    put: async (request, response) => { entries.set(request.url, new Response(await response.arrayBuffer(), { headers: response.headers })); },
  };
  let reads = 0;
  env.DB.prepare = () => { throw new Error('Product media must not read private sessions or the database'); };
  env.PRODUCT_IMAGES = { get: async key => {
    reads++;
    assert.equal(key, 'products/public-image.webp');
    return { body: new Uint8Array([1, 2, 3]), size: 3, httpEtag: '"image-etag"', writeHttpMetadata(headers) { headers.set('Content-Type', 'image/webp'); } };
  } };
  const worker = await workerFunctions([], { caches: { default: cache } });
  const pending = [];
  const context = { waitUntil(promise) { pending.push(promise); } };
  const url = 'https://glamiastore.com/api/assets/products/public-image.webp';
  const response = await worker.default.fetch(new Request(url), env, context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('etag'), '"image-etag"');
  assert.match(response.headers.get('cache-control'), /max-age=31536000, immutable/);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  await Promise.all(pending);
  const hit = await worker.default.fetch(new Request(url + '?ignored=1', { headers: { Cookie: 'unrelated=1', Authorization: 'Bearer untrusted' } }), env, context);
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get('content-type'), 'image/webp');
  assert.deepEqual([...new Uint8Array(await hit.arrayBuffer())], [1, 2, 3]);
  const head = await worker.default.fetch(new Request(url, { method: 'HEAD' }), env, context);
  assert.equal(head.headers.get('content-length'), '3');
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(reads, 1);
});

test('a missing product image is not cached and a HEAD miss cannot poison a later GET', async t => {
  const { env } = fixture(t);
  let writes = 0, present = false;
  env.PRODUCT_IMAGES = { get: async () => present ? { body: 'image', size: 5, httpEtag: '"etag"', writeHttpMetadata() {} } : null };
  const worker = await workerFunctions(['cachedProductImage'], { caches: { default: { match: async () => null, put: async () => { writes++; } } } });
  const context = { waitUntil(promise) { return promise; } };
  const url = new URL('https://glamiastore.com/api/assets/products/missing.webp');
  assert.equal((await worker.cachedProductImage(new Request(url), env, url, context)).status, 404);
  assert.equal(writes, 0);
  present = true;
  assert.equal((await worker.cachedProductImage(new Request(url, { method: 'HEAD' }), env, url, context)).status, 200);
  assert.equal(writes, 0);
  assert.equal(await (await worker.cachedProductImage(new Request(url), env, url, context)).text(), 'image');
  assert.equal(writes, 1);
});
