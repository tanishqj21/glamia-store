import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { money, sellingPrice } from '../react-app/src/lib/commerce.js';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Event checks require an isolated local Worker.');
const login = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
assert.equal(login.status, 302, 'Enable demo admin only on the isolated local Worker.');
const cookie = login.headers.get('set-cookie').split(';', 1)[0];
const [name, ...value] = cookie.split('=');
const eventName = `Local event preview ${Date.now()}`;
const request = (path, options = {}) => fetch(base + path, { ...options, headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', ...options.headers } });
let eventId = '';
let signInOnlyId = '';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.addCookies([{ name, value: value.join('='), url: base }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${base}/admin/events`);
  await page.getByRole('heading', { name: /Make a moment/ }).waitFor();
  await page.getByRole('button', { name: /Create an event/ }).first().click();
  for (const theme of ['festival', 'aurora', 'sunset', 'prism', 'spotlight']) {
    const background = await page.locator(`.events-theme-swatch.event-theme-${theme}`).evaluate(element => getComputedStyle(element).backgroundImage);
    assert.equal((background.match(/radial-gradient/g) || []).length, 3, `${theme} swatch should show its full multicolour palette.`);
  }
  await page.getByLabel('Internal event name').fill(eventName);
  await page.getByLabel('Storefront headline').fill('Something special, just for today.');
  await page.getByLabel('Customer-facing message').fill('A new Glamia moment with the same clear product prices.');
  await page.getByLabel('Publishing state').selectOption('published');
  await page.getByLabel('Spotlight').check();
  await page.getByRole('button', { name: /Create event/ }).last().click();
  await page.getByText(`${eventName} saved.`).waitFor();
  const adminEvents = await request('/api/admin/events').then(response => response.json());
  eventId = adminEvents.events.find(item => item.name === eventName)?.id || '';
  assert.ok(eventId, 'Saved event must appear in the admin API.');
  assert.equal(adminEvents.events.find(item => item.id === eventId)?.theme, 'spotlight');
  for (const theme of ['aurora', 'sunset', 'prism', 'festival', 'spotlight']) {
    const response = await request(`/api/admin/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify({ theme }) });
    assert.equal(response.status, 200, `${theme} must be accepted by the event API.`);
    assert.equal((await response.json()).event.theme, theme);
  }
  const invalidTheme = await request(`/api/admin/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify({ theme: 'unlisted-theme' }) });
  assert.equal(invalidTheme.status, 400, 'Only curated palettes may be stored through the admin API.');
  const settings = await fetch(`${base}/api/storefront-settings`).then(response => response.json());
  assert.equal(settings.active_event?.id, eventId);
  assert.equal(settings.active_event?.theme, 'spotlight');
  assert.equal(settings.sign_in_event?.id, eventId);
  const catalog = await fetch(`${base}/api/products?view=cards&limit=5`).then(response => response.json());
  const first = catalog.products[0];
  assert.ok(first, 'Local catalog fixture must include a product.');
  const popupOnly = await request('/api/admin/events', { method: 'POST', body: JSON.stringify({ name: `${eventName} sign-in`, type: 'announcement', status: 'published', theme: 'cobalt', headline: 'A welcome just for you.', message: 'This event appears only after sign-in.', cta_href: '/offers', starts_at: new Date(Date.now() - 60000).toISOString(), show_on_home: false, show_after_sign_in: true }) });
  assert.equal(popupOnly.status, 201);
  signInOnlyId = (await popupOnly.json()).event.id;
  const separatePlacements = await fetch(`${base}/api/storefront-settings`).then(response => response.json());
  assert.equal(separatePlacements.active_event?.id, eventId, 'Popup-only events must not displace the homepage feature.');
  assert.equal(separatePlacements.sign_in_event?.id, signInOnlyId);
  mkdirSync('test-results', { recursive: true });

  // The live event decorates the existing amount on the home, offers, and detail screens.
  for (const route of ['/', '/offers', `/product/${encodeURIComponent(first.id)}`]) {
    await page.goto(base + route);
    await page.waitForFunction(() => !/Preparing your|Loading collection|Loading product/.test(document.querySelector('#main-content')?.textContent || ''));
    console.log(`Checking ${route}: feature=${await page.locator('.campaign-feature').count()}, prices=${await page.locator('.special-price-label').count()}, cards=${await page.locator('.product-card').count()}`);
    await page.locator('.special-price-label').first().waitFor();
    assert.match(await page.locator('.special-price-label').first().textContent(), /SPECIAL PRICE/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (route.startsWith('/product/')) assert.ok((await page.locator('.detail-price .product-price-amount').textContent()).startsWith(money(sellingPrice(first))), 'Event styling must preserve the actual selling price.');
  }
  await page.goto(base);
  await page.locator('.campaign-feature').waitFor();
  assert.equal(await page.locator('.campaign-feature.event-theme-spotlight').count(), 1, 'The live website feature must use the selected event theme.');
  assert.equal(await page.locator('.campaign-feature h2').innerText(), 'Something special, just for today.');
  if (await page.locator('.sale-popup[open]').count()) await page.locator('.sale-popup-close').click();
  await page.locator('.special-price-label').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/event-special-price-desktop.png' });
  await page.locator('.product-image').first().click();
  await page.locator('.quick-view-dialog .special-price-label').waitFor();
  await page.keyboard.press('Escape');

  // Recheck both themes and the compact editor at a phone sized viewport.
  await page.goto(`${base}/admin/events`);
  await page.getByRole('heading', { name: /Make a moment/ }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, 'Storefront popup must not cover admin tools.');
  await page.screenshot({ path: 'test-results/events-desktop.png', fullPage: true });
  for (const theme of ['light', 'dark']) {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await mobile.addCookies([{ name, value: value.join('='), url: base }]);
    await mobile.addInitScript(nextTheme => localStorage.setItem('glamia-theme', nextTheme), theme);
    const view = await mobile.newPage();
    view.on('pageerror', error => pageErrors.push(`${theme}: ${error.message}`));
    for (const route of ['/admin/events', '/']) {
      await view.goto(base + route);
      await view.locator('h1, h2').first().waitFor();
      await view.waitForFunction(expected => document.documentElement.dataset.theme === expected && getComputedStyle(document.body).color === (expected === 'dark' ? 'rgb(244, 244, 244)' : 'rgb(21, 21, 21)'), theme);
      if (route === '/') await view.locator('.campaign-feature').waitFor();
      await view.evaluate(() => document.fonts.ready);
      assert.equal(await view.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${theme} ${route} overflow`);
      const axe = await new AxeBuilder({ page: view }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact)).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), [], `${theme} ${route} accessibility`);
      if (theme === 'light') await view.screenshot({ path: `test-results/events-mobile-${route === '/' ? 'home' : 'admin'}.png`, fullPage: true });
      if (theme === 'light' && route === '/') { if (await view.locator('.sale-popup[open]').count()) await view.locator('.sale-popup-close').click(); await view.locator('.special-price-label').first().scrollIntoViewIfNeeded(); await view.waitForTimeout(250); await view.screenshot({ path: 'test-results/event-special-price-mobile.png' }); }
    }
    await view.goto(`${base}/admin/events`);
    await view.getByRole('button', { name: /Create an event/ }).first().click();
    await view.getByLabel('Storefront headline').waitFor();
    assert.equal(await view.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (theme === 'light') await view.screenshot({ path: 'test-results/events-mobile-editor.png', fullPage: true });
    await mobile.close();
  }
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('Event editor, storefront, special prices, and mobile themes passed.');
} finally {
  if (signInOnlyId) {
    const removed = await request(`/api/admin/events/${encodeURIComponent(signInOnlyId)}`, { method: 'DELETE' });
    assert.equal(removed.status, 200, 'Clean up the exact sign-in fixture.');
  }
  if (eventId) {
    const removed = await request(`/api/admin/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
    assert.equal(removed.status, 200, 'Clean up only the exact local event fixture.');
  }
  await browser.close();
}
