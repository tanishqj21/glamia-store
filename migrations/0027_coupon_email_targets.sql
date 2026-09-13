-- Restrict a coupon to a manually selected set of customer email addresses.
-- Keep this separate from coupons so the allowlist can grow without changing
-- the coupon record and so it remains enforced server-side in D1.
CREATE TABLE IF NOT EXISTS coupon_email_targets (
  coupon_code TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (coupon_code, email)
);

CREATE INDEX IF NOT EXISTS idx_coupon_email_targets_email
  ON coupon_email_targets(email);
