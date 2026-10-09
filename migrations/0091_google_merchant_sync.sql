-- Queue has no product foreign key: deleted listings still need removal at Google.
CREATE TABLE merchant_sync_queue (
  product_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1,
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_error TEXT, queued_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX merchant_sync_due ON merchant_sync_queue(next_attempt_at);
CREATE TABLE merchant_sync_offers (
  source_name TEXT NOT NULL, offer_id TEXT NOT NULL, product_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL, submitted_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT 0, status_json TEXT,
  PRIMARY KEY(source_name, offer_id)
);
CREATE INDEX merchant_offers_product ON merchant_sync_offers(product_id);
CREATE TABLE merchant_sync_control (
  id INTEGER PRIMARY KEY CHECK(id=1), lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER, last_error TEXT
);
INSERT INTO merchant_sync_control(id) VALUES(1);
CREATE TABLE merchant_product_details (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TRIGGER merchant_product_insert AFTER INSERT ON products BEGIN
  INSERT INTO merchant_sync_queue(product_id) VALUES(NEW.id)
  ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, attempts=0, next_attempt_at=unixepoch(), last_error=NULL;
END;
CREATE TRIGGER merchant_product_update AFTER UPDATE OF name, category, subcategory, brand, price, mrp, stock, color, material, description, images_json, image_url, sizes_json, variant_group, status, deal_price, deal_starts_at, deal_ends_at, preorder_enabled, preorder_release_at, preorder_limit, preorder_sold, product_code ON products BEGIN
  INSERT INTO merchant_sync_queue(product_id) VALUES(NEW.id)
  ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, attempts=0, next_attempt_at=unixepoch(), last_error=NULL;
END;
CREATE TRIGGER merchant_product_delete AFTER DELETE ON products BEGIN
  INSERT INTO merchant_sync_queue(product_id) VALUES(OLD.id)
  ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, attempts=0, next_attempt_at=unixepoch(), last_error=NULL;
END;
CREATE TRIGGER merchant_size_insert AFTER INSERT ON product_sizes BEGIN
  INSERT INTO merchant_sync_queue(product_id) VALUES(NEW.product_id)
  ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, attempts=0, next_attempt_at=unixepoch(), last_error=NULL;
END;
CREATE TRIGGER merchant_size_update AFTER UPDATE ON product_sizes BEGIN
  INSERT INTO merchant_sync_queue(product_id) VALUES(NEW.product_id)
  ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, attempts=0, next_attempt_at=unixepoch(), last_error=NULL;
END;
CREATE TRIGGER merchant_size_delete AFTER DELETE ON product_sizes BEGIN
  INSERT INTO merchant_sync_queue(product_id) VALUES(OLD.product_id)
  ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, attempts=0, next_attempt_at=unixepoch(), last_error=NULL;
END;
INSERT INTO merchant_sync_queue(product_id) SELECT id FROM products WHERE status='live';
