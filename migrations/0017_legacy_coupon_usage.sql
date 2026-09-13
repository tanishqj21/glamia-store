-- The original demo coupons predate per-account limits. Keep them backward
-- compatible; newly created coupons default to one use per account. Rebuild
-- the table here because 0016 originally declared the new field NOT NULL.
CREATE TABLE coupons_legacy_fix (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('percent', 'flat')),
  value INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scope TEXT NOT NULL DEFAULT 'all',
  scope_value TEXT NOT NULL DEFAULT '',
  target_rules TEXT NOT NULL DEFAULT '[]',
  starts_at TEXT,
  ends_at TEXT,
  usage_limit INTEGER,
  per_user_limit INTEGER DEFAULT 1
);

INSERT INTO coupons_legacy_fix (
  code, type, value, active, created_at, scope, scope_value, target_rules,
  starts_at, ends_at, usage_limit, per_user_limit
)
SELECT
  code, type, value, active, created_at, scope, scope_value, target_rules,
  starts_at, ends_at, usage_limit,
  CASE WHEN code IN ('GLAMIA10', 'FLAT200') THEN NULL ELSE per_user_limit END
FROM coupons;

DROP TABLE coupons;
ALTER TABLE coupons_legacy_fix RENAME TO coupons;
