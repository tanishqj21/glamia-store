-- Include return eligibility changes in Merchant Center updates.
DROP TRIGGER merchant_product_update;
CREATE TRIGGER merchant_product_update AFTER UPDATE OF name, category, subcategory, brand, price, mrp, stock, color, material, description, images_json, image_url, sizes_json, variant_group, status, deal_price, deal_starts_at, deal_ends_at, preorder_enabled, preorder_release_at, preorder_limit, preorder_sold, product_code, returnable ON products BEGIN
  INSERT INTO merchant_sync_queue(product_id) VALUES(NEW.id)
  ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, attempts=0, next_attempt_at=unixepoch(), last_error=NULL;
END;
