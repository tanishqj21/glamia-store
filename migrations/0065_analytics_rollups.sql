-- Compact first-party page-view rollups for the admin dashboard. Buckets are
-- stored as the storefront's IST calendar day/hour so reports keep matching
-- the existing Asia/Kolkata presentation without repeatedly scanning raw rows.
CREATE TABLE IF NOT EXISTS page_view_rollups (
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  path TEXT NOT NULL,
  referrer_host TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  country TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, path, referrer_host, device, country)
);

CREATE INDEX IF NOT EXISTS idx_page_view_rollups_day
  ON page_view_rollups(day);
CREATE INDEX IF NOT EXISTS idx_page_view_rollups_day_path
  ON page_view_rollups(day, path);
CREATE INDEX IF NOT EXISTS idx_page_view_rollups_day_referrer
  ON page_view_rollups(day, referrer_host);
CREATE INDEX IF NOT EXISTS idx_page_view_rollups_day_device
  ON page_view_rollups(day, device);
CREATE INDEX IF NOT EXISTS idx_page_view_rollups_day_country
  ON page_view_rollups(day, country);

CREATE TABLE IF NOT EXISTS analytics_rollup_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_created_at TEXT NOT NULL DEFAULT '',
  last_id TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO analytics_rollup_state (id, last_created_at, last_id)
VALUES (1, '', '');

-- Backfill existing events once when this migration is applied. Future events
-- are appended incrementally by the Worker scheduled handler.
INSERT OR IGNORE INTO page_view_rollups
  (day, hour, path, referrer_host, device, country, views)
SELECT
  date(created_at, '+5 hours', '+30 minutes') AS day,
  CAST(strftime('%H', datetime(created_at, '+5 hours', '+30 minutes')) AS INTEGER) AS hour,
  path,
  referrer_host,
  device,
  country,
  COUNT(*) AS views
FROM page_views
GROUP BY day, hour, path, referrer_host, device, country;

UPDATE analytics_rollup_state
SET last_created_at = COALESCE((SELECT created_at FROM page_views ORDER BY created_at DESC, id DESC LIMIT 1), ''),
    last_id = COALESCE((SELECT id FROM page_views ORDER BY created_at DESC, id DESC LIMIT 1), '')
WHERE id = 1;
