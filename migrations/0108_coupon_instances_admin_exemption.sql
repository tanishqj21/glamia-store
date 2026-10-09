-- Coupon identity survives deletion through order/redemption snapshots.
-- Existing history stays attached to the current legacy instance; no records deleted.
ALTER TABLE coupons ADD COLUMN instance_id TEXT NOT NULL DEFAULT '';
ALTER TABLE coupon_redemptions ADD COLUMN coupon_instance_id TEXT NOT NULL DEFAULT '';
ALTER TABLE coupon_redemptions ADD COLUMN admin_exempt INTEGER NOT NULL DEFAULT 0 CHECK(admin_exempt IN (0,1));
ALTER TABLE orders ADD COLUMN coupon_instance_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN coupon_admin_exempt INTEGER NOT NULL DEFAULT 0 CHECK(coupon_admin_exempt IN (0,1));
UPDATE coupons SET instance_id='gmc_'||lower(hex(randomblob(16)));
UPDATE coupon_redemptions SET coupon_instance_id=COALESCE((SELECT instance_id FROM coupons WHERE code=coupon_redemptions.coupon_code),'legacy:'||coupon_code);
UPDATE orders SET coupon_instance_id=COALESCE((SELECT coupon_instance_id FROM coupon_redemptions WHERE order_id=orders.id),
 (SELECT instance_id FROM coupons WHERE code=orders.coupon_code),'legacy:'||coupon_code)
 WHERE coupon_code IS NOT NULL AND coupon_code!='';
CREATE UNIQUE INDEX coupon_instance_identity ON coupons(instance_id) WHERE instance_id!='';
CREATE INDEX coupon_instance_usage ON coupon_redemptions(coupon_instance_id,admin_exempt,customer_email);

CREATE TRIGGER assign_coupon_instance AFTER INSERT ON coupons WHEN NEW.instance_id='' BEGIN
 UPDATE coupons SET instance_id='gmc_'||lower(hex(randomblob(16))) WHERE code=NEW.code;
END;
CREATE TRIGGER coupon_instance_immutable BEFORE UPDATE OF instance_id ON coupons
WHEN OLD.instance_id!='' AND NEW.instance_id!=OLD.instance_id
BEGIN SELECT RAISE(ABORT,'Coupon instance cannot be replaced'); END;
CREATE TRIGGER coupon_order_snapshot_immutable BEFORE UPDATE OF coupon_instance_id,coupon_admin_exempt ON orders
WHEN (OLD.coupon_instance_id!='' AND NEW.coupon_instance_id!=OLD.coupon_instance_id)
 OR NEW.coupon_admin_exempt!=OLD.coupon_admin_exempt
BEGIN SELECT RAISE(ABORT,'Purchased coupon identity is immutable'); END;

DROP TRIGGER enforce_coupon_redemption_limits;
CREATE TRIGGER enforce_coupon_redemption_limits BEFORE INSERT ON coupon_redemptions BEGIN
 SELECT RAISE(ABORT,'Coupon instance changed during checkout')
  WHERE NOT EXISTS(SELECT 1 FROM coupons c WHERE c.code=NEW.coupon_code
   AND (NEW.coupon_instance_id='' OR c.instance_id=NEW.coupon_instance_id))
  ;
 SELECT RAISE(ABORT,'Coupon redemption identity mismatch')
  WHERE EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND
   (LOWER(TRIM(o.customer_email))!=LOWER(TRIM(NEW.customer_email)) OR o.coupon_code IS NOT NEW.coupon_code
    OR (o.coupon_instance_id!='' AND o.coupon_instance_id!=(SELECT instance_id FROM coupons WHERE code=NEW.coupon_code))))
  ;
 SELECT RAISE(ABORT,'Coupon redemption limit reached')
  WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id
   AND LOWER(TRIM(o.customer_email))=LOWER(TRIM(NEW.customer_email)) AND o.coupon_admin_exempt=1)
  AND EXISTS(SELECT 1 FROM coupons c WHERE c.code=NEW.coupon_code AND (
   c.active!=1 OR
   (c.usage_limit IS NOT NULL AND (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_instance_id=c.instance_id AND r.admin_exempt=0)>=c.usage_limit) OR
   (c.per_user_limit IS NOT NULL AND (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_instance_id=c.instance_id AND r.admin_exempt=0
     AND LOWER(TRIM(r.customer_email))=LOWER(TRIM(NEW.customer_email)))>=c.per_user_limit)))
  ;
END;
-- Also stamps older checkout clients during a rolling deployment. The exempt
-- flag comes only from the server-created order, never from a redemption input.
CREATE TRIGGER stamp_coupon_redemption AFTER INSERT ON coupon_redemptions BEGIN
 UPDATE coupon_redemptions SET coupon_instance_id=(SELECT instance_id FROM coupons WHERE code=NEW.coupon_code),
  admin_exempt=COALESCE((SELECT coupon_admin_exempt FROM orders WHERE id=NEW.order_id),0) WHERE id=NEW.id;
 UPDATE orders SET coupon_instance_id=(SELECT instance_id FROM coupons WHERE code=NEW.coupon_code)
  WHERE id=NEW.order_id AND coupon_instance_id='';
END;
CREATE TRIGGER coupon_redemption_identity_immutable BEFORE UPDATE OF coupon_instance_id ON coupon_redemptions
WHEN OLD.coupon_instance_id!='' AND NEW.coupon_instance_id!=OLD.coupon_instance_id
BEGIN SELECT RAISE(ABORT,'Coupon redemption instance is immutable'); END;
CREATE TRIGGER coupon_redemption_exemption_guard BEFORE UPDATE OF admin_exempt ON coupon_redemptions
WHEN NEW.admin_exempt!=COALESCE((SELECT coupon_admin_exempt FROM orders WHERE id=NEW.order_id),0)
BEGIN SELECT RAISE(ABORT,'Coupon exemption must match the purchased order'); END;

DROP TRIGGER credit_checkout_guard;
CREATE TRIGGER credit_checkout_guard BEFORE INSERT ON orders BEGIN
 SELECT RAISE(ABORT,'Coupon instance changed during checkout')
  WHERE NEW.coupon_code IS NOT NULL AND NEW.coupon_instance_id!=''
  AND NOT EXISTS(SELECT 1 FROM coupons WHERE code=NEW.coupon_code AND instance_id=NEW.coupon_instance_id)
  ;
 SELECT RAISE(ABORT,'Invalid checkout credits')
  WHERE typeof(NEW.credits_used)!='integer' OR NEW.credits_used<0 OR NEW.credits_used>NEW.total;
 SELECT RAISE(ABORT,'Store credits require a registered account')
  WHERE NEW.credits_used>0 AND NOT EXISTS(SELECT 1 FROM users WHERE email=NEW.customer_email);
 SELECT RAISE(ABORT,'Coupon cannot be combined with store credits')
  WHERE NEW.credits_used>0 AND NEW.coupon_code IS NOT NULL AND NEW.coupon_admin_exempt=0
  AND NOT EXISTS(SELECT 1 FROM coupons WHERE code=NEW.coupon_code AND allow_store_credits=1
   AND (NEW.coupon_instance_id='' OR instance_id=NEW.coupon_instance_id));
END;
