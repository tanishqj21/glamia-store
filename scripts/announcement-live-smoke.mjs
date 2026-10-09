// Read-only live announcement checks; financial/account/analytics writes blocked.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const base = 'https://glamiastore.com';
const settings = await (await fetch(base + '/api/storefront-settings')).json();
const browser = await chromium.launch();
const errors = [];
mkdirSync('test-results/announcement', { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference', isMobile: width === 390, hasTouch: width === 390 });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method()) || /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|phonepe\.com|razorpay\.com/.test(url.hostname)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const bar = page.locator('.announce');
    await expect(bar).toBeVisible();
    await expect(bar.locator('.announce-progress')).toHaveCount(0);
    await expect(bar.getByRole('button')).toHaveCount(0);
    if (settings.announcement.items.length) {
      await expect(bar.locator('.sr-only')).toContainText(settings.announcement.items[0].text);
      assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationName), 'announce-scroll');
      await page.mouse.move(0, 500);
      const initial = await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).transform);
      await expect.poll(() => bar.locator('.announce-track').evaluate(node => getComputedStyle(node).transform)).not.toBe(initial);
      if (width === 390) await bar.tap();
      else await bar.focus();
      assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationPlayState), 'paused');
      await page.locator('main').click({ position: { x: 5, y: 50 } });
      await page.mouse.move(0, 500);
      assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationPlayState), 'running');
    } else await expect(bar.locator('.announce-message')).toHaveText(settings.announcement.text);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.locator('.site-header').screenshot({ path: `test-results/announcement/live-header-${width}.png` });
    await page.screenshot({ path: `test-results/announcement/live-effect-${width}.png`, clip: { x: 0, y: 0, width, height: 200 } });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (settings.announcement.items.length) {
      assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationName), 'none');
      await expect(bar.locator('.announce-copy').first()).toContainText(settings.announcement.items[0].text);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `test-results/announcement/live-effect-dark-reduced-${width}.png`, clip: { x: 0, y: 0, width, height: 200 } });
    console.log(`PASS live ${width}px: correct announcement, no counter, working motion/pause, no page overflow`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
