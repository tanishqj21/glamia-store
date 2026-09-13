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

/* Search-engine friendly product URLs: /product/<name-slug>. When several live
   products share a name (colourways, re-edits) every one of them disambiguates
   with a short id suffix: /product/<name-slug>-<8-char-id>. Bare ids and the
   older <slug>-<full-id> links keep resolving on the backend. */
let productSlugRegistry = null;

export function setSlugRegistry(products) {
  productSlugRegistry = (Array.isArray(products) ? products : [])
    .map((product) => ({
      id: String(product?.id || product?.slug || "").trim(),
      slug: String(product?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    }))
    .filter((entry) => entry.id && entry.slug);
}

export function productUrl(product) {
  const id = String(product?.id || product?.slug || "").trim();
  if (!id) return "/search";
  const slug = String(product?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return `/product/${id}`;
  const ambiguous = productSlugRegistry ? productSlugRegistry.filter((entry) => entry.slug === slug).length > 1 : false;
  return `/product/${ambiguous ? `${slug}-${id.slice(0, 8)}` : slug}`;
}
