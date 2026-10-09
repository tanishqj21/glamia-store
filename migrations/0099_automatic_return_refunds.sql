-- Explicit new receipt intent only: never backfill old received returns.
ALTER TABLE return_requests ADD COLUMN automatic_refund_requested_at TEXT;
ALTER TABLE return_requests ADD COLUMN automatic_refund_requested_by TEXT;
ALTER TABLE return_requests ADD COLUMN automatic_refund_amount_paise INTEGER;
ALTER TABLE return_requests ADD COLUMN automatic_refund_error TEXT NOT NULL DEFAULT '';
ALTER TABLE return_requests ADD COLUMN automatic_refund_next_attempt_at TEXT;
CREATE INDEX idx_automatic_return_refunds ON return_requests(status,automatic_refund_next_attempt_at)
  WHERE automatic_refund_requested_at IS NOT NULL;
CREATE TRIGGER automatic_refund_intent_immutable BEFORE UPDATE ON return_requests
WHEN OLD.automatic_refund_requested_at IS NOT NULL AND
 (NEW.automatic_refund_requested_at IS NOT OLD.automatic_refund_requested_at
  OR NEW.automatic_refund_requested_by IS NOT OLD.automatic_refund_requested_by
  OR NEW.automatic_refund_amount_paise IS NOT OLD.automatic_refund_amount_paise
  OR NEW.refund_destination IS NOT OLD.refund_destination OR NEW.type IS NOT OLD.type OR NEW.order_id IS NOT OLD.order_id)
BEGIN SELECT RAISE(ABORT,'Automatic refund authorization cannot be replaced'); END;
CREATE TRIGGER automatic_refund_intent_valid BEFORE UPDATE ON return_requests
WHEN OLD.automatic_refund_requested_at IS NULL AND NEW.automatic_refund_requested_at IS NOT NULL AND
 (NEW.status != 'received' OR NEW.type != 'refund' OR NEW.refund_destination != 'original'
  OR NEW.automatic_refund_requested_by IS NULL OR NEW.automatic_refund_amount_paise IS NULL
  OR NEW.automatic_refund_amount_paise < 100 OR NOT EXISTS
    (SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.status='delivered' AND o.payment_status='paid'
     AND o.payment_method IN ('razorpay','phonepe') AND o.payment_method=o.payment_gateway
     AND ROUND(o.total*100)=NEW.automatic_refund_amount_paise))
BEGIN SELECT RAISE(ABORT,'Automatic refund requires a paid delivered original-payment return'); END;
