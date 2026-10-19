# Wibrawl: one interface, two colour palettes

Gaming and Sports now share the same layout, spacing, collection names,
typography, controls, selected states and aligned product rows. Gaming retains
dark surfaces and Sports retains light surfaces. Both use the Wibrawl lime accent.
Shared collection names are Just Spawned, Current Meta and Loot.

## Branding

The supplied `WiBrawl_Master_A_Vector_Transparent.svg` matches the preserved
source at `design/wibrawl-master/master-a.svg` (SHA-256
`efd0a6d494d6a31fbdc33d2db065683a61abf4ad1d8576643abc43f2eb176d99`).
The public logo preserves its vector paths and colours, with transparent margins
trimmed. `logo-light.svg` changes only white lettering to charcoal for legibility.
The light-surface logo has no background rectangle. Both versions occupy exactly
the same space in the header and footer. The matching WB SVG favicon is retained.

## Layout

- Removed Sports-only logo padding and box, which previously increased the
  header height by 10 pixels on mobile and 14 pixels on desktop.
- Put the theme controls between Account and Cart.
- Unified gutters and maximum content widths; increased desktop navigation text.
- Stacked section eyebrows above their titles instead of allowing them inline.
- Removed staggered product-row offsets and aligned loading placeholders.
- Matched desktop hero heights across all three slide layouts and adjusted
  mobile headline placement and scale.
- Corrected selected credit filters and positive/stock text contrast on light
  surfaces after introducing the shared lime accent.

## Verification

- 36 storefront layout/accessibility audits at 360, 390, 768 and 1440 pixels.
- Exact theme parity assertions for header, logo, controls, hero, hubs, collection
  headings, product grid and footer dimensions, typography and spacing.
- 37 populated commerce/accessibility audits, including cart, checkout, credits,
  orders, returns, customer care and PDF actions; API writes use local fixtures.
- Home, product and cart server-rendering hydration checks.
- Hero rotation, swipe, reel playback, reduced motion and saved-theme migration.
- Deal-clock/application-render performance regression check.
- Scoped ESLint and production build/asset checks.
- Glamia isolation checks for catalogue, cart and checkout.

Build warnings about existing large lazy chunks remain; this change adds no
animation or rendering dependencies.

## Release

Deployed Cloudflare version `dce6e7e1-2a47-4def-a706-21cd6c4a1fce`.
Read-only production checks passed at 390 and 1440 pixels: both transparent SVG
versions and the favicon match the local files; theme switching preserves header
and logo dimensions and collection names; all three collection routes, a live
product, cart drawer and all six commerce routes render correctly. Glamia's
original views also pass. No runtime, hydration or CSP errors were observed.
