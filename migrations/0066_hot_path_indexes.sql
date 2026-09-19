-- Targeted indexes for the incremental analytics cursor and public/admin
-- catalogue lookups that remain after pagination and rollups are enabled.
CREATE INDEX IF NOT EXISTS idx_page_views_created_id
  ON page_views(created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_products_variant_group_created
  ON products(variant_group, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_products_status_created
  ON products(status, created_at DESC, id DESC);
