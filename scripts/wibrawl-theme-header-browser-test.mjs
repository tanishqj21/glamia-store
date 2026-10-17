import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.WIBRAWL_THEME_TEST_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use an isolated local preview');
const output = 'tmp/wibrawl-theme-header-review';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const errors = [], findings = [];
try {
  for (const width of [360, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark', reducedMotion: 'no-preference' });
    await context.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ json: path === '/api/session' ? { user: null } : path === '/api/storefront-settings' ? { announcement: { visible: false }, trust_strip: { visible: false }, seo: {}, customer_experience: {} } : { products: [], categories: [], slides: [], cart: [], wishlist: [], saved_for_later: [], balance: 0, pagination: { has_more: false } } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/just-arrived?wibrawl-preview=1`);
    await page.getByRole('button', { name: 'Switch to Stadium Light', exact: true }).waitFor();
    const toggle = page.locator('.wibrawl-theme-toggle');
    assert.equal(await page.locator('.wibrawl-theme-toggle').count(), 1);
    assert.equal(await toggle.innerText(), '');
    const account = await page.locator('.site-header .wb-account-trigger').boundingBox();
    const button = await toggle.boundingBox();
    const cart = await page.locator('.site-header .cart-link').boundingBox();
    assert.ok(account.x + account.width <= button.x + 1 && button.x + button.width <= cart.x + 1, `Theme position at ${width}px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `No horizontal overflow at ${width}px`);
    assert.equal(await toggle.locator('.wibrawl-theme-icon--sports').evaluate(node => getComputedStyle(node).opacity), '1', 'Dark mode shows the football action');
    await toggle.hover();
    await page.waitForTimeout(550);
    assert.notEqual(await toggle.locator('.wibrawl-theme-icon--sports svg').evaluate(node => getComputedStyle(node).transform), 'none');
    await toggle.click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.waitForTimeout(450);
    assert.equal(await toggle.getAttribute('aria-label'), 'Switch to Tunnel Dark');
    assert.equal(await toggle.locator('.wibrawl-theme-icon--gaming').evaluate(node => getComputedStyle(node).opacity), '1');
    assert.equal(await page.evaluate(() => localStorage.getItem('wibrawl-theme')), 'light');
    await page.reload();
    await page.getByRole('button', { name: 'Switch to Tunnel Dark', exact: true }).waitFor();
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.locator('.site-header').screenshot({ path: `${output}/sports-${width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Switch to Tunnel Dark', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await toggle.locator('.wibrawl-theme-icon--sports svg').evaluate(node => getComputedStyle(node).animationName), 'none');
    const axe = await new AxeBuilder({ page }).include('.site-header').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    findings.push(...axe.violations.map(item => ({ width, id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
    await page.locator('.site-header').screenshot({ path: `${output}/gaming-${width}.png` });
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(findings, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ passed: true, widths: [360, 390, 768, 1024, 1440], errors, findings }, null, 2));
  process.stdout.write('Wibrawl header positioning, icon animations, theme persistence and accessibility passed.\n');
} finally { await browser.close(); }
