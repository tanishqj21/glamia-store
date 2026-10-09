import { availableQuantity, isPreorder } from "./commerce.js";
import { cleanSavedCart, savedCartKey } from "./savedItems.js";

// Browser-local selections are isolated by account and never sent as wishlist or checkout items.
export function savedForLaterKey(email = "") {
  const owner = String(email).trim().toLowerCase();
  return `glamia-react-saved-for-later:${owner ? encodeURIComponent(owner) : "guest"}`;
}

export function cleanSavedForLater(items) {
  return [...new Map(cleanSavedCart(items).map(item => [savedCartKey(item), item])).values()];
}

export function saveCartSelection(items, item) {
  const clean = cleanSavedCart([item])[0];
  if (!clean) throw new Error("This item could not be saved. It is still in your bag.");
  const existing = items.some(line => savedCartKey(line) === savedCartKey(clean));
  if (!existing && items.length >= 100) throw new Error("Saved for later is full. Remove a saved item before adding another.");
  return existing ? items.map(line => savedCartKey(line) === savedCartKey(clean) ? clean : line) : [...items, clean];
}

export function removeCartSelection(items, item) {
  return items.filter(line => savedCartKey(line) !== savedCartKey(item));
}

export function restoreCartSelection(cart, item) {
  const existing = cart.find(line => savedCartKey(line) === savedCartKey(item));
  const quantity = (existing?.quantity || 0) + item.quantity;
  if (quantity > 10) throw new Error("Reduce this selection's bag quantity before moving it back.");
  if (!existing && cart.length >= 100) throw new Error("Your bag is full. Remove a bag item before moving this selection back.");
  return existing ? cart.map(line => line === existing ? { ...line, quantity } : line) : [...cart, { ...item }];
}

export function savedSelectionAvailability(item, product, cart = []) {
  if (!product || (product.status && product.status !== "live")) return "Unavailable";
  if (product.sizes?.length && !product.sizes.includes(item.size)) return "Choose a size";
  const existing = cart.find(line => savedCartKey(line) === savedCartKey(item));
  const quantity = item.quantity + (existing?.quantity || 0);
  if (quantity > 10) return "Bag limit reached";
  if (!existing && cart.length >= 100) return "Bag is full";
  const available = availableQuantity(product, item.size);
  if (!available) return isPreorder(product) ? "Pre-order limit reached" : "Sold out";
  // Different variants of the same product share its size stock or preorder capacity.
  const reserved = cart.filter(line => line.id === item.id && (isPreorder(product) || (line.size || "") === (item.size || "")))
    .reduce((sum, line) => sum + line.quantity, 0);
  if (available < item.quantity + reserved) return isPreorder(product) ? "Not enough reservations" : "Not enough stock";
  return "";
}

export function readSavedForLater(storage, key) {
  try {
    const value = storage.getItem(key);
    return { items: cleanSavedForLater(value ? JSON.parse(value) : []), ready: true, error: "" };
  } catch {
    return { items: [], ready: false, error: "Saved for later could not be read from this browser. Your bag has not changed. Check browser storage and refresh to try again." };
  }
}

// Commit the saved list before removing anything from the bag; storage failure is recoverable.
export function writeSavedForLater(storage, key, update) {
  const current = readSavedForLater(storage, key);
  if (!current.ready) throw new Error(current.error);
  const items = update(current.items);
  storage.setItem(key, JSON.stringify(items));
  return items;
}
