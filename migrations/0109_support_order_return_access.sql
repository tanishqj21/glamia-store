-- Manual, order-line-specific exceptions. Purchased policy remains immutable.
ALTER TABLE support_tickets ADD COLUMN referenced_line_ids_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE order_return_access (
  order_item_id TEXT PRIMARY KEY REFERENCES order_items(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 500),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX order_return_access_order ON order_return_access(order_id,enabled);
CREATE TABLE order_return_access_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX order_return_access_events_order ON order_return_access_events(order_id,id);
CREATE TRIGGER order_return_access_identity_insert BEFORE INSERT ON order_return_access BEGIN
  SELECT RAISE(ABORT,'Return access must belong to the support order')
   WHERE NOT EXISTS(SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id
    JOIN support_tickets t ON t.id=NEW.ticket_id
    WHERE i.id=NEW.order_item_id AND o.id=NEW.order_id AND t.order_id IN (o.id,o.order_number)
      AND LOWER(TRIM(t.customer_email))=LOWER(TRIM(o.customer_email)));
  SELECT RAISE(ABORT,'A return request already uses this item')
   WHERE EXISTS(SELECT 1 FROM return_requests r WHERE r.order_id=NEW.order_id AND r.status NOT IN ('rejected','cancelled','completed','refunded')
    AND (json_array_length(r.selected_items_json)=0 OR EXISTS(SELECT 1 FROM json_each(r.selected_items_json) s WHERE json_extract(s.value,'$.line_id')=NEW.order_item_id)));
END;
CREATE TRIGGER order_return_access_identity_update BEFORE UPDATE ON order_return_access BEGIN
  SELECT RAISE(ABORT,'Return access identity cannot be replaced')
   WHERE NEW.order_item_id!=OLD.order_item_id OR NEW.order_id!=OLD.order_id;
  SELECT RAISE(ABORT,'Return access must belong to the support order')
   WHERE NOT EXISTS(SELECT 1 FROM orders o JOIN support_tickets t ON t.id=NEW.ticket_id
    WHERE o.id=NEW.order_id AND t.order_id IN (o.id,o.order_number)
      AND LOWER(TRIM(t.customer_email))=LOWER(TRIM(o.customer_email)));
  SELECT RAISE(ABORT,'A return request already uses this item')
   WHERE NEW.enabled!=OLD.enabled AND EXISTS(SELECT 1 FROM return_requests r WHERE r.order_id=NEW.order_id AND r.status NOT IN ('rejected','cancelled','completed','refunded')
    AND (json_array_length(r.selected_items_json)=0 OR EXISTS(SELECT 1 FROM json_each(r.selected_items_json) s WHERE json_extract(s.value,'$.line_id')=NEW.order_item_id)));
END;
CREATE TRIGGER order_return_access_created AFTER INSERT ON order_return_access BEGIN
  INSERT INTO order_return_access_events(order_item_id,order_id,ticket_id,enabled,actor,reason)
   VALUES(NEW.order_item_id,NEW.order_id,NEW.ticket_id,NEW.enabled,NEW.actor,NEW.reason);
END;
CREATE TRIGGER order_return_access_changed AFTER UPDATE ON order_return_access WHEN NEW.enabled!=OLD.enabled BEGIN
  INSERT INTO order_return_access_events(order_item_id,order_id,ticket_id,enabled,actor,reason)
   VALUES(NEW.order_item_id,NEW.order_id,NEW.ticket_id,NEW.enabled,NEW.actor,NEW.reason);
END;
CREATE TRIGGER order_return_access_no_delete BEFORE DELETE ON order_return_access
BEGIN SELECT RAISE(ABORT,'Disable return access instead of deleting its history'); END;
CREATE TRIGGER order_return_access_events_no_update BEFORE UPDATE ON order_return_access_events
BEGIN SELECT RAISE(ABORT,'Return access events are immutable'); END;
CREATE TRIGGER order_return_access_events_no_delete BEFORE DELETE ON order_return_access_events
BEGIN SELECT RAISE(ABORT,'Return access events must be retained'); END;
