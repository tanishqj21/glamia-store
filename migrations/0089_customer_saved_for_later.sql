-- Share saved-for-later selections in the same versioned account snapshot as the bag and wishlist.
ALTER TABLE customer_saved_items ADD COLUMN saved_for_later_json TEXT NOT NULL DEFAULT '[]';
