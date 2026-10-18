# Wibrawl Phase 2 commerce

Wibrawl-specific presentations now wrap the established cart, checkout, loyalty,
orders, returns and support controllers. Glamia uses their original default
markup. Worker endpoints, database schemas, invoice generation, payment callbacks
and webhook behaviour are unchanged.

## Shopper experience

- A header bag drawer and full bag page use live product details, deal prices,
  low-stock messages, quantity controls, size swaps, saved pieces, real coupon
  validation and an account-scoped credit preference carried to checkout.
- Checkout separates contact/shipping, delivery/GST and payment. It retains
  provider verification, pending-payment recovery, stock checks, idempotency and
  credit-only checkout. Saved product HSN/GST classifications produce estimates
  using the issued invoice's proportional discount rules.
- The club wallet displays the actual balance, configured referral rewards,
  copy/share invite, referral aggregates, pending approved credit refunds awaiting
  receipt, and a filterable timestamped ledger.
- Orders have status filters, fulfilment steps, detail dialogs, real tracking
  identifiers, original-order navigation, existing cancellation/refund handling,
  and issued PDF bill links.
- Returns include a guided eligibility-aware request dialog, admin item
  exceptions, live size stock, supported refund destinations, reason/notes,
  logistics, printable labels and evidence-based refund progress.
- Support includes open/closed filters, linked-order categories, purchased-item
  context, threaded replies, linked-order summaries and the existing visible-tab
  polling/manual refresh.

## Existing backend limits respected

- Delivery is currently free without a minimum. The perk meter shows that real
  unlocked benefit; it does not promise express delivery or invent a threshold.
- The existing checkout exposes configured Razorpay and PhonePe methods. COD is
  not added because that controller does not support it.
- The public response does not expose the seller's tax state. The estimate shows
  product HSN/GST; final state tax split remains on the issued invoice.
- Exchanges currently support another size of the same product/colourway.
  Neither colourway exchange nor photo/condition uploads have a persistence API.
  The request saves supported reason and written condition notes.
- Credit refunds require authorised approval and warehouse receipt. Original
  refunds require provider confirmation. Case closure alone never proves payment.
- Courier name/direct tracking URL only display when supplied. The current
  normal-order response exposes tracking number, so the existing tracking page
  remains the fallback. No courier is guessed from its tracking number.
- The referral endpoint exposes counts, not individual referred-friend records.
  Share sends the real code with signup instructions, without a fake autoapply URL.

## Validation

- 34 existing checkout regressions.
- 47 refund tracking, support-return exception and coupon lifecycle tests.
- 10 commerce model tests, including comparison with the actual Worker invoice
  calculation for inclusive/exclusive GST and proportional discounts.
- Three Wibrawl presentation/payment tests: verified Razorpay callback, pending
  PhonePe recovery with an empty bag, and persisted credit-only checkout.
- Local populated browser fixtures cover bag size merging, restricted coupons,
  credits across navigation/refresh, actual submit payloads, PDF download actions,
  eligible exceptions, exchange submission, label availability, unconfirmed
  refunds, support replies and linked-order ticket creation.
- Automated WCAG checks, overflow checks and screenshots cover both themes.
- Phase 1 checks cover 360/390/768/1440px layouts, hero/reels, PDP, themes, native
  dialogs, Glamia isolation and homepage/product/cart server hydration.

Payment provider tests intercept requests. No real money or production customer
orders are created by verification. Production checks block API writes.

## Deployment

Deployed Cloudflare version `d71d7269-d3b1-415f-a217-016cf48d9164`.
All 94 automated tests passed, together with 37 WCAG/overflow browser snapshots
across 360/390/768/1440px. Read-only production checks passed at 390/1440px for
the Wibrawl drawer and all six commerce routes, plus Glamia's original cart,
checkout and credits views. The existing public support HTML shell remains
cacheable; private account routes retain `no-store` and customer data loads via
authenticated APIs.
