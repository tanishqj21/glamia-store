# Explicit scheduling seconds — 15 October 2026

Added an always-visible 00–59 Seconds selector beside the native date/time input. Native browser calendar popups may omit seconds even when the field accepts second precision.

The shared control covers all 11 scheduling fields: event starts/ends, coupon starts/ends, deal starts/ends, announcement starts/ends, pre-order release, return pickup and next customer update. Existing IST interpretation, required/minimum validation and unchanged fractional-second preservation remain intact. Narrow fields stack the controls to keep the complete date and time readable.

Validation: production build and 54-chunk graph passed; changed JavaScript had no lint errors; all 8 timezone/seconds unit cases passed. Browser checks on Glamia and WiBrawl in India, US and Japan timezones verify selecting :37/:59, saving the correct UTC instant, reopening the chosen seconds, :00 selection, unchanged fractional precision, mobile width, and light/dark themes. No browser page errors. Verification used local fixtures and an in-memory database, with no production order/payment writes.

Evidence: `tmp/explicit-seconds-picker` and `test-results/explicit-seconds-picker` in the main workspace.
