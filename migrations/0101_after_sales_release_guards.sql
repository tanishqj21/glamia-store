-- Production has an earlier revision of 0100. Reconcile it through a new,
-- idempotent migration rather than reapplying ALTER TABLE statements.
-- Only schema/guards change; no historical order status, inventory or payout is changed.
CREATE TRIGGER IF NOT EXISTS valid_replacement_case BEFORE INSERT ON orders
WHEN NEW.order_type='replacement' AND (NEW.status!='pending' OR NEW.packing_status!='unpacked'
 OR NOT EXISTS(SELECT 1 FROM return_requests r WHERE r.id=NEW.replacement_request_id AND r.type='exchange'
 AND r.status='requested' AND r.order_id=NEW.replacement_for_order_id AND LOWER(r.customer_email)=LOWER(NEW.customer_email)))
BEGIN SELECT RAISE(ABORT,'Replacement requires an active purchased exchange case'); END;

DROP TRIGGER IF EXISTS hold_replacement_fulfilment;
CREATE TRIGGER hold_replacement_fulfilment BEFORE UPDATE ON orders
WHEN NEW.order_type='replacement' AND NEW.status!='cancelled' AND (NEW.status IN ('confirmed','shipped','delivered') OR NEW.packing_status='packed')
 AND NOT EXISTS(SELECT 1 FROM return_requests r WHERE r.id=NEW.replacement_request_id AND r.status IN ('received','completed') AND r.returned_at IS NOT NULL)
 AND (NEW.status IS NOT OLD.status OR NEW.packing_status IS NOT OLD.packing_status)
BEGIN SELECT RAISE(ABORT,'Replacement dispatch requires return receipt'); END;

CREATE TRIGGER IF NOT EXISTS complete_delivered_exchange AFTER UPDATE OF status ON orders
WHEN NEW.order_type='replacement' AND NEW.status='delivered' AND OLD.status!='delivered' BEGIN
  UPDATE return_requests SET status='completed',updated_at=CURRENT_TIMESTAMP
    WHERE id=NEW.replacement_request_id AND status='received' AND returned_at IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS selected_refund_ceiling BEFORE UPDATE OF refund_amount ON return_requests
WHEN NEW.requested_amount_paise IS NOT NULL AND ROUND(NEW.refund_amount*100)>NEW.requested_amount_paise
BEGIN SELECT RAISE(ABORT,'Refund exceeds selected purchased items'); END;

CREATE TABLE IF NOT EXISTS return_document_tokens(
  token_hash TEXT PRIMARY KEY,return_id TEXT NOT NULL REFERENCES return_requests(id),
  kind TEXT NOT NULL CHECK(kind IN ('label','receipt')),user_email TEXT NOT NULL,
  session_version INTEGER NOT NULL,expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS return_document_tokens_expiry ON return_document_tokens(expires_at);
