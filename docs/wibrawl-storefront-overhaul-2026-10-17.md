# Wibrawl storefront overhaul — 17 October 2026

## Scope and guardrails

This release updates the existing React 19 / Vite storefront. It introduces no framework, database migration, payment integration, storage binding or admin-component change. Glamia retains its existing components and styles. Unrelated workspace changes and native app projects are preserved.

The only hand-written Worker change is the private HTML fallback for `/returns` on the Wibrawl hostname. It receives `no-store` and `noindex` like the other account pages. API handlers, SQL queries, refund policy, payment checks, R2 bindings and Glamia routing are unchanged.

## Public interface

- Scoped `wibrawl-overhaul.css` implements the requested dark and light design tokens, uppercase display typography, technical monospace details, structural borders and small radii. Public roots expose `data-wibrawl-theme="dark|light"`; `wibrawl-theme` stores dark/light. Existing gaming/sports choices migrate on read. Until explicitly changed, the control continues following the device preference, preserving the preceding theme requirement.
- The football/controller action remains between Account and Cart, with destination-theme labels Stadium Light / Tunnel Dark. Hover/click motion and reduced-motion handling remain available.
- Wibrawl has a dedicated account dialog, instant-search dialog, wishlist count, signed-in credit pill and mobile Home / Drops / Search / Wishlist / Account navigation. Native modal isolation is supplemented with explicit keyboard wrapping and focus restoration.
- The three public hero layouts use the existing admin payload. They retain slide order, campaign/product imagery, recommendations, CTA/category targets and piece selection. Previous/Next, the slide index and mobile swipe are present. Rotation pauses for keyboard interaction, hover, hidden tabs and reduced motion. Admin preview keeps its existing manual behavior and markup.
- Public reels retain enabled layouts, configured order and automatic/manual selection. Manually selected products beyond the first catalogue page are resolved using the existing public product-list endpoint. Product details load near the viewport because card payloads omit galleries/videos. Actual optional videos autoplay muted in view, pause when hidden or reduced motion is enabled, and offer sound controls. Image-only listings stay image-only.
- Cards support thumbnail/gallery previews, video, swipe, colourways, featured/deal/stock badges, live deal prices/countdowns and size-stock-aware quick add. Unknown size stock stays disabled until checked; full-detail navigation remains available on a failed preview read.
- Wibrawl PDP uses the existing product fetch, reviews and question components. It adds an ordered image/video gallery, colourways, size pills, uploaded size-chart dialog with zoom, specification accordions, review/Q&A tabs, related pieces and a mobile purchase bar.
- Existing cart, checkout, credits, orders, return/refund trackers and support conversations receive Wibrawl-scoped styling. The delivery progress indicator represents the current shared free-delivery policy, without inventing a spending threshold. Coupons and credit eligibility remain server-controlled.
- `/returns` reuses `useCustomerReturns`, the existing after-sales dialog, saved-policy exceptions, original-payment/store-credit options and existing refund/exchange trackers. The order overview distinguishes processing, attention, transit and completed states from actual order fields.
- About uses `/api/about` and the same admin content as Glamia, presented as an expandable vertical chronicle.

## Existing data contracts reused

| Surface | Existing source |
| --- | --- |
| Announcements, events, trust, socials, reels | `/api/storefront-settings`; `AnnouncementBar` |
| Hero layouts and linked frames | `/api/hero`; `slides[].layout`, `imagery`, `frames`, `words`, CTA fields |
| Catalogue, filters, size stock | `useCatalogue`; `/api/products?view=cards&include_stock=1` |
| Full gallery, video, colourways | `/api/products/:id?cache=1` |
| Search and categories | Existing Header reads `/api/search` and `/api/categories` |
| Cart and wishlist | Existing App state and saved-item synchronization |
| Product reviews and Q&A | Existing `ProductReviews` and `ProductQuestions` endpoints/components |
| Coupons, credits and payments | Existing `CouponBox`, `StoreCreditsPage`, `CheckoutPage` |
| Customer orders | Existing account collections loader and Orders panel |
| Return eligibility/submission | Existing `AfterSalesDialog` and its endpoints |
| Return updates | `useCustomerReturns` and existing refund/exchange trackers |
| Support | Existing `CustomerSupportPage` and ticket messaging |
| About | `/api/about` |

## Verification

- Vite production compilation, stylesheet generation, asset graph verification and Cloudflare Worker dry-run passed. Windows briefly locked generated output files; rerunning the stylesheet-generation step completed successfully.
- Browser overhaul suite passed at 360, 390, 768 and 1440 pixels with both themes and all three hero layouts. It checked enabled reel order, responsive overflow, colour changes, disabled sizes, quick add, search, modals, size-chart zoom, Q&A, cart, credits, orders, returns, support and About interaction.
- All audited Wibrawl screens had zero WCAG A/AA findings in axe. Glamia desktop/mobile retained its original header and product-card branches.
- Home, product and cart server-rendered fixtures hydrated without mismatch errors. Their controls remained interactive.
- A local generated WebM fixture verified actual optional-video loading from a full product response, muted playback, sound toggling and reduced-motion pause. No fixture product or media was added to production.
- Header positioning/animation/persistence checks and the existing Glamia Wibrawl-link hover regression passed.
- Existing Wibrawl shopping, theme, menu, empty and error-state browser regression passed.
- 47 coupon/refund/return-policy tests passed against in-memory SQLite fixtures.
- 34 checkout regressions passed against the isolated local audit Worker without payment credentials.
- Targeted lint for the new Wibrawl implementation: zero errors and warnings. Existing shared-file warnings were not broadened into unrelated refactors.
- Critical stylesheet isolation confirms Glamia's inline stylesheet contains no `.wb-storefront` rules.

No live orders, payments, refunds, customer messages or catalogue writes were performed during verification. Authenticated commerce was verified using isolated fixtures rather than real transactions.

## Deployment

- Cloudflare Worker version: `645684c4-df25-442a-9862-177bb8d82ecb`.
- Live Wibrawl and Glamia checks passed at 390 and 1440 pixels with no JavaScript, hydration or CSP errors. Wibrawl hero navigation, both theme tokens/persistence, a real product page and the private returns route were checked. Glamia retained its original header/components.
- Live verification blocked every non-GET/HEAD API request, including analytics. It did not create transactions or edit live data.
- Review evidence: `tmp/wibrawl-overhaul-review/report.json`, `live-report.json` and desktop/mobile screenshots. The read-only live checker is `scripts/wibrawl-overhaul-live-check.mjs`.
