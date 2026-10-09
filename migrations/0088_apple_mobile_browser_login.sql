-- Hold a short-lived Apple browser authorization until its originating app redeems it.
CREATE TABLE IF NOT EXISTS apple_mobile_login_flows (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  verifier_hash TEXT NOT NULL,
  ticket_hash TEXT UNIQUE,
  result_json TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_apple_mobile_login_flows_expiry
  ON apple_mobile_login_flows(expires_at);
