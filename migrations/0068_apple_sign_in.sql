-- Native Apple sign-in identity mapping. Apple may omit the email after the
-- first authorization, so the stable Apple subject must be retained.
ALTER TABLE users ADD COLUMN apple_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users(apple_sub) WHERE apple_sub IS NOT NULL;
