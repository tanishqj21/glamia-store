import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8787';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('UI tests require a local server.');
const output = new URL('../test-results/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const findings = [];
const errors = [];
const catalog = await fetch(`${base}/api/products?view=cards`).then(r => r.json());
const product = catalog.products.find(p => Object.values(p.size_stock || {}).some(n => n >= 2));
assert.ok(product, 'Local catalog needs an in-stock product. Run local smoke fixtures first.');
const size = Object.keys(product.size_stock).find(s => product.size_stock[s] >= 2);
const slugify = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const canonicalProductPath = `/${slugify(product.category) || 'collection'}/${slugify(product.subcategory) || 'collection'}/${slugify(product.name) || product.id}-${product.id.toLowerCase()}`;
const categoryRoutes = [...new Set((catalog.products || []).map(p => p.category).filter(Boolean))].map(category => `/${slugify(category)}`);
const routes = [...new Set(['/', '/offers', '/just-arrived', '/best-sellers', '/search', ...categoryRoutes, `/product/${product.id}`, canonicalProductPath, '/cart', '/checkout', '/profile', '/address', '/orders', '/wishlist', '/support', '/contact', '/policies', '/terms-and-conditions', '/privacy-policy', '/refund-cancellation-policy', '/return-policy', '/shipping-policy', '/track-order', '/admin', ...['storefront','labels','hero','add-product','bulk-listing','orders','products','inventory','notifications','customers','reviews','questions','coupons','deals','categories','returns','support','system','manage-store'].map(p => `/admin/${p}`)])];
const vars = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
const secret = vars.split('\n').find(line => line.startsWith('SESSION_SECRET='))?.split('=').slice(1).join('=').trim();
const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const email = config.match(/"ADMIN_EMAILS"\s*:\s*\[\s*"([^"]+)"/)?.[1];
const now = Math.floor(Date.now() / 1000);
const encoded = Buffer.from(JSON.stringify({ sub: 'qa-browser', email, name: 'QA Admin', role: 'admin', iat: now, nbf: now, exp: now + 3600 })).toString('base64url');
const token = encoded + '.' + createHmac('sha256', secret).update(encoded).digest('base64url');
const demoSessionResponse = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
const demoSetCookie = demoSessionResponse.headers.getSetCookie?.()[0] || demoSessionResponse.headers.get('set-cookie') || '';
const demoCookie = demoSetCookie.split(';', 1)[0];
const [demoCookieName, ...demoCookieValue] = demoCookie.split('=');
const browserSessionCookie = demoCookieName && demoCookieValue.length ? { name: demoCookieName, value: demoCookieValue.join('='), url: base } : { name: 'mm_session', value: token, url: base };
try {
  for (const [label, viewport] of [['desktop', {width:1440,height:1000}], ['mobile', {width:390,height:844}]]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await context.addCookies([browserSessionCookie]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    await page.addInitScript(({id,size}) => localStorage.setItem('glamia-react-cart', JSON.stringify([{id,size,quantity:1}])), {id:product.id,size});
    for (const path of routes) {
      await page.goto(base + path, {waitUntil:'domcontentloaded'});
      await page.locator('#main-content').waitFor();
      await page.waitForFunction(() => !/Preparing your|Loading product|Loading collection/.test(document.querySelector('#main-content')?.textContent || ''));
      await page.locator('h1').first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      const axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      const violations = axe.violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.map(n => ({target:n.target, summary:n.failureSummary}))}));
      findings.push({viewport:label,path,overflow,violations});
      writeFileSync(new URL('react-browser-report.json',output),JSON.stringify({findings,errors},null,2));
      console.log(`${label} ${path}: overflow=${overflow}, accessibility=${violations.map(v=>v.id).join(',') || 'pass'}`);
      if (['/', '/cart','/checkout','/admin','/admin/products','/support'].includes(path)) await page.screenshot({path:fileURLToPath(new URL(`${label}-${path.replaceAll('/','-') || 'home'}.png`,output)),fullPage:true});
    }
    await page.goto(base + '/cart');
    await page.getByRole('button',{name:/Increase quantity/}).click();
    await page.getByText('Quantity 2',{exact:false}).waitFor();
    await page.getByRole('button',{name:/Decrease quantity/}).click();
    await page.getByText('Quantity 1',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Remove',exact:true}).click();
    await page.getByText('Your bag is ready for something excellent.',{exact:false}).waitFor();
    await page.goto(base);
    await page.locator('.product-image').first().click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(),0);
    if (label === 'desktop') {
      await page.goto(base);
      await page.waitForFunction(() => Boolean(document.querySelector('.account-menu')));
      await page.locator('.account-menu > summary').click();
      await page.locator('.account-menu-link', { hasText: 'Wishlist' }).waitFor();
      await page.locator('.account-menu-link', { hasText: 'Your orders' }).waitFor();
      await page.locator('.account-menu-link', { hasText: 'Profile' }).waitFor();
      await page.locator('.account-menu-logout').click();
      await page.locator('.login-link').waitFor();
    }
    await page.goto(base + '/legacy-index.html', {waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'This page has moved.'}).waitFor();
    await context.close();
  }
  const guest = await browser.newContext();
  const page = await guest.newPage();
  await page.addInitScript(() => { localStorage.setItem('glamia-react-cart','{bad');localStorage.setItem('glamia-react-wishlist','null'); });
  await page.goto(base + '/cart');
  await page.getByRole('heading',{name:'Shopping bag'}).waitFor();
  await guest.close();
} finally {
  writeFileSync(new URL('react-browser-report.json',output),JSON.stringify({findings,errors},null,2));
  await browser.close();
}
assert.deepEqual(errors,[],'React runtime errors');
assert.equal(findings.filter(f=>f.overflow).length,0,'Horizontal overflow');
assert.equal(findings.filter(f=>f.violations.some(v=>['serious','critical'].includes(v.impact))).length,0,'Serious accessibility violations');
console.log(`PASS: ${findings.length} route/viewport checks, cart controls, dialog Escape, corrupted storage.`);
