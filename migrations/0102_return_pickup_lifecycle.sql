-- Explicit courier custody is distinct from warehouse receipt. No historical
-- pickup or financial intent is backfilled by this migration.
ALTER TABLE return_requests ADD COLUMN pickup_confirmed_at TEXT;
ALTER TABLE return_requests ADD COLUMN pickup_confirmed_by TEXT;
CREATE TRIGGER return_pickup_valid BEFORE UPDATE ON return_requests
WHEN OLD.pickup_confirmed_at IS NULL AND NEW.pickup_confirmed_at IS NOT NULL
 AND (NEW.status!='approved' OR NEW.pickup_confirmed_by IS NULL
 OR TRIM(COALESCE(json_extract(NEW.logistics_json,'$.carrier'),''))=''
 OR TRIM(COALESCE(json_extract(NEW.logistics_json,'$.tracking_number'),''))='')
BEGIN SELECT RAISE(ABORT,'Courier pickup requires approval and assigned tracking'); END;
CREATE TRIGGER return_pickup_immutable BEFORE UPDATE ON return_requests
WHEN OLD.pickup_confirmed_at IS NOT NULL AND
 (NEW.pickup_confirmed_at IS NOT OLD.pickup_confirmed_at
 OR NEW.pickup_confirmed_by IS NOT OLD.pickup_confirmed_by)
BEGIN SELECT RAISE(ABORT,'Courier custody evidence cannot be replaced'); END;

-- New exchanges allocate replacement stock on approval, in one transaction.
-- Existing requested-case replacements remain valid and must not be recreated.
DROP TRIGGER valid_replacement_case;
CREATE TRIGGER valid_replacement_case BEFORE INSERT ON orders
WHEN NEW.order_type='replacement' AND (NEW.status!='pending' OR NEW.packing_status!='unpacked'
 OR NEW.subtotal!=0 OR NEW.discount!=0 OR NEW.total!=0 OR COALESCE(NEW.payable_total,0)!=0 OR COALESCE(NEW.credits_used,0)!=0 OR NEW.payment_status!='not_required'
 OR NOT EXISTS(SELECT 1 FROM return_requests r WHERE r.id=NEW.replacement_request_id AND r.type='exchange'
 AND r.status='approved' AND r.order_id=NEW.replacement_for_order_id AND LOWER(r.customer_email)=LOWER(NEW.customer_email)))
BEGIN SELECT RAISE(ABORT,'Replacement requires an approved purchased exchange case'); END;
CREATE TRIGGER replacement_zero_totals BEFORE UPDATE ON orders
WHEN NEW.order_type='replacement' AND (NEW.subtotal!=0 OR NEW.discount!=0 OR NEW.total!=0
 OR COALESCE(NEW.payable_total,0)!=0 OR COALESCE(NEW.credits_used,0)!=0)
BEGIN SELECT RAISE(ABORT,'Replacement orders must remain zero value'); END;

DROP TRIGGER credit_return_release;
CREATE TRIGGER credit_return_release AFTER UPDATE OF status, credit_approval_status ON return_requests
WHEN NEW.type='refund' AND NEW.refund_destination='store_credit' AND NEW.credit_approval_status='approved'
 AND ((NEW.returned_at IS NOT NULL AND NEW.status IN ('received','refunded'))
 OR (NEW.pickup_confirmed_at IS NOT NULL AND NEW.status='approved')) AND NEW.refund_amount>0
BEGIN
 INSERT OR IGNORE INTO store_credit_ledger(id,user_email,amount,kind,description,order_id,return_request_id,actor_email,idempotency_key)
 VALUES('refund:'||NEW.id,NEW.customer_email,NEW.refund_amount,'refund','Approved return refund',NEW.order_id,NEW.id,NEW.credit_approved_by,'refund:'||NEW.id);
 UPDATE return_requests SET status='refunded',credit_approval_status='credited',refund_processed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id;
END;
