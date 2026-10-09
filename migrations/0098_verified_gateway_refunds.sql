-- Additive only. Financial claims never expire or create replacement refund IDs.
-- One approved financial case per order prevents concurrent/overlapping payouts.
CREATE TABLE gateway_refunds (
  id TEXT PRIMARY KEY,
  return_request_id TEXT NOT NULL UNIQUE REFERENCES return_requests(id),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
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
  CHECK(total_paise = gateway_paise + credit_amount * 100)
);
CREATE INDEX idx_gateway_refunds_due ON gateway_refunds(state,next_check_at);
CREATE TABLE gateway_refund_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_id TEXT NOT NULL REFERENCES gateway_refunds(id),
  state TEXT NOT NULL,
  actor TEXT NOT NULL,
  provider_refund_id TEXT,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
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
CREATE TRIGGER gateway_refund_event_no_update BEFORE UPDATE ON gateway_refund_events
BEGIN SELECT RAISE(ABORT,'Refund audit events are immutable'); END;
CREATE TRIGGER gateway_refund_event_no_delete BEFORE DELETE ON gateway_refund_events
BEGIN SELECT RAISE(ABORT,'Refund audit events must be retained'); END;
CREATE TRIGGER gateway_refund_lock_return BEFORE UPDATE ON return_requests
WHEN EXISTS(SELECT 1 FROM gateway_refunds g WHERE g.return_request_id = OLD.id AND
 (NEW.refund_destination != 'original' OR NEW.type != OLD.type OR NEW.order_id != OLD.order_id
  OR ROUND(NEW.refund_amount * 100) != g.total_paise
  OR (NEW.status != OLD.status AND NOT (g.state = 'processed' AND NEW.status IN ('refunded','completed')))))
BEGIN SELECT RAISE(ABORT,'The approved gateway refund locks this return'); END;
