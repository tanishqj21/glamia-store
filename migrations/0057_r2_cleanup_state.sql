-- Persistent lease/checkpoint for the weekly R2 orphan scan. The Worker
-- already runs a five-minute cron for email delivery; this table lets media
-- cleanup run once every seven days without changing that existing schedule.
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  task_key TEXT PRIMARY KEY,
  last_run_at INTEGER,
  lease_until INTEGER
);
