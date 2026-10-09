import assert from "node:assert/strict";
import test from "node:test";
import { addBagItem, bagItemKey, cleanSavedForLater, removeBagItem, savedForLaterKey, savedItemAvailability } from "../glamia-shoppers-app/src/bagItems.js";
import { isHorizontalSwipe, shouldCaptureMenuOpen, shouldOpenMenu, shouldCloseMenu } from "../glamia-shoppers-app/src/menuGestures.js";

const medium = { id: "shirt", size: "M", variant: "Plum", quantity: 2 };
const large = { ...medium, size: "L", quantity: 1 };

test("saved cart lines keep exact size, colourway and quantity without affecting other sizes", () => {
  const saved = addBagItem([], medium, false);
  assert.deepEqual(saved, [medium]);
  assert.deepEqual(removeBagItem([medium, large], medium), [large]);
  assert.notEqual(bagItemKey(medium), bagItemKey(large));
  assert.deepEqual(addBagItem(saved, { ...medium, quantity: 3 }, false), [{ ...medium, quantity: 3 }]);
});

test("restoring a selection merges only an exact bag match and caps quantity", () => {
  assert.deepEqual(addBagItem([large], medium), [large, medium]);
  assert.deepEqual(addBagItem([medium], { ...medium, quantity: 3 }), [{ ...medium, quantity: 5 }]);
  assert.equal(addBagItem([medium], { ...medium, quantity: 10 })[0].quantity, 10);
  assert.notEqual(bagItemKey({ id: "a-b", size: "c" }), bagItemKey({ id: "a", size: "b-c" }));
});

test("damaged saved storage is bounded, deduplicated and validated", () => {
  assert.deepEqual(cleanSavedForLater(null), []);
  assert.deepEqual(cleanSavedForLater([{ id: "../bad" }, null]), []);
  assert.deepEqual(cleanSavedForLater([medium, { ...medium, quantity: 0 }]), [{ ...medium, quantity: 1 }]);
  assert.equal(cleanSavedForLater(Array.from({ length: 110 }, (_, i) => ({ id: `p${i}` }))).length, 100);
});

test("saved-for-later keys isolate guests and different accounts", () => {
  assert.notEqual(savedForLaterKey(), savedForLaterKey("shopper@example.com"));
  assert.notEqual(savedForLaterKey("one@example.com"), savedForLaterKey("two@example.com"));
  assert.equal(savedForLaterKey(" Shopper@Example.com "), savedForLaterKey("shopper@example.com"));
});

test("unavailable products and sizes cannot be silently moved into the bag", () => {
  const product = { stock: 5, sizes: ["M", "L"], size_stock: { M: 2, L: 0 } };
  assert.equal(savedItemAvailability(medium, product), "");
  assert.equal(savedItemAvailability(large, product), "Size sold out");
  assert.equal(savedItemAvailability({ ...medium, size: "S" }, product), "Choose a size");
  assert.equal(savedItemAvailability(medium, { ...product, stock: 0 }), "Sold out");
  assert.equal(savedItemAvailability(medium, null), "Unavailable");
  assert.equal(savedItemAvailability(large, { ...product, preorder_enabled: true }), "");
  assert.equal(savedItemAvailability(medium, product, [{ ...medium, quantity: 9 }]), "Bag limit reached");
  assert.equal(savedItemAvailability(medium, product, [medium]), "Not enough stock");
});

test("menu swipes do not hijack vertical, central or multi-finger scrolling", () => {
  const swipe = { x0: 12, dx: 80, dy: 3, vx: 0.6, numberActiveTouches: 1 };
  assert.equal(shouldCaptureMenuOpen(swipe), true);
  assert.equal(shouldOpenMenu(swipe), true);
  assert.equal(shouldCaptureMenuOpen({ ...swipe, x0: 100 }), false);
  assert.equal(isHorizontalSwipe({ ...swipe, dy: 100 }), false);
  assert.equal(isHorizontalSwipe({ ...swipe, numberActiveTouches: 2 }), false);
  assert.equal(shouldOpenMenu({ ...swipe, dx: 17, vx: 2 }), false);
  assert.equal(shouldOpenMenu({ ...swipe, dy: 100 }), false);
  assert.equal(shouldCloseMenu({ ...swipe, dx: -100, vx: -0.6 }, 330), true);
  assert.equal(shouldCloseMenu({ ...swipe, dx: -20, vx: -0.1 }, 330), false);
});
