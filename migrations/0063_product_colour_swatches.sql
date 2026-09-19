ALTER TABLE products ADD COLUMN color_hex TEXT NOT NULL DEFAULT '';

UPDATE products
SET color_hex = CASE LOWER(TRIM(color))
  WHEN 'winter sangria' THEN '#8f2e4f'
  WHEN 'sage green' THEN '#88a889'
  WHEN 'teal green' THEN '#318b7a'
  WHEN 'rose pink' THEN '#c56b86'
  WHEN 'midnight blue' THEN '#283f6b'
  WHEN 'chocolate brown' THEN '#6c452d'
  WHEN 'ivory' THEN '#eee5d2'
  WHEN 'cream' THEN '#f0e6cf'
  WHEN 'white' THEN '#f4f1ea'
  WHEN 'black' THEN '#252525'
  WHEN 'charcoal' THEN '#454545'
  WHEN 'navy' THEN '#253b63'
  WHEN 'sage' THEN '#88a889'
  WHEN 'tan' THEN '#b8895b'
  WHEN 'brass' THEN '#b58a3a'
  ELSE color_hex
END
WHERE TRIM(color) <> '';
