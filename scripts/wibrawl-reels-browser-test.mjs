import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const base = process.env.WIBRAWL_TEST_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const subtle = new Proxy(crypto.subtle, { get(target, key) { if (key === 'timingSafeEqual') return timingSafeEqual; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; } });
const worker = await workerFunctions(['routeApi', 'signSession', 'createHeroSlide'], { crypto: { subtle, randomUUID: () => crypto.randomUUID() } });
const { db, env } = localDatabase(); env.SESSION_SECRET = 'reels-browser-fixture'; env.ADMIN_EMAILS = ['reels-owner@example.com'];
const owner = { sub: 'reels-owner', email: env.ADMIN_EMAILS[0], name: 'Reels Owner', role: 'admin', is_owner: true };
db.prepare('INSERT INTO users(email,google_sub,name) VALUES(?,?,?)').run(owner.email, owner.sub, owner.name);
db.exec("UPDATE products SET status='hold'; DELETE FROM hero_slides;");
const products = [['gm', 'glamia', 'Glamia exclusive'], ['wb', 'wibrawl', 'Wibrawl exclusive'], ['both', 'both', 'Shared tee'], ['wb2', 'wibrawl', 'Another Wibrawl tee']].map(([id, storefront_visibility, name], index) => ({ id, name, storefront_visibility, category: 'Tees', brand: 'Fixture', price: 599, mrp: 599, stock: 0, sizes: ['M'], image_url: index % 2 ? '/wibrawl/gaming-campaign-640.webp' : '/wibrawl/sports-campaign-640.webp', status: 'live' }));
for (const p of products) db.prepare("INSERT INTO products(id,seller_email,name,category,brand,price,mrp,stock,color,sizes_json,image_url,description,status,storefront_visibility) VALUES(?,'seller@example.com',?,'Tees','Fixture',599,599,0,'Black','[\"M\"]',?,'Fixture','live',?)").run(p.id, p.name, p.image_url, p.storefront_visibility);
for (const [index, layout] of ['poster', 'collage', 'split'].entries()) await worker.createHeroSlide(new Request(base + '/api/admin/hero?storefront=wibrawl', { method: 'POST', body: JSON.stringify({ title: 'Hero ' + (index + 1), tagline: 'Your vibe, your rules.', product_ids: ['wb', 'both'], layout }) }), env);
const token = await worker.signSession(owner, env);
const output = 'tmp/wibrawl-reels-review'; mkdirSync(output, { recursive: true });
const browser = await chromium.launch(), errors = [], checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, hasTouch: true });
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname; let data = {};
    if (['/api/hero', '/api/storefront-settings'].includes(path) || /^\/api\/admin\/(hero|cinematic-reel|storefront-settings)/.test(path)) {
      const headers = await route.request().allHeaders(); headers.cookie = `mm_session=${token}`;
      const request = new Request(url, { method: route.request().method(), headers, ...(route.request().postData() ? { body: route.request().postData() } : {}) });
      try { const response = await worker.routeApi(request, env, url, {}); return route.fulfill({ status: response.status, body: await response.text(), contentType: 'application/json' }); }
      catch (error) { return route.fulfill({ status: error.status || 500, json: { error: error.message } }); }
    }
    if (path === '/api/session') data = { user: owner, profile_complete: true };
    else if (path === '/api/products') data = { products: products.filter(p => url.searchParams.get('scope') === 'admin' || [url.searchParams.has('wibrawl-preview') ? 'wibrawl' : 'glamia', 'both'].includes(p.storefront_visibility)), pagination: { has_more: false, total: 4 } };
    else if (path === '/api/categories') data = { categories: ['Tees'], subcategories: [] };
    else if (path === '/api/loyalty') data = { balance: 0 };
    else if (path.startsWith('/api/saved-items')) data = { cart: [], wishlist: [], saved_for_later: [] };
    await route.fulfill({ json: data });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/admin/hero?wibrawl-preview=1');
  const studio = page.locator('.cinematic-reel-studio'); await studio.locator('.wb-reel-queue-row').nth(2).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Hero storefront' }).inputValue(), 'wibrawl');
  assert.equal(await studio.getByText('Glamia exclusive', { exact: true }).count(), 0);
  const getReels = () => JSON.parse(db.prepare("SELECT value_json FROM storefront_settings WHERE setting_key='wibrawl_cinematic_reels'").get().value_json).reels;
  const idle = () => page.waitForFunction(() => document.querySelector('.cinematic-reel-studio')?.getAttribute('aria-busy') === 'false');
  await studio.getByRole('checkbox', { name: 'Show Spotlight', exact: true }).uncheck(); await idle();
  assert.equal(getReels().filter(reel => reel.visible).length, 2);
  await studio.getByRole('checkbox', { name: 'Show Lookbook', exact: true }).uncheck(); await idle();
  assert.equal(getReels().filter(reel => reel.visible).length, 1);
  await page.goto(base + '/?wibrawl-preview=1'); await page.locator('.wb-reel-filmstrip').waitFor();
  assert.equal(await page.locator('.wibrawl-home .wb-reel').count(), 1);
  assert.equal(await page.getByRole('button', { name: /play|pause/i }).count(), 0);
  await page.goto(base + '/admin/hero?wibrawl-preview=1'); await studio.locator('.wb-reel-queue-row').nth(2).waitFor();
  await studio.getByRole('checkbox', { name: 'Show Spotlight', exact: true }).check(); await idle();
  await studio.getByRole('checkbox', { name: 'Show Lookbook', exact: true }).check(); await idle();
  const handle = studio.getByRole('button', { name: 'Reorder Lookbook', exact: true });
  await handle.focus(); await page.keyboard.press('ArrowUp'); await idle();
  await handle.focus(); await page.keyboard.press('ArrowUp'); await idle();
  assert.deepEqual(getReels().map(reel => reel.id), ['lookbook', 'filmstrip', 'spotlight']);
  // Exercise pointer capture for both mouse and touch, as on the shared hero queue.
  async function dragReelToFirst(name, touch = false) {
    const handle = studio.getByRole('button', { name: 'Reorder ' + name, exact: true });
    await handle.scrollIntoViewIfNeeded(); await studio.locator('.wb-reel-queue-row').first().scrollIntoViewIfNeeded();
    const from = await handle.boundingBox(), to = await studio.locator('.wb-reel-queue-row').first().boundingBox();
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }, end = { x: to.x + 24, y: to.y + to.height / 2 };
    if (touch) {
      assert.equal(await handle.evaluate(node => getComputedStyle(node).touchAction), 'none');
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
      for (let step = 1; step <= 12; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
    } else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up(); }
    await page.waitForFunction(id => document.querySelector('.wb-reel-queue-row')?.dataset.heroSlideId === id, name.toLowerCase()); await idle();
  }
  await dragReelToFirst('Spotlight');
  await page.setViewportSize({ width: 390, height: 844 }); await dragReelToFirst('Lookbook', true);
  await page.setViewportSize({ width: 1440, height: 950 });
  // Restore the intended preview order with the same keyboard interaction.
  const filmHandle = studio.getByRole('button', { name: 'Reorder Filmstrip', exact: true });
  await filmHandle.focus(); await page.keyboard.press('ArrowUp'); await idle();
  assert.deepEqual(getReels().map(reel => reel.id), ['lookbook', 'filmstrip', 'spotlight']);

  await studio.getByRole('button', { name: 'Preview Spotlight', exact: true }).click();
  await studio.getByLabel('Reel headline', { exact: true }).fill('YOUR NEXT FAVOURITE.');
  await studio.locator('.merch-product-options label').filter({ hasText: 'Another Wibrawl tee' }).click();
  await studio.getByRole('button', { name: 'Save reel', exact: true }).click(); await idle();
  for (const viewport of [{width:1440,height:950},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    const feedback = await studio.locator('.reel-studio-feedback').boundingBox();
    const preview = await studio.locator('.merch-preview-dock').boundingBox();
    const queue = await studio.locator('.hero-slide-queue').boundingBox();
    assert.ok(feedback.height < 90, 'Saved feedback is compact');
    assert.ok(preview.y >= feedback.y + feedback.height, 'The preview follows the saved message');
    assert.ok(queue.y >= preview.y + preview.height, 'The order queue follows the preview');
    assert.ok(preview.width > (await studio.boundingBox()).width - 60, 'The reel preview spans the studio width');
    await studio.locator('.merch-preview-dock').scrollIntoViewIfNeeded();
    await page.locator('.site-header').evaluate(node => node.style.visibility = 'hidden');
    await studio.screenshot({path:output + '/admin-feedback-' + viewport.width + '.png'});
    await page.locator('.site-header').evaluate(node => node.style.visibility = '');
  }
  await page.setViewportSize({width:1440,height:950});
  assert.equal(getReels()[2].title, 'YOUR NEXT FAVOURITE.'); assert.deepEqual(getReels()[2].product_ids, ['wb2']);
  await studio.getByRole('button', { name: 'Use automatic selection', exact: true }).click();
  await studio.getByRole('button', { name: 'Save reel', exact: true }).click(); await idle();
  await page.reload(); await studio.locator('.wb-reel-queue-row').nth(2).waitFor();
  assert.equal(await studio.locator('.wb-reel-queue-row strong').first().innerText(), '1. Lookbook');
  await page.getByRole('combobox', { name: 'Hero storefront' }).selectOption('glamia');
  await studio.getByText('Domain specific · Glamia', { exact: true }).waitFor();
  assert.equal(await studio.locator('.wb-reel').count(), 0);
  // Social editing is available from either admin surface; the selector determines ownership.
  await page.goto(base + '/admin/storefront');
  await page.getByRole('combobox', { name: 'Socials storefront' }).waitFor();
  await page.getByLabel('Instagram', { exact: true }).fill('https://instagram.com/glamia-fixture');
  await page.getByRole('button', { name: 'Save storefront settings', exact: true }).click();
  await page.getByText('Storefront settings saved.', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Socials storefront' }).selectOption('wibrawl');
  await page.getByRole('group', { name: 'Wibrawl socials · Domain specific', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Instagram', { exact: true }).inputValue(), '');
  await page.getByLabel('Instagram', { exact: true }).fill('https://instagram.com/wibrawl-fixture');
  await page.getByRole('button', { name: 'Save storefront settings', exact: true }).click();
  await page.getByText('Storefront settings saved.', { exact: true }).waitFor();
  // Mobile swipe, vertical scrolling, product-tap suppression, and resumed automatic rotation.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/?wibrawl-preview=1'); await page.locator('.wibrawl-carousel').waitFor();
  await page.mouse.move(0, 0); await page.evaluate(() => scrollTo(0, 0));
  const cdp = await context.newCDPSession(page);
  async function swipeHero(direction) {
    const frame = page.locator('.wibrawl-hero-frames a').first(); await frame.scrollIntoViewIfNeeded();
    const box = await frame.boundingBox();
    const x = direction === 'left' ? box.x + box.width * .8 : box.x + box.width * .2;
    const end = direction === 'left' ? box.x + box.width * .2 : box.x + box.width * .8;
    const y = box.y + Math.min(box.height / 2, 140);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 12; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (end - x) * step / 12, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const initial = await page.locator('.wibrawl-hero h1').innerText();
  await swipeHero('left'); await page.waitForFunction(title => document.querySelector('.wibrawl-hero h1')?.textContent !== title, initial);
  const afterLeft = await page.locator('.wibrawl-hero h1').innerText(); assert.ok(page.url().includes('wibrawl-preview'));
  await swipeHero('right'); await page.getByRole('heading', { name: initial, exact: true }).waitFor();
  const frameBox = await page.locator('.wibrawl-hero-frames a').first().boundingBox(); const x = frameBox.x + frameBox.width / 2, y = frameBox.y + 120;
  const beforeScroll = await page.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 10, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await page.locator('.wibrawl-hero h1').innerText(), initial, 'Vertical scrolling cannot change the slide');
  assert.ok(await page.evaluate(() => scrollY) > beforeScroll, 'Vertical page scrolling remains available');
  await page.waitForFunction(title => document.querySelector('.wibrawl-hero h1')?.textContent !== title, initial, { timeout: 8500 });
  assert.equal(await page.locator('.wibrawl-hero h1').innerText(), afterLeft, 'Automatic rotation resumes after manual swiping');
  await page.getByRole('button', { name: 'Next hero slide', exact: true }).tap();
  const afterTap = await page.locator('.wibrawl-hero h1').innerText();
  await page.waitForFunction(title => document.querySelector('.wibrawl-hero h1')?.textContent !== title, afterTap, { timeout: 8500 });
  await cdp.detach();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [label, viewport] of [['desktop', { width: 1440, height: 950 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport); await page.goto(base + '/?wibrawl-preview=1'); await page.locator('.wb-reel-spotlight').waitFor();
    assert.deepEqual(await page.locator('.wibrawl-home .wb-reel').evaluateAll(nodes => nodes.map(node => node.dataset.reel)), ['lookbook', 'filmstrip', 'spotlight']);
    assert.equal(await page.locator('footer a[href="https://instagram.com/wibrawl-fixture"]').count(), 1);
    assert.equal(await page.locator('footer a[href="https://instagram.com/glamia-fixture"]').count(), 0);
    for (const theme of ['Gaming', 'Sports']) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      await page.locator('.wb-reel-spotlight').getByRole('button', { name: 'Next piece', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      const axe = await new AxeBuilder({ page }).include('.wb-reel').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      if (axe.violations.length) writeFileSync(output + '/axe-' + label + '-' + theme + '.json', JSON.stringify(axe.violations, null, 2));
      assert.deepEqual(axe.violations.map(violation => violation.id), [], label + ' ' + theme);
      await page.locator('.site-header').evaluate(node => node.style.visibility = 'hidden');
      for (const layout of ['filmstrip', 'spotlight', 'lookbook']) { await page.locator('.wb-reel-' + layout).screenshot({ path: `${output}/${label}-${theme.toLowerCase()}-${layout}.png` }); }
      await page.locator('.site-header').evaluate(node => node.style.visibility = '');
      checks.push({ label, theme, accessibility: 'pass' });
    }
  }
  await page.goto(base + '/'); await page.locator('footer').waitFor();
  assert.equal(await page.locator('footer a[href="https://instagram.com/glamia-fixture"]').count(), 1);
  assert.equal(await page.locator('footer a[href="https://instagram.com/wibrawl-fixture"]').count(), 0);
  assert.equal(await page.locator('.wb-reel').count(), 0);
  assert.deepEqual(errors, []); writeFileSync(output + '/report.json', JSON.stringify({ checks, errors, savedOrder: getReels().map(reel => reel.id) }, null, 2));
  console.log('Reel editor, subset visibility, order, product selection, brand socials, both themes, desktop/mobile and accessibility passed.');
} finally { await browser.close(); db.close(); }
