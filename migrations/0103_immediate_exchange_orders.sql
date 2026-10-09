-- New exchanges enter normal fulfilment immediately. Do not release historical
-- receipt-held replacements or mutate their inventory/payments during rollout.
ALTER TABLE orders ADD COLUMN replacement_fulfilment_mode TEXT NOT NULL DEFAULT 'after_receipt'
  CHECK(replacement_fulfilment_mode IN ('after_receipt','immediate'));

DROP TRIGGER IF EXISTS replacement_fulfilment_mode_immutable;
CREATE TRIGGER replacement_fulfilment_mode_immutable BEFORE UPDATE OF replacement_fulfilment_mode ON orders
WHEN NEW.replacement_fulfilment_mode IS NOT OLD.replacement_fulfilment_mode
BEGIN SELECT RAISE(ABORT,'Replacement fulfilment policy cannot be replaced'); END;

DROP TRIGGER IF EXISTS valid_replacement_case;
CREATE TRIGGER valid_replacement_case BEFORE INSERT ON orders
WHEN NEW.order_type='replacement' AND (NEW.status!='pending' OR NEW.packing_status!='unpacked'
 OR NEW.subtotal!=0 OR NEW.discount!=0 OR NEW.total!=0 OR COALESCE(NEW.payable_total,0)!=0 OR COALESCE(NEW.credits_used,0)!=0 OR NEW.payment_status!='not_required'
 OR NOT EXISTS(SELECT 1 FROM return_requests r WHERE r.id=NEW.replacement_request_id AND r.type='exchange'
 AND r.status='approved' AND r.replacement_order_id IS NULL AND r.order_id=NEW.replacement_for_order_id AND LOWER(r.customer_email)=LOWER(NEW.customer_email)))
BEGIN SELECT RAISE(ABORT,'Replacement requires an unclaimed eligible exchange case'); END;

DROP TRIGGER IF EXISTS hold_replacement_fulfilment;
CREATE TRIGGER hold_replacement_fulfilment BEFORE UPDATE ON orders
WHEN NEW.order_type='replacement' AND NEW.status!='cancelled' AND (NEW.status IN ('confirmed','shipped','delivered') OR NEW.packing_status='packed')
 AND NOT EXISTS(SELECT 1 FROM return_requests r WHERE r.id=NEW.replacement_request_id
 AND ((NEW.replacement_fulfilment_mode='immediate' AND r.status IN ('approved','received','completed'))
 OR (r.status IN ('received','completed') AND r.returned_at IS NOT NULL)))
 AND (NEW.status IS NOT OLD.status OR NEW.packing_status IS NOT OLD.packing_status)
BEGIN SELECT RAISE(ABORT,'Replacement dispatch requires an active exchange or historical return receipt'); END;

-- Both legs must finish. A delivered replacement must not hide an outstanding
-- return pickup; support either order of warehouse receipt and delivery.
DROP TRIGGER IF EXISTS complete_delivered_exchange;
CREATE TRIGGER complete_delivered_exchange AFTER UPDATE OF status ON orders
WHEN NEW.order_type='replacement' AND NEW.status='delivered' AND OLD.status!='delivered' BEGIN
 UPDATE return_requests SET status='completed',updated_at=CURRENT_TIMESTAMP
 WHERE id=NEW.replacement_request_id AND status='received' AND returned_at IS NOT NULL;
END;
DROP TRIGGER IF EXISTS complete_received_exchange;
CREATE TRIGGER complete_received_exchange AFTER UPDATE OF returned_at,status ON return_requests
WHEN NEW.type='exchange' AND NEW.status='received' AND NEW.returned_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.replacement_order_id AND o.status='delivered') BEGIN
 UPDATE return_requests SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id AND status='received';
END;
