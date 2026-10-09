// Anonymous protection checks only. Never grant a live exception or submit a return.
import assert from 'node:assert/strict';

const base = 'https://glamiastore.com';
const paths = [
  '/api/orders/release-smoke-missing/support-context',
  '/api/orders/release-smoke-missing/returns',
  '/api/admin/support/tickets/release-smoke-missing/order-context',
  '/api/employee/admin/support/tickets/release-smoke-missing/order-context',
];
for (const path of paths) {
  const response = await fetch(base + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  assert.ok([401,403].includes(response.status), `${path}: expected anonymous denial, got ${response.status}`);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  console.log(`PASS anonymous support/order context denied: ${path}`);
}
console.log('PASS 4 support return-access live checks. No mutation sent.');
