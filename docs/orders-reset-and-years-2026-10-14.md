# Order reset and year-wise admin history — 14 October 2026

The user explicitly requested all Glamia and WiBrawl order data be wiped, including the refund marked reconciliation required, and declined a backup. No manual backup was created or retained.

Production cleanup removed 4 orders, 3 invoices, 3 return cases, their 3 refund claims and linked order records, notifications, payment reconciliation history, support records and audit details. The linked private return-label PDF was deleted from R2. All 17 checked order-record groups were empty afterwards. Foreign-key checks passed, and all six temporarily removed deletion guards were restored in the same cleanup import.

Products, customer accounts, stock and credit balances were preserved. Order-number counters remain to prevent reuse of identifiers. No payment-provider actions or refunds were executed. The cleanup was a one-time operation; no public wipe endpoint or repeatable migration was added.

The shared admin Orders and Completed orders screens now offer an Order year selector and year headings, with newest years first. Year means the order creation year in Asia/Kolkata. Filtering happens on the server before pagination, so older years remain accessible even when their records are outside the first page. Search and pagination retain the selected year; changing the year resets completed-history pagination. Empty history still offers the current year. Both domains use the same functionality.

Validation: 22 unit tests passed, including India New Year boundaries, full-history filtering, pagination, completed history and authorisation. Browser checks at 390 px and 1440 px passed on both domains for both admin views, including older-year options, loading more records, pagination resets, headings, empty state and overflow. Targeted ESLint, the production build and 55-chunk asset check passed. Independent live checks confirmed the new entry on both admin routes and unauthenticated order API requests returning 401.

Implementation commit: 4b4a4b4 on codex/wibrawl-storefront.
Cloudflare Worker version: ea63e24b-68b1-40f7-ad43-839d6c100f82.
Entry: assets/index-pNBKqAjm.js.

Validation logs and aggregate verification: tmp/order-reset-2026-10-14/.
Fixture screenshots: test-results/order-years-2026-10-14/.
