-- Server-side store credits and referral foundations.
CREATE TABLE IF NOT EXISTS store_credit_accounts (
  user_email TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_credit_ledger (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  order_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_store_credit_ledger_user ON store_credit_ledger(user_email, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  user_email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  referred_email TEXT PRIMARY KEY,
  referrer_email TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_email, created_at DESC);

ALTER TABLE return_requests ADD COLUMN refund_destination TEXT NOT NULL DEFAULT 'original';
