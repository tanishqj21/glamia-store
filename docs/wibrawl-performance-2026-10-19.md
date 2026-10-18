# Wibrawl responsiveness and loading repair

Scope: Wibrawl public storefront only. Glamia presentation, admin components,
native apps, payment logic, database records and stock remain unchanged.

## Findings and repairs

- Cloudflare's default JSX compilation expected `React.createElement`, while
  the newer Wibrawl components relied on Vite's automatic JSX runtime. This
  caused `ReferenceError: React is not defined` and silently fell back to an
  empty server root. Wibrawl JSX modules now explicitly declare the automatic
  runtime. The actual local Cloudflare runtime renders homepage, PDP and cart
  successfully; browser hydration fixtures now compile with Wrangler's default
  JSX mode so this mismatch is detectable. Live checks require hero markup in
  the HTML response before JavaScript runs.
- The one-second clock lived in App and refreshed its entire commerce context.
  All Wibrawl pages, cards, navigation and media consequently rerendered for
  each countdown tick. A shared external clock now updates only countdown
  leaves. Deal badges and offer membership use stable snapshots and change
  only when a scheduled window starts or ends. One timer serves all subscribers
  and sleeps while the document is hidden; it stops when no subscribers remain.
- First-screen media restoration still targeted the previous Wibrawl DOM.
  Current hero and PDP selectors now reuse the image embedded in server HTML.
  Campaign srcsets keep the small inline AVIF plus crisp larger image sources,
  so desktop does not upscale the tiny image or replace it during hydration.
- Hero piece selectors use the existing tiny preview assets where available.
  Collage/split images advertise their actual layout width instead of 100vw.
- Product quick-add panels and hero chips no longer each create an expensive
  backdrop blur. The mobile header/buy bar use solid theme surfaces; the dock
  retains a lighter blur. The desktop header retains subtle glass styling.
- Only the current Wibrawl shell's rules are embedded as critical CSS. Old
  layouts, product/account and admin rules still arrive in the deferred sheet.
  Embedded Wibrawl CSS drops from 155,785 to about 52,500 bytes; JavaScript-off
  comparisons at 390/1440px found no first-screen geometry, typography or colour
  changes. Glamia's critical-CSS branch is unchanged.
- Server-rendered colour swatches use SVG presentation attributes, so they
  display under the strict CSP without blocked inline style attributes.
- Reel autoplay now requires at least 65% intersection. Mostly offscreen films
  no longer start playing just because their edge enters the viewport.

## Verification

- Vite production build, asset/CSP checks and scoped ESLint passed.
- All 36 layout/accessibility/overflow audits passed at 360/390/768/1440px,
  including persona changes, navigation, search/filtering, stock-aware cards,
  PDP, size charts, reviews/Q&A, Glamia isolation and SSR hydration.
- All 37 populated commerce audits passed for cart, checkout, credits, orders,
  returns, support and PDF actions.
- Cart cascade tests passed in both themes on mobile and desktop, including
  rapid additions, reduced motion, size validation and native-dialog focus.
- Scheduled-deal regression verifies start/end boundaries, ticking seconds,
  and that timer ticks do not rerender App. Bootstrap regressions verify the
  current hero/PDP markup preserves inline media and desktop image sources.
- Real video autoplay/play/pause/mute, hero rotation, swipe, reduced motion
  and saved-theme migration passed. The WebM fixture now records multiple
  changing frames, avoiding a flaky single-frame test clip.
- All 15 persona/cart/payment/invoice model tests passed.

## Measurement protocol

Unmodified Lighthouse mobile/desktop presets run against the live site.
Read-only CDP profiling uses 4x CPU throttling at 390px and 1440px, measures
6.2 seconds after hydration/network-idle, and blocks production API writes.
Baseline reports are in `tmp/lighthouse-reports/wibrawl-lag-before-mobile.*`
and `tmp/wibrawl-lag-profile-before.json`. Final measurements are in
`tmp/lighthouse-reports/wibrawl-lag-lean-*` and
`tmp/wibrawl-performance-review/profile-lean.json`.

The mobile baseline was Performance 72, LCP 5.1s and TBT 310ms. Desktop's
matched idle profile recorded 181.6ms scripting before versus 35.1ms after
(about 81% less scripting under the same 4x throttle). Live-blurred elements
dropped from 7 to 1 on mobile and 6 to 1 on desktop. The mobile baseline still
had deferred catalogue work arriving during the observation window, so its
scripting delta is not presented as a pure steady-state comparison.

## Final deployment and live results

Cloudflare version `8c6edcd0-aaf6-40c6-b2c8-eb753fbce03b` is live.
Read-only production checks passed at 390/1440px for both personas, all three
collection routes, a published product, the drawer and all six commerce routes,
plus Glamia's existing cart/checkout/credits pages. Checks require real hero
markup in the HTML before JavaScript and report no hydration, CSP or runtime
errors. They block API writes and create no production orders.

| Unmodified Lighthouse preset | Performance | FCP | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- |
| Mobile baseline | 72 | 1.5s | 5.1s | 310ms | 0 |
| Mobile final | 86 | 2.2s | 3.8s | 0ms | 0.026 |
| Desktop final | 94 | 1.0s | 1.4s | 0ms | 0.001 |

Both final runs report Accessibility 98, Best Practices 100 and SEO 100.
These are individual lab runs with cold-page/network variation, not field-user
percentiles. Mobile cold loading still scores below 90; no higher score is
claimed. Thumbnail requests now use the roughly 3KB 96px assets instead of the
69–91KB full images for those preview slots.
