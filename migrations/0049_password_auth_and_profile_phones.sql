-- Password sign-in credentials are kept separate from the Google identity fields.
-- Passwords are stored only as PBKDF2 hashes and salts by the Worker.
CREATE TABLE IF NOT EXISTS user_credentials (
  user_email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 120000,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_updated
  ON user_credentials(updated_at DESC);

-- A normalized phone list lets one account keep multiple numbers while the
-- legacy users.phone column remains the primary-number compatibility field.
CREATE TABLE IF NOT EXISTS profile_phones (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '+91',
  phone_number TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_email, country_code, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_profile_phones_user_primary
  ON profile_phones(user_email, is_primary DESC, updated_at DESC);
