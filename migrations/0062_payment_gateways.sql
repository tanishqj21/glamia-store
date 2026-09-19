-- Live gateway reconciliation metadata. Secrets stay in Worker bindings; only
-- provider identifiers needed to reconcile callbacks are stored in D1.
ALTER TABLE orders ADD COLUMN payment_gateway TEXT;
ALTER TABLE orders ADD COLUMN gateway_order_id TEXT;
ALTER TABLE orders ADD COLUMN gateway_payment_id TEXT;
ALTER TABLE orders ADD COLUMN gateway_checkout_url TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_gateway_order
  ON orders(payment_gateway, gateway_order_id);
