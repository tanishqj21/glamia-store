# Lighthouse — WiBrawl and Glamia, 12 October 2026

## Final deployed results

Tested live homepages: https://wibrawl.glamiastore.com/ and https://glamiastore.com/.
Three sequential fresh-browser runs per device and site, using Lighthouse **13.5.0** and its unmodified mobile/desktop presets with simulated throttling. No user-agent detection, audit-specific rendering, network blocking or analytics suppression was used. Browser/layout tests did not run concurrently with these audits.

| Homepage | Mobile runs | Mobile median | Desktop runs | Desktop median |
| --- | --- | --- | --- | --- |
| WiBrawl | 94, 95, 98 | 95 | 98, 98, 98 | 98 |
| Glamia | 95, 95, 95 | 95 | 97, 98, 93 | 97 |

**Accessibility, best practices and SEO scored 100 in every final run.** All 12 final runs exceeded 90 in all four categories, referenced the final entry, loaded Google Analytics and the worker bootstrap with HTTP 200, and passed the browser console-error audit. Final mobile total blocking time was 0 ms on both sites in all runs.

The results cover these two homepages and this repeated lab sample. Scores vary with connection, CDN and device conditions; these measurements do not establish scores for every route or real-user Core Web Vitals.

## Release

- Worker: maison-mode-commerce
- Version: afa71616-c095-4392-9101-667451b58fd8
- Implementation commit: 8205d2c, pushed to codex/wibrawl-storefront
- Cache version prefix: 2026-10-12-storefront-first-screen-v50
- Entry: assets/index--LftfMgD.js; application: assets/main-BdwSMslI.js

## Changes

1. WiBrawl now sends its active hero, public presentation settings and matching first-screen markup from the server. React attaches controls to that existing screen and preserves the hero photo. Saved theme preferences still apply.
2. First-screen CSS is scoped to each store: 81,746 bytes for Glamia and 62,669 for WiBrawl. Negated admin selectors retain public header rules. Common brand-font glyphs arrive with the page; normal font files remain available. The full public stylesheet and private screens retain their existing rules.
3. The existing campaign artwork has responsive AVIF sources with WebP fallback. The initial WiBrawl campaign carries its 960 px AVIF once inside the document, avoiding an extra image round trip and duplicate bootstrap bytes. Hydration reads that existing source. Subsequent campaign slides and direct client navigation retain responsive sources. Two 40 × 48 edit-link pictures use 96 px thumbnails totaling 5,742 bytes instead of 160,018; full product frames and uploads retain their original sources. The generator is scripts/prepare-wibrawl-campaign-media.mjs.
4. Google Analytics executes in a dedicated worker through pinned [Partytown 1.0.0](https://partytown.qwik.dev/), keeping its existing commands, event order and native fallback. The vendored MIT license is included. Worker scope is restricted to /analytics/partytown-1.0.0/. Main-page script CSP remains strict; the same-origin sandbox is permitted by frame-src.
5. Nested analytics files are served before canonical product-route lookup, fixing the production 404 that previously forced native analytics execution. The credit login label matches its visible text.

No production database changes or native-app releases were made. Existing admin preview behaviour, hero navigation, themes and storefront functionality are retained.

## Validation

- 33 unit tests passed across storefront-performance, storefront-critical-css and wibrawl suites.
- Both stores at 390 px and 1440 px passed first-screen browser checks: script-blocked styling matches full CSS, hydration preserves the photo, no overflow or hydration errors, themes restore, menus and hero controls work. WiBrawl uses the embedded AVIF and small link thumbnails while full product slides keep full images.
- Analytics integration tests passed worker startup, worker failure/native fallback and unsupported-browser fallback with initial commands plus a subsequent cart event. A real Google-provider fixture also passed with collection requests intercepted, avoiding fixture events in the live property. Independent live checks confirmed workers, error-free provider loading and successful collection on both domains.
- Vite production build and the 55-chunk asset graph check passed. Targeted ESLint completed with no errors; existing warnings remain.

## Saved reports

Reports have been preserved in the main workspace, including lower-scoring diagnostic versions. JSON report links were relocated to the saved directory; measured values are unchanged.

- [WiBrawl final series](../tmp/lighthouse-reports/oct12-wibrawl-v50-series.json)
- [Glamia final series](../tmp/lighthouse-reports/oct12-glamia-v50-series.json)
- Individual HTML and raw JSON: tmp/lighthouse-reports/oct12-{wibrawl|glamia}-v50-run-{1|2|3}-{mobile|desktop}.{html|json}
- Validation logs: tmp/lighthouse-2026-10-12/
- Layout screenshots: test-results/lighthouse-2026-10-12/first-screen/

## Baseline and diagnostic versions

The initial WiBrawl performance scores were 46 mobile / 87 desktop; Glamia was 80 mobile / 95 desktop. Earlier versions and outliers are retained below, including failed worker routing, slow hero downloads and one audit that saw the preceding entry during deployment propagation. These are not final-release samples.

| Diagnostic series | Mobile median (range) | Desktop median (range) |
| --- | --- | --- |
| oct12-glamia-baseline | 80 (80–80) | 95 (95–95) |
| oct12-glamia-final | 95 (95–95) | 98 (98–98) |
| oct12-glamia-first-screen | 75 (75–75) | 95 (95–95) |
| oct12-glamia-worker | 90 (90–90) | 98 (98–98) |
| oct12-wibrawl-avif-final | 92 (90–93) | 95 (95–97) |
| oct12-wibrawl-baseline | 46 (46–46) | 87 (87–87) |
| oct12-wibrawl-final | 94 (89–94) | 96 (90–97) |
| oct12-wibrawl-first-screen | 67 (67–67) | 93 (93–93) |
| oct12-wibrawl-v49 | 94 (91–96) | 95 (89–98) |
| oct12-wibrawl-worker-routed | 95 (95–95) | 95 (95–95) |
| oct12-wibrawl-worker | 74 (74–74) | 93 (93–93) |
