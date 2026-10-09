-- Keep unpaid gateway orders visible for one day for support and reconciliation,
-- then allow the Worker retention job to remove them and their related records.
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN cancelled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_payment_cancelled_retention
  ON orders(status, payment_status, cancellation_reason, cancelled_at, updated_at);

-- Backfill failed gateway cancellations created before the retention fields
-- existed. Customer/admin queries and the scheduled purge can then handle them
-- consistently with new payment-expiry cancellations.
UPDATE orders
SET cancellation_reason = 'payment_incomplete',
    cancelled_at = COALESCE(cancelled_at, updated_at, created_at)
WHERE status = 'cancelled'
  AND payment_status = 'failed'
  AND payment_gateway IN ('razorpay', 'phonepe')
  AND (cancellation_reason IS NULL OR cancellation_reason = '');
