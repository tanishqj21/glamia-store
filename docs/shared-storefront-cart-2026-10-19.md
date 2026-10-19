# Shared Glamia / Wibrawl bag and order timeline — 19 October 2026

Signed-in customers use the same account cart on both domains. Explicit cart
product lookups and checkout/coupon validation accept live products from either
store, while each browsing catalogue and sitemap retains its admin visibility.
A mixed purchase remains one order and uses the prefix of the checkout store.
Server prices, size stock, reservation, credits, coupons and idempotency remain
server-controlled. No schema migration is needed.

Cart image/title links open exclusive products on their owning store. Products
assigned to both stores stay on the current store. Wrong-domain public product
pages redirect to the owner and preserve the selected size. In-app product
navigation handles the same validated destination. Signed-in cross-store links
finish pending account writes before leaving; page exit has a keepalive fallback.
Account selections refresh on focus and cart/checkout entry, avoiding the old
one-minute stale-read window. Guest baskets remain browser-local.

The connected order timeline now renders in Glamia and Wibrawl order history,
Wibrawl order dialogs, and their shared guest order tracking page. It uses each
store's light/dark palette, switches from horizontal to vertical on phones,
shows recorded timestamps in IST with seconds, and handles cancelled orders
without implying continued delivery. The standalone review carousel stays local.

Validation:

- 46 real-Worker / checkout regression tests passed with in-memory SQLite and
  isolated provider fixtures (including stock, idempotency and both order prefixes).
- 20 saved-item / shared-bag / redirect tests passed. No production writes.
- Real browser with both production hostnames fully intercepted and local build
  assets: immediate cross-domain handoff before debounce, account add/merge,
  both mixed carts, native owner-domain links, one combined Wibrawl payment
  request payload, remote removal on refocus, and both order timelines passed.
- Eight order timeline accessibility audits passed: both stores, 390/1440px,
  light/dark palettes, no browser runtime errors or horizontal overflow.
- Existing four-width Phase 2 cart/checkout/order/aftercare checks passed.
- Production Vite build and asset graph check passed. Scoped lint has no errors
  with the pre-existing CartPage render-prop refs-rule false positive disabled;
  two existing Wibrawl bag effect warnings remain.

Tests: `scripts/shared-storefront-cart.test.mjs` (experimental VM modules),
`scripts/shared-storefront-cart-browser-test.mjs` (build first into
`tmp/shared-cart-app-dist`), and existing Wibrawl / saved-item regressions.
Reports: `tmp/shared-cart-review/`, `tmp/shared-cart-*.log`.
