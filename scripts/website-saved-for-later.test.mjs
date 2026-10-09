import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSavedForLater, readSavedForLater, removeCartSelection, restoreCartSelection, saveCartSelection, savedForLaterKey, savedSelectionAvailability, writeSavedForLater } from "../react-app/src/lib/savedForLater.js";

const item = { id: "test-shirt", size: "M", variant: "Plum", quantity: 2 };
const product = { id: item.id, status: "live", sizes: ["M", "L"], size_stock: { M: 8, L: 3 }, stock: 11 };
const storage = initial => {
  const data = new Map(Object.entries(initial || {}));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test("saved lists are isolated by guest and normalized account email", () => {
  assert.equal(savedForLaterKey(), "glamia-react-saved-for-later:guest");
  assert.equal(savedForLaterKey(" PERSON@Example.com "), savedForLaterKey("person@example.com"));
  assert.notEqual(savedForLaterKey("one@example.com"), savedForLaterKey("two@example.com"));
});
test("cleaning bounds selections and preserves distinct size and variant keys", () => {
  const clean = cleanSavedForLater([item, item, { ...item, size: "L" }, { ...item, variant: "Ink", quantity: 99 }, { id: "<invalid>" }]);
  assert.equal(clean.length, 3);
  assert.equal(clean[2].quantity, 10);
  assert.equal(cleanSavedForLater(Array.from({ length: 150 }, (_, i) => ({ id: `item-${i}` }))).length, 100);
});
test("saving replaces only the matching selection and removing never touches other variants", () => {
  const lines = [item, { ...item, size: "L" }, { ...item, variant: "Ink" }];
  assert.deepEqual(saveCartSelection(lines, { ...item, quantity: 3 }).map(line => line.quantity), [3, 2, 2]);
  assert.deepEqual(removeCartSelection(lines, item), lines.slice(1));
});
test("restoring preserves quantity, size and variant, merging only an exact selection", () => {
  assert.deepEqual(restoreCartSelection([], item), [item]);
  const lines = [item, { ...item, variant: "Ink" }];
  assert.deepEqual(restoreCartSelection(lines, item), [{ ...item, quantity: 4 }, lines[1]]);
  assert.throws(() => restoreCartSelection([{ ...item, quantity: 9 }], item), /Reduce/);
});
test("list and bag capacity never silently discard a saved item", () => {
  const full = Array.from({ length: 100 }, (_, i) => ({ ...item, id: `item-${i}` }));
  assert.throws(() => saveCartSelection(full, item), /full/);
  assert.throws(() => restoreCartSelection(full, item), /full/);
  assert.equal(savedSelectionAvailability(item, product, full), "Bag is full");
});
test("restoring respects stock, missing sizes, unpublished products and preorder limits", () => {
  assert.equal(savedSelectionAvailability(item, product), "");
  assert.equal(savedSelectionAvailability(item, null), "Unavailable");
  assert.equal(savedSelectionAvailability(item, { ...product, status: "draft" }), "Unavailable");
  assert.equal(savedSelectionAvailability({ ...item, size: "XL" }, product), "Choose a size");
  assert.equal(savedSelectionAvailability(item, { ...product, size_stock: { M: 0 } }), "Sold out");
  assert.equal(savedSelectionAvailability(item, { ...product, size_stock: { M: 1 } }), "Not enough stock");
  assert.equal(savedSelectionAvailability(item, { ...product, size_stock: { M: 3 } }, [{ ...item, variant: "Ink" }]), "Not enough stock");
  assert.equal(savedSelectionAvailability(item, product, [{ ...item, quantity: 9 }]), "Bag limit reached");
  assert.equal(savedSelectionAvailability(item, { ...product, preorder_enabled: true, preorder_limit: 5, preorder_sold: 4 }), "Not enough reservations");
  assert.equal(savedSelectionAvailability(item, { ...product, preorder_enabled: true, preorder_limit: 5, preorder_sold: 5 }), "Pre-order limit reached");
  assert.equal(savedSelectionAvailability(item, { ...product, preorder_enabled: true, preorder_limit: null }), "");
});
test("writes reread current storage so another tab's saved selections survive", () => {
  const store = storage(); const key = savedForLaterKey();
  writeSavedForLater(store, key, items => saveCartSelection(items, item));
  const second = { ...item, id: "second-shirt" };
  writeSavedForLater(store, key, items => saveCartSelection(items, second));
  assert.deepEqual(readSavedForLater(store, key).items, [item, second]);
});
test("blocked, corrupt and full storage must fail before moving a bag item", () => {
  const key = savedForLaterKey();
  const corrupt = storage({ [key]: "{broken" });
  assert.equal(readSavedForLater(corrupt, key).ready, false);
  assert.throws(() => writeSavedForLater(corrupt, key, () => [item]), /could not be read/);
  assert.equal(corrupt.getItem(key), "{broken");
  const blocked = { getItem: () => { throw new Error("blocked"); } };
  assert.equal(readSavedForLater(blocked, key).ready, false);
  const full = { getItem: () => null, setItem: () => { throw new DOMException("Full", "QuotaExceededError"); } };
  assert.throws(() => writeSavedForLater(full, key, () => [item]), { name: "QuotaExceededError" });
});
