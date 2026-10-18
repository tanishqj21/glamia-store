import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const base = process.env.WIBRAWL_TEST_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = 'tmp/wibrawl-performance-review'; mkdirSync(output, { recursive: true });
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

try {
  const { ctx, page, goto } = await context({ width: 390, height: 960 });
  await ctx.addInitScript(() => {
    window.__appRenders = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(),
      inject(renderer) { this.renderers.set(1, renderer); return 1; },
      onCommitFiberRoot(id, root) {
        const visit = fiber => { if (!fiber) return; if (fiber.type?.name === 'App' && (fiber.flags & 1)) window.__appRenders++; visit(fiber.child); visit(fiber.sibling); };
        visit(root.current);
      },
      onCommitFiberUnmount() {}, onScheduleFiberRoot() {}, checkDCE() {},
    };
  });
  const time = Date.now();
  products[2].deal_starts_at = new Date(time + 10000).toISOString();
  products[2].deal_ends_at = new Date(time + 20000).toISOString();
  await page.clock.install({ time: new Date(time) });
  await goto('/offers');
  await page.locator('.wb-account-trigger:not(:disabled)').waitFor();
  await expect(page.getByRole('heading', { name: 'The vault is between drops.', exact: true })).toBeVisible();
  const initialRenders = await page.evaluate(() => window.__appRenders);
  assert.ok(initialRenders > 0, 'React render instrumentation is active');
  await page.clock.runFor(11000);
  await expect(page.locator('.wb-drop-vault .wb-spec-card')).toHaveCount(1);
  await expect(page.locator('.wb-drop-vault .wb-price>span').first()).toContainText('599');
  const firstTimer = await page.locator('.wb-deal-timer').textContent();
  await page.clock.runFor(2000);
  assert.notEqual(await page.locator('.wb-deal-timer').textContent(), firstTimer, 'seconds continue to tick');
  const settledRenders = await page.evaluate(() => window.__appRenders);
  await page.clock.runFor(2000);
  assert.equal(await page.evaluate(() => window.__appRenders), settledRenders, 'countdown ticks do not rerender the application');
  await page.clock.runFor(8000);
  await expect(page.locator('.wb-drop-vault .wb-spec-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'The vault is between drops.', exact: true })).toBeVisible();
  await ctx.close();
  // Server-provided media must survive hydration and still select crisp large
  // images on desktop. Exercise the real bootstrap adapter and shared markup.
  const { build } = await import('esbuild');
  const bundle = await build({ entryPoints: ['react-app/src/lib/storefrontBootstrap.js','src/wibrawl-media.js'], bundle: true, platform: 'node', format: 'esm', outdir: 'tmp/wibrawl-performance-modules', logLevel: 'silent' });
  assert.equal(bundle.errors.length, 0);
  const { restoreFirstScreenMedia } = await import('../tmp/wibrawl-performance-modules/react-app/src/lib/storefrontBootstrap.js');
  const { wibrawlCampaignSources } = await import('../tmp/wibrawl-performance-modules/src/wibrawl-media.js');
  const inline = 'data:image/avif;base64,AAAA';
  const restored = restoreFirstScreenMedia({ hero: { campaign_image_from_dom: true, slides: [{}] } }, { querySelector: selector => selector.includes('.wb-arena-visual') ? { getAttribute: name => name === 'srcset' ? inline + ' 480w, /large.avif 1440w' : null } : null });
  assert.equal(restored.hero.slides[0].campaign_image, inline);
  assert.match(wibrawlCampaignSources(inline), /AAAA 480w/);
  assert.match(wibrawlCampaignSources(inline), /streetwear-campaign-1440.avif 1440w/);
  const productInline = 'data:image/webp;base64,AAAA';
  const restoredProduct = restoreFirstScreenMedia({ product: { first_image_inline: { from_dom: true, source: '/original.webp' } } }, { querySelector: selector => selector.includes('.wb-media-deck') ? { getAttribute: name => name === 'srcset' ? productInline + ' 720w' : null } : null });
  assert.equal(restoredProduct.product.first_image_inline.data, productInline);
  assert.deepEqual(errors, []);
  console.log('Scheduled deal starts/ends, ticking seconds, isolated application renders and first-screen media passed');
} finally { await browser.close(); }
