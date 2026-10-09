import assert from 'node:assert/strict';
import { pathFromLink, categoryFromPath } from '../glamia-shoppers-app/src/navigation.js';

assert.equal(pathFromLink('https://glamiastore.com/offers'), '/offers');
assert.equal(pathFromLink('https://www.glamiastore.com/product/seed-midnight-satin-dress'), '/product/seed-midnight-satin-dress');
assert.equal(pathFromLink('glamia-store:///category/women'), '/category/women');
assert.equal(pathFromLink('glamia-store://product/seed-midnight-satin-dress'), '/product/seed-midnight-satin-dress');
assert.equal(pathFromLink('glamia-store://apple-auth?ticket=one-use-secret'), '');
assert.equal(pathFromLink('https://other.example/offers'), '');
assert.equal(pathFromLink('https://glamiastore.com/%2fadmin'), '');
assert.equal(categoryFromPath('/category/everyday-wear', ['Everyday Wear', 'Accessories']), 'Everyday Wear');
console.log('Owned-domain, custom-scheme, and category routing checks passed.');
