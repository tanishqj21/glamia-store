-- Rebuild the constrained Events table so existing campaigns retain their data and new sale palettes can be saved.
CREATE TABLE events_next (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale', 'launch', 'seasonal', 'announcement', 'campaign')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  theme TEXT NOT NULL DEFAULT 'evergreen' CHECK (theme IN ('evergreen', 'terracotta', 'cobalt', 'plum', 'sand', 'graphite', 'festival', 'aurora', 'sunset', 'prism')),
  headline TEXT NOT NULL,
  message TEXT NOT NULL,
  coupon_code TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT 'Shop the edit',
  cta_href TEXT NOT NULL DEFAULT '/offers',
  starts_at TEXT,
  ends_at TEXT,
  show_on_home INTEGER NOT NULL DEFAULT 1,
  show_after_sign_in INTEGER NOT NULL DEFAULT 1,
  show_once INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notify_customers INTEGER NOT NULL DEFAULT 0 CHECK (notify_customers IN (0, 1))
);

INSERT INTO events_next (
  id, slug, name, type, status, theme, headline, message, coupon_code,
  cta_label, cta_href, starts_at, ends_at, show_on_home, show_after_sign_in,
  show_once, created_at, updated_at, notify_customers
)
SELECT id, slug, name, type, status, theme, headline, message, coupon_code,
  cta_label, cta_href, starts_at, ends_at, show_on_home, show_after_sign_in,
  show_once, created_at, updated_at, notify_customers
FROM events;

DROP TABLE events;
ALTER TABLE events_next RENAME TO events;

CREATE INDEX idx_events_live_window ON events(status, show_on_home, starts_at, ends_at, updated_at DESC);
CREATE INDEX idx_events_alerts_due ON events(status, notify_customers, starts_at, ends_at);
