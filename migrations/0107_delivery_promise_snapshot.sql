ALTER TABLE orders ADD COLUMN delivery_estimate TEXT NOT NULL DEFAULT '';
CREATE TRIGGER order_delivery_promise_immutable BEFORE UPDATE OF delivery_estimate ON orders
WHEN OLD.delivery_estimate!='' AND NEW.delivery_estimate!=OLD.delivery_estimate
BEGIN SELECT RAISE(ABORT,'The purchased delivery estimate cannot be changed'); END;
