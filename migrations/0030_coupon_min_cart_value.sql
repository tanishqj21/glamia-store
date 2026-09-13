-- Optional order subtotal required before a coupon can be applied.
ALTER TABLE coupons ADD COLUMN min_cart_value INTEGER;
