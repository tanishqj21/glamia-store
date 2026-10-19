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
    if(path === '/api/search' && url.searchParams.get('q') === 'fit-check') result = {engine:'vector',products:[products[1]]};
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
  for(const width of process.env.WIBRAWL_SSR_ONLY ? [] : [360,390,768,1440]) {
    const {ctx,page,goto}=await context({width,height:960});
    await goto('/');await page.locator('.wb-arena-hero.wb-hero--poster').waitFor();
    await expectMode('gaming');
    async function expectMode(mode){await page.waitForFunction(value=>document.querySelector('.wb-storefront')?.dataset.wibrawlMode===value,mode);}
    await page.locator('.wb-home-hubs').getByRole('link',{name:/JUST SPAWNED/}).waitFor();
    await audit(page,width+'-gaming-poster');
    await page.getByRole('button',{name:'Next hero slide',exact:true}).click();await page.locator('.wb-hero--collage').waitFor();await audit(page,width+'-gaming-collage');
    await page.getByRole('button',{name:'Preview Midnight Tee',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Preview Midnight Tee',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.wb-collage-lead .wb-arena-visual img').getAttribute('alt'),'Midnight Tee');
    await page.getByRole('button',{name:'Next hero slide',exact:true}).click();await page.locator('.wb-hero--split').waitFor();await audit(page,width+'-gaming-split');
    await page.locator('.wb-module-best .wb-spec-card').nth(3).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const layoutGeometry = () => page.evaluate(() => {
      const selectors=['.wb-command-bar','.wb-command-brand img','.wb-command-tools','.wb-arena-hero','.wb-home-hubs','.wb-module-arrived .wb-module-heading','.wb-ranked-bento','.wb-stadium-footer'];
      return Object.fromEntries(selectors.map(selector=>{
        const el=document.querySelector(selector),r=el.getBoundingClientRect(),css=getComputedStyle(el);
        return [selector,{width:r.width,height:r.height,font:css.fontFamily,size:css.fontSize,gap:css.gap,padding:css.padding,borderRadius:css.borderRadius}];
      }));
    });
    const darkGeometry=await layoutGeometry();
    const sports=page.getByRole('button',{name:'SPORTS MODE // Light Mode',exact:true});await sports.hover();await page.getByRole('tooltip',{name:'SPORTS MODE // Light Mode',exact:true}).waitFor();await sports.click();await expectMode('sports');assert.equal(await page.evaluate(()=>localStorage.getItem('wibrawl_mode')),'sports');await page.locator('.wb-home-hubs').getByRole('link',{name:/JUST SPAWNED/}).waitFor();await audit(page,width+'-sports-home');
    const lightGeometry=await layoutGeometry();
    assert.deepEqual(lightGeometry,darkGeometry,width+'px: switching themes must not resize or restyle the UI');
    assert.equal(await page.locator('.wb-command-brand .wb-logo-badge').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
    const tools=await page.locator('.wb-command-tools').evaluate(e=>[...e.children].map(child=>child.className));
    assert.ok(tools.indexOf('wb-mode-switch')>tools.findIndex(c=>c.includes('wb-account-trigger')));
    assert.ok(tools.indexOf('wb-mode-switch')<tools.findIndex(c=>c.includes('cart-link')));
    const heading=page.locator('.wb-module-arrived .wb-module-heading');
    const eyebrow=await heading.locator('.wb-tech').boundingBox(),title=await heading.getByRole('heading').boundingBox();
    assert.ok(eyebrow.y+eyebrow.height<=title.y,width+'px: section eyebrow must sit above its title');
    const cards=await page.locator('.wb-module-best .wb-ranked-bento>.wb-spec-card').evaluateAll(items=>items.slice(0,2).map(e=>e.getBoundingClientRect().y));
    assert.ok(Math.abs(cards[0]-cards[1])<1,width+'px: product rows stay aligned');
    console.log('Theme geometry, transparent branding and aligned headings passed at '+width+'px');

    if(width<768){assert.equal(await page.locator('.wb-command-dock').isVisible(),true);await page.locator('.wb-command-dock').getByRole('link',{name:'Spawned',exact:true}).waitFor();}
    assert.equal(await page.locator('.wb-logo-badge img').first().getAttribute('src'),'/wibrawl/logo-light.svg?v=master-a');assert.equal(await page.locator('.wb-stadium-footer .sr-only').count(),0);
    const card=page.locator('.wb-module-arrived .wb-spec-card').first();await card.scrollIntoViewIfNeeded();await card.hover();await card.getByRole('button',{name:'Add Courtside Tee, size M to bag',exact:true}).click();await card.getByText('M / Added to bag',{exact:true}).waitFor();assert.equal(await card.getByRole('button',{name:'Add Courtside Tee, size S to bag',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:/Open cart, 1 item/}).click();await page.getByRole('dialog',{name:'Your bag.'}).waitFor();await page.getByRole('dialog',{name:'Your bag.'}).getByRole('heading',{name:'Courtside Tee',exact:true}).waitFor();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Open account menu',exact:true}).click();await page.getByRole('dialog',{name:'Your Wibrawl'}).waitFor();await page.getByRole('button',{name:'Browse categories',exact:true}).click();await page.getByRole('dialog',{name:'Find your lane.',exact:true}).waitFor();assert.equal(await page.locator('.wb-category-tree details').count(),0);await page.locator('.wb-category-tree').getByRole('link',{name:/Graphic Tees/}).first().waitFor();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Find your next favourite',exact:true}).click();await page.getByRole('searchbox',{name:'Search the collection',exact:true}).fill('Midnight');await page.locator('.wb-command-results').getByRole('link',{name:/Midnight Tee/}).waitFor();await page.keyboard.press('Escape');
    await goto('/category/Graphic%20Tees?sub=Original%20Prints');await page.getByRole('heading',{name:'Graphic Tees',exact:true}).waitFor();await page.locator('.wb-spec-card').first().waitFor();
    for(const [route,title,display] of [['/just-arrived','JUST SPAWNED','.wb-lookbook-rail'],['/best-sellers','CURRENT META','.wb-ranked-bento'],['/offers','LOOT','.wb-drop-vault']]){await goto(route);await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.locator(display+' .wb-spec-card').first().waitFor();await audit(page,width+'-sports-'+route.slice(1));}
    assert.equal(await page.locator('.wb-deal-timer').count()>0,true);
    await goto('/search?query=fit-check');await page.getByRole('link',{name:'View Midnight Tee',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.wb-filtered-grid .wb-spec-card').length===1);
    await goto('/just-arrived');await page.getByRole('combobox',{name:'Colour',exact:true}).selectOption('White');await page.getByRole('link',{name:'View Midnight Tee',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.wb-spec-card').length===1);
    await goto('/product/tee-0');await page.locator('.wb-loadout-header h1').waitFor();await page.getByRole('button',{name:'Size chart & fit guide',exact:true}).click();await page.getByRole('dialog',{name:'Size chart & fit guide',exact:true}).waitFor();await page.getByRole('button',{name:'Zoom size chart',exact:true}).click();assert.equal(await page.locator('.wb-size-chart-image.is-zoomed').count(),1);await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'M Available',exact:true}).click();await page.locator('.wb-main-add').click();await page.locator('.wb-pdp-message').getByText('Added to your cart.',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'Questions & answers',exact:true}).click();await page.getByText('Q: Is the fit oversized?',{exact:true}).waitFor();await audit(page,width+'-sports-pdp');
    await page.getByRole('button',{name:'GAMING MODE // Dark Mode',exact:true}).click();await expectMode('gaming');await audit(page,width+'-gaming-pdp');
    await goto('/best-sellers');await page.getByRole('heading',{name:'CURRENT META',exact:true}).waitFor();assert.equal(await page.locator('.wb-spec-rank').first().textContent(),'#01');
    await ctx.close();console.log('Arena '+width+'px passed');
  }
  for(const width of [390,1440]){const {ctx,page,goto}=await context({width,height:960},{glamia:true});await goto('/just-arrived');await page.locator('.product-card').first().waitFor();assert.equal(await page.locator('.wb-command-bar,.wb-spec-card,.wb-command-dock').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-wibrawl-mode')),false);assert.equal(await page.evaluate(()=>localStorage.getItem('wibrawl_mode')),null);await ctx.close();}
  const {renderHomepageShell}=await import('../tmp/wibrawl-ssr/homepage-shell.js'),{renderProductShell}=await import('../tmp/wibrawl-ssr/product-shell.js'),{renderCartShell}=await import('../tmp/wibrawl-ssr/cart-shell.js');
  const template=await fetch(base).then(r=>r.text());
  for(const [path,id,data,shell] of [['/','glamia-storefront-bootstrap',{hero:{slides},settings},renderHomepageShell({hero:{slides},settings,storefront:'wibrawl'})],['/product/tee-0','glamia-product-bootstrap',{path:'/product/tee-0',product:products[0],settings},renderProductShell(products[0],settings,null,'wibrawl')],['/cart','glamia-cart-bootstrap',{path:'/cart',settings},renderCartShell(settings,'wibrawl')]]) {
    const {ctx,page,goto}=await context({width:1440,height:1000});const recoverable=[];page.on('console',m=>{if(m.type()==='error'&&/hydrat|server rendered|didn.t match/i.test(m.text()))recoverable.push(m.text());});await ctx.route('**/*',async route=>{if(route.request().isNavigationRequest()&&new URL(route.request().url()).pathname===path)return route.fulfill({contentType:'text/html',body:template.replace('<div id="root"></div>','<div id="root">'+shell+'</div>').replace('</head>','<script type="application/json" id="'+id+'">'+JSON.stringify(data).replaceAll('<','\\u003c')+'</script></head>')});await route.fallback();});await goto(path);await page.locator('.wb-account-trigger:not(:disabled)').waitFor();await page.getByRole('button',{name:'Open account menu',exact:true}).click();await page.getByRole('dialog').waitFor();assert.deepEqual(recoverable,[],path+': hydration');await ctx.close();console.log('Hydration '+path+' passed');
  }
}finally{await browser.close();writeFileSync(output+(process.env.WIBRAWL_SSR_ONLY?'/hydration-report.json':'/report.json'),JSON.stringify({errors,findings,requests},null,2));}
assert.deepEqual(errors,[]);console.log('Arena architecture, persona mutation, stock/cart, filters, PDP and Glamia isolation passed.');
