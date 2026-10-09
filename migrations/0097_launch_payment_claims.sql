-- Additive launch guardrails. Never expire a provider-creation claim: a timed-out
-- POST may already have created a payable session. Reconcile it, do not retry it.
ALTER TABLE orders ADD COLUMN payment_creation_state TEXT NOT NULL DEFAULT 'idle'
  CHECK (payment_creation_state IN ('idle', 'creating', 'ready', 'uncertain'));
ALTER TABLE orders ADD COLUMN payment_creation_claim TEXT;
UPDATE orders SET payment_creation_state = 'ready' WHERE gateway_order_id IS NOT NULL;
CREATE UNIQUE INDEX idx_orders_unique_gateway_reference
  ON orders(payment_gateway, gateway_order_id)
  WHERE gateway_order_id IS NOT NULL AND gateway_order_id != '';
ALTER TABLE email_delivery_log ADD COLUMN delivery_claim TEXT;
CREATE TABLE payment_reconciliation_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  internal_order_id TEXT,
  event_type TEXT NOT NULL,
  amount_paise INTEGER,
  currency TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
