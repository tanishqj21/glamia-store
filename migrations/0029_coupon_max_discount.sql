-- Optional ceiling for the monetary discount produced by a coupon.
ALTER TABLE coupons ADD COLUMN max_discount INTEGER;
