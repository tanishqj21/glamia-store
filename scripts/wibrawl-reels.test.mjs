import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWibrawlReels } from '../src/wibrawl-reels.js';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const worker = await workerFunctions(['getStorefrontSettings', 'updateStorefrontSettings', 'getCinematicReelSettings', 'updateCinematicReelSettings', 'routeApi', 'invalidateStorefrontCache']);
const root = 'https://glamiastore.com', wb = 'https://wibrawl.glamiastore.com';
const put = (origin, path, body) => new Request(origin + path, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
function fixture(t) {
  const local = localDatabase(); t.after(() => local.db.close());
  local.db.exec("UPDATE products SET status='hold'");
  for (const [id, scope] of [['wb', 'wibrawl'], ['gm', 'glamia'], ['both', 'both']]) local.db.prepare("INSERT INTO products(id,seller_email,name,category,brand,price,mrp,stock,color,sizes_json,image_url,description,status,storefront_visibility) VALUES(?,'seller@example.com',?,'Tees','Fixture',100,100,0,'Black','[]','/fixture.webp','Fixture','live',?)").run(id, id, scope);
  return local;
}

test('reel documents preserve arbitrary order and any subset of the three styles', () => {
  for (let mask = 0; mask < 8; mask++) {
    const reels = normalizeWibrawlReels().reverse().map((reel, index) => ({ ...reel, visible: Boolean(mask & (1 << index)) }));
    assert.deepEqual(normalizeWibrawlReels(reels, true), reels);
  }
  const reels = normalizeWibrawlReels();
  for (const invalid of [[], reels.slice(1), [...reels.slice(0, 2), reels[0]], reels.map(reel => ({ ...reel, layout: 'foreign' })), reels.map(reel => ({ ...reel, visible: 'false' })), reels.map(reel => ({ ...reel, title: '' }))]) assert.throws(() => normalizeWibrawlReels(invalid, true));
});

test('Wibrawl reels are saved atomically without changing the Glamia reel', async t => {
  const { db, env } = fixture(t);
  const original = JSON.stringify({ visible: false, title: 'Original Glamia', product_ids: ['gm'] });
  db.prepare("INSERT OR REPLACE INTO storefront_settings(setting_key,value_json) VALUES('cinematic_reel',?)").run(original);
  const reels = normalizeWibrawlReels().reverse().map((reel, index) => ({ ...reel, visible: index !== 1, product_ids: ['wb', 'both'] }));
  await worker.updateCinematicReelSettings(put(root, '/api/admin/cinematic-reel?storefront=wibrawl', { cinematic_reels: reels }), env);
  const result = await (await worker.getCinematicReelSettings(env, 'wibrawl')).json();
  assert.deepEqual(result.cinematic_reels, reels);
  assert.equal(db.prepare("SELECT value_json FROM storefront_settings WHERE setting_key='cinematic_reel'").get().value_json, original);
  const before = db.prepare("SELECT value_json FROM storefront_settings WHERE setting_key='wibrawl_cinematic_reels'").get().value_json;
  const invalid = structuredClone(reels); invalid[0].product_ids = ['gm'];
  await assert.rejects(worker.updateCinematicReelSettings(put(wb, '/api/admin/cinematic-reel', { cinematic_reels: invalid }), env), error => error.status === 400);
  assert.equal(db.prepare("SELECT value_json FROM storefront_settings WHERE setting_key='wibrawl_cinematic_reels'").get().value_json, before);
  const publicSettings = await (await worker.getStorefrontSettings(env, false, 'wibrawl')).json();
  assert.deepEqual(publicSettings.cinematic_reels, reels); assert.equal(publicSettings.cinematic_reel, undefined);
});

test('social profiles have independent persistence with no Glamia fallback on Wibrawl', async t => {
  const { db, env } = fixture(t);
  db.prepare("INSERT OR REPLACE INTO storefront_settings(setting_key,value_json) VALUES('socials',?)").run(JSON.stringify({ instagram: 'https://instagram.com/glamia-fixture' }));
  const initial = await (await worker.getStorefrontSettings(env, false, 'wibrawl')).json();
  assert.equal(initial.socials.instagram, '');
  await worker.updateStorefrontSettings(put(root, '/api/admin/storefront-settings?storefront=wibrawl', { socials: { instagram: 'https://instagram.com/wibrawl-fixture' } }), env);
  assert.equal((await (await worker.getStorefrontSettings(env, false, 'wibrawl')).json()).socials.instagram, 'https://instagram.com/wibrawl-fixture');
  assert.equal((await (await worker.getStorefrontSettings(env)).json()).socials.instagram, 'https://instagram.com/glamia-fixture');
  await worker.updateStorefrontSettings(put(wb, '/api/admin/storefront-settings?storefront=glamia', { socials: { youtube: 'https://youtube.com/@glamia-fixture' } }), env);
  assert.equal((await (await worker.getStorefrontSettings(env)).json()).socials.youtube, 'https://youtube.com/@glamia-fixture');
  assert.equal((await (await worker.getStorefrontSettings(env, false, 'wibrawl')).json()).socials.youtube, '');
  await assert.rejects(worker.updateStorefrontSettings(put(wb, '/api/admin/storefront-settings', { socials: { instagram: 'https://attacker.test' } }), env), error => error.status === 400);
});

test('anonymous callers cannot read or change either brand admin configuration', async t => {
  const { env } = fixture(t);
  for (const path of ['/api/admin/cinematic-reel?storefront=wibrawl', '/api/admin/storefront-settings?storefront=wibrawl']) {
    const request = new Request(root + path);
    await assert.rejects(worker.routeApi(request, env, new URL(request.url), {}), error => [401,403].includes(error.status));
    const mutation = new Request(root + path, { method: 'PUT', headers: { Origin: root, 'X-Requested-With': 'Glamia', 'Content-Type': 'application/json' }, body: '{}' });
    await assert.rejects(worker.routeApi(mutation, env, new URL(mutation.url), {}), error => [401,403].includes(error.status));
  }
  const request = new Request(wb + '/api/storefront-settings?storefront=glamia');
  const publicSettings = await (await worker.routeApi(request, env, new URL(request.url), {})).json();
  assert.ok(Array.isArray(publicSettings.cinematic_reels));
});

test('cache invalidation covers the selected brand across admin origins', async () => {
  const deleted = [];
  const cacheWorker = await workerFunctions(['invalidateStorefrontCache'], { caches: { default: { delete: async request => deleted.push(request.url) } } });
  await cacheWorker.invalidateStorefrontCache(new Request(root + '/api/admin/cinematic-reel'), 'wibrawl');
  assert.equal(deleted.length, 3); assert.ok(deleted.every(url => new URL(url).origin === wb));
  deleted.length = 0;
  await cacheWorker.invalidateStorefrontCache(new Request(wb + '/api/admin/storefront-settings'));
  assert.equal(new Set(deleted.map(url => new URL(url).origin)).size, 3);
});
