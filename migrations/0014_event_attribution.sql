-- Attribute lightweight analytics events to signed-in users and prevent
-- repeated requests from inflating a metric for the same product.
ALTER TABLE cart_adds ADD COLUMN user_email TEXT;
ALTER TABLE wishlist_adds ADD COLUMN user_email TEXT;

CREATE INDEX IF NOT EXISTS idx_cart_adds_user_product ON cart_adds(user_email, product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wishlist_adds_user_product ON wishlist_adds(user_email, product_id, created_at);
