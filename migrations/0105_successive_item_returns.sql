-- Preserve all financial records and audit references while allowing successive item-level cases.
-- Apply transactionally after a backup; no refunds are issued by this schema migration.
PRAGMA defer_foreign_keys=ON;
DROP TRIGGER gateway_refund_lock_return;
DROP TRIGGER queue_paid_cancellation;
DROP TRIGGER gateway_refund_created;
DROP TRIGGER gateway_refund_state_changed;
CREATE TABLE gateway_refunds_new (
  id TEXT PRIMARY KEY,
  return_request_id TEXT NOT NULL UNIQUE REFERENCES return_requests(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL CHECK(provider IN ('razorpay','phonepe')),
  provider_order_id TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  total_paise INTEGER NOT NULL CHECK(total_paise >= 100),
  gateway_paise INTEGER NOT NULL CHECK(gateway_paise >= 100),
  credit_amount INTEGER NOT NULL DEFAULT 0 CHECK(credit_amount >= 0),
  order_total_paise INTEGER NOT NULL CHECK(order_total_paise >= total_paise),
  state TEXT NOT NULL DEFAULT 'approved' CHECK(state IN ('approved','submitting','pending','reconciliation_required','processed','failed')),
  approved_by TEXT NOT NULL,
  last_actor TEXT NOT NULL,
  provider_refund_id TEXT UNIQUE,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  create_attempted INTEGER NOT NULL DEFAULT 0 CHECK(create_attempted IN (0,1)),
  checked_at TEXT,
  next_check_at TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  original_credit_amount INTEGER,
  original_gateway_paise INTEGER,
  CHECK(total_paise = gateway_paise + credit_amount * 100)
);

INSERT INTO gateway_refunds_new SELECT * FROM gateway_refunds;
CREATE TABLE gateway_refund_events_new (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 refund_id TEXT NOT NULL REFERENCES gateway_refunds_new(id),
 state TEXT NOT NULL,actor TEXT NOT NULL,provider_refund_id TEXT,
 evidence_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO gateway_refund_events_new SELECT * FROM gateway_refund_events;
DROP TABLE gateway_refund_events;
DROP TABLE gateway_refunds;
ALTER TABLE gateway_refunds_new RENAME TO gateway_refunds;
ALTER TABLE gateway_refund_events_new RENAME TO gateway_refund_events;
CREATE TRIGGER gateway_refund_event_no_update BEFORE UPDATE ON gateway_refund_events
BEGIN SELECT RAISE(ABORT,'Refund audit events are immutable'); END;
CREATE TRIGGER gateway_refund_event_no_delete BEFORE DELETE ON gateway_refund_events
BEGIN SELECT RAISE(ABORT,'Refund audit events must be retained'); END;
CREATE INDEX idx_gateway_refunds_due ON gateway_refunds(state,next_check_at);
CREATE INDEX gateway_refunds_order ON gateway_refunds(order_id);
CREATE TRIGGER gateway_refund_created AFTER INSERT ON gateway_refunds BEGIN
  INSERT INTO gateway_refund_events(refund_id,state,actor,provider_refund_id,evidence_json)
  VALUES(NEW.id,NEW.state,NEW.last_actor,NEW.provider_refund_id,NEW.evidence_json);
END;
CREATE TRIGGER gateway_refund_state_changed AFTER UPDATE ON gateway_refunds
WHEN NEW.state != OLD.state OR NEW.evidence_json != OLD.evidence_json BEGIN
  INSERT INTO gateway_refund_events(refund_id,state,actor,provider_refund_id,evidence_json)
  VALUES(NEW.id,NEW.state,NEW.last_actor,NEW.provider_refund_id,NEW.evidence_json);
END;
CREATE TRIGGER gateway_refund_snapshot_immutable BEFORE UPDATE ON gateway_refunds
WHEN NEW.id != OLD.id OR NEW.return_request_id != OLD.return_request_id OR NEW.order_id != OLD.order_id
 OR NEW.provider != OLD.provider OR NEW.provider_order_id != OLD.provider_order_id OR NEW.provider_payment_id != OLD.provider_payment_id
 OR NEW.total_paise != OLD.total_paise OR NEW.gateway_paise != OLD.gateway_paise OR NEW.credit_amount != OLD.credit_amount
 OR NEW.order_total_paise != OLD.order_total_paise OR NEW.approved_by != OLD.approved_by
 OR (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS NOT OLD.provider_refund_id)
 OR (OLD.state = 'processed' AND NEW.state != 'processed')
BEGIN SELECT RAISE(ABORT,'Approved refund evidence cannot be replaced'); END;
CREATE TRIGGER gateway_refund_no_delete BEFORE DELETE ON gateway_refunds
BEGIN SELECT RAISE(ABORT,'Refund records must be retained'); END;

CREATE TRIGGER gateway_refund_lock_return BEFORE UPDATE ON return_requests
WHEN EXISTS(SELECT 1 FROM gateway_refunds g WHERE g.return_request_id = OLD.id AND
 (NEW.refund_destination != 'original' OR NEW.type != OLD.type OR NEW.order_id != OLD.order_id
  OR ROUND(NEW.refund_amount * 100) != g.total_paise
  OR (NEW.status != OLD.status AND NOT (g.state = 'processed' AND NEW.status IN ('refunded','completed')))))
BEGIN SELECT RAISE(ABORT,'The approved gateway refund locks this return'); END;

CREATE TRIGGER gateway_original_split_immutable BEFORE UPDATE ON gateway_refunds
WHEN NEW.original_credit_amount IS NOT OLD.original_credit_amount OR NEW.original_gateway_paise IS NOT OLD.original_gateway_paise
BEGIN SELECT RAISE(ABORT,'Original payment split is immutable'); END;
CREATE TRIGGER cancellation_blocks_return_refund BEFORE INSERT ON gateway_refunds
WHEN EXISTS(SELECT 1 FROM cancellation_refunds c WHERE c.order_id=NEW.order_id
 OR (c.provider=NEW.provider AND c.provider_payment_id=NEW.provider_payment_id AND c.provider_payment_id!=''))
BEGIN SELECT RAISE(ABORT,'A cancellation refund already owns this payment'); END;
CREATE TRIGGER gateway_refund_cumulative_budget BEFORE INSERT ON gateway_refunds
WHEN NOT EXISTS(SELECT 1 FROM gateway_refunds WHERE return_request_id=NEW.return_request_id) AND (
 NEW.total_paise+COALESCE((SELECT SUM(total_paise) FROM gateway_refunds WHERE order_id=NEW.order_id),0)
 +COALESCE((SELECT SUM(ROUND(refund_amount*100)) FROM return_requests WHERE order_id=NEW.order_id AND type='refund' AND refund_destination='store_credit' AND status NOT IN ('rejected','cancelled')),0)>NEW.order_total_paise
 OR NEW.gateway_paise+COALESCE((SELECT SUM(gateway_paise) FROM gateway_refunds WHERE order_id=NEW.order_id),0)>NEW.original_gateway_paise
 OR NEW.credit_amount+COALESCE((SELECT SUM(credit_amount) FROM gateway_refunds WHERE order_id=NEW.order_id),0)>NEW.original_credit_amount
 OR EXISTS(SELECT 1 FROM gateway_refunds WHERE provider=NEW.provider AND provider_payment_id=NEW.provider_payment_id AND order_id!=NEW.order_id))
BEGIN SELECT RAISE(ABORT,'Refund exceeds remaining payment budget'); END;
CREATE TRIGGER queue_paid_cancellation AFTER UPDATE OF status ON orders
WHEN NEW.status='cancelled' AND OLD.status!='cancelled' AND OLD.payment_status='paid'
 AND COALESCE(OLD.order_type,'standard')!='replacement' BEGIN
  INSERT INTO cancellation_refunds(id,order_id,provider,provider_order_id,provider_payment_id,total_paise,gateway_paise,
    credit_amount,order_total_paise,original_credit_amount,original_gateway_paise,dispatch_eligible,state,last_error,evidence_json)
  SELECT 'gmcr_'||lower(hex(randomblob(16))),NEW.id,COALESCE(NULLIF(NEW.payment_gateway,''),NEW.payment_method,''),
    COALESCE(NEW.gateway_order_id,''),COALESCE(NEW.gateway_payment_id,''),ROUND(NEW.total*100),ROUND(COALESCE(NEW.payable_total,NEW.total)*100),
    COALESCE(NEW.credits_used,0),ROUND(NEW.total*100),COALESCE(NEW.credits_used,0),ROUND(COALESCE(NEW.payable_total,NEW.total)*100),
    CASE WHEN OLD.status IN ('pending','confirmed') AND COALESCE(OLD.tracking_number,'')='' THEN 1 ELSE 0 END,
    CASE
      WHEN OLD.status NOT IN ('pending','confirmed') OR COALESCE(OLD.tracking_number,'')!='' THEN 'reconciliation_required'
      WHEN EXISTS(SELECT 1 FROM gateway_refunds g WHERE g.order_id=NEW.id OR g.provider_payment_id=NEW.gateway_payment_id) THEN 'reconciliation_required'
      WHEN COALESCE(NEW.gateway_payment_id,'')!='' AND EXISTS(SELECT 1 FROM cancellation_refunds c
        WHERE c.provider=NEW.payment_gateway AND c.provider_payment_id=NEW.gateway_payment_id) THEN 'reconciliation_required'
      WHEN NEW.payment_method='store_credit' AND COALESCE(NEW.payable_total,NEW.total)=0 AND NEW.total=NEW.credits_used AND NEW.total>0 THEN 'processed'
      WHEN NEW.payment_method IN ('razorpay','phonepe') AND NEW.payment_gateway=NEW.payment_method
        AND COALESCE(NEW.gateway_order_id,'')!='' AND COALESCE(NEW.gateway_payment_id,'')!=''
        AND ROUND(NEW.total*100)=ROUND(COALESCE(NEW.payable_total,NEW.total)*100)+COALESCE(NEW.credits_used,0)*100
        AND ROUND(COALESCE(NEW.payable_total,NEW.total)*100)>=100 THEN 'approved'
      ELSE 'reconciliation_required' END,
    '',json_object('stage','paid_order_cancelled','credits_restored_by','credit_checkout_release');
END;


CREATE TRIGGER return_remaining_quantity BEFORE INSERT ON return_requests
WHEN NEW.selected_items_json!='[]' AND (EXISTS(
 SELECT 1 FROM return_requests WHERE order_id=NEW.order_id
 AND status NOT IN ('rejected','cancelled') AND selected_items_json='[]') OR EXISTS(
 SELECT json_extract(value,'$.line_id') FROM json_each(NEW.selected_items_json)
 GROUP BY json_extract(value,'$.line_id') HAVING COUNT(*)>1) OR EXISTS(
 SELECT 1 FROM json_each(NEW.selected_items_json) chosen
 WHERE json_extract(chosen.value,'$.quantity') IS NULL
 OR json_extract(chosen.value,'$.quantity')<1
 OR json_extract(chosen.value,'$.quantity')!=CAST(json_extract(chosen.value,'$.quantity') AS INTEGER)
 OR CAST(json_extract(chosen.value,'$.quantity') AS INTEGER)+COALESCE((
   SELECT SUM(CAST(json_extract(previous.value,'$.quantity') AS INTEGER))
   FROM return_requests r,json_each(r.selected_items_json) previous
   WHERE r.order_id=NEW.order_id AND r.status NOT IN ('rejected','cancelled')
     AND json_extract(previous.value,'$.line_id')=json_extract(chosen.value,'$.line_id')),0)
 > COALESCE((SELECT quantity FROM order_items WHERE order_id=NEW.order_id AND id=json_extract(chosen.value,'$.line_id')),0)))
BEGIN SELECT RAISE(ABORT,'Purchased quantity already requested for return'); END;
