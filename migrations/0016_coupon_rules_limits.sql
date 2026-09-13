-- Coupons can combine category, subcategory, and product targets and can be
-- constrained by a validity window and redemption limits.
ALTER TABLE coupons ADD COLUMN target_rules TEXT NOT NULL DEFAULT '[]';
ALTER TABLE coupons ADD COLUMN starts_at TEXT;
ALTER TABLE coupons ADD COLUMN ends_at TEXT;
ALTER TABLE coupons ADD COLUMN usage_limit INTEGER;
ALTER TABLE coupons ADD COLUMN per_user_limit INTEGER NOT NULL DEFAULT 1;
