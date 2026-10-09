import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('UI tests require a local server.');
const output = new URL('../test-results/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const findings = [];
const errors = [];
const catalog = await fetch(`${base}/api/products`).then(r => r.json());
const product = catalog.products.find(p => Object.values(p.size_stock || {}).some(n => n >= 2));
assert.ok(product, 'Local catalog needs an in-stock product. Run local smoke fixtures first.');
const size = Object.keys(product.size_stock).find(s => product.size_stock[s] >= 2);
const slugify = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const canonicalProductPath = `/${slugify(product.category) || 'collection'}/${slugify(product.subcategory) || 'collection'}/${slugify(product.name) || product.id}-${product.id.toLowerCase()}`;
const categoryRoutes = [...new Set((catalog.products || []).map(p => p.category).filter(Boolean))].map(category => `/${slugify(category)}`);
const routes = [...new Set(['/', '/offers', '/just-arrived', '/best-sellers', '/search', ...categoryRoutes, `/product/${product.id}`, canonicalProductPath, '/cart', '/checkout', '/profile', '/address', '/orders', '/wishlist', '/support', '/contact', '/policies', '/terms-and-conditions', '/privacy-policy', '/refund-cancellation-policy', '/return-policy', '/shipping-policy', '/track-order', '/admin', ...['storefront','labels','hero','tax','employees','add-product','bulk-listing','orders','products','inventory','notifications','customers','reviews','questions','coupons','deals','categories','returns','support','system','manage-store'].map(p => `/admin/${p}`)])];
// Each viewport gets a fresh real local session because the preceding logout revokes it.
async function localAdminCookie() {
  const response = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
  assert.equal(response.status, 302, 'Enable demo admin on the isolated local Worker.');
  const [name, ...value] = response.headers.get('set-cookie').split(';', 1)[0].split('=');
  return { name, value: value.join('='), url: base };
}
try {
  for (const [label, viewport] of [['desktop', {width:1440,height:1000}], ['mobile', {width:390,height:844}]]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await context.addCookies([await localAdminCookie()]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    await page.addInitScript(({id,size}) => localStorage.setItem('glamia-react-cart', JSON.stringify([{id,size,quantity:1}])), {id:product.id,size});
    for (const path of routes) {
      await page.goto(base + path, {waitUntil:'domcontentloaded'});
      await page.locator('#main-content').waitFor();
      await page.waitForFunction(() => !/Preparing your|Loading product|Loading collection/.test(document.querySelector('#main-content')?.textContent || ''));
      await page.locator('h1').first().waitFor();
      if (path.startsWith('/admin')) assert.equal(new URL(page.url()).pathname, path, 'Admin page must not silently redirect to the storefront.');
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
    await page.getByRole('dialog').getByRole('button',{name:'Remove item',exact:true}).click();
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
    const missingPage = await page.goto(base + '/legacy-index.html', {waitUntil:'domcontentloaded'});
    assert.equal(missingPage.status(), 404, 'Unknown pages must not return a successful HTTP status.');
    assert.match(missingPage.headers()['x-robots-tag'] || '', /noindex/);
    await page.getByRole('heading',{name:'Page not found.'}).waitFor();
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
