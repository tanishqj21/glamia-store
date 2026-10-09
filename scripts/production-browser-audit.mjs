// Additional release checks at the requested breakpoint matrix. Local fixtures only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = 'http://127.0.0.1:8788';
const results = [], errors = [];
const browser = await chromium.launch();
await mkdir('test-results/hardening', { recursive: true });
try {
  const auth = await fetch(base + '/api/auth/demo-admin', { redirect: 'manual' });
  assert.equal(auth.status, 302);
  const [name, ...value] = auth.headers.get('set-cookie').split(';')[0].split('=');
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name, value: value.join('='), url: base }]);
    // Block every external request. No Google/analytics/payment action is sent.
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${width}: ${error.message}`));
    for (const path of ['/', '/cart', '/checkout', '/admin/orders', '/admin/credits', '/admin/completed-orders', '/about']) {
      await page.goto(base + path);
      await page.locator('h1').first().waitFor();
      await page.waitForFunction(() => !/Preparing your|Loading product|Loading collection/.test(document.querySelector('#main-content')?.textContent || ''));
      assert.equal(new URL(page.url()).pathname, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const violations = axe.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }));
      const headings = await page.locator('h1').count();
      results.push({ width, path, overflow, violations, headings });
      console.log(`${width} ${path}: overflow=${overflow}, serious=${violations.length}, h1=${headings}`);
      if (width === 320 && path === '/admin/orders') await page.screenshot({ path: 'test-results/hardening/orders-320.png', fullPage: true });
    }
    await context.close();
  }
  for (const path of ['/cart', '/checkout', '/login']) {
    const response = await fetch(base + path);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const products = await fetch(base + '/api/products').then(r => r.json());
  const product = products.products[0];
  assert.ok(product);
  const legacy = await fetch(base + '/product/' + product.id, { redirect: 'manual' });
  assert.equal(legacy.status, 301);
  const canonical = legacy.headers.get('Location');
  const page = await fetch(canonical, { headers: { 'User-Agent': 'Googlebot' } }).then(r => r.text());
  assert.ok(page.includes('<link rel="canonical"'));
  assert.ok(page.includes('application/ld+json'));
  for (const [, json] of page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) JSON.parse(json);
  const sitemap = await fetch(base + '/sitemap.xml').then(r => r.text());
  assert.ok(sitemap.includes(canonical));
  assert.ok(!(await fetch(base + '/admin', { method: 'HEAD', redirect: 'manual' })).ok);
} finally {
  await writeFile('test-results/hardening/responsive-report.json', JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
assert.deepEqual(errors, []);
assert.ok(results.every(r => !r.overflow && r.violations.length === 0 && r.headings === 1));
console.log(`PASS ${results.length} breakpoint checks, private-page indexing, product redirects/schema and sitemap.`);
