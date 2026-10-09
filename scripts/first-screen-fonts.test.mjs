import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storefrontCss, storefrontRouteCriticalStyles } from '../src/storefront-styles.js';

test('embedded common-character fonts match the lossless generated assets on every public shell', () => {
  const fonts = JSON.parse(readFileSync('src/first-screen-fonts.json', 'utf8'));
  assert.equal(fonts.length, 2);
  for (const css of [storefrontCss, ...Object.values(storefrontRouteCriticalStyles).map(value => value.css)]) {
    const payloads = [...css.matchAll(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g)].map(match => Buffer.from(match[1], 'base64'));
    assert.equal(payloads.length, 2);
    fonts.forEach((font, index) => {
      assert.deepEqual(payloads[index], readFileSync('public/' + font.file));
      assert.equal(payloads[index].length, font.bytes);
      assert.ok(font.bytes <= 30000);
      assert.ok(css.includes('/fonts/jost-8d4387d2d7e4.woff2'), 'Uncommon characters retain original font coverage');
      assert.ok(css.includes('/fonts/cormorant-garamond-3ed3913013.woff2'));
    });
  }
});
