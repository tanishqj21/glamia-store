-- No historical delivery date is inferred from an editable updated_at timestamp.
ALTER TABLE orders ADD COLUMN delivered_at TEXT;
UPDATE orders SET delivered_at=delivery_email_sent_at WHERE status='delivered' AND delivery_email_sent_at IS NOT NULL;
CREATE TRIGGER record_delivery_insert AFTER INSERT ON orders WHEN NEW.status='delivered' BEGIN
  UPDATE orders SET delivered_at=COALESCE(NEW.delivered_at,CURRENT_TIMESTAMP) WHERE id=NEW.id;
END;
CREATE TRIGGER record_delivery_update AFTER UPDATE OF status ON orders WHEN NEW.status='delivered' AND OLD.delivered_at IS NULL BEGIN
  UPDATE orders SET delivered_at=CURRENT_TIMESTAMP WHERE id=NEW.id;
END;
CREATE TRIGGER preserve_delivery_date BEFORE UPDATE OF delivered_at ON orders
WHEN OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS NOT OLD.delivered_at
BEGIN SELECT RAISE(ABORT,'Delivery date cannot be replaced'); END;
ALTER TABLE order_items ADD COLUMN returnable_snapshot INTEGER;
CREATE TRIGGER snapshot_return_policy AFTER INSERT ON order_items BEGIN
  UPDATE order_items SET returnable_snapshot=COALESCE(NEW.returnable_snapshot,(SELECT returnable FROM products WHERE id=NEW.product_id),1) WHERE id=NEW.id;
END;
CREATE TRIGGER preserve_return_policy BEFORE UPDATE OF returnable_snapshot ON order_items
WHEN OLD.returnable_snapshot IS NOT NULL AND NEW.returnable_snapshot IS NOT OLD.returnable_snapshot
BEGIN SELECT RAISE(ABORT,'Purchased return policy cannot be replaced'); END;
ALTER TABLE return_requests ADD COLUMN selected_items_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE return_requests ADD COLUMN requested_amount_paise INTEGER;
ALTER TABLE return_requests ADD COLUMN logistics_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE return_requests ADD COLUMN label_key TEXT;
CREATE TRIGGER valid_replacement_case BEFORE INSERT ON orders
WHEN NEW.order_type='replacement' AND (NEW.status!='pending' OR NEW.packing_status!='unpacked'
 OR NOT EXISTS(SELECT 1 FROM return_requests r WHERE r.id=NEW.replacement_request_id AND r.type='exchange'
 AND r.status='requested' AND r.order_id=NEW.replacement_for_order_id AND LOWER(r.customer_email)=LOWER(NEW.customer_email)))
BEGIN SELECT RAISE(ABORT,'Replacement requires an active purchased exchange case'); END;
CREATE TRIGGER hold_replacement_fulfilment BEFORE UPDATE ON orders
WHEN NEW.order_type='replacement' AND NEW.status!='cancelled' AND (NEW.status IN ('confirmed','shipped','delivered') OR NEW.packing_status='packed')
 AND NOT EXISTS(SELECT 1 FROM return_requests r WHERE r.id=NEW.replacement_request_id AND r.status IN ('received','completed') AND r.returned_at IS NOT NULL)
 AND (NEW.status IS NOT OLD.status OR NEW.packing_status IS NOT OLD.packing_status)
BEGIN SELECT RAISE(ABORT,'Replacement dispatch requires return receipt'); END;
CREATE TRIGGER prevent_closing_dispatched_exchange BEFORE UPDATE OF status ON return_requests
WHEN NEW.type='exchange' AND NEW.status IN ('rejected','cancelled')
 AND EXISTS(SELECT 1 FROM orders o WHERE o.id=OLD.replacement_order_id AND o.status IN ('shipped','delivered'))
BEGIN SELECT RAISE(ABORT,'A dispatched replacement requires manual investigation'); END;
CREATE TRIGGER close_exchange_reservation AFTER UPDATE OF status ON return_requests
WHEN NEW.type='exchange' AND NEW.status IN ('rejected','cancelled') AND OLD.status NOT IN ('rejected','cancelled') BEGIN
  UPDATE orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=NEW.replacement_order_id AND status NOT IN ('shipped','delivered');
  INSERT OR IGNORE INTO order_stock_releases(order_id) SELECT id FROM orders WHERE id=NEW.replacement_order_id AND status='cancelled';
END;
CREATE TRIGGER complete_delivered_exchange AFTER UPDATE OF status ON orders
WHEN NEW.order_type='replacement' AND NEW.status='delivered' AND OLD.status!='delivered' BEGIN
  UPDATE return_requests SET status='completed',updated_at=CURRENT_TIMESTAMP
    WHERE id=NEW.replacement_request_id AND status='received' AND returned_at IS NOT NULL;
END;
CREATE TRIGGER return_selection_immutable BEFORE UPDATE ON return_requests
WHEN NEW.selected_items_json IS NOT OLD.selected_items_json OR NEW.requested_amount_paise IS NOT OLD.requested_amount_paise
BEGIN SELECT RAISE(ABORT,'Purchased return selection cannot be replaced'); END;
CREATE TRIGGER selected_refund_ceiling BEFORE UPDATE OF refund_amount ON return_requests
WHEN NEW.requested_amount_paise IS NOT NULL AND ROUND(NEW.refund_amount*100)>NEW.requested_amount_paise
BEGIN SELECT RAISE(ABORT,'Refund exceeds selected purchased items'); END;
-- Selected-item refunds stay within the existing one-financial-case-per-order rule.
DROP TRIGGER automatic_refund_intent_valid;
CREATE TRIGGER automatic_refund_intent_valid BEFORE UPDATE ON return_requests
WHEN OLD.automatic_refund_requested_at IS NULL AND NEW.automatic_refund_requested_at IS NOT NULL AND
 (NEW.status!='received' OR NEW.type!='refund' OR NEW.refund_destination!='original'
 OR NEW.automatic_refund_requested_by IS NULL OR NEW.automatic_refund_amount_paise IS NULL
 OR NEW.automatic_refund_amount_paise<100 OR NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id
 AND o.status='delivered' AND o.payment_status='paid' AND o.payment_method IN ('razorpay','phonepe')
 AND o.payment_method=o.payment_gateway AND NEW.automatic_refund_amount_paise<=ROUND(o.total*100)
 AND NEW.automatic_refund_amount_paise=COALESCE(NEW.requested_amount_paise,ROUND(NEW.refund_amount*100))))
BEGIN SELECT RAISE(ABORT,'Automatic refund requires a bounded paid delivered return'); END;
ALTER TABLE gateway_refunds ADD COLUMN original_credit_amount INTEGER;
ALTER TABLE gateway_refunds ADD COLUMN original_gateway_paise INTEGER;
UPDATE gateway_refunds SET original_credit_amount=credit_amount,original_gateway_paise=order_total_paise-credit_amount*100;
CREATE TRIGGER gateway_original_split_immutable BEFORE UPDATE ON gateway_refunds
WHEN NEW.original_credit_amount IS NOT OLD.original_credit_amount OR NEW.original_gateway_paise IS NOT OLD.original_gateway_paise
BEGIN SELECT RAISE(ABORT,'Original payment split is immutable'); END;
CREATE TABLE return_document_tokens(
  token_hash TEXT PRIMARY KEY,return_id TEXT NOT NULL REFERENCES return_requests(id),
  kind TEXT NOT NULL CHECK(kind IN ('label','receipt')),user_email TEXT NOT NULL,
  session_version INTEGER NOT NULL,expires_at TEXT NOT NULL
);
CREATE INDEX return_document_tokens_expiry ON return_document_tokens(expires_at);
