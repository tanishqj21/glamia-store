-- Recovery and analytics indexes keep the new admin insights on indexed paths.
CREATE INDEX IF NOT EXISTS idx_cart_adds_user_created
  ON cart_adds(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wishlist_adds_user_created
  ON wishlist_adds(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created
  ON orders(payment_method, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created_status
  ON orders(customer_email, created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_status_next_attempt
  ON email_delivery_log(status, next_attempt_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_visibility_created
  ON admin_notifications(dismissed_at, read_at, created_at DESC);

-- Questions are moderated before they are shown publicly.
CREATE TABLE IF NOT EXISTS product_questions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'hidden')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_questions_product_status_created
  ON product_questions(product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_questions_email_created
  ON product_questions(customer_email, created_at DESC);
