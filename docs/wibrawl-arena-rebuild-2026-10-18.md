# Wibrawl persona and layout rebuild

This rebuild follows the complete teardown directive after the Phase 2 commerce
release (`0563fc7`, Cloudflare `d71d7269-d3b1-415f-a217-016cf48d9164`). Phase 2
was completed, deployed, verified live and pushed before this work began.

## New public component hierarchy

- `WibrawlHeader`: three-zone command bar, tooltip-backed core hubs, recursive
  category drawer, instant search and `/` shortcut, account drawer, credits,
  wishlist, cart drawer and a mobile floating five-destination dock.
- `wibrawlPersona`: the single route/vocabulary map. Gaming uses JUST SPAWNED,
  CURRENT META and LOOT. Sports uses NEW SIGNING, TABLE LEADERS and LOCKER ROOM
  DEALS. Each core navigation and heading has explanatory hover/focus text.
- `useWibrawlTheme`: `wibrawl_mode = gaming | sports`, Gaming default. Earlier
  saved preferences migrate; the compatibility key remains for existing clients.
  There is no third system-mode option.
- `WibrawlHome` and `WibrawlHero`: independent Poster, Collage and Split layouts,
  with linked product selectors, a position rail, automatic/manual rotation,
  mobile swipe and reduced-motion handling. Admin previews remain manual and
  continue to use their established editor component.
- `WibrawlCollectionSection` and `WibrawlCatalogPage`: snap-scroll arrival rail,
  ranked bento, live scheduled-deal vault, actual server filters, pagination,
  loading/error/empty states and admin-defined category navigation.
- `WibrawlProductCard`: category/SKU spec strip, persona/deal badge, alternate
  image crossfade, optional product film, colourway pills, live-stock size matrix
  and direct cart/wishlist actions. The matrix remains visible on touch devices.
- `WibrawlProductDetail`: editorial media deck, mobile snap/swipe gallery,
  loadout/locker selection deck, real uploaded size chart, specifications,
  shipping/returns, existing reviews/Q&A and sticky mobile buying control.
- `WibrawlShoppableReels`: vertical films with real play/pause/mute controls,
  visibility-aware playback, reduced-motion support and product buying chips.
- `WibrawlFooter`: standalone Wibrawl logo, persona routes, policies and saved
  Wibrawl socials. It has no literal home text beside the logo.

## Guardrails

The user's subsequent Master A logo request supersedes the temporary-logo
restriction. The exact supplied source is preserved in
`design/wibrawl-master/master-a.svg`. The brand generator trims transparent
margins for the public logo while retaining every path and colour, and derives
an SVG-only WB favicon from the same monogram. Header/footer and loading-screen
dimensions preserve the stacked artwork's aspect ratio. Sports mode gives its
wrapper a `#0F0F12` badge. The public palette uses the
directive's independent mode tokens, including volt for Gaming and pitch-black
with orange active indicators for Sports.

The supplied source SHA-256 is
`efd0a6d494d6a31fbdc33d2db065683a61abf4ad1d8576643abc43f2eb176d99`.

No Worker endpoints, D1 migrations, gateway logic or admin component files
change. The Worker HTML branding strings use the new favicon version and logo
dimensions. Glamia's Wibrawl link gets only sizing/background adjustments so the
new transparent logo's white lettering remains readable. Shared route selection and first-screen
shells select the new Wibrawl components; the Glamia branches retain their markup.
The existing Phase 2 controllers, stock checks, coupons, credits, refunds, bills
and support flow remain in use.

## Validation approach

The arena browser suite checks all three hero structures and both personas at
360/390/768/1440px, taxonomy/tooltips, logo badge, mobile dock, search, categories,
filters, actual stock-aware add-to-bag, fit chart, reviews/Q&A, Glamia isolation
and clean homepage/product/cart hydration. It runs WCAG and overflow audits and
captures screenshots in `tmp/wibrawl-arena-review`.

The motion suite records a real local WebM fixture and verifies visible autoplay,
play/pause, mute and reduced motion, plus automatic hero rotation, default Gaming
on light-configured devices and a mobile hero swipe. All API writes in these
browser suites are intercepted fixtures.

The Phase 2 populated commerce suite is retained, with only the new persona
button label adjusted. Payment and invoice model tests still exercise the real
shared controllers with intercepted providers. Production smoke checks block
all API writes.

## Local verification results

- Vite production build and asset/CSP verification passed (69 current chunks).
  The updated brand preparation regenerates the new SVG logo and favicon.
- 36 layout/WCAG/overflow audits passed across the four viewport widths.
- 37 populated commerce/WCAG audits passed with the rebuilt header and modes.
- Homepage, product and cart server hydration passed without mismatches.
- Real WebM playback, explicit play/pause, mute, reduced motion, automatic hero
  rotation and mobile swipe passed. Legacy saved themes migrate to the new key,
  and Gaming remains the default on light-configured devices.
- Two persona contract tests and 13 payment/invoice/cart model tests passed.
- Ranked search results, suggestions and category filters use the existing
  server responses. Category/search grids have their own filtered layout.
- New presentation components passed ESLint without errors. Admin components,
  payment logic and data endpoints retain their previous implementation.

Earlier Wibrawl layout test entry points now run the arena suite, preserving
their commands while replacing obsolete DOM expectations. The Phase 2 commerce
suite continues to test the completed preceding release's functionality.

## Deployment

Cloudflare version `43e5bcba-5ac5-4ec8-acd2-0e66309b4773` is deployed.
Read-only production checks passed at 390px and 1440px for both personas,
all three collection routes, a published product, the cart drawer and all six
Phase 2 commerce routes, plus Glamia's cart, checkout and credits pages.
The live SVG logo and favicon match the local release, and the rendered favicon
link uses the new `master-a` cache version. No hydration, CSP or runtime errors
were reported. Checks blocked production API writes and created no orders.

Final local checks passed: 36 layout/WCAG audits with zero violations, clean
homepage/product/cart hydration, reel and hero motion interactions and 15
persona/cart/payment/invoice model tests. The preceding populated commerce
suite passed 37 audits. ESLint reported no errors; seven existing React-hook
warnings remain in Phase 2 commerce components.
