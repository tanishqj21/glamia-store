import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';

const context = vm.createContext({});
const manifest = new vm.SourceTextModule(readFileSync('react-app/src/lib/productMediaManifest.js', 'utf8'), { context });
const module = new vm.SourceTextModule(readFileSync('react-app/src/lib/productMedia.js', 'utf8'), { context });
await module.link(() => manifest);
await module.evaluate();
const media = module.namespace;
const entries = Object.entries(manifest.namespace.productMediaManifest);

test('every generated product copy exists, remains raster-only and has the expected dimensions', async () => {
  assert.ok(entries.length > 0);
  for (const [original, variants] of entries) {
    assert.match(original, /^\/api\/assets\/products\/[^/]+\/[a-f0-9-]+\.(png|jpg|jpeg|webp)$/i);
    for (const [width, path] of Object.entries(variants)) {
      assert.match(path, /^\/product-media\/[a-f0-9]{24}-(160|720|960|1600)\.webp$/);
      const file = resolve('public', '.' + path);
      assert.ok(existsSync(file));
      const metadata = await sharp(file).metadata();
      assert.equal(metadata.format, 'webp');
      assert.ok(metadata.width <= Number(width));
      assert.equal(media.productMedia(original, Number(width)), path);
    }
  }
});

test('unmapped or newly uploaded product photos safely retain their original URL', () => {
  const source = '/api/assets/products/new-owner/new-photo.png';
  assert.equal(media.productMedia(source), source);
  assert.equal(media.productMediaSrcSet(source), undefined);
  const [original, variants] = entries[0];
  assert.equal(media.productMediaSrcSet(original), `${variants[720]} 720w, ${variants[960]} 960w, ${variants[1600]} 1600w`);
});

test('missing optimized copies fall back once without an error loop or stale responsive candidate', () => {
  let source = entries[0][1][960], removed = 0, writes = 0;
  const original = entries[0][0];
  const image = { getAttribute: () => source, removeAttribute(name) { assert.equal(name, 'srcset'); removed++; }, set src(value) { source = value; writes++; } };
  media.recoverProductMedia({ currentTarget: image }, original);
  media.recoverProductMedia({ currentTarget: image }, original);
  assert.equal(source, original);
  assert.equal(removed, 1);
  assert.equal(writes, 1);
});

test('inline mobile bytes retain larger candidates and cannot be applied to a different photo',()=>{
  const [source,variants]=entries[0];
  const image={source,data:'data:image/webp;base64,AQID'};
  assert.equal(media.productMediaSrcSet(source,image),`${image.data} 720w, ${variants[960]} 960w, ${variants[1600]} 1600w`);
  assert.equal(media.productMediaSrcSet(source,{...image,source:'other'}),media.productMediaSrcSet(source));
  assert.equal(media.productMediaSrcSet(source,{source,data:'javascript:alert(1)'}),media.productMediaSrcSet(source));
  assert.equal(media.productMediaSrcSet(source,{source,data:'data:image/webp;base64,'+'A'.repeat(70000)}),media.productMediaSrcSet(source));
});
