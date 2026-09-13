-- Match the admin Orders query's complete sort order so D1 can stream the
-- newest records without a temporary sort structure.
DROP INDEX IF EXISTS idx_orders_created_id;
CREATE INDEX IF NOT EXISTS idx_orders_created_id
  ON orders(created_at DESC, id DESC);
