// Actual built storefront; all HTTP requests intercepted, no live writes.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = 'https://glamia-announcement.test', root = resolve('public');
const browser = await chromium.launch();
const errors = [];
try {
  for (const [width, reducedMotion] of [[1440, 'no-preference'], [390, 'no-preference'], [390, 'reduce']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion, isMobile: width === 390, hasTouch: width === 390 });
    let settingsReads = 0;
    const clock = Date.now();
    const items = [
      { id: 'first', text: 'New collection available now', ends_at: new Date(clock + 20000).toISOString() },
      { id: 'second', text: 'Limited weekend offer', ends_at: new Date(clock + 40000).toISOString() },
    ];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        let data = { products: [], categories: [], slides: [], user: null };
        if (url.pathname === '/api/storefront-settings') {
          settingsReads++;
          const remaining = settingsReads === 1 ? items : settingsReads === 2 ? items.slice(1) : [];
          data = { announcement: { visible: true, text: 'Shipping across India.', items: remaining, next_change_at: remaining[0]?.ends_at || null } };
        }
        return route.fulfill({ json: data });
      }
      let file = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (relative(root, file).startsWith('..')) return route.abort();
      if (!existsSync(file) || !extname(file)) file = resolve(root, 'index.html');
      const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' }[extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(clock) });
    await page.goto(base);
    const bar = page.locator('.announce');
    await expect(bar).toBeVisible();
    await expect(bar.locator('.sr-only')).toContainText(items[0].text);
    await expect(bar).not.toContainText('Shipping across India.');
    await expect(bar.locator('.announce-progress')).toHaveCount(0);
    await expect(bar.getByRole('button')).toHaveCount(0);
    await expect(bar.locator('.announce-sparkle')).toHaveCount(12);
    assert.notEqual(await bar.evaluate(node => getComputedStyle(node, '::before').backgroundImage), 'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (reducedMotion === 'reduce') {
      assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationName), 'none');
    } else {
      assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationName), 'announce-scroll');
      if (width === 390) await bar.tap();
      else await bar.focus();
      assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationPlayState), 'paused');
      await page.locator('main').click({ position: { x: 5, y: 50 } });
      await page.mouse.move(0, 500);
      assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationPlayState), 'running');
      if (width === 1440) {
        await bar.hover();
        assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationPlayState), 'paused');
        await page.mouse.move(0, 500);
        assert.equal(await bar.locator('.announce-track').evaluate(node => getComputedStyle(node).animationPlayState), 'running');
      }
    }
    await page.clock.fastForward(21000);
    await expect(bar.locator('.sr-only')).toHaveText(items[1].text);
    await expect.poll(() => settingsReads).toBe(2);
    await page.clock.fastForward(21000);
    await expect(bar.locator('.announce-message')).toHaveText('Shipping across India.');
    await expect(bar.locator('.announce-track')).toHaveCount(0);
    await expect.poll(() => settingsReads).toBe(3);
    console.log(`PASS ${width}px / ${reducedMotion}: scrolling active notices, pause, independent expiry and permanent fallback without reload`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
