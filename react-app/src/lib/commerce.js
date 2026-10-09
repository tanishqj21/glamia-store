export function sellingPrice(product, now = Date.now()) {
  const starts = product?.deal_starts_at ? Date.parse(product.deal_starts_at) : 0;
  const ends = Date.parse(product?.deal_ends_at || "");
  const deal = product?.deal_price;
  return Number(deal != null && starts <= now && ends > now ? deal : product?.price || 0);
}

export function availableQuantity(product, size) {
  if (!product || (product.status && product.status !== "live")) return 0;
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  if (sizes.length && !sizes.includes(size)) return 0;
  if (product.preorder_enabled) return product.preorder_limit == null ? Infinity : Math.max(0, Number(product.preorder_limit) - Number(product.preorder_sold || 0));
  const stock = product.size_stock;
  return Math.max(0, Number(stock && Object.keys(stock).length ? stock[size] || 0 : product.stock || 0));
}

export function isPreorder(product) {
  return Boolean(product?.preorder_enabled);
}

export function preorderRemaining(product) {
  if (!isPreorder(product) || product.preorder_limit == null) return null;
  return Math.max(0, Number(product.preorder_limit) - Number(product.preorder_sold || 0));
}

export function readStorage(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Shopping still works when browser storage is unavailable. */ }
}

export function readArray(key) {
  try { const value = JSON.parse(readStorage(key, "[]")); return Array.isArray(value) ? value : []; } catch { return []; }
}

/* Every timestamp shown anywhere on the site renders in IST, regardless of the
   visitor's device timezone. */
export function money(value) { return `₹${Number(value || 0).toLocaleString("en-IN")}`; }

export function formatIST(value, options) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...options });
}

/* Canonical product URLs use the product hierarchy:
   /<category-slug>/<subcategory-slug>/<name-slug>-<public-code>-<uuid>.
   The category and subcategory make the URL useful to shoppers and search
   engines; the readable code plus immutable UUID makes every listing and
   colourway unambiguous. Legacy UUID-backed products continue to work through
   the fallback.
   Legacy /product/<slug> links continue to resolve and redirect server-side. */
function urlSlug(value, fallback = "collection") {
  const slug = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function productUrl(product) {
  const publicCode = String(product?.product_code || "").trim();
  const internalId = String(product?.id || "").trim();
  const stableId = publicCode || internalId || String(product?.slug || "").trim();
  if (!stableId) return "/search";
  const slug = urlSlug(product?.name, stableId);
  const category = urlSlug(product?.category);
  const subcategory = urlSlug(product?.subcategory);
  const suffix = publicCode && internalId && publicCode.toLowerCase() !== internalId.toLowerCase()
    ? `${publicCode}-${internalId}`
    : stableId;
  return `/${category}/${subcategory}/${slug}-${suffix.toLowerCase()}`;
}
