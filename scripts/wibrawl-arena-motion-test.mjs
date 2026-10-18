import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const base = process.env.WIBRAWL_TEST_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = 'tmp/wibrawl-arena-review'; mkdirSync(output, { recursive: true });
await build({ entryPoints: ['src/homepage-shell.jsx','src/product-shell.jsx','src/cart-shell.jsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outdir: 'tmp/wibrawl-ssr', jsx: 'transform', logLevel: 'silent' });
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
    if(path === '/api/products' && url.searchParams.get('color_family')) result.products = result.products.filter(p => p.color.toLowerCase() === url.searchParams.get('color_family').toLowerCase());
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
  if(name.includes("poster") || name.includes("pdp")) await page.screenshot({path:`${output}/${name}-viewport.png`});
  assert.deepEqual(violations, [], `${name}: accessibility`);
}
try {
  const film=await context({width:1440,height:1000});
  const clip=await film.page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=180;canvas.height=320;const stream=canvas.captureStream(12),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();const drawing=canvas.getContext('2d');for(let frame=0;frame<12;frame++){drawing.fillStyle='#ccff00';drawing.fillRect(0,0,180,320);drawing.fillStyle='#09090b';drawing.fillRect(frame*10,80,20,20);await new Promise(resolve=>setTimeout(resolve,40));}recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));});
  products[0].video_url='/__wibrawl-fixture/reel.webm';await film.ctx.route('**/__wibrawl-fixture/reel.webm',route=>route.fulfill({contentType:'video/webm',body:Buffer.from(clip)}));await film.goto();await film.page.emulateMedia({reducedMotion:'no-preference'});const reel=film.page.locator('.wb-film-card').first();await film.page.locator('.wb-module-best .wb-spec-card').nth(3).waitFor();await reel.scrollIntoViewIfNeeded();await reel.locator('video').waitFor();await reel.scrollIntoViewIfNeeded();try { await film.page.waitForFunction(()=>{const video=document.querySelector('.wb-film-card video');return video&&!video.paused&&video.readyState>=2;}); } catch(error) {console.log(JSON.stringify(await film.page.locator('.wb-film-card').evaluateAll(cards=>cards.map(card=>({box:card.getBoundingClientRect().toJSON(),video:[...card.querySelectorAll('video')].map(v=>({paused:v.paused,ready:v.readyState,error:v.error?.message,source:v.currentSrc,muted:v.muted}))}))),null,2));await film.page.screenshot({path:output+'/film-debug.png'});throw error;}assert.equal(await reel.locator('video').evaluate(v=>v.muted),true);await reel.getByRole('button',{name:'Pause Courtside Tee',exact:true}).click();assert.equal(await reel.locator('video').evaluate(v=>v.paused),true);await reel.getByRole('button',{name:'Play Courtside Tee',exact:true}).click();await reel.getByRole('button',{name:'Unmute Courtside Tee',exact:true}).click();assert.equal(await reel.locator('video').evaluate(v=>v.muted),false);await film.page.emulateMedia({reducedMotion:'reduce'});await film.page.waitForFunction(()=>document.querySelector('.wb-film-card video').paused);await film.ctx.close();delete products[0].video_url;console.log('Real reel autoplay, play/pause, mute and reduced-motion passed');
  const hero=await context({width:1440,height:1000});await hero.page.emulateMedia({reducedMotion:'no-preference',colorScheme:'light'});await hero.goto();await hero.page.mouse.move(2,2);await hero.page.locator('.wb-hero--poster').waitFor();await hero.page.locator('.wb-hero--collage').waitFor({timeout:12000});await hero.page.getByRole('button',{name:'Preview Midnight Tee',exact:true}).click();assert.equal(await hero.page.locator('.wb-collage-lead .wb-arena-visual img').getAttribute('alt'),'Midnight Tee');assert.equal(await hero.page.locator('.wb-storefront').getAttribute('data-wibrawl-mode'),'gaming','default is gaming even on a light device');await hero.ctx.close();console.log('Hero automatic rotation and default gaming persona passed');
  const legacy=await context({width:390,height:844});await legacy.ctx.addInitScript(()=>localStorage.setItem('wibrawl-theme','light'));await legacy.goto();await legacy.page.waitForFunction(()=>document.querySelector('.wb-storefront')?.dataset.wibrawlMode==='sports');assert.equal(await legacy.page.evaluate(()=>localStorage.getItem('wibrawl_mode')),'sports');await legacy.ctx.close();console.log('Existing saved persona migrates to wibrawl_mode');
  const swipe=await context({width:390,height:844});await swipe.goto();await swipe.page.locator('.wb-hero--poster').waitFor();await swipe.page.locator('.wb-arena-hero').evaluate(element=>{element.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[new Touch({identifier:1,target:element,clientX:330,clientY:350})]}));element.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[new Touch({identifier:1,target:element,clientX:40,clientY:350})]}));});await swipe.page.locator('.wb-hero--collage').waitFor();await swipe.ctx.close();console.log('Mobile horizontal hero swipe passed');
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
