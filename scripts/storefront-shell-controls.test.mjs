import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingShoppingControls } from '../src/storefront-shell-controls.js';

test('pending server buttons cannot accept a click but normal product links remain navigable', () => {
  const result = pendingShoppingControls('<button type="button">Add to bag</button><a href="/product/123">Product</a>');
  assert.match(result, /<button disabled="" data-glamia-pending-control="" type="button">/);
  assert.match(result, /<a href="\/product\/123">Product<\/a>/);
});

test('already disabled buttons and escaped merchant descriptions are preserved', () => {
  const source = '<button disabled="" type="button">Unavailable</button><p>&lt;button&gt; is text</p>';
  assert.equal(pendingShoppingControls(source), source);
});
