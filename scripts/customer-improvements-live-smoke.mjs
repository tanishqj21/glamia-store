// Read-only production checks. Never create orders, returns, payments or refunds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const base = 'https://glamiastore.com';
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
const hash = value => createHash('sha256').update(value).digest('hex');
async function read(path, headers = {}) {
  const response = await fetch(new URL(path, base), {
    method: 'GET', headers: { 'Cache-Control': 'no-cache', ...headers },
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.status < 500, `${path}: ${response.status}`);
  return response;
}

const manifest = JSON.parse(readFileSync('public/.vite/manifest.json', 'utf8'));
const files = new Set(Object.values(manifest).flatMap(entry =>
  [entry.file, ...(entry.css || []), ...(entry.assets || [])].filter(Boolean)));
for (const file of files) {
  const response = await read('/' + file);
  assert.equal(response.status, 200);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(readFileSync('public/' + file)), file);
  pass(`release chunk hash: ${file}`);
}
const settingsResponse = await read('/api/storefront-settings');
assert.equal(settingsResponse.status, 200);
const settings = await settingsResponse.json();
for (const field of ['dispatch_min', 'dispatch_max', 'delhi_min', 'delhi_max', 'india_min', 'india_max', 'support_hours']) {
  assert.ok(Number.isInteger(settings.customer_experience?.[field]) && settings.customer_experience[field] > 0, field);
}
pass('public delivery and support targets available to both clients');

const response = await read('/api/products?view=cards&include_stock=1&limit=2&page=1&sort=price_low&facets=1');
assert.equal(response.status, 200);
const catalogue = await response.json();
assert.ok(Array.isArray(catalogue.products));
assert.ok(catalogue.products.length <= 2);
assert.ok(Number.isInteger(catalogue.pagination.total));
assert.equal(catalogue.pagination.page, 1);
assert.ok(Array.isArray(catalogue.facets.colors) && Array.isArray(catalogue.facets.sizes));
for (const product of catalogue.products) {
  assert.ok(Number(product.review_count) >= 0);
  if (!Number(product.review_count)) assert.equal(Number(product.rating), 0);
}
pass('bounded catalogue pagination, facets and review-backed ratings');
if (catalogue.pagination.has_more) {
  const pageTwoResponse = await read('/api/products?view=cards&limit=2&page=2&sort=price_low');
  assert.equal(pageTwoResponse.status, 200);
  const pageTwo = await pageTwoResponse.json();
  assert.equal(pageTwo.pagination.page, 2);
  assert.ok(pageTwo.products.every(product => !catalogue.products.some(previous => previous.id === product.id)));
  pass('next catalogue page contains distinct products');
}
const emptyResponse = await read('/api/products?view=cards&min_price=99999999&limit=2');
assert.equal(emptyResponse.status, 200);
const empty = await emptyResponse.json();
assert.equal(empty.products.length, 0);
assert.equal(empty.pagination.total, 0);
pass('server-side catalogue price filter returns truthful empty results');

for (const path of ['/api/returns', '/api/returns/release-smoke-missing/label', '/api/returns/release-smoke-missing/receipt', '/api/admin/orders/release-smoke-missing/cancellation-refund']) {
  const response = await read(path);
  assert.ok([401, 403].includes(response.status), `${path}: private endpoint denied`);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  pass(`anonymous after-sales access denied: ${path}`);
}
for (const [path, expected] of [
  ['/shipping-policy', /estimates, not courier-confirmed dates/i],
  ['/return-policy', /manual pickup/i],
  ['/refund-cancellation-policy', /original-payment refund/i],
]) {
  const response = await read(path, { 'User-Agent': 'Googlebot' });
  assert.equal(response.status, 200);
  assert.match(await response.text(), expected);
  pass(`crawler policy reflects current workflow: ${path}`);
}
console.log(`PASS ${checks} additional read-only release checks. No financial/account mutation was sent.`);
