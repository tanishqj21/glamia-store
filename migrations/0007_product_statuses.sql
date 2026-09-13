-- SQLite cannot alter a CHECK constraint, so the products table is rebuilt
-- with the extended status set (review / live / hold / archived).
CREATE TABLE products_new (
  id TEXT PRIMARY KEY,
  seller_email TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT NOT NULL,
  price INTEGER NOT NULL,
  mrp INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  rating REAL NOT NULL DEFAULT 4.5,
  status TEXT NOT NULL DEFAULT 'hold' CHECK (status IN ('review', 'live', 'hold', 'archived')),
  featured INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  sizes_json TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_key TEXT,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  material TEXT NOT NULL DEFAULT '',
  images_json TEXT NOT NULL DEFAULT '[]',
  image_keys_json TEXT,
  variants_json TEXT NOT NULL DEFAULT '[]'
);

INSERT INTO products_new SELECT * FROM products;

DROP TABLE products;

ALTER TABLE products_new RENAME TO products;

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_email);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
