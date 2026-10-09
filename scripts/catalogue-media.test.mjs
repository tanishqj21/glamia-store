import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { catalogueMediaManifest } from '../react-app/src/lib/catalogueMediaManifest.js';
import { catalogueMedia, recoverCatalogueMedia } from '../react-app/src/lib/catalogueMedia.js';

test('catalogue copies match the original downloaded bytes and content-addressed names', () => {
  assert.ok(Object.keys(catalogueMediaManifest).length);
  for (const [source, image] of Object.entries(catalogueMediaManifest)) {
    assert.match(source, /^\/api\/assets\/products\/thumbs\/[\w-]+\/[a-f\d-]{36}\.webp$/i);
    assert.equal(image.url, `/catalogue-media/${image.sha256.slice(0, 24)}.webp`);
    const bytes = readFileSync('public' + image.url);
    assert.equal(bytes.length, image.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  }
});
test('a missing copy falls back once without an image error loop', () => {
  let writes = 0;
  let current = '/catalogue-media/missing.webp';
  const image = { getAttribute: () => current, set src(value) { writes++; current = value; } };
  recoverCatalogueMedia({ currentTarget: image }, '/original.webp');
  recoverCatalogueMedia({ currentTarget: image }, '/original.webp');
  assert.equal(current, '/original.webp');
  assert.equal(writes, 1);
});
test('known catalogue images use static assets; new uploads retain their original URLs', () => {
  for (const [source, image] of Object.entries(catalogueMediaManifest)) assert.equal(catalogueMedia(source), image.url);
  for (const source of ['/api/assets/products/thumbs/new-upload.webp', '', 'https://example.test/photo.webp']) assert.equal(catalogueMedia(source), source);
});
