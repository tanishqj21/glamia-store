# Scheduling seconds — 15 October 2026

All 11 scheduling fields use native date/time controls with one-second precision. The redundant standalone Seconds dropdown was removed at the user's request after the native picker showed its seconds column.

Shared fields cover events, coupons, deals, announcements, pre-order release, return pickup and next customer update on both domains. IST interpretation, required/minimum validation and unchanged fractional-second preservation remain intact. The date/time input now uses the full available width.

Validation: production build, complete asset graph, 8 timezone/seconds tests and browser checks on both sites in India, US and Japan timezones. Browser checks cover native :37/:59 edits, saved instants, reopening, zero seconds, unchanged fractional precision, no duplicate Seconds control, mobile width and light/dark themes. No production order or payment writes.
