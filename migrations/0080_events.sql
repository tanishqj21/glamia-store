CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale', 'launch', 'seasonal', 'announcement', 'campaign')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  theme TEXT NOT NULL DEFAULT 'evergreen' CHECK (theme IN ('evergreen', 'terracotta', 'cobalt', 'plum', 'sand', 'graphite')),
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_live_window
  ON events(status, show_on_home, starts_at, ends_at, updated_at DESC);
