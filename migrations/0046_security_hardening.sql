-- Security hardening: revocable sessions and per-account upload budgets.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS upload_usage (
  user_email TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_email, usage_date)
);
