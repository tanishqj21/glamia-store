import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Alert checks require an isolated local Worker.');
const login = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
assert.equal(login.status, 302);
const cookie = login.headers.get('set-cookie').split(';', 1)[0];
const request = (path, options = {}) => fetch(base + path, { ...options, headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', ...options.headers } });
const session = await request('/api/session').then(response => response.json());
const email = String(session.user?.email || '').toLowerCase();
assert.match(email, /^[a-z0-9._+-]+@[a-z0-9.-]+$/);
const originalPreference = await request('/api/notification-preferences').then(response => response.json());
const fakeToken = `ExponentPushToken[local${randomUUID().replaceAll('-', '')}]`;
const headline = `A Glamia event ${randomUUID().slice(0, 8)} is live`;
let eventId = '';
try {
  assert.equal((await request('/api/push-tokens', { method: 'POST', body: JSON.stringify({ token: fakeToken, platform: 'android' }) })).status, 200);
  assert.equal((await request('/api/notification-preferences', { method: 'PUT', body: JSON.stringify({ event_push_enabled: false }) })).status, 200);
  const eventResponse = await request('/api/admin/events', { method: 'POST', body: JSON.stringify({ name: `Scheduled alert test ${Date.now()}`, type: 'announcement', status: 'published', headline, message: 'This local alert opens the offers collection.', cta_href: '/offers', starts_at: new Date(Date.now() - 60_000).toISOString(), ends_at: new Date(Date.now() + 3600_000).toISOString(), notify_customers: true }) });
  assert.equal(eventResponse.status, 201);
  eventId = (await eventResponse.json()).event.id;
  assert.equal((await fetch(`${base}/__scheduled?cron=*/5%20*%20*%20*%20*`)).status, 200);
  await new Promise(resolve => setTimeout(resolve, 400));
  const beforeOptIn = (await request('/api/notifications').then(response => response.json())).notifications.filter(item => item.type === 'event' && item.title === headline);
  assert.equal(beforeOptIn.length, 0, 'An opted-out shopper must not receive an event alert.');
  assert.equal((await request('/api/notification-preferences', { method: 'PUT', body: JSON.stringify({ event_push_enabled: true }) })).status, 200);
  assert.equal((await fetch(`${base}/__scheduled?cron=*/5%20*%20*%20*%20*`)).status, 200);
  let matching = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const notifications = await request('/api/notifications').then(response => response.json());
    matching = (notifications.notifications || []).filter(item => item.type === 'event' && item.title === headline);
    if (matching.length) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(matching.length, 1, 'The scheduled worker should create one in-app event notification.');
  assert.equal(matching[0].deep_link, '/offers');
  assert.equal((await fetch(`${base}/__scheduled?cron=*/5%20*%20*%20*%20*`)).status, 200);
  await new Promise(resolve => setTimeout(resolve, 400));
  const duplicate = (await request('/api/notifications').then(response => response.json())).notifications.filter(item => item.type === 'event' && item.title === headline);
  assert.equal(duplicate.length, 1, 'A second cron tick must not notify the same shopper twice.');
  console.log('Opt-in scheduled event alert, destination, and deduplication passed.');
} finally {
  if (eventId) {
    await request(`/api/admin/events/${eventId}`, { method: 'DELETE' });
    const dedupeKey = `event:${eventId}:${email}`;
    execFileSync('node', ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'glamia-audit-db', '--config', 'scripts/audit/wrangler.jsonc', '--local', '--persist-to', resolve(process.env.AUDIT_PERSIST_TO || '.wrangler/credits-bills-audit'), '--command', `DELETE FROM customer_notifications WHERE dedupe_key = '${dedupeKey}'`], { stdio: 'ignore' });
  }
  await request('/api/push-tokens', { method: 'DELETE', body: JSON.stringify({ token: fakeToken }) });
  await request('/api/notification-preferences', { method: 'PUT', body: JSON.stringify({ event_push_enabled: Boolean(originalPreference.event_push_enabled) }) });
}
