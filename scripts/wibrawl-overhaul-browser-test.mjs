import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const base = process.env.WIBRAWL_TEST_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = 'tmp/wibrawl-overhaul-review'; mkdirSync(output, { recursive: true });
await build({ entryPoints: ['src/homepage-shell.jsx','src/product-shell.jsx','src/cart-shell.jsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outdir: 'tmp/wibrawl-ssr', jsx: 'automatic', logLevel: 'silent' });
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
const errors = [], findings = [], requests = [];
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
    await route.fulfill({ json: result });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  async function goto(path = '/') { await page.goto(`${base}${path}${path.includes('?') ? '&' : '?'}${glamia ? '' : 'wibrawl-preview=1'}`); await page.locator(glamia ? '.app-shell' : '.wb-storefront').waitFor(); await page.waitForFunction(() => !document.getElementById('initial-loader') || document.getElementById('initial-loader').classList.contains('is-hidden')); }
  return { ctx, page, goto };
}
async function audit(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name}: no overflow`);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  const violations = axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
  findings.push({ name, violations });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  assert.deepEqual(violations, [], `${name}: accessibility`);
}
try {
  for (const width of [360,390,768,1440]) {
    const { ctx, page, goto } = await context({ width, height: 960 });
    await goto(); await page.locator('.wb-product-card').first().waitFor();
    assert.equal(await page.locator('.wb-shoppable-section').count(), 2, 'Only enabled reels render');
    assert.deepEqual(await page.locator('.wb-shoppable-section').evaluateAll(nodes => nodes.map(n => n.dataset.reel)), ['lookbook','filmstrip']);
    const controls = await page.locator('.wb-header-actions').evaluate(el => [...el.children].map(n => n.className));
    assert.ok(controls.indexOf('wb-icon-action wb-account-trigger') < controls.findIndex(c => c.includes('wibrawl-theme-toggle')));
    assert.equal(await page.locator('.wb-header details').count(), 0);
    for (const layout of ['poster','collage','split']) {
      await page.locator(`.wb-hero--${layout}`).waitFor();
      await audit(page, `${width}-dark-${layout}`);
      if (layout !== 'split') await page.getByRole('button', { name: 'Next hero slide' }).click();
    }
    await page.getByRole('button', { name: 'Preview Midnight Tee', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Preview Midnight Tee', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Switch to Stadium Light', exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('wibrawl-theme')), 'light');
    await audit(page, `${width}-light-home`);
    await page.getByRole('button', { name: 'Open account menu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Your Wibrawl' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Pick your side.' }).waitFor();
    await page.getByRole('dialog').getByText('Graphic Tees', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await page.locator(width < 768 ? '.wb-bottom-nav button' : '.wb-search-trigger').filter({ hasText: width < 768 ? 'Search' : 'Find your next favourite' }).click();
    await page.getByRole('searchbox', { name: 'Search Wibrawl products' }).fill('Graphic Tees');
    await page.locator('.wb-search-results>a').first().waitFor();
    await page.keyboard.press('Escape');
    const first = page.locator('.wb-product-card').first();
    await first.scrollIntoViewIfNeeded();
    await first.getByRole('button', { name: /Add Courtside Tee, size M to bag/ }).click();
    await first.getByText('M / Added to bag', { exact: true }).waitFor();
    assert.equal(await first.getByRole('button', { name: /size S to bag/ }).isDisabled(), true);
    await first.getByRole('button', { name: 'Preview White', exact: true }).click();
    await first.getByRole('heading', { name: 'Midnight Tee', exact: true }).waitFor();
    await goto('/product/tee-0');
    await page.getByRole('heading', { name: 'Courtside Tee', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Find your fit / Size guide' }).click();
    await page.getByRole('dialog', { name: 'Find your fit' }).waitFor();
    await page.getByRole('button', { name: 'Zoom size chart' }).click();
    assert.equal(await page.locator('.wb-size-chart-image.is-zoomed').count(), 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.locator('.wb-main-add').click();
    await page.locator('.wb-pdp-message').getByText('Added to your cart.', { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Questions & answers', exact: true }).click();
    await page.getByText('Q: Is the fit oversized?').waitFor();
    await audit(page, `${width}-light-pdp`);
    await goto('/about'); await page.getByRole('button', { name: /Make it yours/ }).click(); await page.getByText('The story keeps moving with you.', { exact: true }).waitFor();
    await goto('/cart'); await page.getByRole('heading', { name: 'Shopping bag', exact: true }).waitFor();
    await audit(page, `${width}-light-cart`);
    await ctx.close(); console.log(`Wibrawl ${width}px passed`);
  }
  const account = await context({ width:390,height:844 }, { signedIn:true });
  await account.goto('/credits'); await account.page.getByText('TEST123', { exact:true }).waitFor(); await audit(account.page, 'credits-mobile');
  await account.goto('/orders'); await account.page.getByRole('heading', { name:'Your drops.',exact:true }).waitFor(); await audit(account.page,'orders-mobile');
  await account.goto('/support'); await account.page.getByRole('heading').first().waitFor(); await audit(account.page,'support-mobile'); await account.ctx.close();
  const returns = await context({width:390,height:844},{signedIn:true}); await returns.goto('/returns'); await returns.page.getByRole('heading',{name:'Returns & exchanges',exact:true}).waitFor(); await audit(returns.page,'returns-mobile'); await returns.ctx.close();
  for (const width of [390,1440]) {
    const {ctx,page,goto}=await context({width,height:960},{glamia:true}); await goto('/just-arrived'); await page.locator('.product-card').first().waitFor();
    assert.equal(await page.locator('.wb-header,.wb-bottom-nav,.wb-product-card').count(),0,'Glamia keeps its original components');
    assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-wibrawl-theme')),false);
    await page.screenshot({path:`${output}/glamia-${width}.png`,fullPage:true}); await ctx.close();
  }
  const { renderHomepageShell } = await import('../tmp/wibrawl-ssr/homepage-shell.js');
  const { renderProductShell } = await import('../tmp/wibrawl-ssr/product-shell.js');
  const { renderCartShell } = await import('../tmp/wibrawl-ssr/cart-shell.js');
  const template = await fetch(base).then(response => response.text());
  for (const [path, id, data, shell] of [
    ['/', 'glamia-storefront-bootstrap', {hero:{slides},settings}, renderHomepageShell({hero:{slides},settings,storefront:'wibrawl'})],
    ['/product/tee-0', 'glamia-product-bootstrap', {path:'/product/tee-0',product:products[0],settings}, renderProductShell(products[0],settings,null,'wibrawl')],
    ['/cart','glamia-cart-bootstrap',{path:'/cart',settings},renderCartShell(settings,'wibrawl')],
  ]) {
    const {ctx,page,goto}=await context({width:1440,height:1000}); const recoverable=[];
    page.on('console',message=>{if(message.type()==='error' && /hydrat|server rendered|didn.t match/i.test(message.text()))recoverable.push(message.text());});
    await ctx.route('**/*',async route=>{if(route.request().isNavigationRequest()&&new URL(route.request().url()).pathname===path)return route.fulfill({contentType:'text/html',body:template.replace('<div id="root"></div>',`<div id="root">${shell}</div>`).replace('</head>',`<script type="application/json" id="${id}">${JSON.stringify(data).replaceAll('<','\\u003c')}</script></head>`)});await route.fallback();});
    await goto(path); await page.waitForFunction(()=>document.querySelector('.wb-storefront[data-wibrawl-theme="dark"]')); await page.locator('.wb-account-trigger:not(:disabled)').waitFor();
    await page.getByRole('button',{name:'Open account menu',exact:true}).click(); await page.getByRole('dialog').waitFor();
    assert.deepEqual(recoverable,[],`${path}: clean server hydration`); await ctx.close(); console.log(`Hydration ${path} passed`);
  }
  const film = await context({width:1440,height:1000});
  const clip = await film.page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=180;canvas.height=320;
    const stream=canvas.captureStream(12), recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}), chunks=[];
    recorder.ondataavailable=event=>chunks.push(event.data);
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
    const drawing=canvas.getContext('2d');drawing.fillStyle='#ccff00';drawing.fillRect(0,0,180,320);
    await new Promise(resolve=>setTimeout(resolve,350));recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());
    const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());return Array.from(bytes);
  });
  products[0].video_url='/__wibrawl-fixture/reel.webm';
  await film.ctx.route('**/__wibrawl-fixture/reel.webm',route=>route.fulfill({contentType:'video/webm',body:Buffer.from(clip)}));
  await film.goto(); await film.page.emulateMedia({reducedMotion:'no-preference'});
  const reel=film.page.locator('.wb-shoppable-card').first();await reel.scrollIntoViewIfNeeded();
  await reel.locator('video').waitFor();await film.page.waitForFunction(()=>{const video=document.querySelector('.wb-shoppable-card video');return video && !video.paused && video.readyState>=2;});
  assert.equal(await reel.locator('video').evaluate(video=>video.muted),true);
  await reel.getByRole('button',{name:'Unmute Courtside Tee',exact:true}).click();assert.equal(await reel.locator('video').evaluate(video=>video.muted),false);
  await film.page.emulateMedia({reducedMotion:'reduce'});await film.page.waitForFunction(()=>document.querySelector('.wb-shoppable-card video').paused);
  await film.ctx.close(); delete products[0].video_url; console.log('Real optional video, autoplay, mute and reduced motion passed');
} finally { await browser.close(); writeFileSync(`${output}/report.json`, JSON.stringify({errors,findings,requests},null,2)); }
assert.deepEqual(errors,[]); console.log('Wibrawl overhaul and Glamia isolation checks passed.');
