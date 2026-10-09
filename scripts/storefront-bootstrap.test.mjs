import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreFirstScreenMedia } from '../react-app/src/lib/storefrontBootstrap.js';

const mockDocument = attributes => ({ querySelector: () => ({ getAttribute: name => attributes[name] || null }) });
test('home reuses the already-visible image bytes, leaving other carousel frames unchanged', () => {
  const data = { hero: { first_image_from_dom: true, slides: [{ frames: [{ image: '/original.webp' }, { image: '/other.webp' }] }] } };
  assert.equal(restoreFirstScreenMedia(data, mockDocument({ src: 'data:image/webp;base64,AQID' })), data);
  assert.equal(data.hero.slides[0].frames[0].image, 'data:image/webp;base64,AQID');
  assert.equal(data.hero.slides[0].frames[1].image, '/other.webp');
});
test('product extracts only the inline responsive candidate and preserves its original source', () => {
  const data = { product: { first_image_inline: { source: '/original.webp', from_dom: true } } };
  restoreFirstScreenMedia(data, mockDocument({ src: '/large.webp', srcset: 'data:image/webp;base64,AQID 720w, /large.webp 960w' }));
  assert.deepEqual(data.product.first_image_inline, { source: '/original.webp', data: 'data:image/webp;base64,AQID' });
});
test('missing, oversized or non-image DOM data retains normal URL fallbacks', () => {
  for (const src of ['', 'javascript:bad', 'data:text/html;base64,AQID', 'data:image/webp;base64,' + 'A'.repeat(66000)]) {
    const data = { hero: { first_image_from_dom: true, slides: [{ frames: [{ image: '/normal.webp' }] }] }, product: { first_image_inline: { source: '/original.webp', from_dom: true } } };
    restoreFirstScreenMedia(data, mockDocument({ src }));
    assert.equal(data.hero.slides[0].frames[0].image, '/normal.webp');
    assert.equal(data.product.first_image_inline, null);
  }
});
test('unmarked API data does not read or replace photos from an unrelated screen', () => {
  const data = { product: { image_url: '/normal.webp' }, hero: { slides: [] } };
  assert.equal(restoreFirstScreenMedia(data, { querySelector: () => { throw Error('Unexpected DOM read'); } }), data);
  assert.equal(restoreFirstScreenMedia(null, null), null);
});
