import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

test('unknown pages and missing assets cannot receive a successful SPA fallback', async t => {
  const { db, env } = localDatabase(); t.after(() => db.close());
  env.ASSETS = { fetch: async () => new Response('<html><div id="root"></div></html>', { headers: { 'Content-Type': 'text/html' } }) };
  const worker = await workerFunctions(['isKnownSpaFallback']);
  for (const path of ['/unknown-audit-page', '/assets/missing-audit.js', '/unknown/nested/path/extra']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.default.fetch(new Request(`http://127.0.0.1:8788${path}`, { method }), env, { waitUntil() {} });
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
});

test('known client routes and dynamic category aliases retain the SPA shell', async t => {
  const { db, env } = localDatabase(); t.after(() => db.close());
  const worker = await workerFunctions(['isKnownSpaFallback']);
  for (const path of ['/search', '/checkout', '/credits', '/track-order', '/reviews', '/admin/orders', '/women', '/men']) assert.equal(await worker.isKnownSpaFallback(path, env), true, path);
  db.prepare("INSERT INTO categories(name) VALUES ('Home & Living')").run();
  assert.equal(await worker.isKnownSpaFallback('/home-living', env), true);
  assert.equal(await worker.isKnownSpaFallback('/nonexistent-category', env), false);
  env.ASSETS = { fetch: async () => new Response('export const asset = true;', { headers: { 'Content-Type': 'text/javascript' } }) };
  const asset = await worker.default.fetch(new Request('http://127.0.0.1:8788/assets/real.js'), env, { waitUntil() {} });
  assert.equal(asset.status, 200);
});

test('review/account pages remain private and anonymous admin HEAD still redirects', async t => {
  const { db, env } = localDatabase(); t.after(() => db.close());
  env.ASSETS = { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) };
  const worker = await workerFunctions([]);
  const reviews = await worker.default.fetch(new Request('http://127.0.0.1:8788/reviews'), env, { waitUntil() {} });
  assert.equal(reviews.status, 200);
  assert.equal(reviews.headers.get('Cache-Control'), 'no-store');
  assert.match(reviews.headers.get('X-Robots-Tag'), /noindex/);
  const admin = await worker.default.fetch(new Request('http://127.0.0.1:8788/admin/orders', { method: 'HEAD' }), env, { waitUntil() {} });
  assert.equal(admin.status, 302);
  assert.equal(admin.headers.get('Location'), 'http://127.0.0.1:8788/');
});
