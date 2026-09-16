# Glamia

Customer-facing apparel marketplace on a Cloudflare Worker backend with D1, R2 product images, Google email login with guest browsing, seller listings, and an admin email whitelist.

## Layout

- `src/index.js` — Worker API: Google Sign-In verification, HMAC session cookies, D1 queries, R2 uploads, profile details, listings, admin controls.
- `public/` — static frontend (`index.html`, `app.js`, `styles.css`) served by Workers Assets.
- `migrations/` — D1 schema and seed data.
- `scripts/smoke-test.mjs` — end-to-end API smoke test (run against `wrangler dev`).
- `employee-app/` — separate Expo/React Native packing app for Android and iOS. It uses the same Worker/D1 order data through employee-only bearer APIs.

## Storefront UX

The brand mark opens the home page (there is no Store tab). The design theme is **class & elegance** — ivory canvas, Cormorant Garamond serif headlines, Jost letter-spaced labels, antique-gold accents, and a charcoal hero — structured like a modern fashion storefront. Every page has a real URL (History API routing with a Workers Assets SPA fallback), so any view is deep-linkable and the browser back/forward buttons work.

- **Routes** — `/` (home) · `/offers`, `/just-arrived`, and `/best-sellers` (dedicated collection pages) · `/<category>` (`/men`, `/women`, `/ethnic`, …, landing directly on the filtered catalog) · `/product/<name-slug>-<id>` (unique per product) · `/cart`, `/wishlist`, `/checkout`, `/orders`, `/profile`, `/address` · `/admin/<section>` for every console tab (`/admin`, `/admin/add-product`, `/admin/products`, `/admin/inventory`, `/admin/orders`, `/admin/customers`, `/admin/reviews`, `/admin/coupons`). Unknown paths fall back to home; login-gated pages open the login modal and return to `/`.
- **Shareable filters** — search, price, and sort choices are reflected in the query string (`/men?q=linen&sort=priceLow&max=5000`) and restored from it on reload.
- **Share button** — on each product page: opens the native share sheet on phones (`navigator.share`), otherwise copies the product link to the clipboard (async Clipboard API with an `execCommand` fallback).

- **Header** — category nav with active underline (left), centered GLAMIA wordmark, live **search bar**, wishlist, theme toggle, and cart with count badge (right); an announcement bar sits above.
- **Home** — auto-rotating **hero carousel** (per-category "Explore" slides with product frames, arrows, and dots), a trust strip (free shipping / 7-day returns / demo checkout), a centered **New In** row, a full-width editorial promo banner, shop-by-category tiles, then the live catalog with **category/price filters and sorting** in a sticky Refine sidebar.
- **Product cards** — discount badge, wishlist heart, hover **quick-add bar** (always visible on touch), image swap on hover, and clear **Pre-order** labels for reserved stock.
- **Verified-purchase reviews** — reviews are purchase-gated, and every review card carries a **✓ Verified purchase** badge.
- **Related products** — "You may also like" on product pages (same category, excluding the current listing and its colourway siblings).
- **Deals with countdowns** — admins attach a manual end time to any listing (Admin → Deals); the home page shows a **Deals Ending Soon** section with per-product live countdowns that auto-expire.
- **Autocomplete search** — the header search suggests live products (thumbnail, colour, price); picking one opens the product, Enter keeps the catalog filter. Suggestions and the `/search` page are **semantic (vector) results**: queries and products are embedded with Workers AI (`@cf/baai/bge-small-en-v1.5`) and ranked with Vectorize cosine similarity, so natural phrases ("warm office layers", "festive silk") find relevant pieces without exact keyword matches. If the AI/Vectorize bindings are unavailable the API transparently falls back to the D1 full-text keyword search (`engine: "keyword"` in the response).
- **Vector search index** — product vectors live in the `glamia-product-search` Vectorize index (384 dims, cosine). Products are embedded from name, brand, category, subcategory, colour, material, and description. Creating, editing, or deleting a listing re-embeds the catalog automatically in the background; admins can also force a full rebuild with `POST /api/admin/search/reindex`.
- **Admin-managed categories & subcategories** — categories live in their own table, managed under Admin → Categories (add/delete; deleting is blocked while listings still use one). Each category carries **manually managed subcategories** (chips with usage counts, add/remove inline). The listing form picks a category and then a cascading subcategory; the product page shows it as "Type".
- **Product pages** — dedicated page per product: image gallery, star rating from real reviews, material/colour/sizes/variants, add to cart, wishlist toggle.
- **Wishlist** — ♥ any product (header heart icon); saved per account in the browser.
- **Login / signup** — modal with **Continue with Google** or **Continue as guest** (one Google account covers sign-up and sign-in).
- **Cart** — quantity controls, coupon codes (`GLAMIA10` 10% off, `FLAT200` ₹200 off seeded), then Proceed to Checkout.
- **Checkout & payments** — pick a saved address (or add one inline), reserve eligible **pre-order** pieces, then place a clearly labelled **Demo payment** order. Pre-order release dates and remaining reservation capacity are shown where configured. No money is charged and no real payment method is accepted until a payment gateway is integrated.
- **Address management** — Address Book with multiple addresses, set-default, edit, delete; used at checkout.
- **Order history & tracking** — every order with payment status, coupon, delivery address, and a **tracking timeline** (Order placed → Confirmed → Shipped → Delivered).
- **Order numbers** — `GM-DDMMYYYY-XXX-NNNNN` (e.g. `GM-12092026-MSW-00001`): IST order date, initials of the first item's product name (up to three letters), and a globally sequential counter stored atomically in D1 (migration `0050`). Gaps can appear if a checkout fails after the number is taken; historical orders placed before the change keep their old numbers.
- **After-sales care** — customers can cancel pending/confirmed orders, request a return/exchange/refund after delivery, and see the request status; admins manage each request from the Returns & refunds workspace.
- **Inventory safety** — checkout decrements stock atomically and records committed reservations; cancellations release the reservation and restore stock.
- **Restock alerts** — signed-in customers can subscribe to a sold-out product/size and remove the alert later.
- **Product reviews** — any signed-in customer can review a product (one review per product, editable and deletable from the product page or Profile → Your Reviews). Reviews from customers who bought the item carry a **✓ Verified purchase** badge and **sort before unverified reviews**; catalog ratings average visible reviews only.
- **Size charts** — admins can attach a size-chart image to a listing (upload or URL, in Add/Edit Product); the product page shows a small "Size chart" thumbnail beside the size selector that opens a full-screen lightbox on click.
- **Admin review moderation** — the Admin console has a Reviews tab: hide/unhide (hidden reviews vanish from the product page and stop counting toward ratings, but the author still sees theirs) or delete abusive content.
- **Dark mode** — the header toggle switches the whole palette to charcoal + gold.
- **Store policies and discoverability** — privacy, terms, shipping, returns, and contact pages are available under `/policies`; the app includes route-aware metadata, a sitemap, and robots rules.

Admins additionally get the Admin console tab (products, inventory, orders, customers, coupons, returns, system health, dashboard) — see below.

## Admin Console (whitelisted emails only)

Reach it from the header **Admin** tab or the user dropdown. Sections:

- **Dashboard** — total sales, order count, average order value, low-stock count, a 7-day revenue chart, and recent orders.
- **Add Product** — the listing form: category, subcategory, brand, price/MRP, material, details, **4–6 images** (R2 upload or URL with a preview for every image; admins can move any image to the first or last position and select a separate thumbnail), **per-size stock** (add each size with its own quantity — the total is computed), optional **pre-order** release date and reservation limit, and **colourways**: each colourway (own colour, per-size stock, and **4–8 images**) is published as a **standalone linked listing** that inherits the parent's name, brand, price, and description. Linked listings share a variant group: the catalog shows one card per colour (with the colour under the name and sibling swatches), product pages have a "More colours" navigator, and **status changes (Go Live / Hold / Archive) apply to the whole group** while stock is managed per colourway and per size. Editing a listing edits just that colourway.
- **All Products** — the full catalog with filters (Live / On hold / Archived) and per-product actions: **Go Live**, **Put on Hold**, **Archive**/Restore, Feature/Unfeature, Edit, Delete. Admins can export CSV or XLSX and apply bulk status updates.
- **Inventory** — per-product stock with inline edit and low-stock highlighting (archived listings excluded). Listings with size rows show **per-size stock inputs**; sold-out sizes render crossed-out and unselectable on the product page.
- **Orders** — every order with items, coupon, total, and a status dropdown (pending → confirmed → shipped → delivered / cancelled); returns/refunds track eligibility, refund amount, notes, and processing time.
- **Customers** — all signed-in accounts with DOB/phone, join date, order count, and lifetime spend.
- **Reviews** — customers can submit a 1–5 star rating and written feedback; admins can hide/unhide or delete reviews. Hidden reviews disappear from product pages and ratings.
- **Coupons** — create percent or flat-₹ codes with mixed category/product targeting, selected customer emails, start/end times, total and per-account usage limits, optional minimum cart values, maximum discount caps, and delete them.
- **Returns & refunds** — review customer after-sales requests and move them through requested, approved, received, refunded, completed, rejected, or cancelled.
- **System health** — check D1 health, inspect Brevo email delivery attempts, retry failed email events, and download a JSON data backup.
- **Employees** — create, disable, and reset individual packing-team app credentials. Employee actions are restricted to the packing queue and recorded in a separate audit trail.

## Employee packing app

The employee app is intentionally separate from the buyer storefront and admin console. Admins create credentials under **Admin → Employees**. Each employee can sign in, view non-cancelled orders waiting to be packed, open item/size/colourway/quantity/shipping details, and mark an order as **Packed**.

Packing is stored independently from shipping: marking an order packed never marks it shipped. The Worker creates a deduplicated `order_packed` alert for the admin dashboard, and the website refreshes its admin data every 30 seconds. The app also refreshes its queue every 30 seconds; push notifications can be added later after the workflow is validated.

Run the app from its own directory:

```bash
cd employee-app
npm install
npx expo start
```

For a local Worker on a physical phone, set `EXPO_PUBLIC_API_URL` to the computer’s LAN IP (not `127.0.0.1`). The managed Expo project exports for both platforms with `npx expo export --platform android` and `npx expo export --platform ios`. Before using employee accounts against a deployment, apply migration `0061_employee_packing_workflow.sql` to that D1 database.

Listing statuses: **on hold** (default for new listings — invisible to buyers), **live** (purchasable), **archived** (retired, hidden everywhere until restored). Buyers only ever see live products.

## Local Development

Requires Node.js 18+.

```bash
npm install
npm run db:migrate:local   # apply D1 schema + seed data
npm run dev                # http://localhost:8787
```

Local dev uses simulated D1/R2 (`.wrangler/state`) plus secrets from `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars   # then set SESSION_SECRET to a long random string
```

For local UI demonstrations, set `DEMO_ADMIN_ENABLED=true` in `.dev.vars` and visit `/demo-admin`. This creates a temporary local-only admin session for `demo-admin@glamia.local` and opens `/admin`. The route only works on loopback hosts and is disabled by default; do not enable it in production.

Run the API smoke tests in another terminal (server must be running):

```bash
npm run smoke
```

## Cloudflare Setup (deploy)

1. Create a D1 database and paste the returned `database_id` into `wrangler.jsonc`:

```bash
npx wrangler d1 create maison-mode-db
npm run db:migrate:remote
```

2. Create the R2 bucket:

```bash
npx wrangler r2 bucket create maison-mode-product-images
```

2b. Create the Vectorize index used by semantic search (already created for this account as `glamia-product-search`; only needed for a fresh account):

```bash
npx wrangler vectorize create glamia-product-search --dimensions 384 --metric cosine
```

3. Create a Google OAuth **Web** client ID in Google Cloud ("APIs & Services → Credentials"). Add both origins to **Authorized JavaScript origins**:

   - `http://localhost:8787`
   - `https://<your-worker>.<your-subdomain>.workers.dev`

   Then place the client ID in `wrangler.jsonc` under `GOOGLE_CLIENT_ID`.

4. Add your admin emails to `ADMIN_EMAILS` in `wrangler.jsonc`. Any signed-in Google account becomes a **seller**; only whitelisted emails get the **admin** role (re-evaluated on every request, so removing an email revokes access).

5. Set the session secret for production:

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put BREVO_API_KEY
```

Verify `support@glamiastore.com` (or the approved sender domain) in Brevo before setting `BREVO_API_KEY`. The Worker records every transactional email attempt in D1, retries transient failures automatically every five minutes, and exposes failed events for manual retry in Admin → System health.

5b. (Optional) Connect Google Analytics 4 to Admin → Dashboard. In Google Cloud, enable the Google Analytics Data API and create a service account. Add that service account email as a **Viewer** in the GA4 property’s Property access management, then set the property ID and service-account credentials locally in `.dev.vars`:

```dotenv
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=analytics-reader@your-project.iam.gserviceaccount.com
GA4_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

`GA4_MEASUREMENT_ID` is the public web data-stream ID (the value beginning with `G-`), so keep it in the `vars` section of `wrangler.jsonc`; do not store it as a secret. The React storefront loads the Google tag from `/api/config` and records client-side page views when visitors move between routes. Admin routes are excluded from Google Analytics traffic.

For the deployed Worker, store the values as secrets instead of committing them:

```bash
npx wrangler secret put GA4_PROPERTY_ID
npx wrangler secret put GA4_CLIENT_EMAIL
npx wrangler secret put GA4_PRIVATE_KEY
```

The dashboard reads the last 30 complete days through the read-only `runReport` endpoint. If these values are not configured, the existing first-party visitor analytics continue to work and the Google Analytics panel shows a setup prompt.

6. Deploy:

```bash
npm run deploy
```

## Production Cutover Rule

Before the final production-ready deployment, explicitly confirm a clean start. Clear demo/customer data such as Google-authenticated users, sessions, carts, wishlists, orders, reviews, support conversations, analytics, and other test records. Preserve only the product listings created for the production catalog, including their approved product media and inventory details. Do not perform this reset during ordinary demo deployments. Keep checkout in Demo mode until Razorpay confirms production access and the live payment integration has been separately verified.

## What Is Protected

- Any verified Google account can sign in and publish listings; guests browse without an account.
- Only emails in `ADMIN_EMAILS` receive `admin` role; the role is re-derived from the whitelist on every request. The Admin Panel (approve/feature/delete anything, reset demo) only renders for admins, and its endpoints enforce it server-side.
- Sellers can delete only their own listings; deleting a listing removes its R2 images.
- Uploaded product images are stored in R2 and served through `/api/assets/:key`. A scheduled Worker maintenance scan runs weekly (using the existing cron trigger), preserves every R2 key referenced by products, variants, reviews, and storefront data, and removes only unreferenced `products/` or `reviews/` objects older than a seven-day grace period. Branding assets outside those prefixes are not touched.
- Sessions are HMAC-signed HttpOnly cookies (7-day expiry); a tampered or stale signature is rejected.
- Mutating API requests reject a mismatched `Origin`, sensitive endpoints have a lightweight per-IP rate limit, and all Worker/asset responses include baseline security headers.
- Email attempts are recorded in D1 with retry timing and provider errors; admins can retry failed messages from System health.

## API Summary

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/config` | public |
| GET | `/api/session` | public (returns signed-in user) |
| POST | `/api/auth/google` | public (Google ID token) |
| GET | `/demo-admin` | local development only (`DEMO_ADMIN_ENABLED=true`) |
| POST | `/api/logout` | public |
| GET/PUT | `/api/profile` | signed-in (DOB + mobile) |
| GET | `/api/products` | public (live only; `?scope=seller` / `?scope=admin`) |
| GET | `/api/search` | public (`?q=` semantic vector search, keyword fallback) |
| POST | `/api/admin/search/reindex` | admin (re-embed all live products into Vectorize) |
| POST | `/api/products` | signed-in sellers (4–6 images, created on hold for admin approval) |
| DELETE | `/api/products/:id` | owner or admin |
| GET | `/api/products/:id/reviews` | public (visible only; signed-in callers also get purchase eligibility + own review) |
| POST | `/api/products/:id/reviews` | signed-in purchasers only (1 per product, editable) |
| DELETE | `/api/products/:id/reviews` | signed-in (delete own review) |
| GET | `/api/my/reviews` | signed-in (own review history) |
| GET | `/api/orders` | signed-in (own; `?scope=admin` for all) |
| POST | `/api/orders` | signed-in or guest (items, coupon, demo payment, address) |
| GET | `/api/order-tracking` | public with order number + checkout email, or opaque tracking token |
| POST | `/api/orders/:id/cancel` | owner (pending/confirmed orders) |
| POST | `/api/orders/:id/returns` | owner (delivered orders) |
| GET | `/api/returns` | signed-in (`?scope=admin` for admins) |
| GET/POST/DELETE | `/api/restock-subscriptions` | signed-in |
| GET | `/api/health` | public |
| POST | `/api/coupons/validate` | signed-in |
| POST | `/api/uploads/image` | signed-in sellers (R2) |
| GET | `/api/assets/:key` | public |
| PATCH | `/api/admin/products/:id` | admin (full edit, stock, status, featured) |
| PATCH | `/api/admin/orders/:id` | admin (order status) |
| PATCH | `/api/admin/returns/:id` | admin (after-sales status) |
| GET | `/api/admin/email-events` | admin (delivery log) |
| POST | `/api/admin/email-events/:id/retry` | admin (retry failed email) |
| GET | `/api/admin/audit-log` | admin |
| GET | `/api/admin/backup` | admin (JSON export) |
| GET | `/api/admin/customers` | admin |
| GET | `/api/admin/reviews` | admin (all reviews) |
| PATCH | `/api/admin/reviews/:id` | admin (hide/unhide) |
| DELETE | `/api/admin/reviews/:id` | admin |
| GET/POST | `/api/admin/coupons` | admin |
| DELETE | `/api/admin/coupons/:code` | admin |
| POST | `/api/admin/reset` | admin |
