// Read-only production layout verification. No account/order/payment writes.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const base = 'https://glamiastore.com';
const output = 'test-results/storefront-ui-repair';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const results = [], errors = [];
try {
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await context.addInitScript(value => localStorage.setItem('glamia-theme', value), theme);
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (!['GET', 'HEAD'].includes(request.method()) || url.origin !== base) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && /storefront_(?:hydration|application_load)_failed/.test(message.text())) errors.push(message.text());
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.campaign-feature-actions button')).toBeEnabled();
      await expect(page.locator('.product-card').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.locator('.campaign-feature').evaluate(node => {
        const style = getComputedStyle(node), button = node.querySelector('.campaign-feature-actions button');
        const promises = document.querySelector('.trust-strip'), editor = document.querySelector('.homepage-editorial');
        return {
          display: style.display, columns: style.gridTemplateColumns.split(' ').length,
          padding: parseFloat(style.paddingLeft), titleSize: parseFloat(getComputedStyle(node.querySelector('h2')).fontSize),
          buttonHeight: button.getBoundingClientRect().height, width: node.getBoundingClientRect().width,
          overflow: document.documentElement.scrollWidth > innerWidth + 2,
          correctPlacement: Boolean(promises.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(node.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING),
          theme: document.documentElement.dataset.theme,
        };
      });
      assert.equal(layout.display, 'grid');
      assert.equal(layout.columns, width <= 600 ? 1 : 2);
      assert.ok(layout.padding >= 24 && layout.titleSize >= 52 && layout.buttonHeight >= 48);
      assert.ok(layout.width < width && layout.correctPlacement && !layout.overflow);
      assert.equal(layout.theme, theme);
      await page.locator('.campaign-feature').screenshot({ path: `${output}/live-campaign-${width}-${theme}.png` });
      // Verify the campaign CTA is still a working navigation action, not just
      // styled markup. It does not create a cart, account, or payment session.
      const settings = await page.locator('#glamia-storefront-bootstrap').textContent();
      const destination = JSON.parse(settings).settings.sales_campaign.cta_href || '/offers';
      await page.locator('.campaign-feature-actions button').click();
      await expect(page).toHaveURL(base + destination);
      results.push({ width, theme, layout, destination });
      console.log(`PASS live campaign layout, placement and CTA ${width}/${theme}`);
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/live-campaign-checks.json`, JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); }
