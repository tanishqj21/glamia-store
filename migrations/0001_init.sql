CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  role TEXT NOT NULL DEFAULT 'seller',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  seller_email TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT NOT NULL,
  price INTEGER NOT NULL,
  mrp INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  rating REAL NOT NULL DEFAULT 4.5,
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'live')),
  featured INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  sizes_json TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_key TEXT,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_email);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);

INSERT INTO products (
  id, seller_email, name, category, brand, price, mrp, stock, rating, status, featured, color, sizes_json, image_url, description
) VALUES
('seed-ivory-linen-shirt', 'seed@glamia.local', 'Ivory Linen Resort Shirt', 'Men', 'North Loom', 1899, 2799, 38, 4.6, 'live', 1, 'Ivory', '["S","M","L","XL"]', 'https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=900&q=82', 'A breathable linen shirt with a relaxed resort collar, mother-of-pearl buttons, and a soft garment-washed finish.'),
('seed-midnight-satin-dress', 'seed@glamia.local', 'Midnight Satin Wrap Dress', 'Women', 'Glamia', 4299, 6999, 22, 4.9, 'live', 1, 'Midnight', '["XS","S","M","L"]', 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=900&q=82', 'Fluid satin drape, adjustable waist tie, and evening-ready polish for dinners, receptions, and gallery nights.'),
('seed-wool-blend-blazer', 'seed@glamia.local', 'Sculpted Wool Blend Blazer', 'Women', 'Atelier Loom', 5499, 8299, 16, 4.8, 'live', 1, 'Charcoal', '["S","M","L"]', 'https://images.unsplash.com/photo-1548454782-15b189d129ab?auto=format&fit=crop&w=900&q=82', 'Structured shoulders, refined lapels, and a lightly nipped waist designed for office-to-evening dressing.'),
('seed-silk-kurta-set', 'seed@glamia.local', 'Handwoven Silk Kurta Set', 'Ethnic', 'Raaga House', 3899, 5799, 29, 4.7, 'live', 0, 'Sage', '["S","M","L","XL"]', 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=82', 'A soft silk-blend kurta with tonal embroidery, straight trousers, and an elegant dupatta for festive occasions.'),
('seed-leather-loafers', 'seed@glamia.local', 'Tan Leather Penny Loafers', 'Footwear', 'Cobbler & Co.', 2999, 4499, 11, 4.5, 'live', 0, 'Tan', '["6","7","8","9","10"]', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=82', 'Polished leather loafers with cushioned insoles and a refined almond toe for weekday dressing.'),
('seed-brass-cuff', 'seed@glamia.local', 'Brass Minimal Cuff', 'Accessories', 'Line & Light', 999, 1599, 54, 4.4, 'review', 0, 'Brass', '["One size"]', 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=82', 'A minimal polished cuff with a clean open profile, designed to layer with watches or fine bracelets.');
