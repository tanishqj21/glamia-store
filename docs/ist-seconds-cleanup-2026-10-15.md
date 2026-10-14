# IST, seconds and unused-code cleanup — 15 October 2026

The requested website Test button, ₹1 simulated checkout, API helpers and draft migration were cancelled and removed before deployment. No test-mode schema or configuration was applied to production. Normal prices and payments remain in place.

## Application time

- API timestamp fields return explicit IST (`+05:30`) without changing their underlying instant.
- Scheduling inputs use Asia/Kolkata even when the admin device uses another timezone. Seconds can be entered for events, announcements, deals, pre-orders and return pickup/update schedules.
- Website timestamps and order/return PDFs include seconds whenever a clock is shown. Date-only values stay dates.
- Event countdowns tick once per second, stop at expiry, and refresh after the tab becomes visible. Expiry pricing is no longer delayed by the former minute timer.
- India calendar days apply to daily upload quotas, support-ticket dates and exported filenames. Database storage retains UTC to preserve existing instants and protocol expiry comparisons; no timestamp data migration was performed.

## Cleanup

- Archived 1,237 obsolete tracked website bundles, keeping the current graph and every bundle referenced by a manifest committed in the previous seven days. Cleanup now uses Git history as well as file timestamps, so fresh worktrees cannot retain obsolete bundles just because checkout reset their mtimes.
- Removed abandoned, never-committed bundles generated during development, including the cancelled test-mode build.
- Audited website imports and module reachability; all authored website source modules are reachable. Consolidated repeated imports touched by the timestamp work.
- Audited 29 current shopper/employee app JavaScript sources in the main workspace. Removed the unused `searchProducts` shopper import and unused `Image` employee import. No remaining unused non-JSX bindings or lint errors. These two small app edits remain with the existing local native-app changes; unrelated native work was not included in the website commit or released.
- Kept active invoice scripts, Expo configuration, all reachable app modules and the shared refund presentation model.
- Static CSP hashes now update from the actual built inline scripts alongside the Worker policy.

## Validation

- 142 relevant regression tests passed, including timezone, order year, checkout/coupon, stock credit, refund and production security cases.
- 8 focused timezone/seconds tests passed again after the final source cleanup.
- Browser checks cover both domains in Asia/Kolkata, America/Los_Angeles and Asia/Tokyo, including second precision, unchanged fractional precision and changed schedule instants. A live countdown was checked across a second tick and expiry. No page errors or mobile overflow.
- Production build and complete 54-chunk asset graph passed. Website/backend lint had no errors; existing React effect warnings remain.
- Evidence is preserved in the main workspace under `tmp/ist-cleanup-2026-10-15` and `test-results/ist-seconds`.

## Release

- Code commit: `0a88e6f`, pushed to `codex/wibrawl-storefront` and fast-forwarded into the main workspace.
- Cloudflare version: `a4b24005-b348-479c-aed1-017dbcd26898`.
- Live health and homepage checks returned 200 on both domains, with explicit IST timestamps including seconds and the new `assets/index-_V-8zewO.js` entry. Both domains return 404 for the cancelled `/api/test-mode` endpoint.
- The local main workspace additionally archived 2,913 obsolete generated chunks using the same compatibility rules. The local app edits remain alongside the existing native work; no native release was made.
- Canonical LF line endings and build-time normalization preserve CSP script hashes in future Windows checkouts.

