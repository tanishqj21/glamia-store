import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { savedItemChanges } from '../react-app/src/lib/savedItems.js';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Saved-items checks require an isolated local Worker.');
const login = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
assert.equal(login.status, 302);
const cookie = login.headers.get('set-cookie').split(';', 1)[0];
const [name, ...value] = cookie.split('=');
const request = (path, options = {}) => fetch(base + path, { ...options, headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', ...options.headers } });
const initial = await request('/api/saved-items').then(response => response.json());
const initialPreference = await request('/api/notification-preferences').then(response => response.json());
let eventId = '';
let browser;
try {
  const guestCart = [{ id: 'seed-midnight-satin-dress', size: 'M', variant: '', quantity: 2 }];
  const mergedResponse = await request('/api/saved-items/merge', { method: 'POST', body: JSON.stringify({ cart: guestCart, wishlist: [guestCart[0].id] }) });
  assert.equal(mergedResponse.status, 200);
  const merged = await mergedResponse.json();
  assert.ok(merged.cart.find(item => item.id === guestCart[0].id && item.size === 'M')?.quantity >= 2);
  assert.ok(merged.wishlist.includes(guestCart[0].id));
  const otherId = 'seed-wool-blend-blazer';
  const patchedResponse = await request('/api/saved-items', { method: 'PATCH', body: JSON.stringify({ cart: [{ ...guestCart[0], quantity: 0 }, { id: otherId, size: '', variant: '', quantity: 1 }], wishlist: [{ id: guestCart[0].id, saved: false }, { id: otherId, saved: true }] }) });
  assert.equal(patchedResponse.status, 200);
  const patched = await patchedResponse.json();
  assert.equal(patched.cart.some(item => item.id === guestCart[0].id && item.size === 'M'), false);
  assert.equal(patched.cart.find(item => item.id === otherId)?.quantity, 1);
  assert.ok(patched.wishlist.includes(otherId));
  assert.equal(patched.wishlist.includes(guestCart[0].id), false);
  const invalid = await request('/api/saved-items', { method: 'PATCH', body: JSON.stringify({ cart: [{ id: '../bad', quantity: 1 }], wishlist: [] }) });
  assert.equal(invalid.status, 400);
  const unauthenticated = await fetch(`${base}/api/saved-items`);
  assert.equal(unauthenticated.status, 401);
  const preferences = await request('/api/notification-preferences', { method: 'PUT', body: JSON.stringify({ event_push_enabled: true }) });
  assert.equal(preferences.status, 200);
  assert.equal((await preferences.json()).event_push_enabled, true);
  const eventName = `Local integration event ${Date.now()}`;
  const eventResponse = await request('/api/admin/events', { method: 'POST', body: JSON.stringify({ name: eventName, type: 'sale', status: 'draft', headline: 'A moment for testing', message: 'Only customers who opt in should receive an alert.', notify_customers: true }) });
  assert.equal(eventResponse.status, 201);
  eventId = (await eventResponse.json()).event.id;
  assert.equal((await request('/api/admin/events').then(response => response.json())).events.find(event => event.id === eventId)?.notify_customers, true);

  // A returning signed-in browser merges its guest selections into the same account snapshot.
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([{ name, value: value.join('='), url: base }]);
  await context.addInitScript(() => {
    if (localStorage.getItem('glamia-test-seeded')) return;
    localStorage.setItem('glamia-test-seeded', '1');
    localStorage.setItem('glamia-saved-sync-user', '');
    localStorage.setItem('glamia-react-cart', JSON.stringify([{ id: 'seed-midnight-satin-dress', size: 'S', quantity: 1 }]));
    localStorage.setItem('glamia-react-wishlist', JSON.stringify(['seed-midnight-satin-dress']));
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole('heading', { name: /New in/ }).waitFor();
  let browserMerged = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    browserMerged = await request('/api/saved-items').then(response => response.json());
    if (browserMerged.cart.some(item => item.id === guestCart[0].id && item.size === 'S') && browserMerged.wishlist.includes(guestCart[0].id)) break;
    await page.waitForTimeout(200);
  }
  assert.ok(browserMerged.cart.some(item => item.id === guestCart[0].id && item.size === 'S'));
  assert.ok(browserMerged.wishlist.includes(guestCart[0].id));
  await page.waitForFunction(() => Boolean(localStorage.getItem('glamia-saved-baseline')));
  await page.evaluate(() => localStorage.setItem('glamia-react-cart', JSON.stringify([{ id: 'seed-midnight-satin-dress', size: 'S', quantity: 3 }])));
  await page.reload();
  let restarted = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    restarted = await request('/api/saved-items').then(response => response.json());
    if (restarted.cart.find(item => item.id === guestCart[0].id && item.size === 'S')?.quantity === 3) break;
    await page.waitForTimeout(200);
  }
  assert.equal(restarted.cart.find(item => item.id === guestCart[0].id && item.size === 'S')?.quantity, 3, 'A saved offline change must survive browser restart.');
  await context.close();
  assert.equal((await fetch(`${base}/.well-known/assetlinks.json`)).status, 404, 'Association stays disabled until a real signing fingerprint is configured.');
  console.log('Account-backed saved items, offline restart, opt-in preferences, event controls, and guest merge passed.');
} finally {
  if (browser) await browser.close();
  if (eventId) assert.equal((await request(`/api/admin/events/${eventId}`, { method: 'DELETE' })).status, 200);
  const current = await request('/api/saved-items').then(response => response.json());
  const delta = savedItemChanges(current, initial);
  if (delta.cart.length || delta.wishlist.length) assert.equal((await request('/api/saved-items', { method: 'PATCH', body: JSON.stringify(delta) })).status, 200);
  assert.equal((await request('/api/notification-preferences', { method: 'PUT', body: JSON.stringify({ event_push_enabled: initialPreference.event_push_enabled }) })).status, 200);
}
