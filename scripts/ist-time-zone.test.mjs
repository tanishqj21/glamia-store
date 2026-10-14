import { countdownText } from '../react-app/src/lib/countdown.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { APP_TIME_ZONE, parseStoredTimestamp, parseISTInput, toISTTimestamp, istDayKey, istDateTimeInput, istTimestampReplacer } from '../src/time-zone.js';
import { formatIST } from '../react-app/src/lib/commerce.js';
import { workerFunctions, localDatabase } from './lib/worker-fixture.mjs';
import { adminReturnsFixture } from './lib/admin-returns-fixture.mjs';
import { saveReturnLogistics } from '../src/return-logistics.js';

const worker = await workerFunctions(['json', 'normalizeEventDate', 'normalizeAnnouncementItems', 'normalizePreorderConfig', 'createCoupon']);

test('API timestamps are explicit IST without changing the instant or date-only/protocol fields', async () => {
  const response = worker.json({ created_at: '2026-12-31 19:00:00', nested: { checked_at: '2026-12-31T19:00:00Z' }, dob: '2001-12-31', day: '2026-12-31', issued_at: 1234, title: '2026-12-31 19:00:00' });
  assert.equal(response.headers.get('X-Application-Time-Zone'), 'Asia/Kolkata');
  const data = await response.json();
  assert.equal(data.created_at, '2027-01-01T00:30:00.000+05:30');
  assert.equal(data.nested.checked_at, data.created_at);
  assert.equal(Date.parse(data.created_at), Date.parse('2026-12-31T19:00:00Z'));
  assert.equal(data.dob, '2001-12-31'); assert.equal(data.day, '2026-12-31');
  assert.equal(data.issued_at, 1234); assert.equal(data.title, '2026-12-31 19:00:00');
  assert.equal(JSON.parse(JSON.stringify({ updatedAt: '2026-01-01T00:00:00Z' }, istTimestampReplacer)).updatedAt, '2026-01-01T05:30:00.000+05:30');
});

test('India calendar days roll over at 18:30 UTC and date fields cannot override the site timezone', () => {
  assert.equal(APP_TIME_ZONE, 'Asia/Kolkata');
  assert.equal(istDayKey('2026-12-31T18:29:59Z'), '2026-12-31');
  assert.equal(istDayKey('2026-12-31T18:30:00Z'), '2027-01-01');
  const options = { hour: '2-digit', minute: '2-digit', hour12: false };
  assert.equal(formatIST('2026-01-01 13:30:00', options), '19:00:00');
  assert.equal(formatIST('2026-01-01 13:30:00', { ...options, timeZone: 'America/Los_Angeles' }), '19:00:00');
});

test('naive event, pre-order and announcement scheduling always uses India wall-clock time', () => {
  assert.equal(worker.normalizeEventDate('2026-10-14T19:00', 'Event start'), '2026-10-14T13:30:00.000Z');
  assert.equal(worker.normalizePreorderConfig({ preorder_enabled: true, preorder_release_at: '2026-10-14T19:00' }).preorder_release_at, '2026-10-14T13:30:00.000Z');
  const announcement = worker.normalizeAnnouncementItems([{ text: 'Local sale', starts_at: '2026-10-14T19:00', ends_at: '2026-10-14T20:00' }], true)[0];
  assert.equal(announcement.starts_at, '2026-10-14T13:30:00.000Z');
  assert.equal(announcement.ends_at, '2026-10-14T14:30:00.000Z');
  assert.equal(worker.normalizeEventDate('2026-10-14T19:00:00+05:30', 'Start'), announcement.starts_at);
  assert.throws(() => worker.normalizeEventDate('nonsense', 'Start'), /invalid/);
});

test('existing bare SQLite times retain UTC meaning, while new input text means IST', () => {
  assert.equal(parseStoredTimestamp('2026-10-14 19:00:00').toISOString(), '2026-10-14T19:00:00.000Z');
  assert.equal(parseISTInput('2026-10-14T19:00').toISOString(), '2026-10-14T13:30:00.000Z');
  assert.equal(istDateTimeInput('2026-10-14T13:30:00Z'), '2026-10-14T19:00:00');
  assert.equal(toISTTimestamp('2026-10-14T19:00:00+05:30'), '2026-10-14T19:00:00.000+05:30');
  assert.equal(worker.normalizePreorderConfig({}, { preorder_enabled: true, preorder_release_at: '2026-10-14 19:00:00' }).preorder_release_at, '2026-10-14T19:00:00.000Z');
});

test('coupon API stores the right instant and returns the same time in IST', async t => {
  const { db, env } = localDatabase(); t.after(() => db.close());
  const response = await worker.createCoupon(new Request('https://glamiastore.com/api/admin/coupons', { method: 'POST', body: JSON.stringify({ code: 'ISTTIME', type: 'flat', value: 10, starts_at: '2027-01-01T00:00', ends_at: '2027-01-02T00:00' }) }), env);
  assert.equal(response.status, 201, await response.clone().text());
  const row = db.prepare("SELECT starts_at,ends_at FROM coupons WHERE code='ISTTIME'").get();
  assert.equal(row.starts_at, '2026-12-31T18:30:00.000Z');
  assert.equal(row.ends_at, '2027-01-01T18:30:00.000Z');
  const result = await response.json();
  assert.equal(result.coupon.starts_at, '2027-01-01T00:00:00.000+05:30');
});

test('host timezone cannot affect parsing, formatting or India midnight rules', () => {
  const code = `import {parseISTInput,istDateTimeInput,istDayKey} from './src/time-zone.js';console.log(JSON.stringify([parseISTInput('2026-01-01T19:00').toISOString(),istDateTimeInput('2026-01-01T13:30:00Z'),istDayKey('2026-12-31T19:00:00Z')]));`;
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: timezone }, encoding: 'utf8', windowsHide: true });
    assert.deepEqual(JSON.parse(output), ['2026-01-01T13:30:00.000Z', '2026-01-01T19:00:00', '2027-01-01']);
  }
});

test('pickup and next-update scheduling without an offset are interpreted in IST', async t => {
  const f = await adminReturnsFixture(); t.after(() => f.db.close());
  const { request } = await (await f.create()).json();
  await saveReturnLogistics(new Request('https://glamiastore.com/local', { method: 'PATCH', body: JSON.stringify({ pickup_at: '2027-01-01T19:00', next_update_at: '2027-01-02T10:00' }) }), f.env, request, 'owner@example.com');
  const saved = JSON.parse(f.db.prepare('SELECT logistics_json FROM return_requests WHERE id=?').get(request.id).logistics_json);
  assert.equal(saved.pickup_at, '2027-01-01T13:30:00.000Z');
  assert.equal(saved.next_update_at, '2027-01-02T04:30:00.000Z');
});


test('timestamps include seconds and live countdowns cross minute, day and expiry boundaries', () => {
 const end='2027-01-01T00:00:00+05:30', ms=Date.parse(end);
 assert.equal(countdownText(end,ms-1000),'Ends in 00h 00m 01s');
 assert.equal(countdownText(end,ms-60000),'Ends in 00h 01m 00s');
 assert.equal(countdownText(end,ms-86401000),'Ends in 1d 00h 00m 01s');
 assert.equal(countdownText(end,ms),'Event ended'); assert.equal(countdownText('bad',ms),'');
 assert.match(formatIST('2027-01-01T13:30:45Z',{timeStyle:'short'}),/7:00:45/);
 assert.match(formatIST('2027-01-01T13:30:45Z',{hour:'2-digit',minute:'2-digit'}),/07:00:45/);
 assert.ok(!formatIST(end,{dateStyle:'medium'}).includes(':'));
 assert.equal(istDateTimeInput('2027-01-01T13:30:45Z'),'2027-01-01T19:00:45');
 assert.equal(worker.normalizeEventDate('2027-01-01T19:00:45','Start'),'2027-01-01T13:30:45.000Z');
});
