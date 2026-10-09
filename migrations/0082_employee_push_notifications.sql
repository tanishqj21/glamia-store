-- Push destinations for employee devices. Tokens are scoped to the employee
-- account so a shared device cannot continue receiving another employee's feed
-- after sign-out.
CREATE TABLE IF NOT EXISTS employee_push_tokens (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'unknown',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_push_tokens_employee
  ON employee_push_tokens(employee_id, active, updated_at DESC);

ALTER TABLE admin_notifications ADD COLUMN employee_push_sent_at TEXT;

-- Do not send old notifications to a device the first time it registers.
UPDATE admin_notifications
SET employee_push_sent_at = COALESCE(employee_push_sent_at, created_at)
WHERE employee_push_sent_at IS NULL;
