# Wibrawl Add to Bag cascade

Recreates the supplied recording's layered product-image cascade for Wibrawl:
seven staggered image layers gather, then shrink toward the header bag icon.
A subtle theme-aware wash and bag pulse complete the transition in about 1.2s.
The image follows the selected colourway and visible product image. It works
from catalogue cards, the PDP, quick view and size-free cinematic reel additions.

Cart state updates immediately through the existing controller. The effect
never gates stock/size checks, quantities, saved-cart syncing or checkout.
Reduced-motion users get the normal count/status update and a brief static bag
outline. Rapid additions replace the previous decorative flight; resize,
navigation, visibility and motion-preference changes clean up active effects.

The non-modal popover layer remains pointer-transparent and hidden from assistive
technology. Quick view retains focus and adds an explicit View bag action after
adding on Wibrawl. Glamia retains its original quick-view redirect and receives
no cart animation. No backend, payment, database or native-app changes are made.

## Verification

- Targeted browser checks passed at 390/1440px in Gaming and Sports modes.
- Checked real cart contents/counts, repeated additions, missing-size rejection,
  route/resize cleanup, reduced motion and native quick-view focus.
- Confirmed Glamia's normal add-to-bag behavior without Wibrawl effects.
- Homepage, PDP and cart server hydration passed without mismatches.
- All 15 persona/cart/payment/invoice model tests passed.
- Changed presentation modules passed ESLint; Vite and asset/CSP checks passed.
- Screenshots and local test reports are in `tmp/wibrawl-cart-motion-review`.

Production checks use isolated guest sessions, block API writes, and never place
orders or take payments.

## Deployment

Cloudflare version `954bc21d-2880-43bc-8710-b09d88003e86` is live.
The deployed animation, cart drawer and reduced-motion path passed at 390px and
1440px in both modes. The live catalogue currently contains only zero-stock
sample tees. Checks first verified their disabled size controls, then used the
same public product data with browser-only stock substitutions to exercise the
deployed animation. Production inventory was never changed. The general live
storefront checks also passed for products, collections, both modes, all six
commerce routes and Glamia's original cart/checkout/credits pages, with no
reported hydration, CSP or runtime errors.
