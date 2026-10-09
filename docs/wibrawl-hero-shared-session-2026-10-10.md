# Wibrawl carousel and shared account

Admin → Hero Studio now has a Glamia/Wibrawl storefront selector. Each storefront has its own slides, publishing status, position, copy, CTA and 1–3 product frames. Products must be live and assigned to that storefront or Both. The Wibrawl preview uses the actual storefront carousel and can show Gaming or Sports. Until a Wibrawl slide is published, its original campaign hero remains visible.

Migration `0112_storefront_hero_carousels.sql` adds an indexed storefront column to hero slides, preserving existing slides as Glamia. Public hero reads use the request hostname; admin CRUD explicitly targets a storefront and cannot change or delete a slide belonging to the other store. Publishing invalidates that storefront's cached hero and homepage in the local Cloudflare cache; other locations retain the existing short cache TTL.

The three owned HTTPS origins (`glamiastore.com`, `www.glamiastore.com`, `wibrawl.glamiastore.com`) share `__Secure-mm_shared_session`, with Secure, HttpOnly, SameSite=Lax, Path=/ and Domain=glamiastore.com. Workers.dev, local previews and native bearer authentication remain isolated. The shared cookie takes precedence over legacy host cookies.

Existing logins are upgraded by `/api/session`. When a shopper visits the other storefront first, the client requests `/api/session/storefront-bridge` from the sibling hosts with credentials. Only the three exact storefront origins can read its credentialed response. It returns a boolean and sets the server-validated existing session as a shared cookie; the token is never exposed to JavaScript and its original expiry is preserved. The existing mutation origin checks remain in place. Logout clears the shared cookie and increments the account session version, revoking legacy sessions too.

Verification uses real migrations and Worker functions in isolated SQLite, plus Chromium's actual cookie, CORS and CSP behavior against intercepted HTTPS hosts. No production test accounts, slides or orders are created.

```powershell
node --experimental-vm-modules --experimental-sqlite --test scripts/wibrawl-admin-session.test.mjs scripts/wibrawl.test.mjs scripts/coupon-lifecycle.test.mjs scripts/storefront-performance.test.mjs scripts/storefront-shell-controls.test.mjs scripts/security.test.mjs
node --experimental-vm-modules --experimental-sqlite scripts/storefront-session-browser-test.mjs
# With npm run react:dev running:
node --experimental-vm-modules --experimental-sqlite scripts/wibrawl-hero-browser-test.mjs
node scripts/wibrawl-browser-test.mjs
```

Published on 2026-10-10 to all three existing custom domains. Migration 0112 was applied successfully; Cloudflare version is `70b2c23f-e0e1-4336-9197-fd388dbf10cf`. All 83 server regression tests passed. Browser checks passed for existing login migration in both directions, shared sign-out, admin create/edit and storefront filtering, both carousel themes at 1440/360 pixels, reduced motion, CTA navigation and automated carousel accessibility. Existing shopping/theme/menu checks also passed.

Anonymous live checks confirmed the root/www Glamia carousel remains at one slide and Wibrawl has zero configured slides with its original hero fallback. Credentialed bridge responses permit only owned origins; untrusted origins return 403. Live Glamia and Wibrawl loaded without browser errors, with no horizontal overflow in either mobile theme. No live merchandising or account records were created for verification.
