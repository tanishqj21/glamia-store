-- Future cancellations only. Never initiate payouts for historical orders on migration.
-- Credits are already restored by credit_checkout_release in this same transaction.
CREATE TABLE cancellation_refunds (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'cancellation' CHECK(kind='cancellation'),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  provider TEXT NOT NULL,
  provider_order_id TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  total_paise INTEGER NOT NULL,
  gateway_paise INTEGER NOT NULL,
  credit_amount INTEGER NOT NULL,
  order_total_paise INTEGER NOT NULL,
  original_credit_amount INTEGER NOT NULL,
  original_gateway_paise INTEGER NOT NULL,
  dispatch_eligible INTEGER NOT NULL CHECK(dispatch_eligible IN (0,1)),
  state TEXT NOT NULL CHECK(state IN ('approved','submitting','pending','reconciliation_required','processed','failed')),
  approved_by TEXT NOT NULL DEFAULT 'system:order-cancellation',
  last_actor TEXT NOT NULL DEFAULT 'system:order-cancellation',
  provider_refund_id TEXT UNIQUE,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  create_attempted INTEGER NOT NULL DEFAULT 0 CHECK(create_attempted IN (0,1)),
  checked_at TEXT,
  next_check_at TEXT DEFAULT CURRENT_TIMESTAMP,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX cancellation_refunds_due ON cancellation_refunds(state,next_check_at);
CREATE TABLE cancellation_refund_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_id TEXT NOT NULL REFERENCES cancellation_refunds(id),
  state TEXT NOT NULL,
  actor TEXT NOT NULL,
  provider_refund_id TEXT,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER cancellation_refund_created AFTER INSERT ON cancellation_refunds BEGIN
  INSERT INTO cancellation_refund_events(refund_id,state,actor,provider_refund_id,evidence_json)
    VALUES(NEW.id,NEW.state,NEW.last_actor,NEW.provider_refund_id,NEW.evidence_json);
END;
CREATE TRIGGER cancellation_credit_settled AFTER INSERT ON cancellation_refunds
WHEN NEW.state='processed' AND NEW.provider='store_credit' BEGIN
  UPDATE orders SET payment_status='refunded',payment_updated_at=CURRENT_TIMESTAMP WHERE id=NEW.order_id AND status='cancelled';
END;
CREATE TRIGGER cancellation_refund_changed AFTER UPDATE ON cancellation_refunds
WHEN NEW.state!=OLD.state OR NEW.evidence_json!=OLD.evidence_json BEGIN
  INSERT INTO cancellation_refund_events(refund_id,state,actor,provider_refund_id,evidence_json)
    VALUES(NEW.id,NEW.state,NEW.last_actor,NEW.provider_refund_id,NEW.evidence_json);
END;
CREATE TRIGGER cancellation_refund_immutable BEFORE UPDATE ON cancellation_refunds
WHEN NEW.id!=OLD.id OR NEW.order_id!=OLD.order_id OR NEW.kind!=OLD.kind
 OR NEW.provider!=OLD.provider OR NEW.provider_order_id!=OLD.provider_order_id OR NEW.provider_payment_id!=OLD.provider_payment_id
 OR NEW.total_paise!=OLD.total_paise OR NEW.gateway_paise!=OLD.gateway_paise OR NEW.credit_amount!=OLD.credit_amount
 OR NEW.order_total_paise!=OLD.order_total_paise OR NEW.original_credit_amount!=OLD.original_credit_amount
 OR NEW.original_gateway_paise!=OLD.original_gateway_paise OR NEW.dispatch_eligible!=OLD.dispatch_eligible OR NEW.approved_by!=OLD.approved_by
 OR (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS NOT OLD.provider_refund_id)
 OR (OLD.state='processed' AND NEW.state!='processed')
BEGIN SELECT RAISE(ABORT,'Cancellation refund evidence is immutable'); END;
CREATE TRIGGER cancellation_refund_no_delete BEFORE DELETE ON cancellation_refunds
BEGIN SELECT RAISE(ABORT,'Cancellation refunds must be retained'); END;
CREATE TRIGGER cancellation_refund_event_no_update BEFORE UPDATE ON cancellation_refund_events
BEGIN SELECT RAISE(ABORT,'Cancellation refund audit is immutable'); END;
CREATE TRIGGER cancellation_refund_event_no_delete BEFORE DELETE ON cancellation_refund_events
BEGIN SELECT RAISE(ABORT,'Cancellation refund audit must be retained'); END;

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

-- A payment cannot fund two financial cases across return/cancellation workflows.
CREATE TRIGGER cancellation_blocks_return_refund BEFORE INSERT ON gateway_refunds
WHEN EXISTS(SELECT 1 FROM cancellation_refunds c WHERE c.order_id=NEW.order_id
 OR (c.provider=NEW.provider AND c.provider_payment_id=NEW.provider_payment_id AND c.provider_payment_id!=''))
BEGIN SELECT RAISE(ABORT,'A cancellation refund already owns this payment'); END;
