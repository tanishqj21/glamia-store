-- Product-level return eligibility used by the storefront guarantee badges.
-- Existing products remain returnable unless an admin explicitly changes them.
ALTER TABLE products ADD COLUMN returnable INTEGER NOT NULL DEFAULT 1;
