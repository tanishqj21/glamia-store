CREATE TABLE about_page (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  eyebrow TEXT NOT NULL,
  headline TEXT NOT NULL,
  introduction TEXT NOT NULL,
  timeline_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO about_page (id, eyebrow, headline, introduction, timeline_json)
VALUES (
  1,
  'ABOUT GLAMIA',
  'A story in the making.',
  'Glamia brings considered pieces together for the way people actually live. This is our point of view—and the chapters we are building around it.',
  '[{"id":"idea","period":"01 / THE IDEA","title":"Fashion, considered.","body":"We believe good design should feel personal and useful, not tied to a single occasion or category."},{"id":"edit","period":"02 / THE EDIT","title":"Pieces worth living in.","body":"Our collection brings together apparel and accessories with an eye for everyday wear, thoughtful detail, and individual style."},{"id":"next","period":"03 / WHAT COMES NEXT","title":"The story continues with you.","body":"Glamia grows through the pieces you choose and the moments you make your own."}]'
);
