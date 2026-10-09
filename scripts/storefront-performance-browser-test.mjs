// Real built storefront + Worker + SQLite; every HTTP request is intercepted.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { productMediaManifest } from '../react-app/src/lib/productMediaManifest.js';

const base = 'https://glamia-performance.test';
const { db, env } = localDatabase();
env.GOOGLE_CLIENT_ID = 'isolated-test.apps.googleusercontent.com';
db.exec("UPDATE products SET thumbnail_url='/api/assets/products/thumbs/performance.webp' WHERE status='live'");
const previewBytes = readFileSync('public/glamia-g-mark-96.webp');
env.PRODUCT_IMAGES = { get: async () => ({ body: previewBytes, size: previewBytes.length, httpEtag: '"isolated-preview"', writeHttpMetadata(headers) { headers.set('Content-Type', 'image/webp'); } }) };
const firstImage=Object.keys(productMediaManifest)[0];
db.prepare("UPDATE products SET images_json=?,image_url=? WHERE status='live'").run(JSON.stringify([firstImage]),firstImage);
// Exercise the real optional homepage placement, not only an empty Events DB.
db.exec("INSERT INTO events(id,slug,name,type,status,theme,headline,message,coupon_code,cta_label,cta_href,show_on_home,show_after_sign_in) VALUES('layout-regression','layout-regression','Website Launch','campaign','published','festival','Your Next Big Moment Starts Here','This is a lifestyle not just a piece of clothing','FIRSTTIME','Shop the offer','/offers',1,0)");
const publicRoot = resolve('public');
const manifest = JSON.parse(readFileSync('public/.vite/manifest.json', 'utf8'));
env.ASSETS = { fetch: async request => {
  const url = new URL(typeof request === 'string' ? request : request.url || request.href);
  const pathname = decodeURIComponent(url.pathname);
  let file = resolve(publicRoot, '.' + pathname);
  if (relative(publicRoot, file).startsWith('..')) return new Response('', { status: 404 });
  if (!existsSync(file) || !extname(file)) file = resolve(publicRoot, 'index.html');
  const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' }[extname(file)] || 'application/octet-stream';
  return new Response(readFileSync(file), { headers: { 'Content-Type': type } });
} };
const worker = await workerFunctions([]);
const browser = await chromium.launch();
const errors = [];
try {
  for (const width of [390, 1440]) {
    let signedIn = false;
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const requests = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push(url.href);
      if (url.href === 'https://accounts.google.com/gsi/client') {
        return route.fulfill({ contentType: 'text/javascript', body: "window.google={accounts:{id:{initialize(){},renderButton(element){element.textContent='Isolated Google sign in';}}}};" });
      }
      if (url.origin !== base) return route.abort();
      if (signedIn && url.pathname === '/api/session') return route.fulfill({json:{user:{id:'css-fixture-buyer',name:'Style test buyer',email:'buyer@example.test',role:'customer'},needs_profile_completion:false}});
      if (request.method() !== 'GET') return route.fulfill({ status: 204 });
      if (url.pathname.endsWith('.woff2')) await new Promise(done => setTimeout(done, 1200));
      if (url.pathname.endsWith('.css')) await new Promise(done => setTimeout(done, 1000));
      // Slow noncritical data must not block the initial hero or splash removal.
      if (url.pathname === '/api/products' || url.pathname === '/api/session') await new Promise(done => setTimeout(done, 1800));
      if (/^\/api\/products\/[^/]+$/.test(url.pathname)) await new Promise(done => setTimeout(done, 1800));
      const response = await worker.default.fetch(new Request(url, { headers: { Accept: request.headers().accept || '*/*' } }), env, { waitUntil() {} });
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && message.text().includes('storefront_hydration_failed')) errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.cinematic-copy h1')).toBeVisible({ timeout: 1500 });
    await expect(page.locator('#initial-loader')).toHaveCount(0, { timeout: 1500 });
    await page.evaluate(() => { window.serverHeroImage = document.querySelector('.cinematic-frame > img'); });
    const headerHeight = await page.locator('.site-header').evaluate(node => node.getBoundingClientRect().height);
    await page.evaluate(() => document.fonts.ready);
    const loadedHeaderHeight = await page.locator('.site-header').evaluate(node => node.getBoundingClientRect().height);
    // The font-ready promise can resolve during React's atomic shell handoff.
    await expect(page.locator('.site-header')).toBeVisible();
    const settledHeaderHeight = loadedHeaderHeight || await page.locator('.site-header').evaluate(node => node.getBoundingClientRect().height);
    assert.ok(Math.abs(settledHeaderHeight - headerHeight) < 0.5, `Late fonts must not shift the header height: ${headerHeight} -> ${settledHeaderHeight}`);
    assert.ok(!requests.some(url => url.includes('accounts.google.com/gsi/client')), 'Identity SDK must not load on the homepage');
    assert.ok(!requests.some(url => url.includes('/api/hero')), 'Embedded hero must avoid its API waterfall');
    assert.ok(!requests.some(url => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')));
    assert.ok(!requests.some(url => url.includes('RouteStyles')), 'Non-homepage styles must not load on the homepage');
    const heroTitle = await page.locator('.cinematic-copy h1').textContent();
    await expect(page.locator('.product-card').first()).toBeVisible();
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => !link.media || link.media === 'all')), 'Deferred rules must become active before the application mounts');
    assert.ok(await page.evaluate(() => window.serverHeroImage === document.querySelector('.cinematic-frame > img')), 'Homepage controls must hydrate the existing image rather than repaint a new hero');
    console.log(`PASS ${width}px: homepage hero image retained when shopping controls attach`);
    const assertCampaignLayout = async target => {
      const layout = await target.locator('.campaign-feature').evaluate(node => {
        const style = getComputedStyle(node), title = getComputedStyle(node.querySelector('h2'));
        const action = node.querySelector('.campaign-feature-actions button');
        return { display: style.display, columns: style.gridTemplateColumns.split(' ').length, padding: parseFloat(style.paddingLeft), titleSize: parseFloat(title.fontSize), buttonHeight: action.getBoundingClientRect().height, width: node.getBoundingClientRect().width, viewport: innerWidth };
      });
      assert.equal(layout.display, 'grid', 'Active event must keep its designed grid, not unstyled block content');
      assert.equal(layout.columns, width <= 600 ? 1 : 2);
      assert.ok(layout.padding >= 24 && layout.titleSize >= 52 && layout.buttonHeight >= 48, JSON.stringify(layout));
      assert.ok(layout.width < layout.viewport, 'Campaign must preserve its outer spacing');
      assert.ok(await target.evaluate(() => {
        const promises = document.querySelector('.trust-strip'), campaign = document.querySelector('.campaign-feature');
        return Boolean(promises.compareDocumentPosition(campaign) & Node.DOCUMENT_POSITION_FOLLOWING);
      }), 'Trust strip remains above the event');
    };
    await assertCampaignLayout(page);
    // Compare public UI with the formerly global route sheet, not merely with
    // another subset of the same (potentially incomplete) public stylesheet.
    const assertPublicStylesIndependent = async () => {
      const capture = () => page.locator('.campaign-feature, .campaign-feature *, .trust-strip, .trust-strip *, .cinematic-home, .cinematic-home *, .cinematic-reel, .cinematic-reel *, .site-footer, .site-footer *, .product-modal, .product-modal *').evaluateAll(nodes => {
        const properties = ['display', 'position', 'grid-template-columns', 'flex-direction', 'gap', 'padding', 'margin', 'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'border-width', 'border-radius', 'min-height'];
        return nodes.map(node => ({ element: node.tagName + '.' + node.className, styles: Object.fromEntries(properties.map(key => [key, getComputedStyle(node).getPropertyValue(key)])) }));
      });
      const before = await capture();
      const manifest = JSON.parse(readFileSync('public/.vite/manifest.json', 'utf8'));
      const routeSheet = manifest['src/components/RouteStyles.jsx'].css[0];
      const reference = await page.addStyleTag({ url: base + '/' + routeSheet });
      const after = await capture();
      await reference.evaluate(node => node.remove());
      assert.deepEqual(after, before, 'Public components must not regain missing styles when the account/admin sheet is added');
    };
    await assertPublicStylesIndependent();
    mkdirSync('test-results/storefront-ui-repair', { recursive: true });
    await page.locator('.campaign-feature').screenshot({ path: `test-results/storefront-ui-repair/campaign-${width}.png` });
    assert.ok(!requests.some(url => /\/(ProductDetailPage|QuickView|StoreCredits|Reviews)-[^/]+\.js/.test(url)), 'Product, preview, reviews and wallet chunks must stay off the initial homepage');
    const firstProductName = (await page.locator('.product-card h3').first().textContent()).trim();
    await page.locator('.product-card .product-image').first().click();
    await expect(page.locator('dialog.quick-view-dialog')).toBeVisible();
    await expect(page.locator('#modal-title')).toHaveText(firstProductName);
    await assertPublicStylesIndependent();
    await page.getByRole('button', { name: 'Close product details', exact: true }).click();
    await expect(page.locator('dialog.quick-view-dialog')).toHaveCount(0);
    await page.locator('.product-card h3 a').first().click();
    await expect(page.locator('.detail-copy h1')).toHaveText(firstProductName);
    const productPath = new URL(page.url()).pathname;
    await expect(page.locator('.product-specifications')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeVisible();
    assert.ok(requests.some(url => /\/ProductDetailPage-[^/]+\.js/.test(url)));
    console.log(`PASS ${width}px: deferred quick view, product details, specifications and PIN check render without errors`);
    const loginProducts = page.waitForResponse(response => new URL(response.url()).pathname === '/api/products');
    await page.goto(base + '/login');
    await expect(page).toHaveURL(base + '/login');
    await expect(page.locator('#reactGoogleButton')).toContainText('Isolated Google sign in');
    assert.equal(requests.filter(url => url === 'https://accounts.google.com/gsi/client').length, 1);
    assert.equal((await loginProducts).status(), 200);
    assert.ok(requests.some(url => /RouteStyles.*\.css$/.test(url)), 'Destination styles must load for login');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const catalogueStart = requests.length;
    const catalogueRefresh = page.waitForResponse(response => new URL(response.url()).pathname === '/api/products' && new URL(response.url()).searchParams.get('sort') === 'newest');
    await page.goto(base + '/just-arrived', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { window.serverCatalogueHeading = document.querySelector('h1.page-title'); window.serverCatalogueImage = document.querySelector('.product-card .product-image img'); });
    await expect(page.locator('.product-card h2').first()).toBeVisible();
    await expect(page.locator('.filter-row button').first()).toBeEnabled();
    assert.ok(await page.evaluate(() => window.serverCatalogueHeading === document.querySelector('h1.page-title')), 'Catalogue hydration must preserve its initially painted heading: ' + JSON.stringify(errors));
    assert.ok(!requests.slice(catalogueStart).some(url => /RouteStyles.*\.css$/.test(url)), 'Catalogue must not download unrelated admin/account stylesheet');
    await catalogueRefresh;
    await expect(page.locator('.product-card .product-image img').first()).toHaveAttribute('src', /^\/api\/assets\/products\/thumbs\//);
    assert.ok(await page.evaluate(() => window.serverCatalogueImage === document.querySelector('.product-card .product-image img')), 'The catalogue photo survives hydration and the initial stock refresh');
    await page.getByLabel('Sort', { exact: true }).selectOption('price_low');
    await page.waitForResponse(response => new URL(response.url()).searchParams.get('sort') === 'price_low');
    await expect(page.locator('.product-card h2').first()).toBeVisible();
    console.log(`PASS ${width}px: public catalogue seed, h1/h2 hierarchy and interactive sort without unrelated route CSS`);
    await page.evaluate(() => {
      localStorage.setItem('glamia-react-cart', JSON.stringify([{id:'retained-cart-item',quantity:2,size:'M'}]));
      localStorage.setItem('glamia-react-wishlist', JSON.stringify(['retained-wishlist-item']));
      localStorage.setItem('glamia-theme', 'dark');
    });
    await page.goto(base + productPath, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { window.serverProductImage = document.querySelector('.detail-gallery > img'); });
    await expect(page.getByRole('button', { name: 'Add to bag', exact: true })).toBeEnabled();
    assert.ok(await page.evaluate(() => window.serverProductImage === document.querySelector('.detail-gallery > img')), 'Product hydration must preserve its initially painted image: ' + JSON.stringify(errors));
    assert.ok(await page.locator('.detail-gallery > img').evaluate(node=>node.currentSrc.startsWith('data:image/webp;base64,')), 'The same mobile display copy must arrive embedded, remain selected after hydration, and need no extra image request');
    await expect(page.locator('.detail-gallery > img')).toHaveAttribute('decoding', 'sync');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('glamia-react-cart'))[0]?.quantity), 2);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('glamia-react-wishlist'))), ['retained-wishlist-item']);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    const refreshedProduct=page.waitForResponse(response=>/^\/api\/products\/[^/]+$/.test(new URL(response.url()).pathname));
    const selectedSize=page.locator('.size-list button:not([disabled])').first();
    await selectedSize.click();
    await refreshedProduct;
    await expect(selectedSize).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Add to bag',exact:true}).click();
    await expect(page.getByText('Added to your cart.',{exact:true})).toBeVisible();
    console.log(`PASS ${width}px: early size selection survives slow product refresh and still adds to the bag`);
    console.log(`PASS ${width}px: product/catalogue DOM retained during hydration and private browser preferences restored without overwrite`);
    await page.evaluate(() => localStorage.setItem('glamia-react-cart', '[]'));
    const cartStart = requests.length;
    await page.goto(base + '/cart', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { window.serverCartHeading = document.querySelector('h1.page-title'); });
    await expect(page.getByRole('button', { name: 'Browse best sellers', exact: true })).toBeEnabled();
    assert.ok(await page.evaluate(() => window.serverCartHeading === document.querySelector('h1.page-title')), 'Cart title must remain painted while private contents restore');
    assert.ok(!requests.slice(cartStart).some(url => /RouteStyles.*\.css$/.test(url)), 'Cart must not fetch the unrelated admin/account stylesheet');
    console.log(`PASS ${width}px: private cart first paint, retained heading and isolated cart/coupon styles`);
    signedIn=true;
    await page.goto(base+productPath);
    await expect(page.locator('.review-form')).toBeVisible();
    await expect(page.locator('.question-form')).toBeVisible();
    const captureProductStyles=()=>page.locator('.detail-page, .detail-page *, .product-reviews, .product-reviews *, .product-questions, .product-questions *').evaluateAll(nodes=>nodes.map(node=>{
      const style=getComputedStyle(node);
      return {element:node.tagName+'.'+node.className,values:Object.fromEntries(['display','position','grid-template-columns','gap','padding','margin','font-family','font-size','font-weight','line-height','color','background-color','border-width','border-radius','width','height'].map(key=>[key,style.getPropertyValue(key)]))};
    }));
    await page.evaluate(()=>document.fonts.ready);
    const productStyles=await captureProductStyles();
    const originalStyles=await page.addStyleTag({url:base+'/'+manifest['src/components/RouteStyles.jsx'].css[0]});
    assert.deepEqual(await captureProductStyles(),productStyles,'Authenticated reviews/questions and product controls retain the original full stylesheet appearance');
    await originalStyles.evaluate(node=>node.remove());
    console.log(`PASS ${width}px: signed-in product/review/question forms match the original full stylesheet`);
    await context.close();
    console.log(`PASS ${width}px: early hero, independent slow APIs, local fonts, deferred working Google sign-in, no overflow`);
    const staticContext = await browser.newContext({ viewport: { width, height: 900 } });
    await staticContext.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      // Keep the server shell intact while allowing stylesheet load events in
      // the test harness; no application/third-party script may execute.
      if (request.resourceType() === 'script') return route.abort();
      if (url.origin !== base || request.method() !== 'GET') return route.abort();
      const response = await worker.default.fetch(new Request(url), env, { waitUntil() {} });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
    const staticPage = await staticContext.newPage();
    await staticPage.goto(base);
    await expect(staticPage.locator('.cinematic-copy h1')).toHaveText(heroTitle);
    await expect(staticPage.locator('.cinematic-copy h1')).toBeVisible();
    await expect(staticPage.locator('.site-header')).toBeVisible();
    await assertCampaignLayout(staticPage);
    assert.equal(await staticPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await staticPage.evaluate(() => document.fonts.ready);
    const captureShellStyles = () => staticPage.locator('#root *').evaluateAll(nodes => {
      const properties = ['display', 'position', 'grid-template-columns', 'gap', 'padding', 'margin', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'border-width', 'border-radius', 'width', 'height'];
      return nodes.map(node => {
        const style = getComputedStyle(node);
        return { element: node.tagName + '.' + node.getAttribute('class'), values: Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)])) };
      });
    });
    const criticalStyles = await captureShellStyles();
    const stylesheetUrl = await staticPage.locator('link[data-glamia-storefront-css]').getAttribute('href');
    await staticPage.addStyleTag({ url: base + stylesheetUrl });
    const completeStyles = await captureShellStyles();
    const differences = completeStyles.flatMap((item, index) => Object.entries(item.values).filter(([key, value]) => value !== criticalStyles[index]?.values[key]).map(([key, value]) => `${item.element}: ${key} ${criticalStyles[index]?.values[key]} -> ${value}`));
    assert.deepEqual(differences, [], 'First-screen layout/styles must exactly match the complete stylesheet');
    await staticPage.goto(base + productPath);
    await expect(staticPage.locator('.detail-copy h1')).toHaveText(firstProductName);
    await expect(staticPage.locator('.detail-gallery')).toBeVisible();
    await expect(staticPage.locator('#initial-loader')).toHaveCount(0);
    assert.ok(await staticPage.locator('#glamia-product-bootstrap').count());
    assert.equal(await staticPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await staticPage.evaluate(() => document.fonts.ready);
    const productCritical = await captureShellStyles();
    const productCompleteStyle = await staticPage.locator('link[data-glamia-storefront-css]').getAttribute('href');
    await staticPage.addStyleTag({ url: base + productCompleteStyle });
    const productComplete = await captureShellStyles();
    const productDifferences = productComplete.flatMap((item, index) => Object.entries(item.values).filter(([key, value]) => value !== productCritical[index]?.values[key]).map(([key, value]) => `${item.element}: ${key} ${productCritical[index]?.values[key]} -> ${value}`));
    assert.deepEqual(productDifferences, [], 'Product critical styles must preserve the complete layout');
    const fullRouteReference=await staticPage.addStyleTag({url:base+'/'+manifest['src/components/RouteStyles.jsx'].css[0]});
    assert.deepEqual(await captureShellStyles(), productComplete, 'Product-specific stylesheet must match the original full route stylesheet');
    await fullRouteReference.evaluate(node=>node.remove());
    console.log(`PASS ${width}px: public product first screen renders with application scripts blocked`);
    await staticPage.goto(base + '/just-arrived');
    await expect(staticPage.locator('.product-card h2').first()).toBeVisible();
    await expect(staticPage.locator('.product-card .product-image img').first()).toHaveAttribute('loading', 'eager');
    await expect(staticPage.locator('.product-card .product-image img').first()).toHaveAttribute('fetchpriority', 'high');
    await expect(staticPage.locator('#initial-loader')).toHaveCount(0);
    assert.equal(await staticPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await staticPage.evaluate(() => document.fonts.ready);
    const catalogueCritical = await captureShellStyles();
    const catalogueCompleteStyle = await staticPage.locator('link[data-glamia-storefront-css]').getAttribute('href');
    await staticPage.addStyleTag({ url: base + catalogueCompleteStyle });
    const catalogueComplete = await captureShellStyles();
    const catalogueDifferences = catalogueComplete.flatMap((item, index) => Object.entries(item.values).filter(([key, value]) => value !== catalogueCritical[index]?.values[key]).map(([key, value]) => `${item.element}: ${key} ${catalogueCritical[index]?.values[key]} -> ${value}`));
    assert.deepEqual(catalogueDifferences, [], 'Catalogue critical styles must preserve the complete layout');
    console.log(`PASS ${width}px: public catalogue cards render with application scripts blocked`);
    await staticContext.close();
    console.log(`PASS ${width}px: server header/hero with app JavaScript blocked; critical and complete styles exactly match`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  db.close();
}
