-- Keep notification read/dismiss state per employee. The shared admin feed remains
-- available to the Google admin, while employee actions stay isolated to their account.
CREATE TABLE IF NOT EXISTS employee_notification_states (
  employee_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  read_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_notification_states_employee
  ON employee_notification_states(employee_id, dismissed_at, read_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_notification_states_notification
  ON employee_notification_states(notification_id);
