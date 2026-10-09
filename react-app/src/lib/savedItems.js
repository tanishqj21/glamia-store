export const savedCartKey = item => JSON.stringify([item.id, item.size || "", item.variant || ""]);
const cartKey = savedCartKey;

// Keep only bounded product references before sending device selections to the account API.
export function cleanSavedCart(items) {
  return Array.isArray(items) ? items.filter(item => /^[a-zA-Z0-9_-]{1,128}$/.test(String(item?.id || "")))
    .slice(0, 100).map(item => ({ id: String(item.id), size: String(item.size || "").slice(0, 32), variant: String(item.variant || "").slice(0, 128), quantity: Math.max(1, Math.min(10, Math.floor(Number(item.quantity) || 1))) })) : [];
}

export function cleanSavedWishlist(items) {
  return Array.isArray(items) ? [...new Set(items.filter(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id)))].slice(0, 200) : [];
}

export function savedItemChanges(before, after) {
  const oldCart = new Map(before.cart.map(item => [cartKey(item), item]));
  const newCart = new Map(after.cart.map(item => [cartKey(item), item]));
  const cart = [...new Set([...oldCart.keys(), ...newCart.keys()])].filter(key => oldCart.get(key)?.quantity !== newCart.get(key)?.quantity)
    .map(key => newCart.get(key) || { ...oldCart.get(key), quantity: 0 });
  const oldWishlist = new Set(before.wishlist);
  const newWishlist = new Set(after.wishlist);
  const wishlist = [...new Set([...oldWishlist, ...newWishlist])].filter(id => oldWishlist.has(id) !== newWishlist.has(id))
    .map(id => ({ id, saved: newWishlist.has(id) }));
  const oldLater = new Map((before.saved_for_later || []).map(item => [cartKey(item), item]));
  const newLater = new Map((after.saved_for_later || []).map(item => [cartKey(item), item]));
  const saved_for_later = [...new Set([...oldLater.keys(), ...newLater.keys()])].filter(key => oldLater.get(key)?.quantity !== newLater.get(key)?.quantity)
    .map(key => newLater.get(key) || { ...oldLater.get(key), quantity: 0 });
  return { cart, wishlist, saved_for_later };
}

export function savedItemSnapshot(data) {
  return { cart: cleanSavedCart(data?.cart), wishlist: cleanSavedWishlist(data?.wishlist), saved_for_later: cleanSavedCart(data?.saved_for_later) };
}

export function hasSavedItemChanges(delta) { return Boolean(delta.cart.length || delta.wishlist.length || delta.saved_for_later?.length); }
