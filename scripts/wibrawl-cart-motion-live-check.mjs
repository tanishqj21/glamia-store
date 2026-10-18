// Isolated guest carts only. Block all production API writes and never checkout.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const output = 'tmp/wibrawl-cart-motion-review';
mkdirSync(output, { recursive: true });
const entry = Object.values(JSON.parse(readFileSync('public/.vite/manifest.json', 'utf8'))).find(item => item.isEntry).file;
const catalog = await fetch('https://wibrawl.glamiastore.com/api/products?view=cards&limit=24&include_stock=1').then(response => response.json());
const details = new Map(await Promise.all((catalog.products || []).map(async product => [product.id, await fetch('https://wibrawl.glamiastore.com/api/products/' + encodeURIComponent(product.id)).then(response => response.json())])));
const browser = await chromium.launch(), report = { errors: [], checks: [], blocked: [] };
try {
  for (const width of [390, 1440]) {
    for (const mode of ['gaming', 'sports']) {
      const ctx = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'no-preference' });
      await ctx.addInitScript(value => localStorage.setItem('wibrawl_mode', value), mode);
      await ctx.route('**/api/**', route => {
        if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
        report.blocked.push(new URL(route.request().url()).pathname);
        return route.fulfill({ status: 204 });
      });
      const page = await ctx.newPage(); page.setDefaultTimeout(25000);
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|hydration|storefront_application_load_failed/i.test(message.text())) report.errors.push(message.text()); });
      const response = await page.goto('https://wibrawl.glamiastore.com/just-arrived?release=cart-cascade');
      assert.equal(response.status(), 200); assert.ok((await response.text()).includes(entry));
      await expect(page.locator('.wb-storefront')).toHaveAttribute('data-wibrawl-mode', mode);
      const card = page.locator('.wb-spec-card').first();
      await card.waitFor(); await card.scrollIntoViewIfNeeded(); await card.hover();
      await expect(card.locator('.wb-spec-quickadd .wb-tech')).toContainText('LIVE STOCK');
      let fixtureStock = false;
      if (await card.locator('.wb-quick-sizes button:not(:disabled)').count() === 0) {
        // Live sample tees intentionally have no stock. Confirm their guard,
        // then substitute stock in this browser only to exercise deployed JS.
        await expect(page.getByRole('button', { name: 'Open cart, 0 items', exact: true })).toBeVisible();
        await expect(page.locator('.wb-cart-flight')).toHaveCount(0);
        fixtureStock = true;
        await ctx.route('**/api/products**', async route => {
          if (!['GET', 'HEAD'].includes(route.request().method())) return route.fallback();
          const path = new URL(route.request().url()).pathname;
          const original = path === '/api/products' ? catalog : details.get(decodeURIComponent(path.slice('/api/products/'.length)));
          if (!original) return route.fallback();
          const data = structuredClone(original);
          const withStock = product => ({ ...product, stock: 30, size_stock: Object.fromEntries((product.sizes || []).map(size => [size, 6])) });
          if (data.products) data.products = data.products.map(withStock);
          if (data.product) data.product = withStock(data.product);
          if (data.colourways) data.colourways = data.colourways.map(withStock);
          return route.fulfill({ json: data });
        });
        await page.reload(); await card.waitFor(); await card.scrollIntoViewIfNeeded(); await card.hover();
      }
      await card.locator('.wb-quick-sizes button:not(:disabled)').first().click();
      await expect(page.locator('.wb-cart-flight-piece')).toHaveCount(7);
      await expect(page.getByRole('button', { name: 'Open cart, 1 item', exact: true })).toBeVisible();
      await expect(page.locator('.wb-cart-flight')).toHaveCount(0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      await page.getByRole('button', { name: 'Open cart, 1 item', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Your bag.' }).locator('.wb-bag-line')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await page.emulateMedia({ reducedMotion: 'reduce' }); await card.hover();
      await card.locator('.wb-quick-sizes button:not(:disabled)').first().click();
      await expect(page.getByRole('button', { name: 'Open cart, 2 items', exact: true })).toBeVisible();
      await expect(page.locator('.wb-cart-flight')).toHaveCount(0);
      report.checks.push({ width, mode, cascade: 'pass', bag: 'pass', reducedMotion: 'pass', fixtureStock });
      await ctx.close();
    }
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close(); writeFileSync(output + '/live-report.json', JSON.stringify(report, null, 2));
}
