import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.WIBRAWL_TEST_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = 'tmp/wibrawl-cart-motion-review'; mkdirSync(output, { recursive: true });
const end = new Date(Date.now() + 3600000).toISOString();
const products = ['Courtside Tee', 'Midnight Tee', 'The Away Kit', 'First Team Tee'].map((name, i) => ({
  id: `tee-${i}`, name, category: 'Graphic Tees', subcategory: 'Original Prints', brand: 'Wibrawl',
  price: 799, mrp: 999, stock: 6, sizes: ['S','M','L','XL'], size_stock: { S: 0, M: 3, L: 3, XL: 0 },
  color: i === 1 ? 'White' : 'Black', color_hex: i === 1 ? '#eeeeee' : '#111111',
  variant_group: i < 2 ? 'fixture-colourway' : '', storefront_visibility: 'wibrawl', status: 'live',
  image_url: '/wibrawl/gaming-campaign-640.webp', thumbnail_url: '/wibrawl/gaming-campaign-640.webp',
  images: ['/wibrawl/gaming-campaign-640.webp', '/wibrawl/sports-campaign-640.webp'],
  description: 'An oversized graphic tee. Heavy cotton, made for everyday rotation.',
  specifications: 'Fabric: 240 GSM cotton\nFit: Oversized\nCare: Cold wash inside out',
  size_chart_url: '/wibrawl/sports-campaign-640.webp', hsn_code: '6109', gst_rate: 5,
  featured: i === 0, rating: 5, review_count: 1, created_at: '2026-10-16T12:00:00Z',
  ...(i === 2 ? { deal_price: 599, deal_starts_at: '2026-01-01T00:00:00Z', deal_ends_at: end } : {}),
}));
const slides = ['poster','collage','split'].map((layout, i) => ({ id: `slide-${i}`, layout, imagery: 'campaign', eyebrow: 'THE FIRST EDIT', title: ['YOUR VIBE. YOUR RULES.', 'NO FILTER. ALL YOU.', 'PLAY IT YOUR WAY.'][i], tagline: 'For the everyday rotation. Find the pieces that feel like you.', cta_label: 'Shop the edit', cta_category: 'Graphic Tees', words: ['NO FILTER', 'ALL YOU'], frames: products.slice(0,3).map(p => ({ id: p.id, name: p.name, image: p.image_url, color: p.color })) }));
const settings = { announcement: { visible: true, text: 'The first edit is here', items: [{ id: 'live', text: 'Website launch celebrations', starts_at: '2026-01-01T00:00:00Z', ends_at: end }] }, trust_strip: { visible: false }, seo: {}, customer_experience: {}, payments: { methods: [] }, socials: { instagram: 'https://www.instagram.com/wibrawl' }, active_event: { id: 'live', name: 'Matchday edit', headline: 'A new season starts here.', message: 'Explore the latest pieces.', active: true, starts_at: '2026-01-01T00:00:00Z', ends_at: end, show_on_home: true, cta_href: '/offers', cta_label: 'Shop the edit' }, cinematic_reels: ['lookbook','spotlight','filmstrip'].map((layout, i) => ({ id: layout, layout, visible: i !== 1, eyebrow: 'THE WIBRAWL EDIT', title: ['GOOD TEES.', 'THE SPOTLIGHT.', 'IN ROTATION.'][i], emphasis: 'GREAT ENERGY.', description: 'A closer look at your next rotation.', product_ids: ['tee-0','tee-2','tee-3'] })) };
const errors = [], requests = [];
const browser = await chromium.launch();
async function context(viewport, { glamia = false, signedIn = false, empty = false } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' });
  await ctx.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    requests.push({ path, method: request.method() }); let result = {};
    if (path === '/api/session') result = { user: signedIn ? { name: 'Test Buyer', email: 'test@example.com', role: 'customer' } : null, profile_complete: true };
    else if (path === '/api/storefront-settings') result = settings;
    else if (path === '/api/hero') result = { slides };
    else if (path === '/api/products') result = { products: empty ? [] : products.map(product => { const card = {...product}; delete card.images; delete card.video_url; if (!url.searchParams.has('include_stock')) delete card.size_stock; return card; }), facets: { colors: ['Black','White'], sizes: ['S','M','L','XL'] }, pagination: { total: empty ? 0 : products.length, has_more: false } };
    else if (path.endsWith('/reviews')) result = { reviews: [{ id: 'review', name: 'A buyer', customer_name: 'A buyer', rating: 5, comment: 'Great fit and fabric.', verified_purchase: true, created_at: '2026-10-01' }], count: 1, average: 5 };
    else if (path.endsWith('/questions')) result = { questions: [{ id: 'q1', question: 'Is the fit oversized?', answer: 'Yes, this piece has an oversized fit.' }] };
    else if (path.startsWith('/api/products/')) result = { product: products.find(p => path.includes(p.id)) || products[0], colourways: products.slice(0,2) };
    else if (path === '/api/categories') result = { categories: ['Graphic Tees'], subcategories: [{ category: 'Graphic Tees', name: 'Original Prints' }] };
    else if (path === '/api/search') result = { products: products.filter(p => `${p.name} ${p.category} ${p.color}`.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase())) };
    else if (path === '/api/about') result = { eyebrow: 'Our story', headline: 'Made for your everyday.', introduction: 'The same story, one shared brand family.', timeline: [{ id: 'first', period: 'The beginning', title: 'Find your people', body: 'The first chapter of our story.' }, { id: 'next', period: 'Today', title: 'Make it yours', body: 'The story keeps moving with you.' }] };
    else if (path === '/api/loyalty') result = { balance: 250, referral_code: 'TEST123', referred_reward: 100, referral_reward: 50, ledger: [{ id: 'credit', kind: 'reward', description: 'Referral reward', amount: 50, created_at: '2026-10-01T12:00:00Z' }] };
    else if (path.startsWith('/api/saved-items')) result = { cart: [], wishlist: [], saved_for_later: [] };
    else if (path === '/api/addresses') result = { addresses: [] };
    else if (path === '/api/orders') result = { orders: [] };
    else if (path === '/api/returns') result = { requests: [] };
    else if (path === '/api/support/tickets') result = { tickets: [] };
    if(path === '/api/products' && url.searchParams.get('color_family')) result.products = result.products.filter(p => p.color.toLowerCase() === url.searchParams.get('color_family').toLowerCase());
    await route.fulfill({ json: result });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  async function goto(path = '/') { await page.goto(`${base}${path}${path.includes('?') ? '&' : '?'}${glamia ? '' : 'wibrawl-preview=1'}`); await page.locator(glamia ? '.app-shell' : '.wb-storefront').waitFor(); await page.waitForFunction(() => !document.getElementById('initial-loader') || document.getElementById('initial-loader').classList.contains('is-hidden')); }
  return { ctx, page, goto };
}

async function freezeFlight(page) {
  // Freeze only decorative Web Animations for deterministic inspection.
  // The cart controller, DOM and event handling still run normally.
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const result = animate.apply(this, args);
      if (this.className?.toString().startsWith('wb-cart-flight')) {
        result.pause(); result.currentTime = 430 + Number(args[1]?.delay || 0);
      }
      return result;
    };
  });
}
try {
  for (const width of [390, 1440]) {
    for (const mode of ['gaming', 'sports']) {
      const { ctx, page, goto } = await context({ width, height: 960 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await ctx.addInitScript(value => localStorage.setItem('wibrawl_mode', value), mode);
      await goto('/best-sellers');
      const card = page.locator('.wb-spec-card').first();
      await card.scrollIntoViewIfNeeded(); await card.hover();
      const add = card.getByRole('button', { name: 'Add Courtside Tee, size M to bag', exact: true });
      await expect(add).toBeEnabled();
      await card.locator('.wb-spec-image img').first().evaluate(image => image.decode());
      await freezeFlight(page);
      await add.click();
      await expect(page.getByRole('button', { name: 'Open cart, 1 item', exact: true })).toBeVisible();
      const flight = page.locator('.wb-cart-flight');
      await expect(flight.locator('.wb-cart-flight-piece')).toHaveCount(7);
      assert.equal(await flight.getAttribute('aria-hidden'), 'true');
      assert.equal(await flight.evaluate(node => getComputedStyle(node).pointerEvents), 'none');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      assert.equal(await flight.evaluate(node => !node.showPopover || node.matches(':popover-open')), true);
      // Inspect the paused cascade, then advance its real cleanup timer.
      await page.screenshot({ path: `${output}/${width}-${mode}-cascade.png` });
      await page.clock.runFor(1300);
      await expect(flight).toHaveCount(0);
      await page.getByRole('button', { name: 'Open cart, 1 item', exact: true }).click();
      await page.getByRole('dialog', { name: 'Your bag.' }).getByRole('heading', { name: 'Courtside Tee', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      // Rapid additions preserve quantities and bound the visual work to one flight.
      await add.click(); await add.click();
      await expect(page.getByRole('button', { name: 'Open cart, 3 items', exact: true })).toBeVisible();
      assert.equal(await flight.count() <= 1, true);
      await page.evaluate(() => dispatchEvent(new Event('resize')));
      await expect(flight).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await add.click(); await expect(page.getByRole('button', { name: 'Open cart, 4 items', exact: true })).toBeVisible();
      await expect(flight).toHaveCount(0);
      await ctx.close(); console.log(`${width}px ${mode}: cascade, real bag, rapid additions, cleanup and reduced motion passed`);
    }
  }
  const { ctx, page, goto } = await context({ width: 390, height: 960 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await goto('/product/tee-0');
  await page.locator('.wb-loadout-header h1').waitFor();
  await page.locator('.wb-main-add').click();
  await page.getByText('Choose your size first.', { exact: true }).waitFor();
  await expect(page.locator('.wb-cart-flight')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open cart, 0 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'M Available', exact: true }).click();
  await page.locator('.wb-main-add').click();
  await expect(page.locator('.wb-cart-flight-piece')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Open cart, 1 item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Your orders', exact: true }).click();
  await expect(page.locator('.wb-cart-flight')).toHaveCount(0);
  await goto('/best-sellers');
  const card = page.locator('.wb-spec-card').first(); await card.scrollIntoViewIfNeeded(); await card.hover();
  await card.getByRole('button', { name: 'Quick view Courtside Tee', exact: true }).click();
  const quick = page.getByRole('dialog', { name: 'Courtside Tee', exact: true });
  await quick.getByRole('button', { name: 'M', exact: true }).click();
  await quick.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.locator('.wb-cart-flight-piece')).toHaveCount(7);
  await expect(quick).toBeVisible();
  assert.equal(await quick.evaluate(node => node.contains(document.activeElement)), true, 'motion retains modal focus');
  await expect(page.locator('.wb-cart-flight')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close product details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open cart, 2 items', exact: true })).toBeVisible();
  await ctx.close(); console.log('PDP size validation, route cleanup and native quick-view dialog passed');
  const glamia = await context({ width: 1440, height: 960 }, { glamia: true });
  await glamia.page.emulateMedia({ reducedMotion: 'no-preference' }); await glamia.goto('/product/tee-0');
  await glamia.page.locator('.detail-copy .size-list').getByRole('button', { name: 'M', exact: true }).click();
  await glamia.page.locator('.detail-copy').getByRole('button', { name: 'Add to bag', exact: true }).click();
  await glamia.page.getByText('Added to your cart.', { exact: true }).waitFor();
  await expect(glamia.page.locator('.wb-cart-flight,.wb-cart-confirmed')).toHaveCount(0);
  await glamia.ctx.close(); console.log('Glamia add-to-bag remains unchanged');
  assert.deepEqual(errors, []);
} finally {
  await browser.close(); writeFileSync(output + '/report.json', JSON.stringify({ errors, requests }, null, 2));
}
