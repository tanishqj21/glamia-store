-- Remove the Spotlight hero treatment and initialize editable Cinematic Reel settings.
DELETE FROM hero_slides WHERE variant = 'spotlight';

INSERT OR IGNORE INTO storefront_settings (setting_key, value_json)
VALUES (
  'cinematic_reel',
  '{"visible":true,"eyebrow":"The current mood","title":"Pieces that move","emphasis":"with you.","description":"","product_ids":[]}'
);
