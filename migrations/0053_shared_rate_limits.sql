-- Shared per-IP rate-limit buckets for Worker requests.
-- The Worker keeps an in-memory fallback only for local startup before this
-- migration is applied; deployed traffic should use this D1 table.
CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_updated
  ON request_rate_limits(updated_at);
