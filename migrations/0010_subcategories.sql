-- Subcategories: manual, grouped under an admin-managed category.
CREATE TABLE subcategories (
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category, name)
);

ALTER TABLE products ADD COLUMN subcategory TEXT NOT NULL DEFAULT '';
