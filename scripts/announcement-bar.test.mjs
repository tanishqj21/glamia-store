import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAnnouncements, nextAnnouncementBoundary } from '../react-app/src/lib/announcements.js';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const now = Date.parse('2026-10-08T10:00:00Z');
const announcement = { visible: true, text: 'Permanent shipping message', items: [
  { id: 'active', text: 'Today only', ends_at: new Date(now + 1000).toISOString() },
  { id: 'future', text: 'Tomorrow', starts_at: new Date(now + 2000).toISOString(), ends_at: new Date(now + 5000).toISOString() },
  { id: 'expired', text: 'Yesterday', ends_at: new Date(now - 1000).toISOString() },
] };

test('temporary notices replace the permanent message only during their window', () => {
  assert.deepEqual(activeAnnouncements(announcement, now).map(item => item.id), ['active']);
  assert.deepEqual(activeAnnouncements(announcement, now + 1000), []);
  assert.deepEqual(activeAnnouncements(announcement, now + 2000).map(item => item.id), ['future']);
  assert.deepEqual(activeAnnouncements(announcement, now + 5000), []);
});

test('boundary calculation moves from expiry to future start to final expiry', () => {
  assert.equal(nextAnnouncementBoundary(announcement, now), now + 1000);
  assert.equal(nextAnnouncementBoundary(announcement, now + 1000), now + 2000);
  assert.equal(nextAnnouncementBoundary(announcement, now + 2000), now + 5000);
  assert.equal(nextAnnouncementBoundary(announcement, now + 5000), null);
});

test('public settings advertise refresh time without exposing future or expired notice content', async t => {
  const { db, env } = localDatabase(); t.after(() => db.close());
  const clock = Date.now();
  const settings = { ...announcement, items: [
    { id: 'active', text: 'Active offer', starts_at: new Date(clock - 10000).toISOString(), ends_at: new Date(clock + 60000).toISOString() },
    { id: 'future', text: 'Future secret drop', starts_at: new Date(clock + 30000).toISOString(), ends_at: new Date(clock + 120000).toISOString() },
  ] };
  db.prepare("INSERT INTO storefront_settings(setting_key,value_json) VALUES('announcement',?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(settings));
  const worker = await workerFunctions(['storefrontSettingsObject']);
  const publicData = await worker.storefrontSettingsObject(env);
  assert.deepEqual(Array.from(publicData.announcement.items, item => item.id), ['active']);
  assert.equal(publicData.announcement.next_change_at, settings.items[1].starts_at);
  assert.ok(!JSON.stringify(publicData).includes('Future secret drop'));
  const admin = await worker.storefrontSettingsObject(env, true);
  assert.equal(admin.announcement.items.length, 2);
});
