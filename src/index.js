const SESSION_COOKIE = "mm_session";
const HOST_SESSION_COOKIE = "__Host-mm_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const DAILY_UPLOAD_LIMIT = 50 * 1024 * 1024;
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const DEMO_ADMIN_EMAIL = "demo-admin@glamia.local";
const LOW_STOCK_THRESHOLD = 15;
const CANCELLATION_WINDOW_DAYS = 2;
const RETURN_WINDOW_DAYS = 7;
const R2_CLEANUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const R2_CLEANUP_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const R2_CLEANUP_PREFIXES = ["products/", "reviews/"];
let googleKeysCache = { keys: null, expiresAt: 0 };
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMITS = new Map([
  ["/api/auth/google", 20],
  ["/api/orders", 30],
  ["/api/order-tracking", 20],
  ["/api/coupons/validate", 60],
  ["/api/uploads/image", 30],
  ["/api/support/tickets", 30],
  ["/api/cart-events", 120],
  ["/api/wishlist-events", 120]
]);
// Fallback only for local startup/migration failures. Production traffic uses
// the shared D1 bucket below so limits apply across Worker isolates.
const requestRateBuckets = new Map();
let productEnrichmentCache = { expiresAt: 0, entries: new Map() };
const invalidateProductEnrichment = () => {
  productEnrichmentCache = { expiresAt: 0, entries: new Map() };
};
let googleAnalyticsTokenCache = { accessToken: "", expiresAt: 0, clientEmail: "" };

const seedProducts = [
  ["seed-ivory-linen-shirt", "seed@glamia.local", "Ivory Linen Resort Shirt", "Men", "North Loom", 1899, 2799, 38, 4.6, "live", 1, "Ivory", ["S", "M", "L", "XL"], "https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=900&q=82", "A breathable linen shirt with a relaxed resort collar, mother-of-pearl buttons, and a soft garment-washed finish.", "Pure Linen"],
  ["seed-midnight-satin-dress", "seed@glamia.local", "Midnight Satin Wrap Dress", "Women", "Glamia", 4299, 6999, 22, 4.9, "live", 1, "Midnight", ["XS", "S", "M", "L"], "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=900&q=82", "Fluid satin drape, adjustable waist tie, and evening-ready polish for dinners, receptions, and gallery nights.", "Satin"],
  ["seed-wool-blend-blazer", "seed@glamia.local", "Sculpted Wool Blend Blazer", "Women", "Atelier Loom", 5499, 8299, 16, 4.8, "live", 1, "Charcoal", ["S", "M", "L"], "https://images.unsplash.com/photo-1548454782-15b189d129ab?auto=format&fit=crop&w=900&q=82", "Structured shoulders, refined lapels, and a lightly nipped waist designed for office-to-evening dressing.", "Wool Blend"],
  ["seed-silk-kurta-set", "seed@glamia.local", "Handwoven Silk Kurta Set", "Ethnic", "Raaga House", 3899, 5799, 29, 4.7, "live", 0, "Sage", ["S", "M", "L", "XL"], "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=82", "A soft silk-blend kurta with tonal embroidery, straight trousers, and an elegant dupatta for festive occasions.", "Silk Blend"],
  ["seed-leather-loafers", "seed@glamia.local", "Tan Leather Penny Loafers", "Footwear", "Cobbler & Co.", 2999, 4499, 11, 4.5, "live", 0, "Tan", ["6", "7", "8", "9", "10"], "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=82", "Polished leather loafers with cushioned insoles and a refined almond toe for weekday dressing.", "Genuine Leather"],
  ["seed-brass-cuff", "seed@glamia.local", "Brass Minimal Cuff", "Accessories", "Line & Light", 999, 1599, 54, 4.4, "review", 0, "Brass", ["One size"], "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=82", "A minimal polished cuff with a clean open profile, designed to layer with watches or fine bracelets.", "Brass"]
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") return withSecurityHeaders(new Response(null, { status: 204 }));
      if (request.method === "GET" && url.pathname === "/demo-admin") return withSecurityHeaders(await loginAsDemoAdmin(request, env, true));
      if (request.method === "GET" && url.pathname === "/sitemap.xml") return withSecurityHeaders(await getSitemap(request, env));
      if (request.method === "GET" && url.pathname === "/robots.txt") return withSecurityHeaders(await getRobots(request));
      // Tax reference data is generated into the public asset bundle from the
      // supplied HSN/SAC and GST state workbooks. Let these JSON files reach
      // the asset handler before the public-page/SEO router evaluates them as
      // application routes.
      if (request.method === "GET" && url.pathname.startsWith("/data/tax/")) {
        return withSecurityHeaders(await env.ASSETS.fetch(request));
      }
      if (url.pathname.startsWith("/api/")) {
        const cacheTtl = publicApiCacheTtl(request, url);
        const db = cacheTtl && typeof env.DB?.withSession === "function"
          ? env.DB.withSession("first-unconstrained")
          : env.DB;
        const requestEnv = db === env.DB ? env : { ...env, DB: db };
        const response = cacheTtl
          ? await cachedPublicApi(request, ctx, cacheTtl, () => routeApi(request, requestEnv, url, ctx))
          : await routeApi(request, requestEnv, url, ctx);
        return withSecurityHeaders(response);
      }
      const page = await renderPublicPage(request, env);
      if (page) return withSecurityHeaders(page);
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      const status = error.status || 500;
      return withSecurityHeaders(json({ error: status >= 500 ? "Server error" : (error.message || "Request failed") }, status));
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(processDueEmailEvents(env));
    ctx.waitUntil(runWeeklyR2Cleanup(env));
  }
};

function slugifyName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function productUrlSlug(value, fallback = "collection") {
  return slugifyName(value) || fallback;
}

function canonicalProductPath(product) {
  const id = String(product?.id || "").trim();
  const nameSlug = productUrlSlug(product?.name, id || "item");
  const suffix = id ? `-${id.toLowerCase()}` : "";
  // The complete stable id is always present. It prevents a future rename or
  // same-name re-edit from taking over an existing product URL.
  return `/${productUrlSlug(product?.category)}/${productUrlSlug(product?.subcategory)}/${nameSlug}${suffix}`;
}

/* Order numbers: GM-<DDMMYYYY IST>-<product initials>-<5-digit sequence>,
   e.g. GM-12092026-MSW-00001. The sequence lives in the counters table and is
   bumped atomically per order; gaps are possible when a checkout fails after
   the number is taken, which is expected for sequential identifiers. */
const IST_OFFSET_MS = 5 * 60 * 60 * 1000 + 30 * 60 * 1000;

function istDateString(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return `${String(ist.getUTCDate()).padStart(2, "0")}${String(ist.getUTCMonth() + 1).padStart(2, "0")}${ist.getUTCFullYear()}`;
}

function productNameInitials(name) {
  const words = String(name || "").trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.slice(0, 3).map(word => word[0].toUpperCase()).join("") || "ITM";
}

async function nextOrderSequence(env) {
  const bumped = await env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name = 'order_number' RETURNING value").first().catch(() => null);
  if (bumped) return Number(bumped.value);
  await env.DB.prepare("INSERT OR IGNORE INTO counters (name, value) VALUES ('order_number', 0)").run().catch(() => {});
  const retried = await env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name = 'order_number' RETURNING value").first().catch(() => null);
  return retried ? Number(retried.value) : null;
}

function buildOrderNumber(initials, sequence) {
  const tail = sequence == null
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()
    : String(sequence).padStart(5, "0");
  return `GM-${istDateString()}-${initials}-${tail}`;
}

const DEFAULT_PAGE_DESCRIPTION = "Shop curated apparel and accessories from independent ateliers — free and fast shipping across India, demo checkout available.";

const CRAWLER_UA = /Googlebot|Google-InspectionTool|Bingbot|Yandex|DuckDuckBot|Baiduspider|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|TelegramBot|Applebot|PetalBot|SemrushBot|AhrefsBot|MJ12bot|GPTBot|ClaudeBot|PerplexityBot|ImagesiftBot/i;

function absoluteImageUrl(value, origin) {
  const src = String(value || "").trim();
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  return `${origin}${src.startsWith("/") ? src : `/${src}`}`;
}

function currentSellingPrice(product) {
  const now = Date.now();
  const starts = product.deal_starts_at ? Date.parse(product.deal_starts_at) : 0;
  const ends = product.deal_ends_at ? Date.parse(product.deal_ends_at) : 0;
  const deal = Number(product.deal_price || 0);
  return deal > 0 && starts <= now && ends > now ? deal : Number(product.price || 0);
}

async function getPublicCatalogRows(env, category = "") {
  try {
    const categoryFilter = category ? "AND LOWER(TRIM(p.category)) = LOWER(TRIM(?))" : "";
    const statement = env.DB.prepare(`
      SELECT p.id, p.name, p.category, p.subcategory, p.brand, p.price, p.mrp, p.color,
        p.description, p.image_url, p.thumbnail_url, p.deal_starts_at,
        p.deal_ends_at, p.deal_price, p.created_at, p.updated_at,
        (SELECT COALESCE(SUM(oi.quantity), 0)
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id AND o.status != 'cancelled') AS sold_total
      FROM products p
      WHERE p.status = 'live' ${categoryFilter}
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    const result = category ? await statement.bind(category).all() : await statement.all();
    return { available: true, rows: result.results || [] };
  } catch {
    return { available: false, rows: [] };
  }
}

function catalogBotContent(title, description, rows, origin) {
  const links = rows.map(row => {
    const image = absoluteImageUrl(row.thumbnail_url || row.image_url, origin);
    const price = currentSellingPrice(row);
    return `<li>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(row.name)}" width="120" height="150" />` : ""}<a href="${canonicalProductPath(row)}">${escapeHtml(row.name)}</a><span>${escapeHtml(row.brand || "Glamia")} · ${escapeHtml(row.category || "Apparel")} · ${escapeHtml(row.subcategory || "Collection")} · ₹${Number(price).toLocaleString("en-IN")}</span></li>`;
  }).join("");
  return `<main class="catalog-page"><p class="eyebrow">Glamia collection</p><h1>${escapeHtml(title)}</h1><p class="catalog-description">${escapeHtml(description)}</p>${rows.length ? `<ul class="catalog-bot-list">${links}</ul>` : "<p>Explore the Glamia collection and discover curated pieces from independent ateliers.</p>"}</main>`;
}

function productBotContent(product, price, images, inStock, relatedRows) {
  const category = String(product.category || "Apparel").trim();
  const subcategory = String(product.subcategory || "Collection").trim();
  const categoryHref = `/category/${encodeURIComponent(category)}`;
  const subcategoryHref = `${categoryHref}?sub=${encodeURIComponent(subcategory)}`;
  const sizes = (product.sizes || []).map(value => String(value || "").trim()).filter(Boolean);
  const availability = product.preorder_enabled ? "Available for pre-order" : inStock ? "In stock" : "Currently out of stock";
  const description = String(product.description || `${product.name} is a considered ${subcategory.toLowerCase()} piece from ${product.brand || "Glamia"}, selected for everyday comfort and lasting style.`).trim();
  const specifications = String(product.specifications || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const imageMarkup = images.slice(0, 4).map((image, index) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(`${product.name}${index ? ` — view ${index + 1}` : ""}`)}" width="640" height="800"${index ? ' loading="lazy"' : ""} />`).join("");
  const details = [
    ["Category", category],
    ["Subcategory", subcategory],
    ["Colour", product.color],
    ["Material", product.material],
    ["Available sizes", sizes.join(", ")],
    ["Availability", availability]
  ].filter(([, value]) => String(value || "").trim()).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const related = relatedRows.slice(0, 6).map(row => `<li><a href="${canonicalProductPath(row)}">${escapeHtml(row.name)}</a><span>${escapeHtml(row.subcategory || row.category || "Glamia collection")} · ₹${Number(currentSellingPrice(row)).toLocaleString("en-IN")}</span></li>`).join("");
  const specificationMarkup = specifications.length
    ? `<section class="seo-product-specifications" aria-labelledby="product-specifications-heading"><h2 id="product-specifications-heading">Product specifications</h2><ul>${specifications.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>`
    : "";
  return `<main class="page-main seo-product-page"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><a href="${categoryHref}">${escapeHtml(category)}</a><span aria-hidden="true">›</span><a href="${subcategoryHref}">${escapeHtml(subcategory)}</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHtml(product.name)}</span></nav><article class="detail-page"><div class="detail-gallery">${imageMarkup}</div><div class="detail-copy"><p class="eyebrow">${escapeHtml(product.brand || "Glamia")}</p><h1>${escapeHtml(product.name)}</h1><p class="detail-price">₹${Number(price).toLocaleString("en-IN")}${Number(product.mrp) > price ? ` <del>₹${Number(product.mrp).toLocaleString("en-IN")}</del>` : ""}</p><p class="muted">${escapeHtml(category)} · ${escapeHtml(subcategory)}${product.color ? ` · ${escapeHtml(product.color)}` : ""}${Number(product.rating) > 0 ? ` · ${Number(product.rating)} / 5${Number(product.review_count) > 0 ? ` from ${Number(product.review_count)} review${Number(product.review_count) === 1 ? "" : "s"}` : " rating"}` : ""}</p><p class="detail-description">${escapeHtml(description)}</p><section aria-labelledby="product-details-heading"><h2 id="product-details-heading">Product details</h2><dl class="seo-product-details">${details}</dl></section>${specificationMarkup}<p class="seo-shop-note">Secure demo checkout is available while Glamia completes payment-provider approval. Shipping and return information is shown before an order is placed.</p><p><a href="${subcategoryHref}">Explore more ${escapeHtml(subcategory)}</a> · <a href="/policies">Delivery and return policies</a> · <a href="/support">Customer support</a></p></div></article>${related ? `<section class="seo-related-products" aria-labelledby="related-products-heading"><h2 id="related-products-heading">More from ${escapeHtml(category)}</h2><ul>${related}</ul></section>` : ""}</main>`;
}

const standalonePolicyPaths = {
  terms: "/terms-and-conditions",
  privacy: "/privacy-policy",
  "refund-cancellation": "/refund-cancellation-policy",
  returns: "/return-policy",
  shipping: "/shipping-policy"
};

function policiesBotContent(selectedId = "") {
  const sections = [
    ["terms", "Terms & Conditions", "Glamia’s Platform includes https://glamiastore.com/, its mobile site, and app. By using it, you agree to provide accurate information, follow applicable law, and respect Glamia’s intellectual property. Orders become legally binding once accepted. These terms are governed by the laws of India; the jurisdiction field in the supplied policy document still needs confirmation before production."],
    ["privacy", "Privacy Policy", "Glamia may collect account, contact, identity, address, order, transaction, preference, and relevant payment information to provide services, support orders, personalise the experience, communicate updates, prevent fraud, and meet legal obligations. Information may be shared with affiliates, sellers, logistics providers, service providers, payment providers, and authorities where lawful. Users can access, update, or request deletion of their information, subject to legal and operational retention needs."],
    ["refund-cancellation", "Refund & Cancellation Policy", "Cancellation requests should be made within 2 days of the order and may not be accepted after shipping has started or the order is out for delivery. Damaged, defective, or not-as-described items should be reported to customer service within 7 days of receipt. Approved refunds are processed within 14 days."],
    ["returns", "Return Policy", "Refunds or exchanges may be requested within the first 7 days from purchase. Items should be unused, in the same condition, and in original packaging. Sale items, exempt categories, and exchanges are subject to the eligibility rules shown at purchase and inspection on return."],
    ["shipping", "Shipping Policy", "Orders are shipped through registered domestic courier and/or speed post services within 14 days from order or payment, or by an agreed delivery date. Delivery is attempted at the address supplied at purchase. Courier delays are outside Glamia’s liability, and seller or Platform shipping charges are not refundable."]
  ];
  const selected = sections.find(([id]) => id === selectedId);
  const visibleSections = selected ? [selected] : sections;
  const navigation = sections.map(([id, title]) => `<a href="${standalonePolicyPaths[id]}">${escapeHtml(title)}</a>`).join(" · ");
  const content = visibleSections.map(([id, title, body]) => `<section id="${id}"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></section>`).join("");
  return `<main class="info-page policy-seo-page"><p class="eyebrow">Glamia care</p><h1>${escapeHtml(selected ? selected[1] : "Policies, plainly put.")}</h1><p>${escapeHtml(selected ? selected[2] : "Review Glamia’s terms, privacy, refunds, returns, and shipping policies before you shop.")}</p><nav aria-label="Policy sections">${navigation}</nav>${content}<p><a href="/support">Contact Glamia support</a> for help with an order or a policy request.</p></main>`;
}

function catalogJsonLd(rows, origin) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: rows.map((row, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: row.name,
      url: `${origin}${canonicalProductPath(row)}`
    }))
  };
}

/* Server-side meta + content for public pages. Every visitor gets real
   Open Graph/Twitter tags, canonical URL and Product JSON-LD in the HTML;
   known crawlers receive a self-contained static rendering inside #root so
   indexing never depends on browser-side API requests. */
async function renderPublicPage(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const legacyProductMatch = path.match(/^\/product\/([^/]+)$/);
  const seoProductMatch = path.match(/^\/(?!category(?:\/|$)|product(?:\/|$))([^/]+)\/([^/]+)\/([^/]+)$/i);
  const categoryMatch = path.match(/^\/category\/([^/]+)$/);
  const catalogPath = new Set(["/", "/offers", "/just-arrived", "/best-sellers"]);
  const infoPath = new Set(["/contact", "/support", "/policies", ...Object.values(standalonePolicyPaths)]);
  if (!catalogPath.has(path) && !infoPath.has(path) && !legacyProductMatch && !seoProductMatch && !categoryMatch) return null;

  const shellResponse = await env.ASSETS.fetch(new URL("/index.html", url));
  if (!shellResponse.ok) return null;
  let html = await shellResponse.text();
  const origin = url.origin;
  const isBot = CRAWLER_UA.test(request.headers.get("User-Agent") || "");

  let title = "Glamia — Curated Apparel & Accessories";
  let description = DEFAULT_PAGE_DESCRIPTION;
  let ogType = "website";
  let ogImage = "";
  let canonical = `${origin}${path}`;
  let headExtras = "";
  let botContent = "";

  if (legacyProductMatch || seoProductMatch) {
    const productReference = decodeURIComponent((seoProductMatch || legacyProductMatch)[seoProductMatch ? 3 : 1]);
    const pathContext = seoProductMatch ? { category: seoProductMatch[1], subcategory: seoProductMatch[2] } : null;
    const resolvedId = await resolveProductReference(env, productReference, pathContext);
    const row = resolvedId ? await env.DB.prepare(`${PRODUCT_SELECT}
      WHERE p.id = ? AND p.status = 'live'
      GROUP BY p.id`).bind(resolvedId).first() : null;
    if (!row) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    const [product] = await withSizeStock(env, [row]);
    const price = currentSellingPrice(product);
    const inStock = (product.sizes || []).length ? Object.values(product.size_stock || {}).some((quantity) => Number(quantity) > 0) : Number(product.stock || 0) > 0;
    const images = (product.images || []).map((image) => absoluteImageUrl(image, origin)).filter(Boolean);
    ogImage = images[0] || absoluteImageUrl(product.image_url, origin);
    title = `${product.name} | Glamia`;
    description = String(product.description || `${product.name} — ${product.brand || "Glamia"} curated piece in ${product.color || "a timeless finish"}.`).slice(0, 300);
    ogType = "product";
    const canonicalPath = canonicalProductPath(product);
    canonical = `${origin}${canonicalPath}`;
    if (path !== canonicalPath) return new Response(null, { status: 301, headers: { Location: canonical, "Cache-Control": "public, max-age=3600" } });
    const relatedCatalog = isBot ? await getPublicCatalogRows(env, product.category) : { rows: [] };
    const relatedRows = (relatedCatalog.rows || []).filter(candidate => candidate.id !== product.id);
    botContent = productBotContent(product, price, images.length ? images : [ogImage].filter(Boolean), inStock, relatedRows);
    const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description || undefined, image: images.slice(0, 4), sku: product.id, category: [product.category, product.subcategory].filter(Boolean).join(" > ") || undefined, color: product.color || undefined, material: product.material || undefined, brand: { "@type": "Brand", name: product.brand || "Glamia" }, offers: { "@type": "Offer", url: canonical, priceCurrency: "INR", price, availability: product.preorder_enabled ? "https://schema.org/PreOrder" : inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", itemCondition: "https://schema.org/NewCondition" }, ...(Number(product.rating) > 0 && Number(product.review_count) > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(product.rating), reviewCount: Number(product.review_count) } } : {}) };
    headExtras = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;
  }

  if (categoryMatch) {
    const category = decodeURIComponent(categoryMatch[1]);
    const catalog = await getPublicCatalogRows(env, category);
    if (catalog.available && !catalog.rows.length) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    const canonicalCategory = catalog.rows[0]?.category || category;
    title = `${canonicalCategory} collection | Glamia`;
    description = `Shop the ${canonicalCategory} edit — curated pieces from independent ateliers, delivered fast across India.`;
    canonical = `${origin}/category/${encodeURIComponent(canonicalCategory)}`;
    botContent = catalogBotContent(`${canonicalCategory} collection`, description, catalog.rows.slice(0, 24), origin);
    headExtras = `<script type="application/ld+json">${JSON.stringify(catalogJsonLd(catalog.rows.slice(0, 24), origin)).replace(/</g, "\\u003c")}</script>`;
  }

  if (catalogPath.has(path)) {
    const catalog = await getPublicCatalogRows(env);
    let rows = catalog.rows;
    if (path === "/offers") rows = rows.filter(row => currentSellingPrice(row) < Number(row.mrp || row.price || 0));
    if (path === "/best-sellers") rows = [...rows].sort((left, right) => Number(right.sold_total || 0) - Number(left.sold_total || 0));
    if (path === "/") {
      title = "Glamia — Curated Apparel & Accessories";
      description = DEFAULT_PAGE_DESCRIPTION;
      botContent = catalogBotContent("Curated apparel and accessories", description, rows.slice(0, 24), origin);
    } else {
      const titles = { "/offers": "Offers", "/just-arrived": "Just arrived", "/best-sellers": "Best sellers" };
      title = `${titles[path]} | Glamia`;
      description = `${titles[path]} from Glamia — curated apparel and accessories from independent ateliers, delivered fast across India.`;
      botContent = catalogBotContent(titles[path], description, rows.slice(0, 24), origin);
    }
    headExtras = `<script type="application/ld+json">${JSON.stringify(catalogJsonLd(rows.slice(0, 24), origin)).replace(/</g, "\\u003c")}</script>`;
  }

  if (infoPath.has(path)) {
    const info = {
      "/contact": ["Contact Glamia", "Questions about an order, product, or delivery? Our team is here to help."],
      "/support": ["Glamia customer support", "Find help with orders, returns, exchanges, delivery, and your account."],
      "/policies": ["Glamia policies", "Review delivery, returns, exchanges, privacy, and checkout information before you shop."],
      "/terms-and-conditions": ["Glamia Terms & Conditions", "Read Glamia’s terms for using the website, mobile site, app, and placing orders."],
      "/privacy-policy": ["Glamia Privacy Policy", "Learn how Glamia collects, uses, shares, protects, and retains personal data."],
      "/refund-cancellation-policy": ["Glamia Refund & Cancellation Policy", "Review Glamia’s order cancellation, damaged-item, and refund rules."],
      "/return-policy": ["Glamia Return Policy", "Review Glamia’s return, exchange, eligibility, and inspection rules."],
      "/shipping-policy": ["Glamia Shipping Policy", "Review Glamia’s shipping methods, delivery timing, delays, and charges."]
    }[path];
    title = `${info[0]} | Glamia`;
    description = info[1];
    botContent = path === "/policies" || Object.values(standalonePolicyPaths).includes(path)
      ? policiesBotContent(Object.entries(standalonePolicyPaths).find(([, value]) => value === path)?.[0] || "")
      : `<main class="info-page"><p class="eyebrow">Glamia</p><h1>${escapeHtml(info[0])}</h1><p>${escapeHtml(info[1])}</p><p><a href="/best-sellers">Browse the collection</a> · <a href="/orders">Track your order</a></p></main>`;
  }

  const metaTags = [
    `<meta property="og:site_name" content="Glamia" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : "",
    `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />` : "",
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`
  ].join("");

  html = html
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace("</head>", `${metaTags}${headExtras}</head>`);
  if (isBot && botContent) {
    html = html
      .replace('<div id="root"></div>', `<div id="root">${botContent}</div>`)
      .replace(/<div id="initial-loader"[\s\S]*?<div id="root"/, '<div id="root"')
      .replace(/<script[^>]+src="https:\/\/accounts\.google\.com\/gsi\/client"[^>]*><\/script>/i, "")
      .replace(/<script\s+type="module"[^>]*><\/script>/i, "");
  }

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "public, max-age=120, s-maxage=300, stale-while-revalidate=1800" } });
}

async function getSitemap(request, env) {
  const origin = new URL(request.url).origin.replace(/\/+$/, "");
  const staticPaths = ["/", "/offers", "/just-arrived", "/best-sellers", "/contact", "/support", "/policies", ...Object.values(standalonePolicyPaths)];
  let productRows = [];
  try {
    const result = await env.DB.prepare(`
      SELECT id, name, category, subcategory, images_json, image_url, thumbnail_url, updated_at, created_at
      FROM products
      WHERE status = 'live'
      ORDER BY updated_at DESC, created_at DESC
    `).all();
    productRows = result.results || [];
  } catch {
    // Keep the core sitemap available even during a temporary database outage.
  }

  const entries = [];
  const seen = new Set();
  const add = (path, lastmod = "", images = [], title = "") => {
    const loc = `${origin}${path}`;
    if (seen.has(loc)) return;
    seen.add(loc);
    entries.push({ loc, lastmod, images, title });
  };
  const formatLastmod = value => {
    if (!value) return "";
    const raw = String(value).trim();
    const date = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  };
  const absoluteImage = value => {
    const src = String(value || "").trim();
    if (!src) return "";
    if (/^https?:\/\//i.test(src)) return src;
    return `${origin}${src.startsWith("/") ? src : `/${src}`}`;
  };
  const productImages = row => {
    const images = jsonArray(row.images_json).map(absoluteImage);
    const thumbnail = absoluteImage(row.thumbnail_url);
    if (thumbnail && !images.includes(thumbnail)) images.unshift(thumbnail);
    const main = absoluteImage(row.image_url);
    if (main && !images.includes(main)) images.push(main);
    return [...new Set(images)].filter(Boolean).slice(0, 4);
  };

  const latestProductUpdate = formatLastmod(productRows[0]?.updated_at || productRows[0]?.created_at);
  staticPaths.forEach(path => add(path, path === "/" ? latestProductUpdate : ""));
  const categoryMeta = new Map();
  for (const row of productRows) {
    const category = String(row.category || "").trim();
    if (!category) continue;
    const key = category.toLowerCase();
    const lastmod = formatLastmod(row.updated_at || row.created_at);
    const existing = categoryMeta.get(key);
    if (!existing || (lastmod && lastmod > existing.lastmod)) categoryMeta.set(key, { name: category, lastmod });
  }
  for (const meta of categoryMeta.values()) add(`/category/${encodeURIComponent(meta.name)}`, meta.lastmod);
  for (const product of productRows) {
    const id = String(product.id || "").trim();
    if (!id) continue;
    const lastmod = formatLastmod(product.updated_at || product.created_at);
    const images = productImages(product);
    add(canonicalProductPath(product), lastmod, images, product.name);
  }

  const escapeXml = value => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...entries.map(entry => `  <url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ""}${(entry.images || []).map(image => `<image:image><image:loc>${escapeXml(image)}</image:loc>${entry.title ? `<image:title>${escapeXml(entry.title)}</image:title>` : ""}</image:image>`).join("")}</url>`),
    "</urlset>",
    ""
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600"
    }
  });
}

async function getRobots(request) {
  const origin = new URL(request.url).origin.replace(/\/+$/, "");
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Allow: /api/assets/",
    "Allow: /api/products",
    "Allow: /api/hero",
    "Allow: /api/storefront-settings",
    "Allow: /api/categories",
    "Allow: /api/session",
    "Disallow: /api/",
    "Disallow: /login",
    "Disallow: /profile",
    "Disallow: /address",
    "Disallow: /orders",
    "Disallow: /wishlist",
    "Disallow: /cart",
    "Disallow: /checkout",
    `Sitemap: ${origin}/sitemap.xml`,
    ""
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600"
    }
  });
}

function publicApiCacheTtl(request, url) {
  if (request.method !== "GET" || request.headers.get("Cookie")) return 0;
  if (url.searchParams.get("cache") === "1" && url.pathname === "/api/categories") return 300;
  if (url.searchParams.get("cache") === "1" && (url.pathname === "/api/hero" || url.pathname === "/api/storefront-settings")) return 60;
  if (url.pathname === "/api/products" && url.searchParams.get("view") === "cards" && [null, "public"].includes(url.searchParams.get("scope"))) return 30;
  return 0;
}

async function cachedPublicApi(request, ctx, ttl, producer) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const response = await producer();
  if (response.status !== 200) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, s-maxage=${ttl}, stale-while-revalidate=${Math.max(ttl * 5, 300)}`);
  const cacheable = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
  return cacheable;
}

async function routeApi(request, env, url, ctx) {
  assertSameOrigin(request, url);
  await enforceRateLimit(request, url, env, ctx);
  const user = await currentUser(request, env);
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/config") {
    return json({
      googleClientId: env.GOOGLE_CLIENT_ID || "",
      googleAnalyticsMeasurementId: env.GA4_MEASUREMENT_ID || "",
    });
  }

  if (request.method === "GET" && path === "/api/session") {
    const profileStatus = user && user.role !== "admin"
      ? await getProfileCompletionStatus(env, user)
      : { profile_complete: true, needs_profile_completion: false };
    return json({ user, ...profileStatus });
  }

  if (request.method === "POST" && path === "/api/auth/signup") {
    return json({ error: "Password sign-up is disabled for the demo. Please sign in with Google." }, 410);
  }

  if (request.method === "POST" && path === "/api/auth/login") {
    return json({ error: "Password sign-in is disabled for the demo. Please sign in with Google." }, 410);
  }

  if (request.method === "POST" && path === "/api/auth/google") {
    return loginWithGoogle(request, env);
  }

  if (request.method === "GET" && path === "/api/auth/demo-admin") {
    return loginAsDemoAdmin(request, env);
  }

  if (request.method === "POST" && path === "/api/logout") {
    if (user?.email) {
      await env.DB.prepare("UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE email = ?")
        .bind(user.email).run();
    }
    const response = json({ user: null });
    response.headers.append("Set-Cookie", clearSessionCookie(request, HOST_SESSION_COOKIE));
    response.headers.append("Set-Cookie", clearSessionCookie(request, SESSION_COOKIE));
    return response;
  }

  if (request.method === "GET" && path === "/api/profile") {
    requireUser(user);
    return getProfile(env, user);
  }
  if (request.method === "PUT" && path === "/api/profile") {
    requireUser(user);
    return updateProfile(request, env, user);
  }

  if (request.method === "GET" && path === "/api/loyalty") {
    requireUser(user);
    return getLoyalty(env, user);
  }

  if (request.method === "GET" && path === "/api/addresses") {
    requireUser(user);
    return listAddresses(env, user);
  }
  if (request.method === "POST" && path === "/api/addresses") {
    requireUser(user);
    return createAddress(request, env, user);
  }
  if (request.method === "PUT" && path === "/api/addresses") {
    requireUser(user);
    return replaceAddresses(request, env, user);
  }

  const accountAddress = path.match(/^\/api\/addresses\/([^/]+)$/);
  if (accountAddress && request.method === "PATCH") {
    requireUser(user);
    return updateAddress(request, env, user, decodeURIComponent(accountAddress[1]));
  }
  if (accountAddress && request.method === "DELETE") {
    requireUser(user);
    return deleteAddress(env, user, decodeURIComponent(accountAddress[1]));
  }

  if (request.method === "GET" && path === "/api/products") {
    return listProducts(env, user, url.searchParams.get("scope") || "public", url.searchParams);
  }

  if (request.method === "POST" && path === "/api/analytics/track") {
    // First-party page-view beacon. Admin sessions are never counted so the
    // owner's own browsing does not pollute the visitor stats.
    if (user?.role === "admin") return json({ ok: true });
    return trackPageView(request, env);
  }

  if (request.method === "GET" && path === "/api/search") {
    const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
    const limit = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 40)));
    const vector = await vectorSearchProducts(env, query, limit);
    if (vector) return json(vector);
    const fallback = await listProducts(env, user, "public", new URLSearchParams({ q: query, view: "cards", limit: String(limit) }));
    const data = await fallback.json();
    return json({ products: data.products || [], engine: "keyword" });
  }

  if (request.method === "POST" && path === "/api/admin/search/reindex") {
    requireAdmin(user);
    if (!env.AI || !env.VEC) return json({ error: "Vector search is not configured on this deployment" }, 501);
    const result = await reindexProductVectors(env);
    return json(result);
  }

  if (request.method === "GET" && path === "/api/hero") {
    return listHeroSlides(env, false);
  }

  if (request.method === "GET" && path === "/api/storefront-settings") {
    return getStorefrontSettings(env);
  }

  if (request.method === "GET" && path === "/api/postal-lookup") {
    return lookupIndianPostalCode(url.searchParams.get("pin"));
  }

  if (request.method === "POST" && path === "/api/products") {
    requireUser(user);
    const response = await createProduct(request, env, user);
    if (response.ok) scheduleVectorReindex(env, ctx);
    return response;
  }

  if (request.method === "POST" && path === "/api/uploads/image") {
    requireUser(user);
    return uploadImage(request, env, user);
  }

  if (request.method === "GET" && path === "/api/orders") {
    requireUser(user);
    return listOrders(env, user, url.searchParams.get("scope") || "own");
  }

  if (request.method === "GET" && path === "/api/order-tracking") {
    return trackPublicOrder(env, url.searchParams.get("order_id"), url.searchParams.get("email"));
  }

  if (request.method === "POST" && path === "/api/orders") {
    return createOrder(request, env, user);
  }

  const orderAction = path.match(/^\/api\/orders\/([^/]+)\/(cancel|returns)$/);
  if (orderAction && request.method === "POST") {
    requireUser(user);
    const orderId = decodeURIComponent(orderAction[1]);
    return orderAction[2] === "cancel"
      ? cancelOwnOrder(request, env, user, orderId)
      : createReturnRequest(request, env, user, orderId);
  }

  if (request.method === "GET" && path === "/api/returns") {
    requireUser(user);
    return listReturns(env, user, url.searchParams.get("scope") || "own");
  }

  if (request.method === "GET" && path === "/api/restock-subscriptions") {
    requireUser(user);
    return listRestockSubscriptions(env, user);
  }

  if (request.method === "POST" && path === "/api/support/tickets") {
    return createSupportTicket(request, env, user);
  }
  if (request.method === "GET" && path === "/api/support/tickets") {
    requireUser(user);
    return listSupportTickets(env, user, "own");
  }
  const supportMessagesRoute = path.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
  if (supportMessagesRoute && ["GET", "POST"].includes(request.method)) {
    requireUser(user);
    const ticketId = decodeURIComponent(supportMessagesRoute[1]);
    return request.method === "GET"
      ? listSupportMessages(env, user, ticketId)
      : createSupportMessage(request, env, user, ticketId);
  }
  if (request.method === "POST" && path === "/api/restock-subscriptions") {
    requireUser(user);
    return createRestockSubscription(request, env, user);
  }
  if (request.method === "DELETE" && path === "/api/restock-subscriptions") {
    requireUser(user);
    return deleteRestockSubscription(request, env, user);
  }

  if (request.method === "GET" && path === "/api/health") {
    return healthCheck(env);
  }

  if (request.method === "POST" && path === "/api/coupons/validate") {
    requireUser(user);
    return validateCoupon(request, env, user);
  }

  if (request.method === "POST" && path === "/api/cart-events") {
    requireUser(user);
    return trackCartEvent(request, env, user);
  }

  if (request.method === "POST" && path === "/api/wishlist-events") {
    requireUser(user);
    return trackWishlistEvent(request, env, user);
  }

  if (["GET", "HEAD"].includes(request.method) && path.startsWith("/api/assets/")) {
    return serveR2Asset(env, path.replace("/api/assets/", ""), request.method === "HEAD");
  }

  const productResource = path.match(/^\/api\/products\/([^/]+)$/);
  if (productResource && request.method === "GET") {
    const context = url.searchParams.has("category") || url.searchParams.has("subcategory")
      ? { category: url.searchParams.get("category") || "", subcategory: url.searchParams.get("subcategory") || "" }
      : null;
    return getProduct(env, user, decodeURIComponent(productResource[1]), context);
  }
  if (productResource && request.method === "DELETE") {
    requireUser(user);
    const response = await deleteProduct(env, user, decodeURIComponent(productResource[1]));
    if (response.ok) scheduleVectorReindex(env, ctx);
    return response;
  }

  const productReviews = path.match(/^\/api\/products\/([^/]+)\/reviews$/);
  if (productReviews && request.method === "GET") {
    return listReviews(env, decodeURIComponent(productReviews[1]), user);
  }
  if (productReviews && request.method === "POST") {
    requireUser(user);
    return upsertReview(request, env, user, decodeURIComponent(productReviews[1]));
  }
  if (productReviews && request.method === "DELETE") {
    requireUser(user);
    return deleteOwnReview(env, user, decodeURIComponent(productReviews[1]));
  }

  const productQuestions = path.match(/^\/api\/products\/([^/]+)\/questions$/);
  if (productQuestions && request.method === "GET") {
    return listProductQuestions(env, decodeURIComponent(productQuestions[1]));
  }
  if (productQuestions && request.method === "POST") {
    requireUser(user);
    return createProductQuestion(request, env, user, decodeURIComponent(productQuestions[1]));
  }

  if (request.method === "GET" && path === "/api/my/reviews") {
    requireUser(user);
    return listMyReviews(env, user);
  }

  if (request.method === "GET" && path === "/api/admin/reviews") {
    requireAdmin(user);
    return listAllReviews(env);
  }

  if (request.method === "GET" && path === "/api/admin/questions") {
    requireAdmin(user);
    return listAllProductQuestions(env);
  }
  const adminQuestion = path.match(/^\/api\/admin\/questions\/([^/]+)$/);
  if (adminQuestion && request.method === "PATCH") {
    requireAdmin(user);
    return moderateProductQuestion(request, env, user, decodeURIComponent(adminQuestion[1]));
  }

  const adminReview = path.match(/^\/api\/admin\/reviews\/([^/]+)$/);
  if (adminReview && request.method === "PATCH") {
    requireAdmin(user);
    return moderateReview(request, env, decodeURIComponent(adminReview[1]));
  }
  if (adminReview && request.method === "DELETE") {
    requireAdmin(user);
    return deleteReview(env, decodeURIComponent(adminReview[1]));
  }

  if (request.method === "GET" && path === "/api/categories") {
    return listCategories(env);
  }

  if (request.method === "POST" && path === "/api/admin/categories") {
    requireAdmin(user);
    return createCategory(request, env);
  }

  const adminCategory = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (adminCategory && request.method === "DELETE") {
    requireAdmin(user);
    return deleteCategory(env, decodeURIComponent(adminCategory[1]));
  }

  if (request.method === "POST" && path === "/api/admin/subcategories") {
    requireAdmin(user);
    return createSubcategory(request, env);
  }

  const adminSubcategory = path.match(/^\/api\/admin\/subcategories\/([^/]+)\/([^/]+)$/);
  if (adminSubcategory && request.method === "DELETE") {
    requireAdmin(user);
    return deleteSubcategory(env, decodeURIComponent(adminSubcategory[1]), decodeURIComponent(adminSubcategory[2]));
  }

  const adminProduct = path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (adminProduct && request.method === "PATCH") {
    requireAdmin(user);
    const response = await updateProduct(request, env, decodeURIComponent(adminProduct[1]), user);
    if (response.ok) scheduleVectorReindex(env, ctx);
    return response;
  }

  const adminOrder = path.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (adminOrder && request.method === "PATCH") {
    requireAdmin(user);
    return updateOrderStatus(request, env, decodeURIComponent(adminOrder[1]), user);
  }

  const adminReturn = path.match(/^\/api\/admin\/returns\/([^/]+)$/);
  if (adminReturn && request.method === "PATCH") {
    requireAdmin(user);
    return updateReturnRequest(request, env, user, decodeURIComponent(adminReturn[1]));
  }

  if (request.method === "GET" && path === "/api/admin/email-events") {
    requireAdmin(user);
    return listEmailEvents(env);
  }
  const adminEmailEvent = path.match(/^\/api\/admin\/email-events\/([^/]+)\/retry$/);
  if (adminEmailEvent && request.method === "POST") {
    requireAdmin(user);
    return retryEmailEvent(env, decodeURIComponent(adminEmailEvent[1]), user);
  }
  if (request.method === "GET" && path === "/api/admin/audit-log") {
    requireAdmin(user);
    return listAuditLog(env);
  }
  if (request.method === "GET" && path === "/api/admin/backup") {
    requireAdmin(user);
    return exportBackup(env, user);
  }

  if (request.method === "GET" && path === "/api/admin/customers") {
    requireAdmin(user);
    return listCustomers(env);
  }

  if (request.method === "GET" && path === "/api/admin/tax-compliance") {
    requireAdmin(user);
    return taxComplianceReport(env);
  }

  if (request.method === "GET" && path === "/api/admin/tax-settings") {
    requireAdmin(user);
    return getTaxSettings(env);
  }

  if (request.method === "PATCH" && path === "/api/admin/tax-settings") {
    requireAdmin(user);
    return updateTaxSettings(request, env, user);
  }

  if (request.method === "GET" && path === "/api/admin/support/tickets") {
    requireAdmin(user);
    return listSupportTickets(env, user, "admin");
  }
  const adminSupportTicket = path.match(/^\/api\/admin\/support\/tickets\/([^/]+)$/);
  if (adminSupportTicket && request.method === "PATCH") {
    requireAdmin(user);
    return updateSupportTicket(request, env, user, decodeURIComponent(adminSupportTicket[1]));
  }

  if (request.method === "GET" && path === "/api/admin/dashboard") {
    requireAdmin(user);
    return dashboardStats(env);
  }

  if (request.method === "GET" && path === "/api/admin/google-analytics") {
    requireAdmin(user);
    return googleAnalyticsReport(env);
  }

  if (request.method === "GET" && path === "/api/admin/notifications") {
    requireAdmin(user);
    return listAdminNotifications(env);
  }
  if (request.method === "POST" && path === "/api/admin/notifications/read-all") {
    requireAdmin(user);
    await env.DB.prepare("UPDATE admin_notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE dismissed_at IS NULL").run();
    return listAdminNotifications(env);
  }
  if (request.method === "DELETE" && path === "/api/admin/notifications/cleared") {
    requireAdmin(user);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM admin_notifications WHERE (read_at IS NOT NULL OR dismissed_at IS NOT NULL) AND type NOT IN ('low_stock', 'out_of_stock')"),
      env.DB.prepare("UPDATE admin_notifications SET dismissed_at = CURRENT_TIMESTAMP WHERE type IN ('low_stock', 'out_of_stock') AND (read_at IS NOT NULL OR dismissed_at IS NOT NULL)")
    ]);
    return listAdminNotifications(env);
  }

  const adminNotification = path.match(/^\/api\/admin\/notifications\/([^/]+)$/);
  if (adminNotification && request.method === "PATCH") {
    requireAdmin(user);
    return updateAdminNotification(request, env, decodeURIComponent(adminNotification[1]));
  }

  if (request.method === "GET" && path === "/api/admin/hero") {
    requireAdmin(user);
    return listHeroSlides(env, true);
  }

  if (request.method === "GET" && path === "/api/admin/hero/insights") {
    requireAdmin(user);
    return heroInsights(env);
  }

  if (request.method === "GET" && path === "/api/admin/storefront-settings") {
    requireAdmin(user);
    return getStorefrontSettings(env, true);
  }

  if (request.method === "PUT" && path === "/api/admin/storefront-settings") {
    requireAdmin(user);
    return updateStorefrontSettings(request, env);
  }

  if (request.method === "POST" && path === "/api/admin/hero") {
    requireAdmin(user);
    return createHeroSlide(request, env);
  }

  const adminHero = path.match(/^\/api\/admin\/hero\/([^/]+)$/);
  if (adminHero && request.method === "PATCH") {
    requireAdmin(user);
    return updateHeroSlide(request, env, decodeURIComponent(adminHero[1]));
  }
  if (adminHero && request.method === "DELETE") {
    requireAdmin(user);
    return deleteHeroSlide(env, decodeURIComponent(adminHero[1]));
  }

  if (request.method === "GET" && path === "/api/admin/coupons") {
    requireAdmin(user);
    return listCoupons(env);
  }

  if (request.method === "POST" && path === "/api/admin/coupons") {
    requireAdmin(user);
    return createCoupon(request, env);
  }

  const adminCoupon = path.match(/^\/api\/admin\/coupons\/([^/]+)$/);
  if (adminCoupon && request.method === "DELETE") {
    requireAdmin(user);
    return deleteCoupon(env, decodeURIComponent(adminCoupon[1]));
  }

  if (request.method === "POST" && path === "/api/admin/reset") {
    requireAdmin(user);
    return resetProducts(env);
  }

  return json({ error: "Not found" }, 404);
}

async function loginWithGoogle(request, env) {
  const { credential, referral_code: referralCode } = await readJson(request);
  if (!credential) return json({ error: "Missing Google credential" }, 400);
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.includes("REPLACE_WITH")) {
    return json({ error: "Configure GOOGLE_CLIENT_ID in wrangler.jsonc" }, 500);
  }

  const profile = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
  if (!profile.email || profile.email_verified !== true) {
    return json({ error: "Google email must be verified" }, 401);
  }

  const email = profile.email.toLowerCase();
  const role = adminEmails(env, request).includes(email) ? "admin" : "seller";
  const user = {
    sub: profile.sub,
    email,
    name: profile.name || email,
    picture: profile.picture || "",
    role
  };

  const existing = await env.DB.prepare(
    "SELECT auth_email_sent_at, name, first_name FROM users WHERE email = ?"
  ).bind(user.email).first();
  const authEmailType = existing ? (!existing.auth_email_sent_at ? "first-login" : null) : "welcome";

  await env.DB.prepare(`
    INSERT INTO users (email, google_sub, name, picture, role, last_login_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      google_sub = excluded.google_sub,
      name = CASE WHEN COALESCE(users.first_name, '') <> '' THEN users.name ELSE excluded.name END,
      picture = excluded.picture,
      role = excluded.role,
      last_login_at = CURRENT_TIMESTAMP
  `).bind(user.email, user.sub, user.name, user.picture, user.role).run();

  const storedIdentity = await env.DB.prepare("SELECT name FROM users WHERE email = ?").bind(user.email).first();
  user.name = storedIdentity?.name || user.name;

  if (authEmailType) {
    const sent = await sendAuthEmail(env, user, authEmailType);
    if (sent) {
      await env.DB.prepare("UPDATE users SET auth_email_sent_at = CURRENT_TIMESTAMP WHERE email = ?")
        .bind(user.email).run();
    }
  }

  if (!existing && referralCode) {
    await applyReferral(env, user.email, referralCode).catch(() => null);
  }

  const profileStatus = role === "admin"
    ? { profile_complete: true, needs_profile_completion: false }
    : await getProfileCompletionStatus(env, user);
  const token = await signSession(user, env);
  return json({ user: { ...user, needs_profile_completion: profileStatus.needs_profile_completion }, ...profileStatus }, 200, {
    "Set-Cookie": makeSessionCookie(request, token)
  });
}

async function sendAuthEmail(env, user, type) {
  const apiKey = String(env.BREVO_API_KEY || "").trim();
  const fromEmail = String(env.BREVO_FROM_EMAIL || "").trim();
  if (!apiKey || !fromEmail || !user.email || user.email.endsWith("@glamia.local")) return false;

  const isWelcome = type === "welcome";
  const firstName = String(user.name || "there").trim().split(/\s+/)[0] || "there";
  const subject = isWelcome ? "Welcome to Glamia" : "New sign-in to your Glamia account";
  const intro = isWelcome
    ? "Your Glamia account is ready. Discover curated fashion from independent ateliers."
    : "Your Glamia account was signed in to for the first time since registration.";
  const htmlContent = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#241f18;line-height:1.6"><h1 style="letter-spacing:.18em">GLAMIA</h1><p>Hi ${escapeHtml(firstName)},</p><p>${intro}</p><p>If this was not you, please secure your Google account.</p><p>Warmly,<br>Team Glamia</p></body></html>`;
  const textContent = `Hi ${firstName},\n\n${intro}\n\nIf this was not you, please secure your Google account.\n\nWarmly,\nTeam Glamia`;

  return deliverBrevoEmail(env, {
    eventType: type,
    recipient: user.email,
    userEmail: user.email,
    payload: {
      sender: { name: env.BREVO_FROM_NAME || "Glamia", email: fromEmail },
      to: [{ email: user.email, name: user.name || user.email }],
      subject,
      htmlContent,
      textContent
    }
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[character]));
}

async function loginAsDemoAdmin(request, env, renderPage = false) {
  if (!isLocalDemoRequest(request, env)) return json({ error: "Not found" }, 404);
  const user = {
    sub: "demo-admin-local",
    email: DEMO_ADMIN_EMAIL,
    name: "Local Demo Admin",
    picture: "",
    role: "admin"
  };
  await env.DB.prepare(`
    INSERT INTO users (email, google_sub, name, picture, role, last_login_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      google_sub = excluded.google_sub,
      name = excluded.name,
      picture = excluded.picture,
      role = excluded.role,
      last_login_at = CURRENT_TIMESTAMP
  `).bind(user.email, user.sub, user.name, user.picture, user.role).run();
  const token = await signSession(user, env);
  const cookie = makeSessionCookie(request, token);
  if (renderPage) {
    const browserCookie = makeSessionCookie(request, token).replace(" HttpOnly", "");
    return new Response(`<!doctype html><title>Opening Glamia Admin</title><p>Opening the local admin console… <a href="/admin">Continue</a></p><script>document.cookie=${JSON.stringify(browserCookie)};location.replace('/admin')</script>`, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8", "Set-Cookie": cookie }
    });
  }
  return new Response(null, {
    status: 302,
    headers: { "Location": new URL("/admin", request.url).toString(), "Set-Cookie": cookie }
  });
}

async function verifyGoogleIdToken(token, clientId) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || token.split(".").length !== 3) {
    throw httpError("Invalid Google token", 401);
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecodeToString(encodedHeader));
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
  } catch {
    throw httpError("Invalid Google token", 401);
  }
  if (!header || typeof header !== "object" || !payload || typeof payload !== "object") {
    throw httpError("Invalid Google token", 401);
  }
  if (header.alg !== "RS256") throw httpError("Unsupported Google token algorithm", 401);

  const keys = await fetchGoogleKeys();
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw httpError("Google signing key not found", 401);

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!valid) throw httpError("Invalid Google token signature", 401);

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== clientId) throw httpError("Google token audience mismatch", 401);
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw httpError("Invalid Google token issuer", 401);
  if (Number(payload.exp) <= now) throw httpError("Google token expired", 401);
  return payload;
}

async function fetchGoogleKeys() {
  if (googleKeysCache.keys && googleKeysCache.expiresAt > Date.now()) return googleKeysCache.keys;
  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) throw httpError("Unable to fetch Google signing keys", 502);
  const body = await response.json();
  googleKeysCache = { keys: body.keys || [], expiresAt: Date.now() + 5 * 60 * 1000 };
  return googleKeysCache.keys;
}

const PRODUCT_SELECT = `
  SELECT p.*, AVG(r.rating) AS review_avg, COUNT(r.id) AS review_count
  FROM products p
  LEFT JOIN reviews r ON r.product_id = p.id AND r.status = 'visible'
`;

const PRODUCT_CARD_SELECT = `
  SELECT
    p.id, p.name, p.category, p.subcategory, p.brand, p.price, p.mrp, p.stock,
    p.rating, p.status, p.featured, p.color, p.material, p.sizes_json,
    p.image_url, p.thumbnail_url, p.thumbnail_images_json, p.variant_group,
    p.deal_starts_at, p.deal_ends_at, p.deal_price, p.reorder_point,
    p.preorder_enabled, p.preorder_release_at, p.preorder_limit, p.preorder_sold, p.created_at,
    AVG(r.rating) AS review_avg, COUNT(r.id) AS review_count
  FROM products p
  LEFT JOIN reviews r ON r.product_id = p.id AND r.status = 'visible'
`;

function productSearchQuery(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.slice(0, 8)
    .map(token => `"${token.replace(/"/g, "")}"*`)
    .join(" AND ") || "";
}

async function listProducts(env, user, scope, searchParams = new URLSearchParams()) {
  if (scope === "admin") {
    requireAdmin(user);
    return json({ products: await withSizeStock(env, await allProductRows(env)) });
  }
  if (scope === "seller") {
    requireUser(user);
    if (user.role === "admin") return json({ products: await withSizeStock(env, await allProductRows(env)) });
    const { results } = await env.DB.prepare(`${PRODUCT_SELECT} WHERE p.seller_email = ? GROUP BY p.id ORDER BY p.created_at DESC`)
      .bind(user.email)
      .all();
    return json({ products: await withSizeStock(env, results) });
  }

  const where = ["p.status = 'live'"];
  const bindings = [];
  const category = String(searchParams.get("category") || "").trim();
  const subcategory = String(searchParams.get("subcategory") || "").trim();
  const color = String(searchParams.get("color") || "").trim();
  const material = String(searchParams.get("material") || "").trim();
  const size = String(searchParams.get("size") || "").trim();
  const search = productSearchQuery(searchParams.get("q"));
  const minPrice = Number(searchParams.get("min_price"));
  const maxPrice = Number(searchParams.get("max_price"));
  if (category) { where.push("p.category = ?"); bindings.push(category); }
  if (subcategory) { where.push("p.subcategory = ?"); bindings.push(subcategory); }
  if (color) { where.push("LOWER(p.color) = LOWER(?)"); bindings.push(color); }
  if (material) { where.push("LOWER(p.material) = LOWER(?)"); bindings.push(material); }
  if (size) {
    where.push("EXISTS (SELECT 1 FROM product_sizes ps WHERE ps.product_id = p.id AND ps.size = ? AND ps.stock > 0)");
    bindings.push(size);
  }
  if (search) {
    where.push("p.id IN (SELECT product_id FROM product_search WHERE product_search MATCH ?)");
    bindings.push(search);
  }
  if (searchParams.get("in_stock") === "1") where.push("p.stock > 0");
  if (Number.isFinite(minPrice) && searchParams.has("min_price")) { where.push("p.price >= ?"); bindings.push(Math.max(0, Math.floor(minPrice))); }
  if (Number.isFinite(maxPrice) && searchParams.has("max_price")) { where.push("p.price <= ?"); bindings.push(Math.max(0, Math.floor(maxPrice))); }

  const sortSql = {
    featured: "p.featured DESC, p.rating DESC, p.created_at DESC",
    newest: "p.created_at DESC",
    price_low: "p.price ASC, p.created_at DESC",
    price_high: "p.price DESC, p.created_at DESC",
    rating: "p.rating DESC, p.created_at DESC"
  }[searchParams.get("sort") || "featured"] || "p.featured DESC, p.rating DESC, p.created_at DESC";
  const wantsCards = searchParams.get("view") === "cards";
  const requestedLimit = Number(searchParams.get("limit"));
  const hasPagination = Number.isSafeInteger(requestedLimit) && requestedLimit > 0;
  const limit = hasPagination ? Math.min(requestedLimit, 100) : null;
  const page = hasPagination ? Math.max(1, Math.floor(Number(searchParams.get("page")) || 1)) : 1;
  const offset = limit ? (page - 1) * limit : 0;
  const select = wantsCards ? PRODUCT_CARD_SELECT : PRODUCT_SELECT;
  const sql = `${select} WHERE ${where.join(" AND ")} GROUP BY p.id ORDER BY ${sortSql}${limit ? " LIMIT ? OFFSET ?" : ""}`;
  const queryBindings = limit ? [...bindings, limit, offset] : bindings;
  const { results } = await env.DB.prepare(sql).bind(...queryBindings).all();
  const products = await withSizeStock(env, results, wantsCards ? formatProductCard : formatProduct);
  if (!limit) return json({ products });
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM products p WHERE ${where.join(" AND ")}`)
    .bind(...bindings).first();
  const total = Number(count?.count || 0);
  return json({ products, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), has_more: offset + products.length < total } });
}

/* First-party page-view tracking: one D1 row per storefront page view.
   Bots are skipped, the visitor's IP is never stored, and only the referrer's
   hostname is kept (same-host referrals count as direct). */
async function trackPageView(request, env) {
  const userAgent = request.headers.get("User-Agent") || "";
  if (/bot|crawl|spider|slurp|headless|lighthouse|preview|monitor/i.test(userAgent)) return json({ ok: true });
  const body = await readJson(request).catch(() => ({}));
  const path = String(body.path || "/").slice(0, 200);
  if (!path.startsWith("/") || path.startsWith("/admin") || path.startsWith("/api")) return json({ ok: true });
  let referrerHost = "";
  const referrer = String(body.referrer || request.headers.get("Referer") || "");
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (host && host !== new URL(request.url).hostname) referrerHost = host;
  } catch { /* no usable referrer — counts as direct */ }
  const device = /mobile|android|iphone|ipod|ipad/i.test(userAgent) ? "mobile" : "desktop";
  const country = String(request.cf?.country || "").slice(0, 8);
  await env.DB.prepare("INSERT INTO page_views (id, path, referrer_host, device, country, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
    .bind(crypto.randomUUID(), path, referrerHost, device, country)
    .run();
  return json({ ok: true });
}

/* Vector (semantic) search: products and queries are embedded with Workers AI
   and ranked with Vectorize cosine similarity. Every helper degrades to null so
   callers fall back to the FTS keyword search whenever AI or Vectorize is
   unavailable (missing binding, quota, or an index that has not been created). */
const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";
const VECTOR_EMBED_BATCH = 50;

function productEmbeddingText(product) {
  return [
    product.name,
    product.brand,
    product.category,
    product.subcategory,
    product.color,
    product.material,
    product.description
  ].filter(Boolean).join(". ").slice(0, 2000);
}

async function embedTexts(env, texts) {
  const result = await env.AI.run(EMBEDDING_MODEL, { text: texts });
  const vectors = result?.data;
  if (!Array.isArray(vectors) || vectors.length !== texts.length) throw new Error("Embedding model returned no vectors");
  return vectors;
}

async function reindexProductVectors(env) {
  const { results } = await env.DB.prepare(`
    SELECT id, name, brand, category, subcategory, color, material, description
    FROM products
    WHERE status = 'live'
    ORDER BY created_at DESC
  `).all();
  let indexed = 0;
  for (let index = 0; index < results.length; index += VECTOR_EMBED_BATCH) {
    const rows = results.slice(index, index + VECTOR_EMBED_BATCH);
    const embeddings = await embedTexts(env, rows.map(productEmbeddingText));
    await env.VEC.upsert(rows.map((row, position) => ({ id: String(row.id), values: embeddings[position] })));
    indexed += rows.length;
  }
  return { indexed, skipped: false };
}

function scheduleVectorReindex(env, ctx) {
  if (!env.AI || !env.VEC || !ctx?.waitUntil) return;
  ctx.waitUntil(reindexProductVectors(env).catch(() => {}));
}

async function vectorSearchProducts(env, rawQuery, limit = 40) {
  const term = String(rawQuery || "").trim();
  if (!term) return { products: [], engine: "vector" };
  try {
    const [embedding] = await embedTexts(env, [term.slice(0, 512)]);
    if (!Array.isArray(embedding)) return null;
    const response = await env.VEC.query(embedding, { topK: Math.min(40, Math.max(1, limit)), returnMetadata: "none" });
    const hits = (response?.matches || []).map((match) => String(match.id));
    if (!hits.length) return { products: [], engine: "vector" };
    const placeholders = hits.map(() => "?").join(",");
    const { results } = await env.DB.prepare(`${PRODUCT_CARD_SELECT} WHERE p.status = 'live' AND p.id IN (${placeholders}) GROUP BY p.id`)
      .bind(...hits).all();
    const byId = new Map(results.map(row => [String(row.id), row]));
    const products = await withSizeStock(env, hits.map(id => byId.get(id)).filter(Boolean), formatProductCard);
    return { products, engine: "vector" };
  } catch {
    return null;
  }
}

/* Attach per-size stock maps, sold totals and deal fields to formatted products. */
async function withSizeStock(env, rows, formatter = formatProduct) {
  const products = rows.map(formatter);
  if (!products.length) return products;
  if (productEnrichmentCache.expiresAt <= Date.now()) {
    productEnrichmentCache = { expiresAt: Date.now() + 10000, entries: new Map() };
  }
  const ids = [...new Set(products.map(product => product.id).filter(Boolean))];
  const missingIds = ids.filter(id => !productEnrichmentCache.entries.has(id));
  if (missingIds.length) {
    const placeholders = missingIds.map(() => "?").join(",");
    const [sizeResult, salesResult] = await env.DB.batch([
      env.DB.prepare(`
        SELECT product_id, size, stock
        FROM product_sizes
        WHERE product_id IN (${placeholders})
      `).bind(...missingIds),
      env.DB.prepare(`
        SELECT oi.product_id,
          SUM(CASE WHEN o.status != 'cancelled' THEN oi.quantity ELSE 0 END) AS sold_total,
          SUM(CASE WHEN o.status != 'cancelled' AND o.created_at >= datetime('now', '-7 days') THEN oi.quantity ELSE 0 END) AS sold_7d
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id IN (${placeholders})
        GROUP BY oi.product_id
      `).bind(...missingIds)
    ]);
    for (const id of missingIds) {
      productEnrichmentCache.entries.set(id, { sizeStock: {}, sold: 0, soldRecent: 0 });
    }
    for (const row of sizeResult.results || []) {
      productEnrichmentCache.entries.get(row.product_id).sizeStock[row.size] = Number(row.stock || 0);
    }
    for (const row of salesResult.results || []) {
      const entry = productEnrichmentCache.entries.get(row.product_id);
      entry.sold = Number(row.sold_total || 0);
      entry.soldRecent = Number(row.sold_7d || 0);
    }
  }
  return products.map(product => {
    const metrics = productEnrichmentCache.entries.get(product.id);
    return {
      ...product,
      size_stock: Object.keys(metrics?.sizeStock || {}).length ? metrics.sizeStock : null,
      sold_total: metrics?.sold || 0,
      sold_7d: metrics?.soldRecent || 0
    };
  });
}

async function allProductRows(env) {
  const { results } = await env.DB.prepare(`${PRODUCT_SELECT} GROUP BY p.id ORDER BY p.created_at DESC`).all();
  return results;
}

/* Product references accept the canonical hierarchical URL's final slug,
   legacy /product/<slug> links, bare ids, and older slug-id links. The
   category/subcategory context disambiguates identical names safely. */
async function resolveProductReference(env, reference, context = null) {
  const value = String(reference || "").trim();
  if (!value) return "";
  const direct = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(value).first();
  if (direct) return String(direct.id);
  const { results } = await env.DB.prepare("SELECT id, name, category, subcategory FROM products WHERE status = 'live'").all();
  const candidates = results
    .map(row => ({ id: String(row.id), slug: slugifyName(row.name), category: productUrlSlug(row.category), subcategory: productUrlSlug(row.subcategory) }))
    .filter(row => row.slug);
  const normalizedValue = value.toLowerCase();
  const exact = candidates.filter(row => row.slug === normalizedValue);
  const canonical = candidates.filter(row => `${row.slug}-${row.id.toLowerCase()}` === normalizedValue);
  if (canonical.length === 1) return canonical[0].id;
  // Keep the short-id form compatible with the first rollout of this URL
  // system, so links shared during that window still reach the right item.
  const shortened = candidates.filter(row => `${row.slug}-${row.id.slice(0, 8).toLowerCase()}` === normalizedValue);
  if (shortened.length === 1) return shortened[0].id;
  const contextMatches = context
    ? candidates.filter(row => row.slug === normalizedValue && row.category === productUrlSlug(context.category) && row.subcategory === productUrlSlug(context.subcategory))
    : [];
  if (contextMatches.length === 1) return contextMatches[0].id;
  if (exact.length === 1) return exact[0].id;
  // Tolerate links saved under an older name: <old-slug>-<8-char-id> resolves
  // while the trailing id chunk still identifies the listing.
  for (const candidate of candidates) {
    for (const token of [candidate.id.toLowerCase(), candidate.id.slice(0, 8).toLowerCase()]) {
      if (!token || !normalizedValue.endsWith(`-${token}`)) continue;
      const prefix = normalizedValue.slice(0, -(token.length + 1));
      if (candidate.slug === prefix || candidate.slug.startsWith(`${prefix}-`) || prefix.startsWith(candidate.slug)) return candidate.id;
    }
  }
  // Never guess when a plain name is shared by multiple live listings. The
  // canonical URL always carries the stable id suffix, so an ambiguous alias
  // must fail rather than exposing the wrong product.
  return "";
}

async function getProduct(env, user, reference, context = null) {
  const canManage = user?.role === "admin";
  const sellerEmail = String(user?.email || "").toLowerCase();
  const resolvedId = await resolveProductReference(env, reference, context);
  if (!resolvedId) return json({ error: "Product not found" }, 404);
  const row = await env.DB.prepare(`${PRODUCT_SELECT}
    WHERE p.id = ? AND (p.status = 'live' OR ? = 1 OR LOWER(p.seller_email) = ?)
    GROUP BY p.id`)
    .bind(resolvedId, canManage ? 1 : 0, sellerEmail)
    .first();
  if (!row) return json({ error: "Product not found" }, 404);
  const [product] = await withSizeStock(env, [row]);
  let colourways = [];
  if (product.variant_group) {
    const { results } = await env.DB.prepare(`${PRODUCT_SELECT}
      WHERE p.variant_group = ? AND (p.status = 'live' OR ? = 1 OR LOWER(p.seller_email) = ?)
      GROUP BY p.id ORDER BY p.created_at ASC`)
      .bind(product.variant_group, canManage ? 1 : 0, sellerEmail)
      .all();
    colourways = await withSizeStock(env, results);
  }
  return json({ product, colourways });
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function heroArray(value) {
  return jsonArray(value);
}

function formatHeroSlide(row, productsById) {
  const productIds = heroArray(row.product_ids_json)
    .map(id => String(id || "").trim())
    .filter((id, index, all) => id && all.indexOf(id) === index)
    .slice(0, 3);
  const frames = productIds
    .map(id => productsById.get(id))
    .filter(Boolean)
    .map(product => ({
      id: product.id,
      name: product.name,
      image: product.image,
      color: product.color
    }));
  return {
    id: row.id,
    eyebrow: row.eyebrow,
    title: row.title,
    tagline: row.tagline,
    cta_label: row.cta_label,
    cta_category: row.cta_category,
    product_ids: productIds,
    frames,
    words: heroArray(row.words_json).map(word => String(word || "").trim().toUpperCase()).filter(Boolean).slice(0, 5),
    position: Number(row.position) || 0,
    active: Boolean(row.active),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function listHeroSlides(env, admin = false) {
  const slideQuery = admin
    ? "SELECT * FROM hero_slides ORDER BY position ASC, created_at ASC"
    : "SELECT * FROM hero_slides WHERE active = 1 ORDER BY position ASC, created_at ASC";
  const [{ results: rows }, productRows] = await Promise.all([
    env.DB.prepare(slideQuery).all(),
    allProductRows(env)
  ]);
  const productsById = new Map(productRows.filter(row => row.status === "live").map(row => {
    const product = formatProduct(row);
    return [product.id, product];
  }));
  const slides = rows.map(row => formatHeroSlide(row, productsById));
  return json({ slides: admin ? slides : slides.filter(slide => slide.frames.length) });
}

function heroText(value, fallback, max) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, max);
}

function announcementText(value, fallback = "") {
  return String(value === undefined || value === null ? fallback : value).trim().slice(0, 160);
}

function normalizeAnnouncementItems(value, strict = false) {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const [index, item] of value.slice(0, 10).entries()) {
    const text = announcementText(item?.text);
    const startsAt = String(item?.starts_at ?? item?.startsAt ?? "").trim();
    const endsAt = String(item?.ends_at ?? item?.endsAt ?? "").trim();
    if (!text && !startsAt && !endsAt) continue;
    const startMs = startsAt ? Date.parse(startsAt) : 0;
    const endMs = endsAt ? Date.parse(endsAt) : NaN;
    if (!text || !endsAt || !Number.isFinite(endMs) || (startsAt && !Number.isFinite(startMs)) || (startsAt && endMs <= startMs)) {
      if (strict) throw httpError(`Scheduled announcement ${index + 1} needs text, a valid start time, and an end time after it`, 400);
      continue;
    }
    items.push({
      id: String(item?.id || `announcement-${index + 1}`).trim().slice(0, 100),
      text,
      starts_at: startsAt,
      ends_at: endsAt
    });
  }
  return items;
}

function heroProductIds(body) {
  if (!Array.isArray(body.product_ids)) return [];
  return [...new Set(body.product_ids.map(id => String(id || "").trim()).filter(Boolean))].slice(0, 3);
}

async function validateHeroPayload(body, env) {
  const title = heroText(body.title, "", 100);
  const tagline = heroText(body.tagline, "", 240);
  if (title.length < 2 || title.length > 100) throw httpError("Hero headline must be 2–100 characters", 400);
  if (tagline.length < 2 || tagline.length > 240) throw httpError("Hero tagline must be 2–240 characters", 400);
  const productIds = heroProductIds(body);
  if (!productIds.length) throw httpError("Select at least one live product for the hero slide", 400);
  if (productIds.length > 3) throw httpError("A hero slide can show at most 3 products", 400);
  const placeholders = productIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT id FROM products WHERE id IN (${placeholders}) AND status = 'live'`)
    .bind(...productIds).all();
  const liveIds = new Set(results.map(row => row.id));
  const missing = productIds.find(id => !liveIds.has(id));
  if (missing) throw httpError("Hero slides can only use live products", 400);
  const words = Array.isArray(body.words)
    ? [...new Set(body.words.map(word => String(word || "").trim().toUpperCase()).filter(Boolean))].slice(0, 5)
    : [];
  return {
    eyebrow: heroText(body.eyebrow, "The Glamia Edit", 60),
    title,
    tagline,
    ctaLabel: heroText(body.cta_label, "Shop now", 40),
    ctaCategory: String(body.cta_category || "").trim(),
    productIds,
    words,
    active: body.active === undefined ? true : Boolean(body.active),
    position: Number.isSafeInteger(Number(body.position)) && Number(body.position) >= 0 ? Number(body.position) : null
  };
}

async function createHeroSlide(request, env) {
  const body = await readJson(request);
  const next = await validateHeroPayload(body, env);
  const last = await env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS position FROM hero_slides").first();
  const id = crypto.randomUUID();
  const position = next.position ?? Number(last?.position || -1) + 1;
  await env.DB.prepare(`
    INSERT INTO hero_slides (
      id, eyebrow, title, tagline, cta_label, cta_category, product_ids_json,
      words_json, position, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, next.eyebrow, next.title, next.tagline, next.ctaLabel, next.ctaCategory,
    JSON.stringify(next.productIds), JSON.stringify(next.words), position, next.active ? 1 : 0
  ).run();
  return json({ ok: true, id }, 201);
}

async function updateHeroSlide(request, env, id) {
  const current = await env.DB.prepare("SELECT * FROM hero_slides WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Hero slide not found" }, 404);
  const body = await readJson(request);
  const merged = {
    eyebrow: body.eyebrow ?? current.eyebrow,
    title: body.title ?? current.title,
    tagline: body.tagline ?? current.tagline,
    cta_label: body.cta_label ?? current.cta_label,
    cta_category: body.cta_category ?? current.cta_category,
    product_ids: body.product_ids ?? heroArray(current.product_ids_json),
    words: body.words ?? heroArray(current.words_json),
    active: body.active === undefined ? Boolean(current.active) : body.active,
    position: body.position === undefined ? Number(current.position) : body.position
  };
  const next = await validateHeroPayload(merged, env);
  await env.DB.prepare(`
    UPDATE hero_slides SET eyebrow = ?, title = ?, tagline = ?, cta_label = ?,
      cta_category = ?, product_ids_json = ?, words_json = ?, position = ?,
      active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(
    next.eyebrow, next.title, next.tagline, next.ctaLabel, next.ctaCategory,
    JSON.stringify(next.productIds), JSON.stringify(next.words),
    next.position ?? Number(current.position), next.active ? 1 : 0, id
  ).run();
  return json({ ok: true, id });
}

async function deleteHeroSlide(env, id) {
  const result = await env.DB.prepare("DELETE FROM hero_slides WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return json({ error: "Hero slide not found" }, 404);
  return json({ ok: true });
}

async function heroInsights(env) {
  const [productRows, salesRows, cartRows, wishRows] = await Promise.all([
    allProductRows(env),
    env.DB.prepare(`
      SELECT oi.product_id,
        SUM(CASE WHEN o.status != 'cancelled' THEN oi.quantity ELSE 0 END) AS units,
        SUM(CASE WHEN o.status != 'cancelled' THEN
          CASE WHEN o.subtotal > 0
            THEN MAX(0, oi.unit_price * oi.quantity - CAST(ROUND(
              COALESCE(o.discount, 0) * 1.0 * (oi.unit_price * oi.quantity) / o.subtotal
            ) AS INTEGER))
            ELSE oi.unit_price * oi.quantity
          END
          ELSE 0 END) AS revenue,
        COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END) AS orders,
        COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) AS cancelled,
        COUNT(DISTINCT o.id) AS total_orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      GROUP BY oi.product_id
    `).all(),
    env.DB.prepare("SELECT product_id, quantity FROM cart_adds").all(),
    env.DB.prepare("SELECT product_id FROM wishlist_adds").all()
  ]);
  const products = productRows.map(formatProduct);
  const metrics = {};
  const ensure = id => (metrics[id] ||= { units: 0, revenue: 0, orders: 0, cancelled: 0, cart_adds: 0, wishlists: 0 });
  for (const row of salesRows.results) {
    const entry = ensure(row.product_id);
    entry.units = Number(row.units || 0);
    entry.revenue = Number(row.revenue || 0);
    entry.orders = Number(row.orders || 0);
    entry.cancelled = Number(row.cancelled || 0);
    entry.total_orders = Number(row.total_orders || 0);
  }
  for (const row of cartRows.results) ensure(row.product_id).cart_adds += Number(row.quantity) || 1;
  for (const row of wishRows.results) ensure(row.product_id).wishlists += 1;
  const enriched = products.map(product => {
    const m = metrics[product.id] || ensure(product.id);
    const orderCount = m.orders;
    const totalOrderCount = m.total_orders || orderCount + m.cancelled;
    return {
      id: product.id,
      name: product.name,
      color: product.color,
      category: product.category,
      subcategory: product.subcategory,
      image: product.image,
      rating: Number(product.rating) || 0,
      review_count: product.review_count,
      created_at: product.created_at,
      units: m.units,
      revenue: m.revenue,
      orders: orderCount,
      cart_adds: m.cart_adds,
      wishlists: m.wishlists,
      cancellation_rate: totalOrderCount ? Math.round((m.cancelled / totalOrderCount) * 1000) / 10 : null
    };
  });
  const by = (compare, limit = 6) => [...enriched].sort(compare).slice(0, limit);
  const dateValue = product => new Date(product.created_at || 0).getTime() || 0;
  const byUnits = (a, b) => b.units - a.units || b.revenue - a.revenue;
  const byRating = (a, b) => b.rating - a.rating || b.review_count - a.review_count;
  const byReviews = (a, b) => b.review_count - a.review_count || b.rating - a.rating;
  const withOrderHistory = enriched.filter(product => product.orders > 0);
  const lowReturnRate = [...(withOrderHistory.length ? withOrderHistory : enriched)]
    .sort((a, b) => (a.cancellation_rate ?? 0) - (b.cancellation_rate ?? 0) || byUnits(a, b)).slice(0, 6);
  return json({
    recommendations: {
      best_selling: by(byUnits),
      new_arrivals: by((a, b) => dateValue(b) - dateValue(a)),
      top_rated: by(byRating),
      top_reviewed: by(byReviews),
      low_return_rate: lowReturnRate
    },
    return_metric: "cancellation_rate",
    return_note: "Actual returns are not recorded yet; cancellation rate is shown as a conservative proxy.",
    products: enriched
  });
}

const STOREFRONT_DEFAULTS = {
  announcement: {
    visible: true,
    text: "Complimentary shipping across India · Demo checkout available",
    items: []
  },
  trust_strip: {
    visible: true,
    items: [
      { id: "shipping", visible: true, title: "Free & Fast Shipping", body: "Complimentary on every order" },
      { id: "returns", visible: true, title: "7-Day Easy Returns", body: "Simple exchanges, no questions" },
      { id: "cod", visible: true, title: "Demo Checkout", body: "No money is charged" }
    ]
  },
  fulfillment: {
    warehouse_address: ""
  },
  payments: {
    cod_enabled: true
  },
  support_contact: {
    visible: false,
    country_code: "+91",
    phone_number: ""
  }
};

function parseSettingObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function storefrontSettingsObject(env, includePrivate = false) {
  const { results } = await env.DB.prepare("SELECT setting_key, value_json FROM storefront_settings").all();
  const raw = Object.fromEntries(results.map(row => [row.setting_key, parseSettingObject(row.value_json)]));
  const announcementTextValue = announcementText(raw.announcement?.text, STOREFRONT_DEFAULTS.announcement.text);
  const allAnnouncementItems = normalizeAnnouncementItems(raw.announcement?.items);
  const now = Date.now();
  const announcement = {
    visible: (raw.announcement?.visible === undefined ? STOREFRONT_DEFAULTS.announcement.visible : Boolean(raw.announcement.visible)) && Boolean(announcementTextValue),
    text: announcementTextValue,
    items: includePrivate ? allAnnouncementItems : allAnnouncementItems.filter(item => (!item.starts_at || Date.parse(item.starts_at) <= now) && Date.parse(item.ends_at) > now)
  };
  const rawItems = Array.isArray(raw.trust_strip?.items) ? raw.trust_strip.items : [];
  const items = STOREFRONT_DEFAULTS.trust_strip.items.map(defaultItem => {
    const item = rawItems.find(entry => entry?.id === defaultItem.id) || {};
    return {
      id: defaultItem.id,
      visible: item.visible === undefined ? defaultItem.visible : Boolean(item.visible),
      title: heroText(item.title, defaultItem.title, 70),
      body: heroText(item.body, defaultItem.body, 120)
    };
  });
  const supportContactVisible = raw.support_contact?.visible === undefined ? STOREFRONT_DEFAULTS.support_contact.visible : Boolean(raw.support_contact.visible);
  const supportContact = {
    visible: supportContactVisible,
    country_code: String(raw.support_contact?.country_code || STOREFRONT_DEFAULTS.support_contact.country_code),
    phone_number: includePrivate || supportContactVisible ? String(raw.support_contact?.phone_number || "") : ""
  };
  return {
    announcement,
    trust_strip: {
      visible: raw.trust_strip?.visible === undefined ? true : Boolean(raw.trust_strip.visible),
      items
    },
    fulfillment: {
      warehouse_address: heroText(raw.fulfillment?.warehouse_address, STOREFRONT_DEFAULTS.fulfillment.warehouse_address, 320)
    },
    payments: {
      cod_enabled: raw.payments?.cod_enabled === undefined ? STOREFRONT_DEFAULTS.payments.cod_enabled : Boolean(raw.payments.cod_enabled)
    },
    support_contact: supportContact,
    seo: {
      title: heroText(raw.seo?.title, "Glamia — Curated apparel for every wardrobe", 120),
      description: heroText(raw.seo?.description, "Discover refined everyday pieces, occasionwear, and accessories from independent ateliers.", 220),
      image: heroText(raw.seo?.image, "", 500)
    }
  };
}

async function getStorefrontSettings(env, includePrivate = false) {
  const settings = await storefrontSettingsObject(env, includePrivate);
  if (!includePrivate) delete settings.fulfillment;
  return json(settings);
}

async function updateStorefrontSettings(request, env) {
  const body = await readJson(request);
  const current = await storefrontSettingsObject(env, true);
  const nextAnnouncement = body.announcement && typeof body.announcement === "object"
    ? body.announcement
    : current.announcement;
  const nextTrust = body.trust_strip && typeof body.trust_strip === "object"
    ? body.trust_strip
    : current.trust_strip;
  const nextFulfillment = body.fulfillment && typeof body.fulfillment === "object"
    ? body.fulfillment
    : current.fulfillment;
  const nextPayments = body.payments && typeof body.payments === "object"
    ? body.payments
    : current.payments;
  const nextSupportContact = body.support_contact && typeof body.support_contact === "object"
    ? body.support_contact
    : current.support_contact;
  const nextSeo = body.seo && typeof body.seo === "object" ? body.seo : current.seo;
  const announcementTextValue = announcementText(nextAnnouncement.text, current.announcement.text);
  const announcementVisible = nextAnnouncement.visible === undefined ? current.announcement.visible : Boolean(nextAnnouncement.visible);
  if (announcementVisible && !announcementTextValue) throw httpError("Add permanent announcement text before showing the announcement bar", 400);
  const announcement = {
    visible: announcementVisible && Boolean(announcementTextValue),
    text: announcementTextValue,
    items: normalizeAnnouncementItems(nextAnnouncement.items === undefined ? current.announcement.items : nextAnnouncement.items, true)
  };
  const submittedItems = Array.isArray(nextTrust.items) ? nextTrust.items : current.trust_strip.items;
  const trustItems = STOREFRONT_DEFAULTS.trust_strip.items.map(defaultItem => {
    const item = submittedItems.find(entry => entry?.id === defaultItem.id) || current.trust_strip.items.find(entry => entry.id === defaultItem.id) || defaultItem;
    return {
      id: defaultItem.id,
      visible: item.visible === undefined ? defaultItem.visible : Boolean(item.visible),
      title: heroText(item.title, defaultItem.title, 70),
      body: heroText(item.body, defaultItem.body, 120)
    };
  });
  const trustStrip = {
    visible: nextTrust.visible === undefined ? current.trust_strip.visible : Boolean(nextTrust.visible),
    items: trustItems
  };
  const fulfillment = {
    warehouse_address: heroText(nextFulfillment.warehouse_address, current.fulfillment.warehouse_address, 320)
  };
  const payments = {
    cod_enabled: nextPayments.cod_enabled === undefined ? current.payments.cod_enabled : Boolean(nextPayments.cod_enabled)
  };
  const supportContact = {
    visible: nextSupportContact.visible === undefined ? current.support_contact.visible : Boolean(nextSupportContact.visible),
    country_code: normalizePhoneCountryCode(nextSupportContact.country_code),
    phone_number: nextSupportContact.phone_number ? normalizePhoneNumber(nextSupportContact.phone_number) : ""
  };
  if (supportContact.visible && !supportContact.phone_number) throw httpError("Add a support mobile number before showing it", 400);
  const seo = {
    title: heroText(nextSeo.title, current.seo.title, 120),
    description: heroText(nextSeo.description, current.seo.description, 220),
    image: heroText(nextSeo.image, current.seo.image, 500)
  };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("announcement", JSON.stringify(announcement)),
    env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("trust_strip", JSON.stringify(trustStrip)),
    env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("fulfillment", JSON.stringify(fulfillment)),
    env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("payments", JSON.stringify(payments)),
    env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("support_contact", JSON.stringify(supportContact)),
    env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("seo", JSON.stringify(seo))
  ]);
  return json({ ok: true, announcement, trust_strip: trustStrip, fulfillment, payments, support_contact: supportContact, seo });
}

function splitProfileName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts.at(-1)
  };
}

function capitalizeProfileNamePart(value) {
  return String(value || "").trim().replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

function normalizeProfileNamePart(value, label, required) {
  const part = String(value || "").trim();
  if (required && !part) throw httpError(`${label} is required`, 400);
  if (part.length > 60) throw httpError(`${label} must be 60 characters or fewer`, 400);
  if (part && !/^[\p{L}\p{M}\s.\-'’]+$/u.test(part)) {
    throw httpError(`${label} contains unsupported characters`, 400);
  }
  return capitalizeProfileNamePart(part);
}

const PROFILE_GENDERS = new Set(["female", "male", "non_binary", "prefer_not_to_say"]);

function birthdayChangeAvailableAt(row) {
  if (!row?.dob || !row?.dob_updated_at) return null;
  const raw = String(row.dob_updated_at).trim();
  const timestamp = Date.parse(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  if (!Number.isFinite(timestamp)) return null;
  const next = new Date(timestamp);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next.toISOString();
}

function formatProfile(row, user) {
  const fallback = splitProfileName(row?.name || user?.name || "");
  const hasStructuredName = Boolean(String(row?.first_name || "").trim() || String(row?.last_name || "").trim());
  const firstName = capitalizeProfileNamePart(hasStructuredName ? row.first_name : fallback.firstName);
  const middleName = capitalizeProfileNamePart(hasStructuredName ? row.middle_name : fallback.middleName);
  const lastName = capitalizeProfileNamePart(hasStructuredName ? row.last_name : fallback.lastName);
  const name = [firstName, middleName, lastName].filter(Boolean).join(" ") || row?.name || user?.name || user?.email || "";
  const dobChangeAvailableAt = birthdayChangeAvailableAt(row);
  return {
    name,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    dob: row?.dob || "",
    gender: row?.gender || "",
    phone: row?.phone || "",
    dob_updated_at: row?.dob_updated_at || null,
    dob_change_available_at: dobChangeAvailableAt,
    can_change_dob: !row?.dob || !dobChangeAvailableAt || Date.now() >= Date.parse(dobChangeAvailableAt)
  };
}

async function profileRow(env, email) {
  return env.DB.prepare(`
    SELECT name, first_name, middle_name, last_name, dob, gender, phone, dob_updated_at
    FROM users WHERE email = ?
  `).bind(email).first();
}

function normalizePhoneCountryCode(value) {
  const code = String(value || "+91").trim().replace(/\s+/g, "");
  if (!/^\+\d{1,4}$/.test(code)) throw httpError("Choose a valid country calling code", 400);
  return code;
}

function normalizePhoneNumber(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!raw || !/^[\d\s().-]{4,24}$/.test(raw) || digits.length < 4 || digits.length > 15) {
    throw httpError("Enter a valid mobile number", 400);
  }
  return digits;
}

function formatPhone(countryCode, phoneNumber) {
  return `${countryCode} ${phoneNumber}`.trim();
}

function normalizeProfilePhones(value) {
  if (!Array.isArray(value)) throw httpError("Phone numbers must be a list", 400);
  if (value.length > 5) throw httpError("You can save up to 5 mobile numbers", 400);
  const seen = new Set();
  const phones = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw httpError(`Mobile number ${index + 1} is invalid`, 400);
    const countryCode = normalizePhoneCountryCode(item.country_code ?? item.countryCode);
    const phoneNumber = normalizePhoneNumber(item.phone_number ?? item.number ?? item.phone);
    const key = `${countryCode}:${phoneNumber}`;
    if (seen.has(key)) throw httpError("The same mobile number cannot be added twice", 409);
    seen.add(key);
    return {
      id: String(item.id || crypto.randomUUID()).trim().slice(0, 100),
      label: String(item.label || "").trim().slice(0, 40),
      country_code: countryCode,
      phone_number: phoneNumber,
      is_primary: Boolean(item.is_primary ?? item.isPrimary) || index === 0
    };
  });
  if (phones.length) {
    const primaryIndex = Math.max(0, phones.findIndex(item => item.is_primary));
    phones.forEach((item, index) => { item.is_primary = index === primaryIndex; });
  }
  return phones;
}

async function profilePhones(env, email, legacyPhone = "") {
  const { results } = await env.DB.prepare(`
    SELECT id, label, country_code, phone_number, is_primary, created_at, updated_at
    FROM profile_phones
    WHERE user_email = ?
    ORDER BY is_primary DESC, updated_at DESC, created_at DESC
  `).bind(email).all();
  if (results.length) return results.map(row => ({
    id: row.id,
    label: row.label || "",
    country_code: row.country_code || "+91",
    phone_number: row.phone_number,
    phone: formatPhone(row.country_code || "+91", row.phone_number),
    is_primary: Boolean(row.is_primary)
  }));
  if (!legacyPhone) return [];
  const digits = String(legacyPhone).replace(/\D/g, "");
  if (!digits) return [];
  const countryCode = String(legacyPhone).trim().startsWith("+") && digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : "+91";
  const phoneNumber = countryCode === "+91" ? digits.slice(-10) : digits.slice(countryCode.length - 1);
  return [{ id: "legacy-primary", label: "", country_code: countryCode, phone_number: phoneNumber, phone: formatPhone(countryCode, phoneNumber), is_primary: true }];
}

function validProfileDob(value) {
  const dob = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const parsed = new Date(`${dob}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dob && parsed <= new Date();
}

function profileIsComplete(row) {
  const firstName = String(row?.first_name || "").trim();
  const lastName = String(row?.last_name || "").trim();
  const phoneDigits = String(row?.phone || "").replace(/\D/g, "");
  return Boolean(firstName && lastName && phoneDigits.length >= 4 && phoneDigits.length <= 20 && validProfileDob(row?.dob) && PROFILE_GENDERS.has(String(row?.gender || "").trim()));
}

async function getProfileCompletionStatus(env, user) {
  const row = await profileRow(env, user.email);
  const complete = profileIsComplete(row);
  return { profile_complete: complete, needs_profile_completion: !complete };
}

async function getProfile(env, user) {
  const row = await profileRow(env, user.email);
  return json({ ...formatProfile(row, user), phones: await profilePhones(env, user.email, row?.phone || "") });
}

async function updateProfile(request, env, user) {
  const body = await readJson(request);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO users (email, google_sub, name, role)
    VALUES (?, ?, ?, ?)
  `).bind(user.email, user.sub, user.name || user.email, user.role).run();

  const current = await profileRow(env, user.email);
  const currentProfile = formatProfile(current, user);
  const nameWasProvided = ["first_name", "middle_name", "last_name", "firstName", "middleName", "lastName"]
    .some(key => Object.prototype.hasOwnProperty.call(body, key));
  const firstName = normalizeProfileNamePart(
    nameWasProvided ? (body.first_name ?? body.firstName) : currentProfile.first_name,
    "First name",
    nameWasProvided
  );
  const middleName = normalizeProfileNamePart(
    nameWasProvided ? (body.middle_name ?? body.middleName) : currentProfile.middle_name,
    "Middle name",
    false
  );
  const lastName = normalizeProfileNamePart(
    nameWasProvided ? (body.last_name ?? body.lastName) : currentProfile.last_name,
    "Last name",
    nameWasProvided
  );
  const name = [firstName, middleName, lastName].filter(Boolean).join(" ") || current?.name || user.name || user.email;
  const phone = Object.prototype.hasOwnProperty.call(body, "phone")
    ? String(body.phone || "").trim()
    : String(current?.phone || "").trim();
  const phones = Object.prototype.hasOwnProperty.call(body, "phones")
    ? normalizeProfilePhones(body.phones)
    : null;
  const primaryPhone = phones?.find(item => item.is_primary) || phones?.[0] || null;
  const storedPhone = phones
    ? (primaryPhone ? formatPhone(primaryPhone.country_code, primaryPhone.phone_number) : "")
    : phone;
  const dob = Object.prototype.hasOwnProperty.call(body, "dob")
    ? String(body.dob || "").trim()
    : String(current?.dob || "").trim();
  const gender = Object.prototype.hasOwnProperty.call(body, "gender")
    ? String(body.gender || "").trim()
    : String(current?.gender || "").trim();

  if (gender && !PROFILE_GENDERS.has(gender)) throw httpError("Choose a valid gender option", 400);

  if (!phones && phone) {
    const phoneDigits = phone.replace(/\D/g, "");
    if (phone.length > 30 || !/^[+()\-\s./#xX\d]{6,30}$/.test(phone) || phoneDigits.length < 6 || phoneDigits.length > 20) {
      throw httpError("Enter a valid mobile number", 400);
    }
  }
  if (current?.dob && !dob) throw httpError("Date of birth cannot be removed once saved", 400);
  if (dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw httpError("Date of birth must be a valid date", 400);
    const parsedDob = new Date(`${dob}T00:00:00Z`);
    if (Number.isNaN(parsedDob.getTime()) || parsedDob.toISOString().slice(0, 10) !== dob || parsedDob > new Date()) {
      throw httpError("Date of birth must be a valid past date", 400);
    }
  }

  const dobChanged = String(current?.dob || "") !== dob;
  if (dobChanged && !currentProfile.can_change_dob) {
    const available = currentProfile.dob_change_available_at?.slice(0, 10);
    throw httpError(`Birthday can only be changed once every 12 months${available ? `. You can change it again on ${available}` : ""}`, 409);
  }

  const result = await env.DB.prepare(`
    UPDATE users SET
      name = ?, first_name = ?, middle_name = ?, last_name = ?, phone = ?, dob = ?, gender = ?,
      dob_updated_at = CASE WHEN COALESCE(dob, '') <> ? THEN CURRENT_TIMESTAMP ELSE dob_updated_at END
    WHERE email = ?
      AND (
        COALESCE(dob, '') = ?
        OR dob_updated_at IS NULL
        OR datetime(dob_updated_at, '+1 year') <= CURRENT_TIMESTAMP
      )
  `).bind(name, firstName, middleName, lastName, storedPhone, dob, gender, dob, user.email, dob).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    const latest = formatProfile(await profileRow(env, user.email), user);
    const available = latest.dob_change_available_at?.slice(0, 10);
    throw httpError(`Birthday can only be changed once every 12 months${available ? `. You can change it again on ${available}` : ""}`, 409);
  }

  if (phones) {
    const statements = [env.DB.prepare("DELETE FROM profile_phones WHERE user_email = ?").bind(user.email)];
    phones.forEach(phoneEntry => statements.push(env.DB.prepare(`
      INSERT INTO profile_phones (id, user_email, label, country_code, phone_number, is_primary)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(phoneEntry.id, user.email, phoneEntry.label, phoneEntry.country_code, phoneEntry.phone_number, phoneEntry.is_primary ? 1 : 0)));
    await env.DB.batch(statements);
  }
  const updatedRow = await profileRow(env, user.email);
  const updated = { ...formatProfile(updatedRow, { ...user, name }), phones: await profilePhones(env, user.email, updatedRow?.phone || "") };
  const token = await signSession({ ...user, name: updated.name }, env);
  return json(updated, 200, {
    "Set-Cookie": makeSessionCookie(request, token)
  });
}

function normalizeAddressInput(raw, fallbackId = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw httpError("Address details are required", 400);
  }
  const country = raw.country === undefined || raw.country === null ? "India" : raw.country;
  const address = {
    id: String(fallbackId || raw.id || crypto.randomUUID()).trim().slice(0, 100),
    name: String(raw.name || "").trim().slice(0, 100),
    phone: String(raw.phone || "").trim().slice(0, 30),
    line1: String(raw.line1 || "").trim().slice(0, 240),
    line2: String(raw.line2 || "").trim().slice(0, 240),
    city: String(raw.city || "").trim().slice(0, 100),
    state: String(raw.state || "").trim().slice(0, 100),
    pin: String(raw.pin || "").trim().slice(0, 20),
    country: String(country).trim().slice(0, 100),
    isDefault: Boolean(raw.isDefault ?? raw.is_default)
  };
  for (const field of ["name", "phone", "line1", "city", "country"]) {
    if (!address[field]) throw httpError("Fill every required address field", 400);
  }
  const phoneDigits = address.phone.replace(/\D/g, "");
  if (!/^[+()\-\s./#xX\d]{6,30}$/.test(address.phone) || phoneDigits.length < 6 || phoneDigits.length > 20) {
    throw httpError("Enter a valid mobile number", 400);
  }
  if (address.pin && !/^[^\u0000-\u001F\u007F]{1,20}$/.test(address.pin)) {
    throw httpError("Enter a valid postal or ZIP code", 400);
  }
  return address;
}

function addressDuplicateKey(address) {
  const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const phone = String(address.phone || "").replace(/\D/g, "") || normalize(address.phone);
  return [address.line1, address.line2, address.city, address.state, address.pin, address.country, phone]
    .map(normalize)
    .join("\u001f");
}

function rejectDuplicateAddress(address, existingAddresses, excludedId = null) {
  const key = addressDuplicateKey(address);
  if (existingAddresses.some(existing => existing.id !== excludedId && addressDuplicateKey(existing) === key)) {
    throw httpError("This address is already saved with the same phone number", 409);
  }
}

async function lookupIndianPostalCode(value) {
  const pin = String(value || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(pin)) return json({ error: "Enter a 6-digit Indian PIN code" }, 400);
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      headers: { accept: "application/json" }
    });
    if (!response.ok) return json({ error: "Postal code lookup is temporarily unavailable" }, 502);
    const payload = await response.json();
    const offices = Array.isArray(payload) && Array.isArray(payload[0]?.PostOffice) ? payload[0].PostOffice : [];
    const office = offices[0];
    if (!office) return json({ error: "That Indian PIN code was not found" }, 404);
    return json({
      pin,
      country: "India",
      state: String(office.State || "").trim(),
      city: String(office.District || office.Block || office.Name || "").trim(),
      locality: String(office.Name || "").trim()
    });
  } catch {
    return json({ error: "Postal code lookup is temporarily unavailable" }, 502);
  }
}

function formatAddress(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2 || "",
    city: row.city,
    state: row.state,
    pin: row.pin,
    country: row.country || "India",
    isDefault: Boolean(row.is_default),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function listAddresses(env, user) {
  const { results } = await env.DB.prepare(`
    SELECT id, name, phone, line1, line2, city, state, pin, country, is_default, created_at, updated_at
    FROM user_addresses
    WHERE user_email = ?
    ORDER BY is_default DESC, updated_at DESC, created_at DESC
  `).bind(user.email).all();
  return json({ addresses: results.map(formatAddress) });
}

async function createAddress(request, env, user) {
  const body = await readJson(request);
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM user_addresses WHERE user_email = ?")
    .bind(user.email).first();
  if (Number(countRow?.count || 0) >= 20) throw httpError("You can save up to 20 addresses", 400);

  const address = normalizeAddressInput(body);
  const { results: existingAddresses } = await env.DB.prepare(`
    SELECT id, phone, line1, line2, city, state, pin, country
    FROM user_addresses WHERE user_email = ?
  `).bind(user.email).all();
  rejectDuplicateAddress(address, existingAddresses);
  address.isDefault = address.isDefault || Number(countRow?.count || 0) === 0;
  const statements = [];
  if (address.isDefault) {
    statements.push(env.DB.prepare("UPDATE user_addresses SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE user_email = ?")
      .bind(user.email));
  }
  statements.push(env.DB.prepare(`
    INSERT INTO user_addresses
      (id, user_email, name, phone, line1, line2, city, state, pin, country, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    address.id, user.email, address.name, address.phone, address.line1, address.line2,
    address.city, address.state, address.pin, address.country, address.isDefault ? 1 : 0
  ));
  await env.DB.batch(statements);
  invalidateProductEnrichment();
  return listAddresses(env, user);
}

async function updateAddress(request, env, user, id) {
  const existing = await env.DB.prepare("SELECT id, is_default FROM user_addresses WHERE id = ? AND user_email = ?")
    .bind(id, user.email).first();
  if (!existing) throw httpError("Address not found", 404);

  const body = await readJson(request);
  const address = normalizeAddressInput(body, id);
  const { results: otherAddresses } = await env.DB.prepare(`
    SELECT id, phone, line1, line2, city, state, pin, country
    FROM user_addresses WHERE user_email = ? AND id <> ?
  `).bind(user.email, id).all();
  rejectDuplicateAddress(address, otherAddresses);
  const makeDefault = address.isDefault || Boolean(existing.is_default);
  const statements = [];
  if (address.isDefault) {
    statements.push(env.DB.prepare("UPDATE user_addresses SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE user_email = ?")
      .bind(user.email));
  }
  statements.push(env.DB.prepare(`
    UPDATE user_addresses SET
      name = ?, phone = ?, line1 = ?, line2 = ?, city = ?, state = ?, pin = ?, country = ?,
      is_default = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_email = ?
  `).bind(
    address.name, address.phone, address.line1, address.line2, address.city, address.state,
    address.pin, address.country, makeDefault ? 1 : 0, id, user.email
  ));
  await env.DB.batch(statements);
  return listAddresses(env, user);
}

async function deleteAddress(env, user, id) {
  const existing = await env.DB.prepare("SELECT id, is_default FROM user_addresses WHERE id = ? AND user_email = ?")
    .bind(id, user.email).first();
  if (!existing) throw httpError("Address not found", 404);

  const statements = [env.DB.prepare("DELETE FROM user_addresses WHERE id = ? AND user_email = ?").bind(id, user.email)];
  if (existing.is_default) {
    statements.push(env.DB.prepare(`
      UPDATE user_addresses SET is_default = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM user_addresses WHERE user_email = ? AND id <> ?
        ORDER BY updated_at DESC, created_at DESC LIMIT 1
      )
    `).bind(user.email, id));
  }
  await env.DB.batch(statements);
  return listAddresses(env, user);
}

async function replaceAddresses(request, env, user) {
  const body = await readJson(request);
  if (!Array.isArray(body.addresses)) throw httpError("Addresses must be an array", 400);
  if (body.addresses.length > 20) throw httpError("You can save up to 20 addresses", 400);

  const addresses = body.addresses.map(address => normalizeAddressInput(address));
  const ids = new Set();
  const addressKeys = new Set();
  for (const address of addresses) {
    if (ids.has(address.id)) throw httpError("Each saved address needs a unique ID", 400);
    ids.add(address.id);
    const key = addressDuplicateKey(address);
    if (addressKeys.has(key)) throw httpError("This address is already listed with the same phone number", 409);
    addressKeys.add(key);
  }
  if (addresses.length) {
    const defaultIndex = addresses.findIndex(address => address.isDefault);
    addresses.forEach((address, index) => { address.isDefault = index === (defaultIndex < 0 ? 0 : defaultIndex); });
  }

  const statements = [env.DB.prepare("DELETE FROM user_addresses WHERE user_email = ?").bind(user.email)];
  for (const address of addresses) {
    statements.push(env.DB.prepare(`
      INSERT INTO user_addresses
        (id, user_email, name, phone, line1, line2, city, state, pin, country, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      address.id, user.email, address.name, address.phone, address.line1, address.line2,
      address.city, address.state, address.pin, address.country, address.isDefault ? 1 : 0
    ));
  }
  await env.DB.batch(statements);
  return listAddresses(env, user);
}

const MAX_VARIANT_IMAGES = 8;
const MIN_VARIANT_IMAGES = 4;

/* R2 keys are derived from the stored asset URLs — the single source of truth —
   so an edit can never mistake a kept image for a removed one. */
function keysFromImages(images) {
  return images
    .map(image => String(image || "").trim())
    .filter(image => image.startsWith("/api/assets/"))
    .map(image => {
      try {
        return decodeURIComponent(image.replace("/api/assets/", ""));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/* Deals: optional start time (defaults to "already started"), manual deal price. */
function dealActive(row, now = Date.now()) {
  if (!row.deal_ends_at) return false;
  const starts = row.deal_starts_at ? new Date(row.deal_starts_at).getTime() : 0;
  const ends = new Date(row.deal_ends_at).getTime();
  return now >= starts && now <= ends;
}

function effectivePrice(row, now = Date.now()) {
  return dealActive(row, now) && row.deal_price && Number(row.deal_price) > 0
    ? Math.max(1, Math.round(Number(row.deal_price)))
    : Number(row.price);
}

/* Per-size stock: stored in product_sizes, product.stock mirrors the total. */
function sizeStockPlan(env, productId, sizes, sizeStock, fallbackStock) {
  const labels = (sizes || []).map(size => String(size || "").trim()).filter(Boolean);
  const values = labels.map(size => sizeStock && sizeStock[size] !== undefined
    ? Math.max(0, Math.floor(Number(sizeStock[size]) || 0))
    : Math.max(0, Math.floor(Number(fallbackStock) || 0)));
  return {
    total: values.reduce((sum, value) => sum + value, 0),
    statements: [
      env.DB.prepare("DELETE FROM product_sizes WHERE product_id = ?").bind(productId),
      ...labels.map((size, index) => env.DB.prepare("INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)")
        .bind(productId, size, values[index]))
    ]
  };
}

async function applySizeStock(env, productId, sizes, sizeStock, fallbackStock) {
  const plan = sizeStockPlan(env, productId, sizes, sizeStock, fallbackStock);
  await env.DB.batch(plan.statements);
  return plan.total;
}

async function getSizeStockMap(env, productId) {
  const { results } = await env.DB.prepare("SELECT size, stock FROM product_sizes WHERE product_id = ?")
    .bind(productId).all();
  const map = {};
  for (const row of results) map[row.size] = row.stock;
  return map;
}

function sanitizeVariants(variants) {
  return (variants || []).map(variant => ({
    color: String(variant.color || "").trim(),
    sizes: (variant.sizes || []).map(size => String(size || "").trim()).filter(Boolean),
    size_stock: variant.size_stock && typeof variant.size_stock === "object" ? variant.size_stock : null,
    stock: Math.max(0, Number(variant.stock) || 0),
    images: (variant.images || []).map(image => String(image || "").trim()).filter(Boolean).slice(0, MAX_VARIANT_IMAGES),
    image_keys: (variant.image_keys || []).map(key => String(key || "").trim()).filter(Boolean).slice(0, MAX_VARIANT_IMAGES),
    thumbnail_images: (variant.thumbnail_images || []).map(image => String(image || "").trim()).filter(Boolean).slice(0, MAX_VARIANT_IMAGES),
    thumbnail_keys: (variant.thumbnail_keys || []).map(key => String(key || "").trim()).filter(Boolean).slice(0, MAX_VARIANT_IMAGES),
    thumbnail_source_url: String(variant.thumbnail_source_url || "").trim()
  }));
}

function normalizePreorderConfig(input = {}, current = {}) {
  const enabled = input.preorder_enabled === undefined
    ? Boolean(current.preorder_enabled)
    : input.preorder_enabled === true || input.preorder_enabled === 1 || input.preorder_enabled === "1" || input.preorder_enabled === "true";
  const releaseInput = input.preorder_release_at === undefined ? current.preorder_release_at : input.preorder_release_at;
  let releaseAt = null;
  if (releaseInput !== null && releaseInput !== undefined && String(releaseInput).trim()) {
    const date = new Date(String(releaseInput));
    if (Number.isNaN(date.getTime())) throw httpError("Pre-order release time is invalid", 400);
    releaseAt = date.toISOString();
  }
  const limitInput = input.preorder_limit === undefined ? current.preorder_limit : input.preorder_limit;
  let limit = null;
  if (limitInput !== null && limitInput !== undefined && String(limitInput).trim()) {
    limit = validateStock(limitInput, "Pre-order limit");
    if (limit < 1) throw httpError("Pre-order limit must be at least 1", 400);
  }
  const sold = Number(current.preorder_sold || 0);
  if (limit !== null && sold > limit) throw httpError(`Pre-order limit cannot be below ${sold} already committed unit(s)`, 400);
  return { preorder_enabled: enabled ? 1 : 0, preorder_release_at: releaseAt, preorder_limit: limit };
}

function normalizeTaxConfig(input = {}, current = {}) {
  const code = String(input.hsn_sac_code === undefined ? (current.hsn_sac_code || "") : (input.hsn_sac_code || ""))
    .trim().toUpperCase().slice(0, 20);
  const typeValue = String(input.hsn_sac_type === undefined ? (current.hsn_sac_type || "HSN") : (input.hsn_sac_type || "HSN"))
    .trim().toUpperCase();
  if (!['HSN', 'SAC'].includes(typeValue)) throw httpError("Tax code type must be HSN or SAC", 400);
  const rateInput = input.gst_rate === undefined ? current.gst_rate : input.gst_rate;
  let rate = null;
  if (rateInput !== null && rateInput !== undefined && String(rateInput).trim() !== "") {
    rate = Number(rateInput);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw httpError("GST rate must be between 0 and 100", 400);
    rate = Math.round(rate * 100) / 100;
  }
  const inclusiveInput = input.gst_tax_inclusive === undefined ? current.gst_tax_inclusive : input.gst_tax_inclusive;
  const inclusive = inclusiveInput === undefined || inclusiveInput === null
    ? 1
    : (inclusiveInput === true || inclusiveInput === 1 || inclusiveInput === "1" || inclusiveInput === "true" ? 1 : 0);
  return { hsn_sac_code: code, hsn_sac_type: typeValue, gst_rate: rate, gst_tax_inclusive: inclusive };
}

function productInsertStatement(env, entry) {
  return env.DB.prepare(`
    INSERT INTO products (
      id, seller_email, name, category, brand, price, mrp, stock, rating, status, featured,
      color, sizes_json, image_url, image_key, images_json, image_keys_json, thumbnail_url, thumbnail_key,
      thumbnail_images_json, thumbnail_keys_json, thumbnail_source_url, material, description, specifications, variants_json, variant_group,
      subcategory, size_chart_url, cost_price, reorder_point, preorder_enabled, preorder_release_at,
      preorder_limit, preorder_sold, hsn_sac_code, hsn_sac_type, gst_rate, gst_tax_inclusive
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).bind(
    entry.id,
    entry.sellerEmail,
    entry.name,
    entry.category,
    entry.brand,
    entry.price,
    entry.mrp,
    entry.stock,
    entry.rating,
    entry.status,
    entry.featured,
    entry.color,
    JSON.stringify(entry.sizes),
    entry.images[0],
    entry.imageKeys[0] || null,
    JSON.stringify(entry.images),
    JSON.stringify(entry.imageKeys),
    entry.thumbnailImages[0] || null,
    entry.thumbnailKeys[0] || null,
    JSON.stringify(entry.thumbnailImages),
    JSON.stringify(entry.thumbnailKeys),
    entry.thumbnailSourceUrl || entry.images[0] || "",
    entry.material,
    entry.description,
    entry.specifications || "",
    JSON.stringify(entry.variants || []),
    entry.variantGroup,
    entry.subcategory || "",
    entry.sizeChartUrl || null,
    entry.costPrice || 0,
    entry.reorderPoint ?? 15,
    entry.preorderEnabled ? 1 : 0,
    entry.preorderReleaseAt || null,
    entry.preorderLimit ?? null,
    0,
    entry.hsnSacCode || "",
    entry.hsnSacType || "HSN",
    entry.gstRate ?? null,
    entry.gstTaxInclusive ?? 1
  );
}

async function createProduct(request, env, user) {
  const product = await readJson(request);
  validateProduct(product);
  if (!(await categoryExists(env, product.category))) {
    return json({ error: `Unknown category "${product.category}"` }, 400);
  }
  const rating = Number((4.2 + Math.random() * 0.7).toFixed(1));
  const images = product.images.map(image => String(image).trim());
  const imageKeys = keysFromImages(images);
  const thumbnailImages = Array.isArray(product.thumbnail_urls) ? product.thumbnail_urls.map(image => String(image || "").trim()).filter(Boolean) : [];
  const thumbnailKeys = Array.isArray(product.thumbnail_keys) ? product.thumbnail_keys.map(key => String(key || "").trim()).filter(Boolean) : [];
  const requestedThumbnailSource = String(product.thumbnail_source_url || "").trim();
  const thumbnailSourceUrl = images.includes(requestedThumbnailSource) ? requestedThumbnailSource : images[0];
  const variants = sanitizeVariants(product.variants);
  const groupId = variants.length ? crypto.randomUUID() : null;
  const mainId = crypto.randomUUID();
  const subcategory = String(product.subcategory || "").trim();
  if (subcategory && !(await subcategoryExists(env, product.category, subcategory))) {
    return json({ error: `Unknown subcategory "${subcategory}" for ${product.category}` }, 400);
  }
  const sizeChartUrl = String(product.size_chart_url || "").trim();
  validateImageUrl(sizeChartUrl, "Size chart", true);
  const costPrice = product.cost_price === undefined || product.cost_price === "" ? 0 : validateStock(product.cost_price, "Cost price");
  const reorderPoint = product.reorder_point === undefined || product.reorder_point === "" ? 15 : validateStock(product.reorder_point, "Reorder point");
  const preorder = normalizePreorderConfig(product);
  const tax = normalizeTaxConfig(product);
  if (costPrice > Number(product.price)) return json({ error: "Cost price cannot exceed the selling price" }, 400);

  const entries = [{
    id: mainId,
    sellerEmail: user.email,
    name: product.name,
    category: product.category,
    brand: product.brand,
    price: Number(product.price),
    mrp: Number(product.mrp),
    stock: Number(product.stock),
    rating,
    status: "hold",
    featured: 0,
    color: product.color,
    sizes: product.sizes,
    images,
    imageKeys,
    thumbnailSourceUrl,
    thumbnailImages: thumbnailImages.length ? thumbnailImages : [images[0]],
    thumbnailKeys: thumbnailKeys.length ? thumbnailKeys : [imageKeys[0] || ""].filter(Boolean),
    material: product.material,
    description: product.description,
    specifications: product.specifications || "",
    variants,
    variantGroup: groupId,
    subcategory,
    sizeChartUrl,
    costPrice,
    reorderPoint,
    preorderEnabled: preorder.preorder_enabled,
    preorderReleaseAt: preorder.preorder_release_at,
    preorderLimit: preorder.preorder_limit,
    hsnSacCode: tax.hsn_sac_code,
    hsnSacType: tax.hsn_sac_type,
    gstRate: tax.gst_rate,
    gstTaxInclusive: tax.gst_tax_inclusive
  }];

  const createdVariants = [];
  for (const variant of variants) {
    const id = crypto.randomUUID();
    entries.push({
      id,
      sellerEmail: user.email,
      name: product.name,
      category: product.category,
      brand: product.brand,
      price: Number(product.price),
      mrp: Number(product.mrp),
      stock: variant.stock,
      rating,
      status: "hold",
      featured: 0,
      color: variant.color,
      sizes: variant.sizes,
      images: variant.images,
      imageKeys: keysFromImages(variant.images),
      thumbnailSourceUrl: variant.thumbnail_source_url && variant.images.includes(variant.thumbnail_source_url)
        ? variant.thumbnail_source_url
        : variant.images[0],
      thumbnailImages: variant.thumbnail_images.length ? variant.thumbnail_images : [variant.images[0]].filter(Boolean),
      thumbnailKeys: variant.thumbnail_keys.length ? variant.thumbnail_keys : [keysFromImages(variant.images)[0] || ""].filter(Boolean),
      material: product.material,
      description: product.description,
      specifications: product.specifications || "",
      variantGroup: groupId,
      subcategory,
      sizeChartUrl,
      costPrice,
      reorderPoint,
      preorderEnabled: preorder.preorder_enabled,
      preorderReleaseAt: preorder.preorder_release_at,
      preorderLimit: preorder.preorder_limit,
      hsnSacCode: tax.hsn_sac_code,
      hsnSacType: tax.hsn_sac_type,
      gstRate: tax.gst_rate,
      gstTaxInclusive: tax.gst_tax_inclusive
    });
    createdVariants.push(id);
  }

  const statements = entries.map(entry => productInsertStatement(env, entry));
  if (product.size_stock && typeof product.size_stock === "object") {
    const plan = sizeStockPlan(env, mainId, product.sizes, product.size_stock, 0);
    statements.push(...plan.statements, env.DB.prepare("UPDATE products SET stock = ? WHERE id = ?").bind(plan.total, mainId));
  }
  for (const [index, variant] of variants.entries()) {
    if (!variant.size_stock) continue;
    const plan = sizeStockPlan(env, createdVariants[index], variant.sizes, variant.size_stock, 0);
    statements.push(...plan.statements, env.DB.prepare("UPDATE products SET stock = ? WHERE id = ?")
      .bind(plan.total, createdVariants[index]));
  }
  await env.DB.batch(statements);
  invalidateProductEnrichment();

  const created = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(mainId).first();
  return json({
    product: { ...formatProduct(created), size_stock: await getSizeStockMap(env, mainId) },
    variants: createdVariants
  }, 201);
}

async function updateProduct(request, env, id, adminUser = null) {
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Product not found" }, 404);

  let next = { ...current };
  let removedKeys = [];
  let removedSizeChartKeys = [];
  let sizePlan = null;

  if (body.status !== undefined) {
    if (!["review", "live", "hold", "archived"].includes(body.status)) return json({ error: "Invalid status" }, 400);
    next.status = body.status;
  }
  if (body.featured !== undefined) next.featured = Number(Boolean(body.featured));

  const hasPreorderEdit = ["preorder_enabled", "preorder_release_at", "preorder_limit"].some(field => body[field] !== undefined);
  if (hasPreorderEdit) Object.assign(next, normalizePreorderConfig(body, current));

  const hasTaxEdit = ["hsn_sac_code", "hsn_sac_type", "gst_rate", "gst_tax_inclusive"].some(field => body[field] !== undefined);
  if (hasTaxEdit) Object.assign(next, normalizeTaxConfig(body, current));

  if (body.deal_ends_at !== undefined) {
    if (body.deal_ends_at === null || body.deal_ends_at === "") {
      next.deal_ends_at = null;
      next.deal_starts_at = null;
      next.deal_price = null;
    } else {
      const date = new Date(body.deal_ends_at);
      if (Number.isNaN(date.getTime())) return json({ error: "Invalid deal end date" }, 400);
      next.deal_ends_at = date.toISOString();
      if (body.deal_starts_at === undefined && !next.deal_starts_at) next.deal_starts_at = new Date().toISOString();
    }
  }
  if (body.deal_starts_at !== undefined) {
    if (body.deal_starts_at === null || body.deal_starts_at === "") {
      next.deal_starts_at = null;
    } else {
      const date = new Date(body.deal_starts_at);
      if (Number.isNaN(date.getTime())) return json({ error: "Invalid deal start date" }, 400);
      next.deal_starts_at = date.toISOString();
    }
  }
  if (body.deal_price !== undefined) {
    if (body.deal_price === null || body.deal_price === "") {
      next.deal_price = null;
    } else {
      const price = Math.round(Number(body.deal_price));
      if (!Number.isFinite(price) || price < 1) return json({ error: "Deal price must be at least ₹1" }, 400);
      next.deal_price = price;
    }
  }

    const catalogFields = ["name", "category", "brand", "price", "mrp", "color", "material", "sizes", "description", "specifications", "images", "thumbnail_urls", "thumbnail_keys", "thumbnail_source_url", "subcategory", "size_chart_url", "cost_price", "reorder_point", "variants"];
  const hasCatalogEdit = catalogFields.some(field => body[field] !== undefined);
  if (hasCatalogEdit) {
    let currentImages = [];
    try { currentImages = JSON.parse(current.images_json || "[]"); } catch {}
    if (!currentImages.length && current.image_url) currentImages = [current.image_url];
    const imageInput = body.images === undefined
      ? currentImages
      : Array.isArray(body.images)
        ? body.images
        : String(body.images || "").split(/\r?\n/);
    const mergedImages = Array.isArray(imageInput) ? imageInput.map(image => String(image || "").trim()).filter(Boolean) : imageInput;
    let currentThumbImages = [];
    try { currentThumbImages = JSON.parse(current.thumbnail_images_json || "[]"); } catch {}
    if (!currentThumbImages.length && current.thumbnail_url) currentThumbImages = [current.thumbnail_url];
    const thumbnailInput = body.thumbnail_urls ?? (body.images !== undefined ? mergedImages : currentThumbImages);
    const mergedThumbnailImages = Array.isArray(thumbnailInput) ? thumbnailInput.map(image => String(image || "").trim()).filter(Boolean) : [];
    let currentThumbKeys = [];
    try { currentThumbKeys = JSON.parse(current.thumbnail_keys_json || "[]"); } catch {}
    if (!currentThumbKeys.length && current.thumbnail_key) currentThumbKeys = [current.thumbnail_key];
    const mergedThumbnailKeys = Array.isArray(body.thumbnail_keys)
      ? body.thumbnail_keys.map(key => String(key || "").trim()).filter(Boolean)
      : (body.images !== undefined ? [] : currentThumbKeys);
    const requestedThumbnailSource = String(body.thumbnail_source_url ?? current.thumbnail_source_url ?? "").trim();
    const thumbnailSourceUrl = Array.isArray(mergedImages) && mergedImages.includes(requestedThumbnailSource)
      ? requestedThumbnailSource
      : (Array.isArray(mergedImages) ? mergedImages[0] || "" : "");
    const merged = {
      name: body.name ?? current.name,
      category: body.category ?? current.category,
      brand: body.brand ?? current.brand,
      price: body.price ?? current.price,
      mrp: body.mrp ?? current.mrp,
      stock: body.stock ?? current.stock,
      color: body.color ?? current.color,
      material: body.material ?? current.material,
      sizes: body.sizes ?? jsonArray(current.sizes_json),
      description: body.description ?? current.description,
      specifications: body.specifications ?? current.specifications ?? "",
      variants: body.variants !== undefined ? sanitizeVariants(body.variants) : jsonArray(current.variants_json),
      images: mergedImages,
      image_keys: Array.isArray(mergedImages) ? keysFromImages(mergedImages) : [],
      thumbnail_images: mergedThumbnailImages,
      thumbnail_keys: mergedThumbnailKeys,
      thumbnail_source_url: thumbnailSourceUrl,
      subcategory: body.subcategory !== undefined ? String(body.subcategory || "").trim() : (current.subcategory || ""),
      size_chart_url: body.size_chart_url !== undefined ? String(body.size_chart_url || "").trim() : (current.size_chart_url || "")
    };
    merged.cost_price = body.cost_price !== undefined && body.cost_price !== "" ? validateStock(body.cost_price, "Cost price") : Number(current.cost_price || 0);
    merged.reorder_point = body.reorder_point !== undefined && body.reorder_point !== "" ? validateStock(body.reorder_point, "Reorder point") : Number(current.reorder_point ?? 15);
    if (merged.cost_price > Number(merged.price)) return json({ error: "Cost price cannot exceed the selling price" }, 400);
    if (!merged.thumbnail_images.length && merged.images.length) merged.thumbnail_images = [merged.images[0]];
    if (!(await categoryExists(env, merged.category))) return json({ error: `Unknown category "${merged.category}"` }, 400);
    if (merged.subcategory && !(await subcategoryExists(env, merged.category, merged.subcategory))) {
      return json({ error: `Unknown subcategory "${merged.subcategory}" for ${merged.category}` }, 400);
    }
    const legacyImagesPreserved = currentImages.length < 4 && Array.isArray(merged.images) &&
      merged.images.length === currentImages.length && merged.images.every((image, index) => image === currentImages[index]);
    validateProduct({ ...merged, images: merged.images }, { requireImages: !legacyImagesPreserved });
    validateImageUrl(merged.size_chart_url, "Size chart", true);

    let oldKeys = [];
    try {
      const oldImages = JSON.parse(current.images_json || "[]");
      const oldStoredKeys = JSON.parse(current.image_keys_json || "[]");
      const oldThumbImages = JSON.parse(current.thumbnail_images_json || "[]");
      const oldThumbKeys = JSON.parse(current.thumbnail_keys_json || "[]");
      oldKeys = [...new Set([
        ...keysFromImages(oldImages), ...oldStoredKeys.map(key => String(key || "").trim()).filter(Boolean),
        ...keysFromImages(oldThumbImages), ...oldThumbKeys.map(key => String(key || "").trim()).filter(Boolean)
      ])];
    } catch {}
    removedKeys = oldKeys.filter(key => !merged.image_keys.includes(key));
    if (body.size_chart_url !== undefined && current.size_chart_url && current.size_chart_url !== merged.size_chart_url) {
      removedSizeChartKeys = keysFromImages([current.size_chart_url]);
    }
    next = {
      ...next,
      name: merged.name,
      category: merged.category,
      brand: merged.brand,
      price: validateMoney(merged.price, "Price"),
      mrp: validateMoney(merged.mrp, "MRP"),
      stock: validateStock(merged.stock, "Stock"),
      color: merged.color,
      material: merged.material,
      description: merged.description,
      specifications: merged.specifications,
      variants_json: JSON.stringify(merged.variants),
      sizes_json: JSON.stringify(merged.sizes),
      image_url: merged.images[0],
      image_key: merged.image_keys[0] || null,
      images_json: JSON.stringify(merged.images),
      image_keys_json: JSON.stringify(merged.image_keys),
      thumbnail_url: merged.thumbnail_images[0] || null,
      thumbnail_key: merged.thumbnail_keys[0] || null,
      thumbnail_images_json: JSON.stringify(merged.thumbnail_images),
      thumbnail_keys_json: JSON.stringify(merged.thumbnail_keys),
      thumbnail_source_url: merged.thumbnail_source_url,
      size_chart_url: merged.size_chart_url,
      subcategory: merged.subcategory,
      cost_price: merged.cost_price,
      reorder_point: merged.reorder_point
    };
  }

  if (body.stock !== undefined && (body.size_stock === undefined || body.size_stock === null)) {
    next.stock = validateStock(body.stock, "Stock");
  }
  if (body.size_stock !== undefined && body.size_stock !== null) {
    if (typeof body.size_stock !== "object" || Array.isArray(body.size_stock)) {
      return json({ error: "size_stock must be an object of size -> stock" }, 400);
    }
    const sizes = body.sizes ?? jsonArray(next.sizes_json);
    validateSizeList(sizes);
    sizePlan = sizeStockPlan(env, id, sizes, body.size_stock, 0);
    next.stock = sizePlan.total;
  }

  const updateStatement = env.DB.prepare(`
    UPDATE products SET
      name = ?, category = ?, brand = ?, price = ?, mrp = ?, stock = ?, color = ?, material = ?,
      description = ?, specifications = ?, sizes_json = ?, image_url = ?, image_key = ?, images_json = ?,
      image_keys_json = ?, thumbnail_url = ?, thumbnail_key = ?, thumbnail_images_json = ?, thumbnail_keys_json = ?, thumbnail_source_url = ?,
      variants_json = ?, status = ?, featured = ?, deal_ends_at = ?,
      deal_starts_at = ?, deal_price = ?, size_chart_url = ?, subcategory = ?, cost_price = ?, reorder_point = ?,
      preorder_enabled = ?, preorder_release_at = ?, preorder_limit = ?, hsn_sac_code = ?, hsn_sac_type = ?,
      gst_rate = ?, gst_tax_inclusive = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    next.name, next.category, next.brand, next.price, next.mrp, next.stock, next.color, next.material,
    next.description, next.specifications ?? "", next.sizes_json, next.image_url, next.image_key, next.images_json,
    next.image_keys_json, next.thumbnail_url ?? null, next.thumbnail_key ?? null, next.thumbnail_images_json ?? "[]", next.thumbnail_keys_json ?? "[]", next.thumbnail_source_url ?? "",
    next.variants_json, next.status, next.featured, next.deal_ends_at ?? null,
    next.deal_starts_at ?? null, next.deal_price ?? null, next.size_chart_url ?? null, next.subcategory ?? "", next.cost_price ?? 0,
    next.reorder_point ?? 15, next.preorder_enabled ? 1 : 0, next.preorder_release_at ?? null, next.preorder_limit ?? null,
    next.hsn_sac_code ?? "", next.hsn_sac_type ?? "HSN", next.gst_rate ?? null, next.gst_tax_inclusive ? 1 : 0, id
  );
  const updateStatements = sizePlan ? [...sizePlan.statements] : [];
  if (current.variant_group && body.status !== undefined) {
    updateStatements.push(env.DB.prepare("UPDATE products SET status = ? WHERE variant_group = ? AND id != ?")
      .bind(body.status, current.variant_group, id));
  }
  updateStatements.push(updateStatement);
  await env.DB.batch(updateStatements);
  invalidateProductEnrichment();
  let retainedImageKeys = new Set();
  try {
    retainedImageKeys = new Set([
      ...jsonArray(next.image_keys_json),
      ...jsonArray(next.thumbnail_keys_json)
    ]);
  } catch {}
  for (const key of [...new Set([...removedKeys, ...removedSizeChartKeys])].filter(key => !retainedImageKeys.has(key))) {
    await env.PRODUCT_IMAGES.delete(key).catch(() => null);
  }

  const updated = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (adminUser) await writeAuditLog(env, adminUser.email, "update_product", "product", id, { fields: Object.keys(body) });
  return json({ product: { ...formatProduct(updated), size_stock: await getSizeStockMap(env, id) } });
}

async function deleteProduct(env, user, id) {
  const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!product) return json({ ok: true });
  if (user.role !== "admin" && product.seller_email !== user.email) throw httpError("You can delete only your own listings", 403);
  await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM product_sizes WHERE product_id = ?").bind(id).run();
  let keys = [];
  try {
    const productImages = JSON.parse(product.images_json || "[]");
    keys = [...new Set([
      ...keysFromImages(productImages),
      ...keysFromImages([product.image_url]),
      ...keysFromImages([product.thumbnail_url]),
      ...(JSON.parse(product.image_keys_json || "[]") || []).map(key => String(key || "").trim()).filter(Boolean)
    ])];
  } catch {
    keys = [];
  }
  if (product.image_key && !keys.includes(product.image_key)) keys.push(product.image_key);
  if (product.thumbnail_key && !keys.includes(product.thumbnail_key)) keys.push(product.thumbnail_key);
  try { keys.push(...(JSON.parse(product.thumbnail_keys_json || "[]") || [])); } catch {}
  if (product.size_chart_url) keys.push(...keysFromImages([product.size_chart_url]));
  try {
    const variants = JSON.parse(product.variants_json || "[]");
    keys.push(...variants.flatMap(variant => [
      ...keysFromImages(variant.images || []),
      ...keysFromImages(variant.thumbnail_images || []),
      ...(variant.image_keys || []), ...(variant.thumbnail_keys || [])
    ]));
  } catch {}
  const ownedPrefix = `products/${product.seller_email}/`;
  const deletableKeys = user.role === "admin" ? keys : keys.filter(key => key.startsWith(ownedPrefix));
  for (const key of [...new Set(deletableKeys)]) await env.PRODUCT_IMAGES.delete(key).catch(() => null);
  invalidateProductEnrichment();
  return json({ ok: true });
}

async function listCategories(env) {
  const [categoryRows, subcategoryRows] = await env.DB.batch([
    env.DB.prepare("SELECT name FROM categories ORDER BY name ASC"),
    env.DB.prepare("SELECT category, name FROM subcategories ORDER BY category ASC, name ASC")
  ]);
  return json({
    categories: (categoryRows.results || []).map(row => row.name),
    subcategories: subcategoryRows.results || []
  });
}

async function createCategory(request, env) {
  const body = await readJson(request);
  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 30) return json({ error: "Category name must be 2–30 characters" }, 400);
  try {
    await env.DB.prepare("INSERT INTO categories (name) VALUES (?)").bind(name).run();
  } catch {
    return json({ error: "That category already exists" }, 409);
  }
  return json({ ok: true, name }, 201);
}

async function deleteCategory(env, name) {
  const decoded = String(name || "").trim();
  const inUse = await env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE category = ?")
    .bind(decoded).first();
  if (inUse.count > 0) {
    return json({ error: `Cannot delete "${decoded}" — ${inUse.count} listing(s) still use it. Move or delete them first.` }, 409);
  }
  const result = await env.DB.prepare("DELETE FROM categories WHERE name = ?").bind(decoded).run();
  if (!result.meta.changes) return json({ error: "Category not found" }, 404);
  await env.DB.prepare("DELETE FROM subcategories WHERE category = ?").bind(decoded).run();
  return json({ ok: true });
}

async function createSubcategory(request, env) {
  const body = await readJson(request);
  const category = String(body.category || "").trim();
  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 30) return json({ error: "Subcategory name must be 2–30 characters" }, 400);
  const categoryExists = await env.DB.prepare("SELECT name FROM categories WHERE name = ?").bind(category).first();
  if (!categoryExists) return json({ error: "Create the category first" }, 400);
  try {
    await env.DB.prepare("INSERT INTO subcategories (category, name) VALUES (?, ?)").bind(category, name).run();
  } catch {
    return json({ error: "That subcategory already exists in this category" }, 409);
  }
  return json({ ok: true, category, name }, 201);
}

async function deleteSubcategory(env, category, name) {
  const inUse = await env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE category = ? AND subcategory = ?")
    .bind(category, name).first();
  if (inUse.count > 0) {
    return json({ error: `Cannot delete "${name}" — ${inUse.count} listing(s) still use it.` }, 409);
  }
  const result = await env.DB.prepare("DELETE FROM subcategories WHERE category = ? AND name = ?").bind(category, name).run();
  if (!result.meta.changes) return json({ error: "Subcategory not found" }, 404);
  return json({ ok: true });
}

async function subcategoryExists(env, category, subcategory) {
  if (!subcategory) return true;
  const row = await env.DB.prepare("SELECT name FROM subcategories WHERE category = ? AND name = ?")
    .bind(category, subcategory).first();
  return Boolean(row);
}

async function categoryExists(env, category) {
  const row = await env.DB.prepare("SELECT name FROM categories WHERE name = ?").bind(String(category || "").trim()).first();
  return Boolean(row);
}

async function trackCartEvent(request, env, user) {
  const body = await readJson(request);
  const productId = String(body.id || "").trim();
  const quantity = Number(body.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) return json({ error: "Invalid quantity" }, 400);
  if (!productId) return json({ error: "Missing product" }, 400);
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? AND status = 'live'").bind(productId).first();
  if (!product) return json({ error: "Product not found" }, 404);
  await env.DB.prepare(`
    INSERT INTO cart_adds (product_id, quantity, user_email)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM cart_adds WHERE product_id = ? AND user_email = ?
        AND created_at >= datetime('now', '-1 minute')
    )
  `).bind(productId, quantity, user.email, productId, user.email).run();
  return json({ ok: true });
}

async function trackWishlistEvent(request, env, user) {
  const body = await readJson(request);
  const productId = String(body.id || "").trim();
  if (!productId) return json({ error: "Missing product" }, 400);
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? AND status = 'live'").bind(productId).first();
  if (!product) return json({ error: "Product not found" }, 404);
  await env.DB.prepare(`
    INSERT INTO wishlist_adds (product_id, user_email)
    SELECT ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM wishlist_adds WHERE product_id = ? AND user_email = ?
        AND created_at >= datetime('now', '-1 minute')
    )
  `).bind(productId, user.email, productId, user.email).run();
  return json({ ok: true });
}

async function dashboardStats(env) {
  const [salesResult, cartResult, wishResult, productResult, customerResult, orderCount, returnCount, stateOrdersResult, hourOrdersResult, recoveryResult, codResult, funnelResult, viewsTotalResult, viewsByDayResult, viewsByPathResult, viewsByReferrerResult, viewsByDeviceResult, viewsByCountryResult, viewsByHourResult, viewsByDayHourResult] = await Promise.all([
    env.DB.prepare(`
      SELECT oi.product_id,
        SUM(MAX(0, oi.unit_price * oi.quantity - CAST(ROUND(
          COALESCE(o.discount, 0) * 1.0 * (oi.unit_price * oi.quantity) / NULLIF(o.subtotal, 0)
        ) AS INTEGER))) AS revenue,
        SUM(oi.quantity) AS units,
        COUNT(DISTINCT oi.order_id) AS orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'cancelled'
      GROUP BY oi.product_id
    `).all(),
    env.DB.prepare("SELECT product_id, SUM(quantity) AS quantity FROM cart_adds GROUP BY product_id").all(),
    env.DB.prepare("SELECT product_id, COUNT(*) AS count FROM wishlist_adds GROUP BY product_id").all(),
    // Dashboard cards only need these fields; avoid pulling image/variant JSON
    // for every product on every admin refresh.
    env.DB.prepare(`
      SELECT id, name, color, category, subcategory, price, stock,
        status, cost_price, image_url, thumbnail_url, created_at
      FROM products
    `).all(),
    env.DB.prepare(`
      SELECT customer_email, COUNT(*) AS order_count, COALESCE(SUM(total), 0) AS total_spent
      FROM orders
      WHERE status != 'cancelled' AND customer_email != ''
      GROUP BY customer_email
    `).all(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE status != 'cancelled'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM return_requests WHERE status IN ('refunded', 'completed')").first(),
    env.DB.prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(json_extract(o.shipping_json, '$.state')), ''), 'Unknown') AS state,
        COUNT(*) AS orders,
        COALESCE(SUM(o.total), 0) AS revenue
      FROM orders o
      WHERE o.status != 'cancelled'
        AND LOWER(COALESCE(NULLIF(TRIM(json_extract(o.shipping_json, '$.country')), ''), 'india')) IN ('india', 'in')
      GROUP BY state
      ORDER BY orders DESC, state ASC
    `).all(),
    env.DB.prepare(`
      WITH RECURSIVE hours(hour) AS (
        SELECT 0
        UNION ALL
        SELECT hour + 1 FROM hours WHERE hour < 23
      )
      SELECT
        hours.hour,
        COUNT(o.id) AS orders,
        COALESCE(SUM(CASE WHEN o.id IS NULL THEN 0 ELSE o.total END), 0) AS revenue
      FROM hours
      LEFT JOIN orders o
        ON o.status != 'cancelled'
        AND CAST(strftime('%H', datetime(o.created_at, '+5 hours', '+30 minutes')) AS INTEGER) = hours.hour
      GROUP BY hours.hour
      ORDER BY hours.hour ASC
    `).all()
    , env.DB.prepare(`
      WITH activity AS (
        SELECT LOWER(TRIM(ca.user_email)) AS customer_email,
          MAX(ca.created_at) AS last_activity,
          SUM(ca.quantity) AS units_added,
          COUNT(DISTINCT ca.product_id) AS product_count,
          COALESCE(SUM(ca.quantity * CASE
            WHEN p.deal_price > 0
              AND (p.deal_starts_at IS NULL OR datetime(p.deal_starts_at) <= CURRENT_TIMESTAMP)
              AND p.deal_ends_at IS NOT NULL
              AND datetime(p.deal_ends_at) > CURRENT_TIMESTAMP
            THEN p.deal_price
            ELSE p.price
          END), 0) AS estimated_value,
          GROUP_CONCAT(DISTINCT p.name) AS products
        FROM cart_adds ca
        JOIN products p ON p.id = ca.product_id
        WHERE ca.user_email IS NOT NULL AND TRIM(ca.user_email) != ''
        GROUP BY LOWER(TRIM(ca.user_email))
      )
      SELECT activity.*
      FROM activity
      WHERE NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE LOWER(TRIM(o.customer_email)) = activity.customer_email
          AND o.status != 'cancelled'
          AND datetime(o.created_at) >= datetime(activity.last_activity)
      )
      ORDER BY activity.last_activity DESC
      LIMIT 25
    `).all()
    , env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM orders
      WHERE LOWER(COALESCE(payment_method, 'cod')) IN ('cod', 'demo')
    `).first()
    , env.DB.prepare(`
      WITH cart_customers AS (
        SELECT DISTINCT LOWER(TRIM(user_email)) AS customer_email
        FROM cart_adds
        WHERE user_email IS NOT NULL AND TRIM(user_email) != ''
      )
      SELECT
        COUNT(*) AS cart_customers,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM orders o
          WHERE LOWER(TRIM(o.customer_email)) = cart_customers.customer_email
            AND o.status != 'cancelled'
        ) THEN 1 ELSE 0 END) AS purchasing_customers
      FROM cart_customers
    `).first(),
    env.DB.prepare("SELECT COUNT(*) AS views FROM page_views WHERE date(created_at, '+5 hours', '+30 minutes') >= date('now', '+5 hours', '+30 minutes', '-29 days')").first(),
    env.DB.prepare(`
      WITH RECURSIVE days(day) AS (
        SELECT date('now', '+5 hours', '+30 minutes', '-29 days')
        UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date('now', '+5 hours', '+30 minutes')
      )
      SELECT days.day,
        COUNT(pv.id) AS views
      FROM days
      LEFT JOIN page_views pv
        ON date(pv.created_at, '+5 hours', '+30 minutes') = days.day
      GROUP BY days.day
      ORDER BY days.day ASC
    `).all(),
    env.DB.prepare("SELECT path, COUNT(*) AS views FROM page_views WHERE date(created_at, '+5 hours', '+30 minutes') >= date('now', '+5 hours', '+30 minutes', '-29 days') GROUP BY path ORDER BY views DESC LIMIT 8").all(),
    env.DB.prepare("SELECT referrer_host AS source, COUNT(*) AS views FROM page_views WHERE date(created_at, '+5 hours', '+30 minutes') >= date('now', '+5 hours', '+30 minutes', '-29 days') AND referrer_host != '' GROUP BY referrer_host ORDER BY views DESC LIMIT 8").all(),
    env.DB.prepare("SELECT device, COUNT(*) AS views FROM page_views WHERE date(created_at, '+5 hours', '+30 minutes') >= date('now', '+5 hours', '+30 minutes', '-29 days') GROUP BY device ORDER BY views DESC").all(),
    env.DB.prepare("SELECT country, COUNT(*) AS views FROM page_views WHERE date(created_at, '+5 hours', '+30 minutes') >= date('now', '+5 hours', '+30 minutes', '-29 days') AND country != '' GROUP BY country ORDER BY views DESC LIMIT 8").all(),
    env.DB.prepare(`
      WITH RECURSIVE hours(hour) AS (
        SELECT 0
        UNION ALL
        SELECT hour + 1 FROM hours WHERE hour < 23
      )
      SELECT hours.hour,
        COUNT(pv.id) AS views
      FROM hours
      LEFT JOIN page_views pv
        ON date(pv.created_at, '+5 hours', '+30 minutes') >= date('now', '+5 hours', '+30 minutes', '-29 days')
        AND CAST(strftime('%H', datetime(pv.created_at, '+5 hours', '+30 minutes')) AS INTEGER) = hours.hour
      GROUP BY hours.hour
      ORDER BY hours.hour ASC
    `).all(),
    env.DB.prepare(`
      SELECT
        date(created_at, '+5 hours', '+30 minutes') AS day,
        CAST(strftime('%H', datetime(created_at, '+5 hours', '+30 minutes')) AS INTEGER) AS hour,
        COUNT(*) AS views
      FROM page_views
      WHERE date(created_at, '+5 hours', '+30 minutes') >= date('now', '+5 hours', '+30 minutes', '-29 days')
      GROUP BY day, hour
      ORDER BY day ASC, hour ASC
    `).all()
  ]);
  const products = productResult.results.map(formatProduct);

  const agg = {};
  for (const row of salesResult.results) {
    agg[row.product_id] = {
      revenue: Number(row.revenue || 0),
      units: Number(row.units || 0),
      orders: Number(row.orders || 0),
      adds: 0,
      wishlists: 0
    };
  }
  for (const row of cartResult.results) {
    const entry = (agg[row.product_id] ||= { revenue: 0, units: 0, orders: 0, adds: 0 });
    entry.adds = Number(row.quantity || 0);
  }
  for (const row of wishResult.results) {
    const entry = (agg[row.product_id] ||= { revenue: 0, units: 0, orders: 0, adds: 0, wishlists: 0 });
    entry.wishlists = Number(row.count || 0);
  }

  const byProduct = products.map(product => {
    const metrics = agg[product.id] || {};
    const revenue = Number(metrics.revenue || 0);
    const cost = Number(product.cost_price || 0) * Number(metrics.units || 0);
    return {
      id: product.id,
      name: product.name,
      color: product.color,
      category: product.category,
      subcategory: product.subcategory,
      price: product.price,
      stock: product.stock,
      status: product.status,
      created_at: product.created_at,
      image: product.thumbnail || product.image || "",
      thumbnail: product.thumbnail || product.image || "",
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0,
      units: Number(metrics.units || 0),
      orders: Number(metrics.orders || 0),
      adds: Number(metrics.adds || 0),
      wishlists: Number(metrics.wishlists || 0)
    };
  });

  const byCategory = {};
  const bySubcategory = {};
  for (const product of byProduct) {
    const cat = (byCategory[product.category] ||= {
      name: product.category, revenue: 0, cost: 0, profit: 0, units: 0, orders: 0, adds: 0, wishlists: 0, products: 0
    });
    cat.revenue += product.revenue;
    cat.cost += product.cost;
    cat.profit += product.profit;
    cat.units += product.units;
    cat.orders += product.orders;
    cat.adds += product.adds;
    cat.wishlists += product.wishlists;
    cat.products += 1;
    if (product.subcategory) {
      const key = `${product.category}/${product.subcategory}`;
      const sub = (bySubcategory[key] ||= {
        name: product.subcategory, category: product.category, revenue: 0, cost: 0, profit: 0, units: 0, orders: 0, adds: 0, wishlists: 0, products: 0
      });
      sub.revenue += product.revenue;
      sub.cost += product.cost;
      sub.profit += product.profit;
      sub.units += product.units;
      sub.orders += product.orders;
      sub.adds += product.adds;
      sub.wishlists += product.wishlists;
      sub.products += 1;
    }
  }

  const totals = byProduct.reduce((sum, p) => ({
    revenue: sum.revenue + p.revenue,
    cost: sum.cost + p.cost,
    profit: sum.profit + p.profit,
    units: sum.units + p.units,
    orders: sum.orders + p.orders,
    adds: sum.adds + p.adds,
    wishlists: sum.wishlists + p.wishlists
  }), { revenue: 0, cost: 0, profit: 0, units: 0, orders: 0, adds: 0, wishlists: 0 });

  const totalOrders = Number(orderCount?.count || 0);
  const refundedOrCompleted = Number(returnCount?.count || 0);
  const lifetimeValues = customerResult.results.map(row => Number(row.total_spent || 0)).filter(value => value >= 0);
  const codTotal = Number(codResult?.total || 0);
  const codCancelled = Number(codResult?.cancelled || 0);
  const trackedCartCustomers = Number(funnelResult?.cart_customers || 0);
  const purchasingCustomers = Number(funnelResult?.purchasing_customers || 0);
  return json({
    byProduct,
    byCategory: Object.values(byCategory).sort((a, b) => b.revenue - a.revenue),
    bySubcategory: Object.values(bySubcategory).sort((a, b) => b.revenue - a.revenue),
    orders_by_state: stateOrdersResult.results.map(row => ({
      state: row.state || "Unknown",
      orders: Number(row.orders || 0),
      revenue: Number(row.revenue || 0)
    })),
    orders_by_hour: hourOrdersResult.results.map(row => ({
      hour: Number(row.hour || 0),
      orders: Number(row.orders || 0),
      revenue: Number(row.revenue || 0)
    })),
    cart_recovery: recoveryResult.results.map(row => ({
      customer_email: row.customer_email,
      last_activity: row.last_activity,
      units_added: Number(row.units_added || 0),
      product_count: Number(row.product_count || 0),
      estimated_value: Number(row.estimated_value || 0),
      products: String(row.products || "").split(",").map(value => value.trim()).filter(Boolean).slice(0, 4)
    })),
    visitors: {
      total_30d: Number(viewsTotalResult?.views || 0),
      by_day: viewsByDayResult.results.map(row => ({ day: row.day, views: Number(row.views || 0) })),
      by_hour: viewsByHourResult.results.map(row => ({ hour: Number(row.hour || 0), views: Number(row.views || 0) })),
      by_day_hour: viewsByDayHourResult.results.map(row => ({ day: row.day, hour: Number(row.hour || 0), views: Number(row.views || 0) })),
      top_pages: viewsByPathResult.results.map(row => ({ path: row.path, views: Number(row.views || 0) })),
      referrers: viewsByReferrerResult.results.map(row => ({ source: row.source || "direct", views: Number(row.views || 0) })),
      devices: viewsByDeviceResult.results.map(row => ({ device: row.device || "desktop", views: Number(row.views || 0) })),
      countries: viewsByCountryResult.results.map(row => ({ country: row.country || "Unknown", views: Number(row.views || 0) }))
    },
    analytics: {
      average_customer_lifetime_value: lifetimeValues.length ? Math.round(lifetimeValues.reduce((sum, value) => sum + value, 0) / lifetimeValues.length) : 0,
      customer_lifetime_values: customerResult.results.map(row => ({ email: row.customer_email, orders: Number(row.order_count || 0), value: Number(row.total_spent || 0) })).sort((a, b) => b.value - a.value).slice(0, 10),
      cod_cancellation_rate: codTotal ? Math.round((codCancelled / codTotal) * 100) : 0,
      cod_orders: codTotal,
      cancelled_cod_orders: codCancelled,
      tracked_cart_customers: trackedCartCustomers,
      purchasing_customers: purchasingCustomers,
      tracked_cart_to_order_rate: trackedCartCustomers ? Math.round((purchasingCustomers / trackedCartCustomers) * 100) : 0
    },
    totals: {
      ...totals,
      repeat_customers: customerResult.results.filter(row => Number(row.order_count || 0) > 1).length,
      return_rate: totalOrders ? Math.round((refundedOrCompleted / totalOrders) * 100) : 0
    }
  });
}

function googleAnalyticsCredentials(env) {
  const propertyId = String(env.GA4_PROPERTY_ID || "")
    .trim()
    .replace(/^properties\//i, "");
  let clientEmail = String(env.GA4_CLIENT_EMAIL || "").trim();
  let privateKey = String(env.GA4_PRIVATE_KEY || "").trim();

  // Supporting the original service-account JSON export makes local setup
  // less error-prone while keeping the private key server-side.
  if ((!clientEmail || !privateKey) && env.GA4_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(String(env.GA4_SERVICE_ACCOUNT_JSON));
      clientEmail ||= String(serviceAccount.client_email || "").trim();
      privateKey ||= String(serviceAccount.private_key || "").trim();
    } catch {
      // The normal missing/invalid configuration response below is clearer
      // than leaking a JSON parsing error to the admin UI.
    }
  }

  const missing = [];
  if (!/^\d+$/.test(propertyId)) missing.push("GA4_PROPERTY_ID");
  if (!clientEmail) missing.push("GA4_CLIENT_EMAIL");
  if (!privateKey) missing.push("GA4_PRIVATE_KEY");
  return { configured: missing.length === 0, missing, propertyId, clientEmail, privateKey };
}

function pemToDer(privateKey) {
  const body = String(privateKey)
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64UrlToBytes(body);
}

async function googleAnalyticsAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  if (googleAnalyticsTokenCache.clientEmail === credentials.clientEmail &&
      googleAnalyticsTokenCache.expiresAt > now + 60) {
    return googleAnalyticsTokenCache.accessToken;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(JSON.stringify({
    iss: credentials.clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsignedToken = `${header}.${claims}`;
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(credentials.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(unsignedToken)
  );
  const assertion = `${unsignedToken}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    const detail = String(tokenData.error_description || tokenData.error || "request rejected").slice(0, 160);
    throw new Error(`Google Analytics authentication failed: ${detail}`);
  }
  googleAnalyticsTokenCache = {
    accessToken: tokenData.access_token,
    expiresAt: now + Math.min(Number(tokenData.expires_in || 3600), 3600),
    clientEmail: credentials.clientEmail
  };
  return tokenData.access_token;
}

async function runGoogleAnalyticsReport(credentials, accessToken, requestBody) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${credentials.propertyId}:runReport`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(data.error?.message || data.error?.status || "request rejected").slice(0, 220);
    throw new Error(`Google Analytics report failed: ${detail}`);
  }
  return data;
}

function googleAnalyticsMetric(row, index) {
  const value = Number(row?.metricValues?.[index]?.value || 0);
  return Number.isFinite(value) ? value : 0;
}

function googleAnalyticsDimension(row, index) {
  return String(row?.dimensionValues?.[index]?.value || "").trim();
}

async function googleAnalyticsReport(env) {
  const credentials = googleAnalyticsCredentials(env);
  if (!credentials.configured) {
    return json({
      source: "google_analytics_4",
      configured: false,
      property_id: credentials.propertyId || null,
      missing: credentials.missing,
      setup: "Add the Google Analytics 4 property ID and read-only service-account credentials to the Worker environment."
    });
  }

  try {
    const accessToken = await googleAnalyticsAccessToken(credentials);
    const dateRanges = [{ startDate: "30daysAgo", endDate: "yesterday" }];
    const [summaryReport, dailyReport, pagesReport, channelsReport, devicesReport] = await Promise.all([
      runGoogleAnalyticsReport(credentials, accessToken, {
        dateRanges,
        metrics: [
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "engagementRate" }
        ]
      }),
      runGoogleAnalyticsReport(credentials, accessToken, {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        keepEmptyRows: true,
        limit: 31
      }),
      runGoogleAnalyticsReport(credentials, accessToken, {
        dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 8
      }),
      runGoogleAnalyticsReport(credentials, accessToken, {
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 8
      }),
      runGoogleAnalyticsReport(credentials, accessToken, {
        dateRanges,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 6
      })
    ]);

    const summaryRow = summaryReport.rows?.[0] || {};
    const daily = (dailyReport.rows || []).map((row) => ({
      date: googleAnalyticsDimension(row, 0),
      active_users: googleAnalyticsMetric(row, 0),
      sessions: googleAnalyticsMetric(row, 1),
      page_views: googleAnalyticsMetric(row, 2)
    })).sort((a, b) => a.date.localeCompare(b.date));
    const topPages = (pagesReport.rows || []).map((row) => ({
      path: googleAnalyticsDimension(row, 0) || "/",
      page_views: googleAnalyticsMetric(row, 0),
      active_users: googleAnalyticsMetric(row, 1),
      sessions: googleAnalyticsMetric(row, 2)
    })).sort((a, b) => b.page_views - a.page_views);
    const channels = (channelsReport.rows || []).map((row) => ({
      channel: googleAnalyticsDimension(row, 0) || "Unassigned",
      sessions: googleAnalyticsMetric(row, 0),
      active_users: googleAnalyticsMetric(row, 1)
    })).sort((a, b) => b.sessions - a.sessions);
    const devices = (devicesReport.rows || []).map((row) => ({
      device: googleAnalyticsDimension(row, 0) || "Unknown",
      active_users: googleAnalyticsMetric(row, 0),
      sessions: googleAnalyticsMetric(row, 1)
    })).sort((a, b) => b.active_users - a.active_users);

    return json({
      source: "google_analytics_4",
      configured: true,
      property_id: credentials.propertyId,
      fetched_at: new Date().toISOString(),
      period: { start: "30 days ago", end: "yesterday" },
      summary: {
        active_users: googleAnalyticsMetric(summaryRow, 0),
        new_users: googleAnalyticsMetric(summaryRow, 1),
        sessions: googleAnalyticsMetric(summaryRow, 2),
        page_views: googleAnalyticsMetric(summaryRow, 3),
        bounce_rate: googleAnalyticsMetric(summaryRow, 4),
        engagement_rate: googleAnalyticsMetric(summaryRow, 5)
      },
      daily,
      top_pages: topPages,
      channels,
      devices
    });
  } catch (error) {
    console.error("Google Analytics report unavailable", error?.message || error);
    return json({
      source: "google_analytics_4",
      configured: true,
      property_id: credentials.propertyId,
      error: String(error?.message || "Google Analytics is unavailable").slice(0, 240)
    }, 502);
  }
}

async function uploadImage(request, env, user) {
  const form = await readFormData(request);
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Missing image file" }, 400);
  const uploadKind = String(form.get("kind") || "").trim().toLowerCase();
  if (uploadKind === "review") return json({ error: "Review media uploads are disabled" }, 400);
  const adminUpload = adminEmails(env, request).includes(String(user?.email || "").trim().toLowerCase());
  // Every non-review asset is part of the product/admin media workflow. Keep
  // the legacy empty kind unlimited as well so older listing screens do not
  // unexpectedly hit the customer upload budget.
  const productUpload = uploadKind !== "review";
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowedTypes.has(file.type)) return json({ error: "Upload a JPEG, PNG, WebP, or GIF image" }, 400);
  const isThumbnail = uploadKind === "product-thumbnail";
  if (file.size > (isThumbnail ? 1 : 5) * 1024 * 1024) return json({ error: `${isThumbnail ? "Thumbnail" : "Image"} must be ${isThumbnail ? "1MB" : "5MB"} or smaller` }, 400);
  if (!(await hasValidFileSignature(file, file.type))) return json({ error: "The uploaded file content does not match its type" }, 400);

  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  const kind = isThumbnail ? "products/thumbs" : "products";
  const ownerKey = await hashIdentifier(user.email);
  const key = `${kind}/${ownerKey}/${crypto.randomUUID()}.${extension}`;
  const quotaRequired = !adminUpload && !productUpload;
  if (quotaRequired) await reserveUploadQuota(env, user.email, file.size);
  try {
    await env.PRODUCT_IMAGES.put(key, file, {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedBy: user.email }
    });
  } catch (error) {
    if (quotaRequired) await releaseUploadQuota(env, user.email, file.size).catch(() => null);
    throw error;
  }
  return json({ imageUrl: `/api/assets/${key}`, imageKey: key, mediaType: file.type });
}

async function hasValidFileSignature(file, type) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const startsWith = values => values.every((value, index) => bytes[index] === value);
  const text = (start, end) => new TextDecoder().decode(bytes.slice(start, end));
  if (type === "image/png") return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "image/jpeg") return startsWith([0xff, 0xd8, 0xff]);
  if (type === "image/gif") return text(0, 6) === "GIF87a" || text(0, 6) === "GIF89a";
  if (type === "image/webp") return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
  return false;
}

async function reserveUploadQuota(env, email, bytes) {
  const usageDate = new Date().toISOString().slice(0, 10);
  const result = await env.DB.prepare(`
    INSERT INTO upload_usage (user_email, usage_date, bytes) VALUES (?, ?, ?)
    ON CONFLICT(user_email, usage_date) DO UPDATE SET bytes = upload_usage.bytes + excluded.bytes
    WHERE upload_usage.bytes + excluded.bytes <= ?
  `).bind(String(email).toLowerCase(), usageDate, bytes, DAILY_UPLOAD_LIMIT).run();
  if (Number(result.meta?.changes || 0) !== 1) throw httpError("Your daily upload limit has been reached", 429);
}

async function releaseUploadQuota(env, email, bytes) {
  const usageDate = new Date().toISOString().slice(0, 10);
  await env.DB.prepare("UPDATE upload_usage SET bytes = MAX(0, bytes - ?) WHERE user_email = ? AND usage_date = ?")
    .bind(bytes, String(email).toLowerCase(), usageDate).run();
}

async function serveR2Asset(env, rawKey, headOnly = false) {
  let key = rawKey;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    // Key contained a stray "%" — look it up verbatim.
  }
  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) return json({ error: "Asset not found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("content-length", String(object.size));
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(headOnly ? null : object.body, { headers });
}

async function hasPurchasedProduct(env, email, productId) {
  const row = await env.DB.prepare(`
    SELECT 1 AS purchased
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.customer_email = ? AND oi.product_id = ? AND o.status != 'cancelled'
    LIMIT 1
  `).bind(String(email || "").toLowerCase(), productId).first();
  return Boolean(row);
}

async function createAdminNotification(env, {
  type, title, message, dedupeKey, orderId = null, productId = null, reviewId = null, priority = "normal"
}) {
  await env.DB.prepare(`
    INSERT INTO admin_notifications
      (id, type, priority, title, message, dedupe_key, order_id, product_id, review_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dedupe_key) DO UPDATE SET
      priority = excluded.priority,
      title = excluded.title,
      message = excluded.message,
      order_id = excluded.order_id,
      product_id = excluded.product_id,
      review_id = excluded.review_id,
      created_at = excluded.created_at
  `).bind(
    crypto.randomUUID(), type, priority, title, message, dedupeKey, orderId, productId, reviewId, new Date().toISOString()
  ).run();
}

async function ensureStockNotifications(env) {
  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM admin_notifications
      WHERE type IN ('low_stock', 'out_of_stock')
        AND (
          (type = 'low_stock' AND NOT EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = admin_notifications.product_id
              AND p.status != 'archived'
              AND p.stock <= COALESCE(p.reorder_point, ?)
          ))
          OR (type = 'out_of_stock' AND NOT EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = admin_notifications.product_id
              AND p.status != 'archived'
              AND p.stock <= 0
          ))
        )
    `).bind(LOW_STOCK_THRESHOLD),
    env.DB.prepare(`
      INSERT INTO admin_notifications
        (id, type, priority, title, message, dedupe_key, product_id, created_at, last_triggered_at)
      SELECT LOWER(HEX(RANDOMBLOB(16))), 'low_stock', 'high', 'Low stock alert',
        p.name || ' has ' || MAX(0, p.stock) || ' units left',
        'low-stock:' || p.id, p.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM products p
      WHERE p.status != 'archived' AND p.stock <= COALESCE(p.reorder_point, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET
        priority = excluded.priority,
        title = excluded.title,
        message = excluded.message,
        product_id = excluded.product_id,
        read_at = NULL,
        dismissed_at = NULL,
        created_at = CURRENT_TIMESTAMP,
        last_triggered_at = CURRENT_TIMESTAMP
      WHERE (admin_notifications.read_at IS NOT NULL OR admin_notifications.dismissed_at IS NOT NULL)
        AND (admin_notifications.last_triggered_at IS NULL OR admin_notifications.last_triggered_at <= datetime('now', '-8 hours'))
    `).bind(LOW_STOCK_THRESHOLD)
    , env.DB.prepare(`
      INSERT INTO admin_notifications
        (id, type, priority, title, message, dedupe_key, product_id, created_at, last_triggered_at)
      SELECT LOWER(HEX(RANDOMBLOB(16))), 'out_of_stock', 'urgent', 'Out-of-stock alert',
        p.name || ' is out of stock',
        'out-of-stock:' || p.id, p.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM products p
      WHERE p.status != 'archived' AND p.stock <= 0
      ON CONFLICT(dedupe_key) DO UPDATE SET
        priority = excluded.priority,
        title = excluded.title,
        message = excluded.message,
        product_id = excluded.product_id,
        read_at = NULL,
        dismissed_at = NULL,
        created_at = CURRENT_TIMESTAMP,
        last_triggered_at = CURRENT_TIMESTAMP
      WHERE (admin_notifications.read_at IS NOT NULL OR admin_notifications.dismissed_at IS NOT NULL)
        AND (admin_notifications.last_triggered_at IS NULL OR admin_notifications.last_triggered_at <= datetime('now', '-1 day'))
    `)
  ]);
}

async function ensurePendingOrderNotifications(env) {
  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM admin_notifications
      WHERE type = 'new_order'
        AND dedupe_key LIKE 'pending-order:%'
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = admin_notifications.order_id
            AND o.status = 'pending'
            AND o.created_at <= datetime('now', '-12 hours')
        )
    `),
    env.DB.prepare(`
      INSERT INTO admin_notifications
        (id, type, priority, title, message, dedupe_key, order_id)
      SELECT LOWER(HEX(RANDOMBLOB(16))), 'new_order', 'urgent', 'Pending order needs attention',
        COALESCE(NULLIF(o.customer_name, ''), o.customer_email, 'Customer') || ' · ' || COALESCE(o.order_number, o.id) || ' has been pending for more than 12 hours',
        'pending-order:' || o.id, o.id
      FROM orders o
      WHERE o.status = 'pending' AND o.created_at <= datetime('now', '-12 hours')
      ON CONFLICT(dedupe_key) DO UPDATE SET
        priority = 'urgent',
        title = excluded.title,
        message = excluded.message,
        order_id = excluded.order_id
    `)
  ]);
}

async function listAdminNotifications(env) {
  await ensureStockNotifications(env);
  await ensurePendingOrderNotifications(env);
  const { results } = await env.DB.prepare(`
    SELECT id, type, priority, title, message, order_id, product_id, review_id, read_at, created_at
    FROM admin_notifications
    WHERE dismissed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 200
  `).all();
  const unread = results.filter(notification => !notification.read_at).length;
  return json({ notifications: results, unread_count: unread });
}

async function updateAdminNotification(request, env, id) {
  const current = await env.DB.prepare("SELECT id FROM admin_notifications WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Notification not found" }, 404);
  const body = await readJson(request);
  const updates = [];
  const bindings = [];
  if (body.read === true) {
    updates.push("read_at = CURRENT_TIMESTAMP");
  } else if (body.read === false) {
    updates.push("read_at = NULL");
  }
  if (body.dismissed === true) {
    updates.push("dismissed_at = CURRENT_TIMESTAMP");
  } else if (body.dismissed === false) {
    updates.push("dismissed_at = NULL");
  }
  if (!updates.length) return json({ error: "Choose read or dismissed" }, 400);
  bindings.push(id);
  await env.DB.prepare(`UPDATE admin_notifications SET ${updates.join(", ")} WHERE id = ?`).bind(...bindings).run();
  return listAdminNotifications(env);
}

async function listReviews(env, productId, user) {
  const { results } = await env.DB.prepare(
    "SELECT id, product_id, user_email, user_name, rating, comment, status, verified, created_at FROM reviews WHERE product_id = ? AND status = 'visible' ORDER BY verified DESC, created_at DESC"
  ).bind(productId).all();
  const count = results.length;
  const average = count ? Math.round((results.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10 : 0;
  const response = {
    reviews: results.map(row => ({
      id: row.id,
      product_id: row.product_id,
      user_name: row.user_name,
      rating: row.rating,
      comment: row.comment,
      status: row.status,
      verified: Number(row.verified || 0),
      created_at: row.created_at
    })),
    average,
    count
  };
  if (user) {
    response.has_purchased = await hasPurchasedProduct(env, user.email, productId);
    response.my_review = await env.DB.prepare(
      "SELECT id, rating, comment, status, verified FROM reviews WHERE product_id = ? AND user_email = ?"
    ).bind(productId, user.email).first() || null;
  }
  return json(response);
}

async function upsertReview(request, env, user, productId) {
  const body = await readJson(request);
  if (body?.media !== undefined) throw httpError("Review media uploads are disabled", 400);
  const rating = Math.floor(Number(body.rating));
  const comment = String(body.comment || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError("Rating must be 1-5", 400);
  if (comment.length < 3 || comment.length > 500) throw httpError("Review must be 3-500 characters", 400);
  const product = await env.DB.prepare("SELECT id, name FROM products WHERE id = ?").bind(productId).first();
  if (!product) return json({ error: "Product not found" }, 404);
  const verified = (await hasPurchasedProduct(env, user.email, productId)) ? 1 : 0;
  const existing = await env.DB.prepare("SELECT id FROM reviews WHERE product_id = ? AND user_email = ?")
    .bind(productId, user.email).first();
  const reviewId = existing?.id || crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO reviews (id, product_id, user_email, user_name, rating, comment, status, verified)
    VALUES (?, ?, ?, ?, ?, ?, 'visible', ?)
    ON CONFLICT(product_id, user_email) DO UPDATE SET
      rating = excluded.rating,
      comment = excluded.comment,
      user_name = excluded.user_name,
      verified = excluded.verified,
      created_at = CURRENT_TIMESTAMP
  `).bind(reviewId, productId, user.email, user.name || user.email, rating, comment, verified).run();
  await createAdminNotification(env, {
    type: "new_review",
    title: existing ? "Rating updated" : "New review received",
    message: `${user.name || user.email} rated ${product.name} ${rating}/5`,
    dedupeKey: `review:${reviewId}:${Date.now()}`,
    productId,
    reviewId
  }).catch(() => null);
  return listReviews(env, productId, user);
}

async function deleteOwnReview(env, user, productId) {
  await env.DB.prepare("DELETE FROM reviews WHERE product_id = ? AND user_email = ?").bind(productId, user.email).run();
  return listReviews(env, productId, user);
}

function productQuestionView(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name || "",
    product_image: row.product_image || "",
    customer_name: row.customer_name || "Customer",
    customer_email: row.customer_email || "",
    question: row.question,
    answer: row.answer || "",
    status: row.status || "pending",
    created_at: row.created_at,
    answered_at: row.answered_at || null
  };
}

async function listProductQuestions(env, productId) {
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? AND status = 'live'").bind(productId).first();
  if (!product) return json({ error: "Product not found" }, 404);
  const { results } = await env.DB.prepare(`
    SELECT q.id, q.product_id, q.customer_name, q.question, q.answer, q.status, q.created_at, q.answered_at
    FROM product_questions q
    WHERE q.product_id = ? AND q.status = 'published'
    ORDER BY q.created_at DESC
    LIMIT 50
  `).bind(productId).all();
  return json({ questions: results.map(row => productQuestionView(row)) });
}

async function createProductQuestion(request, env, user, productId) {
  const body = await readJson(request);
  const question = String(body.question || "").trim().slice(0, 600);
  if (question.length < 5) return json({ error: "Write a little more so the seller can answer" }, 400);
  const product = await env.DB.prepare("SELECT id, name FROM products WHERE id = ? AND status = 'live'").bind(productId).first();
  if (!product) return json({ error: "Product not found" }, 404);
  const recent = await env.DB.prepare(`
    SELECT id FROM product_questions
    WHERE product_id = ? AND customer_email = ? AND question = ?
      AND created_at >= datetime('now', '-1 day')
    LIMIT 1
  `).bind(productId, String(user.email || "").toLowerCase(), question).first();
  if (recent) return json({ error: "You already asked this question recently" }, 409);
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO product_questions (id, product_id, customer_email, customer_name, question)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, productId, String(user.email || "").toLowerCase(), String(user.name || user.email || "").trim().slice(0, 100), question).run();
  await createAdminNotification(env, {
    type: "product_question",
    priority: "normal",
    title: "New product question",
    message: `${user.name || user.email} asked about ${product.name}`,
    dedupeKey: `product-question:${id}`,
    productId
  }).catch(() => null);
  const created = await env.DB.prepare("SELECT * FROM product_questions WHERE id = ?").bind(id).first();
  return json({ question: productQuestionView({ ...created, product_name: product.name }) }, 201);
}

async function listAllProductQuestions(env) {
  const { results } = await env.DB.prepare(`
    SELECT q.*, p.name AS product_name, p.thumbnail_url AS product_image
    FROM product_questions q
    LEFT JOIN products p ON p.id = q.product_id
    ORDER BY CASE q.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, q.created_at DESC
    LIMIT 300
  `).all();
  return json({ questions: results.map(row => productQuestionView(row)) });
}

async function moderateProductQuestion(request, env, adminUser, id) {
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM product_questions WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Question not found" }, 404);
  const status = body.status === undefined ? current.status : String(body.status).trim();
  if (!["pending", "published", "hidden"].includes(status)) return json({ error: "Invalid question status" }, 400);
  const answer = body.answer === undefined ? String(current.answer || "") : String(body.answer || "").trim().slice(0, 1000);
  const answeredAt = answer ? (current.answered_at || new Date().toISOString()) : null;
  await env.DB.prepare("UPDATE product_questions SET status = ?, answer = ?, answered_at = ? WHERE id = ?")
    .bind(status, answer, answeredAt, id).run();
  await writeAuditLog(env, adminUser.email, "moderate_product_question", "product_question", id, { status, answered: Boolean(answer) });
  const updated = await env.DB.prepare(`
    SELECT q.*, p.name AS product_name, p.thumbnail_url AS product_image
    FROM product_questions q LEFT JOIN products p ON p.id = q.product_id WHERE q.id = ?
  `).bind(id).first();
  return json({ question: productQuestionView(updated) });
}

function formatReviewRow(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name || null,
    product_image: row.product_image || null,
    user_name: row.user_name,
    rating: row.rating,
    comment: row.comment,
    status: row.status || "visible",
    verified: Boolean(row.verified),
    created_at: row.created_at
  };
}

async function listMyReviews(env, user) {
  const { results } = await env.DB.prepare(`
    SELECT r.id, r.product_id, r.user_email, r.user_name, r.rating, r.comment, r.status, r.created_at,
      p.name AS product_name, p.image_url AS product_image
    FROM reviews r
    LEFT JOIN products p ON p.id = r.product_id
    WHERE r.user_email = ?
    ORDER BY r.created_at DESC
  `).bind(user.email).all();
  return json({ reviews: results.map(row => formatReviewRow(row)) });
}

async function listAllReviews(env) {
  const { results } = await env.DB.prepare(`
    SELECT r.id, r.product_id, r.user_email, r.user_name, r.rating, r.comment, r.status, r.created_at,
      p.name AS product_name, p.image_url AS product_image
    FROM reviews r
    LEFT JOIN products p ON p.id = r.product_id
    ORDER BY r.created_at DESC
  `).all();
  return json({ reviews: results.map(row => ({ ...formatReviewRow(row), user_email: row.user_email })) });
}

async function moderateReview(request, env, id) {
  const body = await readJson(request);
  if (!["visible", "hidden"].includes(body.status)) return json({ error: "Invalid review status" }, 400);
  const current = await env.DB.prepare("SELECT id FROM reviews WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Review not found" }, 404);
  await env.DB.prepare("UPDATE reviews SET status = ? WHERE id = ?").bind(body.status, id).run();
  return json({ ok: true, id, status: body.status });
}

async function deleteReview(env, id) {
  await env.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

function formatPaymentMethod(value) {
  const normalized = String(value || "demo").trim().toLowerCase();
  return ["cod", "demo"].includes(normalized) ? "demo" : normalized;
}

function formatOrder(row) {
  if (!row) return null;
  let items = [];
  try {
    items = JSON.parse(row.items_json || "[]");
  } catch {
    items = [];
  }
  let shipping = null;
  try {
    shipping = row.shipping_json ? JSON.parse(row.shipping_json) : null;
  } catch {
    shipping = null;
  }
  return {
    id: row.id,
    order_number: row.order_number || fallbackOrderNumber(row),
    customer_email: row.customer_email,
    customer_name: row.customer_name,
    items,
    subtotal: row.subtotal,
    discount: row.discount,
    coupon_code: row.coupon_code,
    total: row.total,
    status: row.status,
    payment_method: formatPaymentMethod(row.payment_method),
    payment_status: row.payment_status || "pending",
    tracking_token: row.tracking_token || "",
    tracking_number: row.tracking_number || "",
    order_type: row.order_type || "standard",
    replacement_for_order_id: row.replacement_for_order_id || null,
    replacement_request_id: row.replacement_request_id || null,
    shipping,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function fallbackOrderNumber(row) {
  const date = String(row.created_at || "").replace(/[^0-9]/g, "").slice(0, 8) || "00000000";
  const token = String(row.id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  return `GM-${date}-${token}`;
}

async function listOrders(env, user, scope) {
  if (scope === "admin") {
    requireAdmin(user);
    const { results } = await env.DB.prepare(`
      SELECT id, order_number, customer_email, customer_name, items_json, subtotal, discount,
        coupon_code, total, status, payment_method, payment_status, tracking_token, tracking_number,
        order_type, replacement_for_order_id, replacement_request_id, shipping_json,
        created_at, updated_at
      FROM orders
      ORDER BY created_at DESC, id DESC
    `).all();
    return json({ orders: results.map(formatOrder) });
  }
  const { results } = await env.DB.prepare("SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC")
    .bind(String(user.email || "").trim().toLowerCase())
    .all();
  return json({ orders: results.map(formatOrder) });
}

async function trackPublicOrder(env, rawOrderId, rawEmail) {
  const orderId = String(rawOrderId || "").trim();
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!orderId || orderId.length > 100) return json({ error: "Enter an order ID to track" }, 400);
  if (email.length > 254) return json({ error: "Enter a valid email address" }, 400);
  const row = await env.DB.prepare(`
    SELECT id, order_number, items_json, status, payment_method, tracking_number,
      order_type, created_at, updated_at
    FROM orders
    WHERE tracking_token = ?
      OR ((order_number = ? OR id = ?) AND customer_email = ?)
    LIMIT 1
  `).bind(orderId, orderId, orderId, email).first();
  if (!row) return json({ error: "We could not find an order with that ID" }, 404);
  let rawItems = [];
  try { rawItems = JSON.parse(row.items_json || "[]"); } catch { rawItems = []; }
  return json({ order: {
    order_number: row.order_number || fallbackOrderNumber(row),
    status: row.status || "pending",
    payment_method: formatPaymentMethod(row.payment_method),
    tracking_number: row.tracking_number || "",
    order_type: row.order_type || "standard",
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: Array.isArray(rawItems) ? rawItems.map((item) => ({
      name: item.name || item.product_name || item.title || item.id || "Product",
      size: item.size || "",
      quantity: Math.max(1, Number(item.quantity) || 1)
    })) : []
  } });
}

function normalizeOrderItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const merged = new Map();
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") throw httpError("Each cart item is invalid", 400);
    const id = String(entry.id || "").trim();
    const quantity = Number(entry.quantity);
    if (!id || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw httpError("Each cart quantity must be a whole number from 1 to 1000", 400);
    }
    const size = String(entry.size || "").trim();
    const variant = String(entry.variant || "").trim();
    const key = `${id}\0${size}`;
    const current = merged.get(key);
    if (current) {
      current.quantity += quantity;
      if (current.quantity > 1000) throw httpError("Cart quantity is too large", 400);
    } else {
      merged.set(key, { id, quantity, size, variant });
    }
  }
  if (merged.size > 50) throw httpError("A cart can contain at most 50 distinct items", 400);
  return [...merged.values()];
}

async function loadLiveProductsById(env, requested) {
  const ids = [...new Set(requested.map(item => String(item.id || "").trim()).filter(Boolean))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT * FROM products WHERE status = 'live' AND id IN (${placeholders})`)
    .bind(...ids).all();
  return new Map(results.map(row => [row.id, row]));
}

async function loadSizeRowsByProduct(env, requested) {
  const ids = [...new Set(requested.map(item => String(item.id || "").trim()).filter(Boolean))];
  const grouped = new Map();
  if (!ids.length) return grouped;
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`
    SELECT product_id, size, stock
    FROM product_sizes
    WHERE product_id IN (${placeholders})
    ORDER BY product_id, size
  `).bind(...ids).all();
  for (const row of results) {
    if (!grouped.has(row.product_id)) grouped.set(row.product_id, []);
    grouped.get(row.product_id).push(row);
  }
  return grouped;
}

async function createOrder(request, env, user) {
  const body = await readJson(request);
  const requested = normalizeOrderItems(body.items);
  if (!requested.length) throw httpError("Your cart is empty", 400);

  const normalizedAddress = normalizeAddressInput(body.address || {});
  const address = {
    name: normalizedAddress.name,
    phone: normalizedAddress.phone,
    line1: normalizedAddress.line1,
    line2: normalizedAddress.line2,
    city: normalizedAddress.city,
    state: normalizedAddress.state,
    pin: normalizedAddress.pin,
    country: normalizedAddress.country
  };

  const requestedPaymentMethod = String(body.payment_method || "demo").trim().toLowerCase();
  if (requestedPaymentMethod && !["demo", "cod"].includes(requestedPaymentMethod)) {
    throw httpError("Only demo payments are available right now. No money will be charged.", 400);
  }
  const paymentMethod = "demo";
  const storefront = await storefrontSettingsObject(env);
  if (!storefront.payments.cod_enabled) {
    throw httpError("Demo checkout is currently unavailable. Please contact support for help.", 409);
  }
  const customerEmail = user
    ? String(user.email || "").trim().toLowerCase()
    : String(body.email || "").trim().toLowerCase();
  if (!user && (customerEmail.length > 254 || !isRealCustomerEmail(customerEmail))) {
    throw httpError("Enter a valid email for order confirmation and delivery updates", 400);
  }
  const paymentStatus = "demo";
  const trackingToken = crypto.randomUUID().replace(/-/g, "");

  const [catalog, sizeRowsByProduct] = await Promise.all([
    loadLiveProductsById(env, requested),
    loadSizeRowsByProduct(env, requested)
  ]);

  const items = [];
  let subtotal = 0;
  const productQuantities = new Map();
  const sizeQuantities = new Map();
  const preorderQuantities = new Map();
  let hasPreorder = false;
  for (const entry of requested) {
    const row = catalog.get(entry.id);
    if (!row) throw httpError("A product in your cart is no longer available", 400);
    const quantity = entry.quantity;
    const variant = String(entry.variant || "").trim();
    const size = String(entry.size || "").trim();
    const sizeRows = sizeRowsByProduct.get(row.id) || [];
    let declaredSizes = [];
    try { declaredSizes = JSON.parse(row.sizes_json || "[]"); } catch {}
    if (declaredSizes.length && !size) throw httpError(`Select a size for ${row.name}`, 400);
    if (size) {
      if (declaredSizes.length && !declaredSizes.includes(size)) throw httpError(`Size ${size} is not available for ${row.name}`, 400);
      if (sizeRows.length) {
        const sizeRow = sizeRows.find(sizeEntry => sizeEntry.size === size);
        if (!sizeRow) throw httpError(`Size ${size} is not available for ${row.name}`, 400);
        if (!row.preorder_enabled) {
          const key = `${row.id}\0${size}`;
          sizeQuantities.set(key, (sizeQuantities.get(key) || 0) + quantity);
        }
      }
    }
    if (row.preorder_enabled) {
      hasPreorder = true;
      preorderQuantities.set(row.id, (preorderQuantities.get(row.id) || 0) + quantity);
    } else {
      productQuantities.set(row.id, (productQuantities.get(row.id) || 0) + quantity);
    }
    const unitPrice = effectivePrice(row);
    subtotal += unitPrice * quantity;
    items.push({
      id: row.id,
      name: row.name,
      price: unitPrice,
      quantity,
      size,
      variant,
      color: row.color,
      image: row.image_url,
      preorder: Boolean(row.preorder_enabled),
      preorder_release_at: row.preorder_release_at || null,
      hsn_sac_code: row.hsn_sac_code || "",
      hsn_sac_type: row.hsn_sac_type || "HSN",
      gst_rate: row.gst_rate === null || row.gst_rate === undefined ? null : Number(row.gst_rate),
      gst_tax_inclusive: row.gst_tax_inclusive === undefined ? true : Boolean(row.gst_tax_inclusive)
    });
  }

  for (const [productId, quantity] of productQuantities) {
    const row = catalog.get(productId);
    if (row.stock < quantity) throw httpError(`Only ${row.stock} left of ${row.name}`, 400);
  }
  for (const [key, quantity] of sizeQuantities) {
    const [productId, size] = key.split("\0");
    const sizeRow = sizeRowsByProduct.get(productId)?.find(entry => entry.size === size);
    if (!sizeRow || sizeRow.stock < quantity) {
      throw httpError(sizeRow?.stock === 0 ? `Size ${size} of ${catalog.get(productId)?.name} is sold out` : `Only ${sizeRow?.stock || 0} left in size ${size}`, 400);
    }
  }

  let discount = 0;
  let couponCode = null;
  const code = String(body.coupon || "").trim().toUpperCase();
  if (code) {
    if (!user) throw httpError("Sign in to use a coupon", 401);
    const coupon = await env.DB.prepare("SELECT * FROM coupons WHERE code = ? AND active = 1").bind(code).first();
    if (!coupon) throw httpError("That coupon code is not valid", 400);
    const availabilityError = await couponAvailability(coupon, env, user);
    if (availabilityError) throw httpError(availabilityError, 400);
    const minimumCartError = couponMinimumCartError(coupon, subtotal);
    if (minimumCartError) throw httpError(minimumCartError, 400);
    const eligible = couponEligibleSubtotal(coupon, requested, catalog);
    if (eligible <= 0) throw httpError("This coupon does not apply to the items in your cart", 400);
    discount = couponDiscount(coupon, eligible);
    couponCode = coupon.code;
  }

  const total = subtotal - discount;
  const id = crypto.randomUUID();
  const sequence = await nextOrderSequence(env);
  const orderNumber = buildOrderNumber(productNameInitials(items[0]?.name), sequence);
  const customerName = user?.name || address.name;
  const orderType = hasPreorder ? "preorder" : "standard";

  const checkoutStatements = [];
  for (const [productId, quantity] of preorderQuantities) {
    checkoutStatements.push(env.DB.prepare(`
      UPDATE products
      SET preorder_sold = preorder_sold + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND preorder_enabled = 1
    `).bind(quantity, productId));
  }
  const productAdjustments = [...productQuantities].map(([productId, quantity]) => ({ productId, quantity }));
  const productAdjustmentsJson = JSON.stringify(productAdjustments);
  checkoutStatements.push(env.DB.prepare(`
    UPDATE products
    SET stock = stock - COALESCE((
      SELECT CAST(json_extract(value, '$.quantity') AS INTEGER)
      FROM json_each(?)
      WHERE json_extract(value, '$.productId') = products.id
    ), 0)
    WHERE id IN (SELECT json_extract(value, '$.productId') FROM json_each(?))
  `).bind(productAdjustmentsJson, productAdjustmentsJson));
  const sizeAdjustments = [...sizeQuantities].map(([key, quantity]) => {
    const [productId, size] = key.split("\0");
    return { productId, size, quantity };
  });
  if (sizeAdjustments.length) {
    const sizeAdjustmentsJson = JSON.stringify(sizeAdjustments);
    checkoutStatements.push(env.DB.prepare(`
      UPDATE product_sizes AS current_size
      SET stock = stock - COALESCE((
        SELECT CAST(json_extract(value, '$.quantity') AS INTEGER)
        FROM json_each(?)
        WHERE json_extract(value, '$.productId') = current_size.product_id
          AND json_extract(value, '$.size') = current_size.size
      ), 0)
      WHERE EXISTS (
        SELECT 1 FROM json_each(?)
        WHERE json_extract(value, '$.productId') = current_size.product_id
          AND json_extract(value, '$.size') = current_size.size
      )
    `).bind(sizeAdjustmentsJson, sizeAdjustmentsJson));
  }
  checkoutStatements.push(env.DB.prepare(`
      INSERT INTO orders (id, order_number, tracking_token, customer_email, customer_name, items_json, subtotal, discount, coupon_code, total, status, payment_method, payment_status, shipping_json, order_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).bind(
      id, orderNumber, trackingToken, customerEmail, customerName, JSON.stringify(items), subtotal, discount,
      couponCode, total, paymentMethod, paymentStatus, JSON.stringify(address), orderType
    ));

  const orderItemRows = items.map(item => ({
    lineId: crypto.randomUUID(),
    ...item,
    size: item.size || "",
    variant: item.variant || "",
    color: item.color || "",
    image: item.image || ""
  }));
  checkoutStatements.push(env.DB.prepare(`
    INSERT INTO order_items
      (id, order_id, product_id, product_name, unit_price, quantity, size, variant, color, image_url,
       hsn_sac_code, hsn_sac_type, gst_rate, gst_tax_inclusive)
    SELECT
      json_extract(value, '$.lineId'), ?, json_extract(value, '$.id'), json_extract(value, '$.name'),
      CAST(json_extract(value, '$.price') AS INTEGER), CAST(json_extract(value, '$.quantity') AS INTEGER),
      json_extract(value, '$.size'), json_extract(value, '$.variant'), json_extract(value, '$.color'),
      json_extract(value, '$.image'), json_extract(value, '$.hsn_sac_code'), json_extract(value, '$.hsn_sac_type'),
      CAST(json_extract(value, '$.gst_rate') AS REAL), CAST(json_extract(value, '$.gst_tax_inclusive') AS INTEGER)
    FROM json_each(?)
  `).bind(id, JSON.stringify(orderItemRows)));

  const productsWithSizeReservations = new Set([...sizeQuantities.keys()].map(key => key.split("\0")[0]));
  const reservationRows = [];
  for (const [productId, quantity] of productQuantities) {
    if (productsWithSizeReservations.has(productId)) continue;
    reservationRows.push({ id: crypto.randomUUID(), productId, size: "", quantity });
  }
  for (const [key, quantity] of sizeQuantities) {
    const [productId, size] = key.split("\0");
    reservationRows.push({ id: crypto.randomUUID(), productId, size, quantity });
  }
  if (reservationRows.length) {
    checkoutStatements.push(env.DB.prepare(`
      INSERT INTO inventory_reservations (id, order_id, product_id, size, quantity, status)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.productId'),
        json_extract(value, '$.size'), CAST(json_extract(value, '$.quantity') AS INTEGER), 'committed'
      FROM json_each(?)
    `).bind(id, JSON.stringify(reservationRows)));
  }
  if (couponCode) {
    checkoutStatements.push(env.DB.prepare("INSERT INTO coupon_redemptions (id, coupon_code, customer_email, order_id) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), couponCode, customerEmail, id));
  }

  try {
    await env.DB.batch(checkoutStatements);
  } catch (error) {
    const detail = String(error?.message || error || "");
    if (/insufficient .*stock/i.test(detail)) {
      throw httpError("Some items sold out while you were checking out. Please refresh your cart.", 409);
    }
    if (/coupon redemption limit/i.test(detail)) {
      throw httpError("This coupon reached its usage limit while you were checking out.", 409);
    }
    if (/pre-order limit/i.test(detail)) {
      throw httpError("This pre-order limit was reached while you were checking out. Please refresh and try again.", 409);
    }
    throw error;
  }
  invalidateProductEnrichment();

  const created = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  await createAdminNotification(env, {
    type: "new_order",
    title: "New order received",
    message: `${created.customer_name || created.customer_email} placed ${items.length} item${items.length === 1 ? "" : "s"} · ${orderNumber}`,
    dedupeKey: `order:${id}`,
    orderId: id
  }).catch(() => null);
  const confirmationSent = await sendOrderEmail(env, created, "confirmation");
  if (confirmationSent) {
    await env.DB.prepare("UPDATE orders SET confirmation_email_sent_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id).run();
  }
  return json({ order: formatOrder(created) }, 201);
}

async function cancelOwnOrder(request, env, user, id) {
  const current = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND customer_email = ?")
    .bind(id, String(user.email || "").trim().toLowerCase()).first();
  if (!current) return json({ error: "Order not found" }, 404);
  if (current.status === "cancelled") return json({ order: formatOrder(current) });
  if (!["pending", "confirmed"].includes(current.status)) {
    return json({ error: "This order can no longer be cancelled. Please request a return instead." }, 409);
  }
  const createdAt = Date.parse(current.created_at || "");
  if (Number.isFinite(createdAt) && Date.now() - createdAt > CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return json({ error: `This order is outside the ${CANCELLATION_WINDOW_DAYS}-day cancellation window. Please request a return instead.` }, 409);
  }
  const results = await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO order_stock_releases (order_id)
      SELECT id FROM orders
      WHERE id = ? AND status IN ('pending', 'confirmed')
    `).bind(id),
    env.DB.prepare("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'confirmed')")
      .bind(id),
    env.DB.prepare("DELETE FROM coupon_redemptions WHERE order_id = ?").bind(id)
  ]);
  invalidateProductEnrichment();
  if (Number(results[0]?.meta?.changes || 0) === 1) {
    await writeAuditLog(env, user.email, "cancel_order", "order", id, { stock_restored: true });
  }
  const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  await createAdminNotification(env, {
    type: "cancelled_order",
    priority: "urgent",
    title: "Order cancelled",
    message: `${updated.customer_name || updated.customer_email} cancelled ${updated.order_number || updated.id}`,
    dedupeKey: `cancelled-order:${id}`,
    orderId: id
  }).catch(() => null);
  if (Number(results[1]?.meta?.changes || 0) === 1) {
    await sendOrderEmail(env, updated, "cancelled");
  }
  return json({ order: formatOrder(updated) });
}

async function createReturnRequest(request, env, user, orderId) {
  const body = await readJson(request);
  const requestedType = String(body.type || "return_refund").trim().toLowerCase();
  const type = ["return_refund", "return", "refund"].includes(requestedType) ? "refund" : requestedType;
  const reason = String(body.reason || "").trim().slice(0, 500);
  const refundDestination = type === "exchange" ? "store_credit" : String(body.refund_destination || "store_credit").trim().toLowerCase();
  const exchangeProductId = String(body.exchange_product_id || "").trim();
  const requestedExchangeFromSize = String(body.exchange_from_size || "").trim();
  const requestedExchangeSize = String(body.exchange_to_size || "").trim();
  let exchangeItem = null;
  let exchangeFromSize = "";
  let exchangeToSize = "";
  if (!["refund", "exchange"].includes(type)) return json({ error: "Choose Return/Refund or Exchange" }, 400);
  if (!["original", "store_credit"].includes(refundDestination)) return json({ error: "Choose a valid refund destination" }, 400);
  if (reason.length < 3) return json({ error: "Tell us why you need help with this order" }, 400);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND customer_email = ?")
    .bind(orderId, String(user.email || "").trim().toLowerCase()).first();
  if (!order) return json({ error: "Order not found" }, 404);
  if (["cod", "demo"].includes(order.payment_method) && refundDestination === "original") {
    return json({ error: "Demo-payment refunds are available only as Glamia store credits" }, 400);
  }
  if (order.status !== "delivered") return json({ error: "Returns and refunds open after delivery" }, 409);
  const deliveredAt = new Date(order.updated_at || order.created_at).getTime();
  if (Number.isFinite(deliveredAt) && Date.now() - deliveredAt > RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return json({ error: `This order is outside the ${RETURN_WINDOW_DAYS}-day return window` }, 409);
  }
  const existing = await env.DB.prepare("SELECT id FROM return_requests WHERE order_id = ? AND status NOT IN ('rejected', 'cancelled') LIMIT 1")
    .bind(orderId).first();
  if (existing) return json({ error: "An after-sales request already exists for this order" }, 409);
  if (type === "exchange") {
    exchangeItem = await env.DB.prepare(`
      SELECT product_id AS id, size, quantity, product_name, unit_price, variant, color, image_url
      FROM order_items
      WHERE order_id = ? AND product_id = ?
        AND (? = '' OR LOWER(size) = LOWER(?))
      LIMIT 1
    `).bind(orderId, exchangeProductId, requestedExchangeFromSize, requestedExchangeFromSize).first();
    if (!exchangeItem) return json({ error: "Choose the same product from this order for exchange" }, 400);
    exchangeFromSize = String(exchangeItem.size || "").trim();
    const { results: sizeRows } = await env.DB.prepare(`
      SELECT ps.size, ps.stock
      FROM product_sizes ps
      JOIN products p ON p.id = ps.product_id
      WHERE ps.product_id = ? AND p.status = 'live'
      ORDER BY ps.size
    `).bind(exchangeProductId).all();
    const availableSizes = sizeRows
      .filter(row => Number(row.stock) >= Number(exchangeItem.quantity || 1) && String(row.size || "").trim().toLowerCase() !== exchangeFromSize.toLowerCase())
      .map(row => String(row.size || "").trim())
      .filter(Boolean);
    if (!availableSizes.length) {
      return json({ error: "No other size is available for this product. Please proceed with Return/Refund." }, 409);
    }
    const matchingSize = availableSizes.find(size => size.toLowerCase() === requestedExchangeSize.toLowerCase());
    if (!matchingSize) return json({ error: "Choose an available different size for this product" }, 400);
    exchangeToSize = matchingSize;
  }
  const id = crypto.randomUUID();
  const refundAmount = Math.max(0, Math.floor(Number(order.total) || 0));
  await env.DB.prepare(`INSERT INTO return_requests
    (id, order_id, customer_email, type, reason, refund_amount, refund_destination, exchange_product_id, exchange_from_size, exchange_to_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, orderId, user.email.toLowerCase(), type, reason, refundAmount, refundDestination,
      type === "exchange" ? exchangeProductId : null, type === "exchange" ? exchangeFromSize : null, type === "exchange" ? exchangeToSize : null).run();
  let replacementOrder = null;
  if (type === "exchange") {
    try {
      replacementOrder = await createReplacementOrder(env, order, exchangeItem, exchangeToSize, id);
      await env.DB.prepare("UPDATE return_requests SET replacement_order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(replacementOrder.id, id).run();
    } catch (error) {
      await env.DB.prepare("DELETE FROM return_requests WHERE id = ?").bind(id).run();
      if (/insufficient replacement stock/i.test(String(error?.message || error))) {
        return json({ error: "That size just sold out. Please choose another available size or proceed with Return/Refund." }, 409);
      }
      throw error;
    }
  }
  await createAdminNotification(env, {
    type: type === "exchange" ? "exchange_request" : "return_request",
    priority: "urgent",
    title: type === "exchange" ? "Exchange request needs attention" : "Return/Refund request needs attention",
    message: `${order.customer_name || order.customer_email} requested ${type === "exchange" ? `a replacement size (${exchangeFromSize || "current"} → ${exchangeToSize})` : "a return/refund"} · ${order.order_number || order.id}`,
    dedupeKey: `after-sales:${id}`,
    orderId
  }).catch(() => null);
  await writeAuditLog(env, user.email, "create_return_request", "return_request", id, {
    order_id: orderId, type: requestedType, refund_destination: refundDestination,
    exchange_product_id: exchangeProductId || null, exchange_to_size: exchangeToSize || null
  });
  const createdRequest = await getReturnRequest(env, id);
  await sendReturnEmail(env, createdRequest, "requested");
  return json({ request: createdRequest, replacement_order: replacementOrder }, 201);
}

async function createReplacementOrder(env, originalOrder, exchangeItem, replacementSize, requestId) {
  const quantity = Math.max(1, Math.floor(Number(exchangeItem.quantity) || 1));
  const product = await env.DB.prepare("SELECT id, name, stock, price, color, image_url FROM products WHERE id = ? AND status = 'live'")
    .bind(exchangeItem.id).first();
  if (!product) throw httpError("The exchange product is no longer available", 409);
  const item = {
    id: product.id,
    name: product.name || exchangeItem.product_name || "Replacement item",
    price: 0,
    quantity,
    size: replacementSize,
    variant: exchangeItem.variant || "",
    color: product.color || exchangeItem.color || "",
    image: product.image_url || exchangeItem.image_url || ""
  };
  const id = crypto.randomUUID();
  const sequence = await nextOrderSequence(env);
  const orderNumber = buildOrderNumber(productNameInitials(item.name), sequence);
  const trackingToken = crypto.randomUUID().replace(/-/g, "");
  const reservation = { id: crypto.randomUUID(), productId: product.id, size: replacementSize, quantity };
  const statements = [
    env.DB.prepare(`
      INSERT INTO orders
        (id, order_number, tracking_token, customer_email, customer_name, items_json, subtotal, discount, coupon_code, total, status, payment_method, payment_status, shipping_json, order_type, replacement_for_order_id, replacement_request_id)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, 0, 'pending', 'replacement', 'not_required', ?, 'replacement', ?, ?)
    `).bind(
      id, orderNumber, trackingToken, originalOrder.customer_email, originalOrder.customer_name,
      JSON.stringify([item]), originalOrder.shipping_json || null,
      originalOrder.id, requestId
    ),
    env.DB.prepare(`
      INSERT INTO order_items
        (id, order_id, product_id, product_name, unit_price, quantity, size, variant, color, image_url)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), id, item.id, item.name, quantity, item.size, item.variant, item.color, item.image),
    env.DB.prepare(`
      INSERT INTO inventory_reservations (id, order_id, product_id, size, quantity, status)
      VALUES (?, ?, ?, ?, ?, 'committed')
    `).bind(reservation.id, id, reservation.productId, reservation.size, reservation.quantity),
    env.DB.prepare("UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock >= ?")
      .bind(quantity, product.id, quantity),
    env.DB.prepare("UPDATE product_sizes SET stock = stock - ? WHERE product_id = ? AND size = ? AND stock >= ?")
      .bind(quantity, product.id, replacementSize, quantity)
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (/insufficient replacement stock/i.test(String(error?.message || error))) throw httpError("The selected replacement size is no longer available", 409);
    throw error;
  }
  invalidateProductEnrichment();
  const created = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!created) throw new Error("Replacement order could not be loaded after creation");
  await createAdminNotification(env, {
    type: "new_order",
    priority: "high",
    title: "Replacement product order created",
    message: `${created.customer_name || created.customer_email} · ${created.order_number} · ${item.name} · size ${replacementSize}`,
    dedupeKey: `order:${id}`,
    orderId: id,
    productId: item.id
  }).catch(() => null);
  const confirmationSent = await sendOrderEmail(env, created, "confirmation");
  if (confirmationSent) {
    await env.DB.prepare("UPDATE orders SET confirmation_email_sent_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id).run();
  }
  return formatOrder(created);
}

const RETURN_WITH_ORDER_SELECT = `
  SELECT rr.*,
    o.id AS joined_order_id,
    o.order_number AS joined_order_number,
    o.customer_email AS joined_customer_email,
    o.customer_name AS joined_customer_name,
    o.items_json AS joined_items_json,
    o.subtotal AS joined_subtotal,
    o.discount AS joined_discount,
    o.coupon_code AS joined_coupon_code,
    o.total AS joined_total,
    o.status AS joined_status,
    o.payment_method AS joined_payment_method,
    o.payment_status AS joined_payment_status,
    o.tracking_number AS joined_tracking_number,
    o.shipping_json AS joined_shipping_json,
    o.created_at AS joined_created_at,
    o.updated_at AS joined_updated_at,
    (SELECT ro.order_number FROM orders ro WHERE ro.id = rr.replacement_order_id) AS replacement_order_number
  FROM return_requests rr
  LEFT JOIN orders o ON o.id = rr.order_id
`;

function formatReturnWithOrder(row) {
  const order = row.joined_order_id ? formatOrder({
    id: row.joined_order_id,
    order_number: row.joined_order_number,
    customer_email: row.joined_customer_email,
    customer_name: row.joined_customer_name,
    items_json: row.joined_items_json,
    subtotal: row.joined_subtotal,
    discount: row.joined_discount,
    coupon_code: row.joined_coupon_code,
    total: row.joined_total,
    status: row.joined_status,
    payment_method: row.joined_payment_method,
    payment_status: row.joined_payment_status,
    tracking_number: row.joined_tracking_number,
    shipping_json: row.joined_shipping_json,
    created_at: row.joined_created_at,
    updated_at: row.joined_updated_at
  }) : null;
  const result = { ...row, order };
  for (const key of Object.keys(result)) {
    if (key.startsWith("joined_")) delete result[key];
  }
  return result;
}

async function getReturnRequest(env, id) {
  const row = await env.DB.prepare(`${RETURN_WITH_ORDER_SELECT} WHERE rr.id = ?`).bind(id).first();
  return row ? formatReturnWithOrder(row) : null;
}

async function listReturns(env, user, scope) {
  if (scope === "admin") requireAdmin(user);
  const query = scope === "admin"
    ? `${RETURN_WITH_ORDER_SELECT} ORDER BY rr.created_at DESC`
    : `${RETURN_WITH_ORDER_SELECT} WHERE rr.customer_email = ? ORDER BY rr.created_at DESC`;
  const statement = scope === "admin" ? env.DB.prepare(query) : env.DB.prepare(query).bind(user.email.toLowerCase());
  const { results } = await statement.all();
  return json({ requests: results.map(formatReturnWithOrder) });
}

async function updateReturnRequest(request, env, user, id) {
  const body = await readJson(request);
  const status = String(body.status || "").trim().toLowerCase();
  const returnStatuses = ["requested", "approved", "rejected", "received", "refunded", "completed", "cancelled"];
  if (!returnStatuses.includes(status)) {
    return json({ error: "Invalid after-sales status" }, 400);
  }
  const current = await env.DB.prepare("SELECT * FROM return_requests WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "After-sales request not found" }, 404);
  const allowedTransitions = {
    requested: new Set(["approved", "rejected", "cancelled"]),
    approved: new Set(["received", "refunded", "rejected", "cancelled"]),
    received: new Set(["refunded", "rejected", "cancelled"]),
    refunded: new Set(["completed"]),
    rejected: new Set(),
    completed: new Set(),
    cancelled: new Set()
  };
  if (status !== current.status && !allowedTransitions[current.status]?.has(status)) {
    return json({ error: `Cannot move an after-sales request from ${current.status} to ${status}` }, 409);
  }
  if (status === current.status) return json({ request: await getReturnRequest(env, id) });
  const notes = String(body.notes ?? current.notes ?? "").trim().slice(0, 1000);
  const order = current.order_id ? await env.DB.prepare("SELECT total, payment_method FROM orders WHERE id = ?").bind(current.order_id).first() : null;
  const orderTotal = Math.max(0, Math.floor(Number(order?.total) || 0));
  const refundDestination = ["cod", "demo"].includes(order?.payment_method) ? "store_credit" : (current.refund_destination || "original");
  const refundAmount = body.refund_amount === "" || body.refund_amount === null || body.refund_amount === undefined
    ? Math.max(0, Math.floor(Number(current.refund_amount) || orderTotal))
    : Math.floor(Number(body.refund_amount));
  if (!Number.isSafeInteger(refundAmount) || refundAmount < 0 || refundAmount > orderTotal) {
    return json({ error: `Refund amount must be between ₹0 and ${formatInr(orderTotal)}` }, 400);
  }
  const processedAt = status === "refunded" ? (current.refund_processed_at || new Date().toISOString()) : current.refund_processed_at;
  const statements = [env.DB.prepare("UPDATE return_requests SET status = ?, notes = ?, refund_amount = ?, refund_processed_at = ?, refund_destination = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, notes, refundAmount, processedAt, refundDestination, id)];
  if (status === "refunded" && current.status !== "refunded" && refundDestination === "store_credit") {
    const customerEmail = String(current.customer_email || "").trim().toLowerCase();
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO store_credit_ledger (id, user_email, amount, kind, description, order_id, return_request_id) VALUES (?, ?, ?, 'refund', ?, ?, ?)")
      .bind(crypto.randomUUID(), customerEmail, refundAmount, `Refund credit for ${current.order_id}`, current.order_id, id));
    statements.push(env.DB.prepare(`INSERT INTO store_credit_accounts (user_email, balance, updated_at)
      SELECT ?, COALESCE(SUM(amount), 0), CURRENT_TIMESTAMP FROM store_credit_ledger WHERE user_email = ?
      ON CONFLICT(user_email) DO UPDATE SET balance = excluded.balance, updated_at = CURRENT_TIMESTAMP`)
      .bind(customerEmail, customerEmail));
  }
  await env.DB.batch(statements);
  await writeAuditLog(env, user.email, "update_return_request", "return_request", id, { from: current.status, to: status });
  const updatedRequest = await getReturnRequest(env, id);
  await sendReturnEmail(env, updatedRequest, status);
  return json({ request: updatedRequest });
}

async function getLoyalty(env, user) {
  const email = String(user.email || "").trim().toLowerCase();
  let codeRow = await env.DB.prepare("SELECT code FROM referral_codes WHERE user_email = ?").bind(email).first();
  if (!codeRow) {
    const code = `GLAMIA-${await shortHash(email)}`;
    await env.DB.prepare("INSERT OR IGNORE INTO referral_codes (code, user_email) VALUES (?, ?)").bind(code, email).run();
    codeRow = await env.DB.prepare("SELECT code FROM referral_codes WHERE user_email = ?").bind(email).first();
  }
  const account = await env.DB.prepare("SELECT balance FROM store_credit_accounts WHERE user_email = ?").bind(email).first();
  const { results: ledger } = await env.DB.prepare("SELECT amount, kind, description, order_id, created_at FROM store_credit_ledger WHERE user_email = ? ORDER BY created_at DESC LIMIT 20").bind(email).all();
  const { results: referrals } = await env.DB.prepare("SELECT referred_email, created_at FROM referral_rewards WHERE referrer_email = ? ORDER BY created_at DESC LIMIT 20").bind(email).all();
  return json({ balance: Number(account?.balance || 0), referral_code: codeRow?.code || null, ledger, referrals });
}

async function applyReferral(env, referredEmail, rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return false;
  const referrer = await env.DB.prepare("SELECT user_email FROM referral_codes WHERE code = ?").bind(code).first();
  const referred = String(referredEmail || "").trim().toLowerCase();
  if (!referrer || !referred || referrer.user_email === referred) return false;
  const existing = await env.DB.prepare("SELECT referred_email FROM referral_rewards WHERE referred_email = ?").bind(referred).first();
  if (existing) return false;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO referral_rewards (referred_email, referrer_email, referral_code) VALUES (?, ?, ?)").bind(referred, referrer.user_email, code),
    env.DB.prepare(`INSERT INTO store_credit_accounts (user_email, balance) VALUES (?, 500) ON CONFLICT(user_email) DO UPDATE SET balance = store_credit_accounts.balance + 500, updated_at = CURRENT_TIMESTAMP`).bind(referred),
    env.DB.prepare(`INSERT INTO store_credit_accounts (user_email, balance) VALUES (?, 1000) ON CONFLICT(user_email) DO UPDATE SET balance = store_credit_accounts.balance + 1000, updated_at = CURRENT_TIMESTAMP`).bind(referrer.user_email),
    env.DB.prepare("INSERT INTO store_credit_ledger (id, user_email, amount, kind, description) VALUES (?, ?, 500, 'referral', 'Welcome credit for joining through a Glamia referral', ?)").bind(crypto.randomUUID(), referred, null),
    env.DB.prepare("INSERT INTO store_credit_ledger (id, user_email, amount, kind, description) VALUES (?, ?, 1000, 'referral', 'Referral reward for welcoming a new Glamia member', ?)").bind(crypto.randomUUID(), referrer.user_email, null)
  ]);
  return true;
}

async function shortHash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].slice(0, 5).map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function listRestockSubscriptions(env, user) {
  const { results } = await env.DB.prepare("SELECT * FROM restock_subscriptions WHERE user_email = ? ORDER BY created_at DESC")
    .bind(user.email.toLowerCase()).all();
  return json({ subscriptions: results });
}

async function createRestockSubscription(request, env, user) {
  const body = await readJson(request);
  const productId = String(body.product_id || body.id || "").trim();
  const size = String(body.size || "").trim();
  if (!productId) return json({ error: "Product is required" }, 400);
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? AND status = 'live'").bind(productId).first();
  if (!product) return json({ error: "Product not found" }, 404);
  await env.DB.prepare(`INSERT INTO restock_subscriptions (user_email, product_id, size) VALUES (?, ?, ?) ON CONFLICT(user_email, product_id, size) DO UPDATE SET notified_at = NULL`)
    .bind(user.email.toLowerCase(), productId, size).run();
  return json({ ok: true });
}

async function deleteRestockSubscription(request, env, user) {
  const body = await readJson(request);
  const productId = String(body.product_id || body.id || "").trim();
  const size = String(body.size || "").trim();
  await env.DB.prepare("DELETE FROM restock_subscriptions WHERE user_email = ? AND product_id = ? AND size = ?")
    .bind(user.email.toLowerCase(), productId, size).run();
  return json({ ok: true });
}

async function healthCheck(env) {
  const started = Date.now();
  const emailConfigured = Boolean(String(env.BREVO_API_KEY || "").trim() && String(env.BREVO_FROM_EMAIL || "").trim());
  try {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: row?.ok === 1, service: "glamia", database: "ok", email_delivery: emailConfigured ? "configured" : "not_configured", checked_at: new Date().toISOString(), latency_ms: Date.now() - started });
  } catch {
    return json({ ok: false, service: "glamia", database: "unavailable", email_delivery: emailConfigured ? "configured" : "not_configured", checked_at: new Date().toISOString() }, 503);
  }
}

function supportTicketView(row) {
  return {
    id: row.id, ticket_number: row.ticket_number, customer_email: row.customer_email,
    customer_name: row.customer_name, order_id: row.order_id || "", subject: row.subject,
    message: row.message, status: row.status, priority: row.priority,
    admin_note: row.admin_note || "", created_at: row.created_at, updated_at: row.updated_at,
    resolved_at: row.resolved_at || null
  };
}

async function createSupportTicket(request, env, user) {
  const body = await readJson(request);
  const email = String(body.email || user?.email || "").trim().toLowerCase();
  const name = String(body.name || user?.name || "").trim().slice(0, 100);
  const subject = String(body.subject || "").trim().slice(0, 140);
  const message = String(body.message || "").trim().slice(0, 2000);
  const orderId = String(body.order_id || "").trim().slice(0, 100);
  if (!isRealCustomerEmail(email)) return json({ error: "Enter a valid email address" }, 400);
  if (subject.length < 3) return json({ error: "Add a short subject" }, 400);
  if (message.length < 10) return json({ error: "Tell us a little more so we can help" }, 400);
  if (orderId) {
    const order = await env.DB.prepare("SELECT id, customer_email FROM orders WHERE id = ? OR order_number = ? LIMIT 1").bind(orderId, orderId).first();
    if (!order) return json({ error: "That order could not be found" }, 400);
    if (user && String(order.customer_email).toLowerCase() !== String(user.email).toLowerCase()) return json({ error: "That order does not belong to this account" }, 403);
  }
  const id = crypto.randomUUID();
  const ticketNumber = `GM-SUP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  await env.DB.prepare("INSERT INTO support_tickets (id, ticket_number, customer_email, customer_name, order_id, subject, message) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, ticketNumber, email, name, orderId, subject, message).run();
  await env.DB.prepare("INSERT INTO support_messages (id, ticket_id, sender_role, sender_email, message) VALUES (?, ?, 'customer', ?, ?)")
    .bind(crypto.randomUUID(), id, email, message).run();
  const created = await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first();
  await createAdminNotification(env, {
    type: "support_ticket",
    priority: "high",
    title: "New support ticket",
    message: `${name || email} · ${subject}${orderId ? ` · Order ${orderId}` : ""}`,
    dedupeKey: `support-ticket:${id}`,
    orderId: orderId || null
  }).catch(() => null);
  return json({ ticket: supportTicketView(created) }, 201);
}

async function listSupportTickets(env, user, scope) {
  if (scope === "admin") requireAdmin(user);
  const statement = scope === "admin"
    ? env.DB.prepare("SELECT * FROM support_tickets ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC LIMIT 300")
    : env.DB.prepare("SELECT * FROM support_tickets WHERE customer_email = ? ORDER BY created_at DESC").bind(String(user.email).toLowerCase());
  const { results } = await statement.all();
  return json({ tickets: results.map(supportTicketView) });
}

async function supportTicketForUser(env, user, ticketId) {
  const ticket = await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(ticketId).first();
  if (!ticket) throw httpError("Support ticket not found", 404);
  if (user.role !== "admin" && String(ticket.customer_email || "").toLowerCase() !== String(user.email || "").toLowerCase()) {
    throw httpError("That support ticket does not belong to this account", 403);
  }
  return ticket;
}

async function listSupportMessages(env, user, ticketId) {
  const ticket = await supportTicketForUser(env, user, ticketId);
  const { results } = await env.DB.prepare("SELECT id, ticket_id, sender_role, sender_email, message, created_at FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC")
    .bind(ticketId).all();
  if (!results.length && ticket.message) {
    results.push({
      id: `legacy-${ticket.id}`,
      ticket_id: ticket.id,
      sender_role: "customer",
      sender_email: ticket.customer_email,
      message: ticket.message,
      created_at: ticket.created_at
    });
  }
  return json({ messages: results });
}

async function createSupportMessage(request, env, user, ticketId) {
  const ticket = await supportTicketForUser(env, user, ticketId);
  const body = await readJson(request);
  const message = String(body.message || "").trim().slice(0, 2000);
  if (message.length < 1) return json({ error: "Write a message before sending" }, 400);
  const senderRole = user.role === "admin" ? "admin" : "customer";
  const senderEmail = String(user.email || "").trim().toLowerCase();
  const id = crypto.randomUUID();
  const nextStatus = senderRole === "admin" ? "in_progress" : "open";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO support_messages (id, ticket_id, sender_role, sender_email, message) VALUES (?, ?, ?, ?, ?)")
      .bind(id, ticketId, senderRole, senderEmail, message),
    env.DB.prepare("UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP, resolved_at = NULL WHERE id = ?")
      .bind(nextStatus, ticketId)
  ]);
  if (senderRole === "admin") {
    await writeAuditLog(env, user.email, "reply_support_ticket", "support_ticket", ticketId, { message_id: id });
  }
  const created = await env.DB.prepare("SELECT id, ticket_id, sender_role, sender_email, message, created_at FROM support_messages WHERE id = ?").bind(id).first();
  return json({ message: created, ticket: supportTicketView(await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(ticketId).first()) }, 201);
}

async function updateSupportTicket(request, env, user, id) {
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Support ticket not found" }, 404);
  const status = body.status === undefined ? current.status : String(body.status).trim();
  const priority = body.priority === undefined ? current.priority : String(body.priority).trim();
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) return json({ error: "Invalid ticket status" }, 400);
  if (!["low", "normal", "high", "urgent"].includes(priority)) return json({ error: "Invalid ticket priority" }, 400);
  const note = String(body.admin_note ?? current.admin_note ?? "").trim().slice(0, 2000);
  await env.DB.prepare("UPDATE support_tickets SET status = ?, priority = ?, admin_note = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, priority, note, ["resolved", "closed"].includes(status) ? (current.resolved_at || new Date().toISOString()) : null, id).run();
  await writeAuditLog(env, user.email, "update_support_ticket", "support_ticket", id, { status, priority });
  return json({ ticket: supportTicketView(await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first()) });
}

async function exportBackup(env, adminUser) {
  const tables = [
    "users", "products", "product_sizes", "reviews", "hero_slides", "categories", "subcategories",
    "storefront_settings", "orders", "order_items", "inventory_reservations", "order_stock_releases",
    "coupons", "coupon_email_targets", "coupon_redemptions", "user_addresses", "profile_phones",
    "return_requests", "store_credit_accounts", "store_credit_ledger", "referral_codes", "referral_rewards",
    "support_tickets", "support_messages", "product_questions", "restock_subscriptions", "email_delivery_log",
    "admin_notifications", "admin_audit_log", "cart_adds", "wishlist_adds", "upload_usage", "page_views", "counters"
  ];
  const backup = { generated_at: new Date().toISOString(), tables: {} };
  const tableResults = await env.DB.batch(tables.map(table => env.DB.prepare(`SELECT * FROM ${table}`)));
  tables.forEach((table, index) => { backup.tables[table] = tableResults[index].results || []; });
  await writeAuditLog(env, adminUser?.email, "export_backup", "backup", null, { tables, generated_at: backup.generated_at });
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "Content-Disposition": `attachment; filename="glamia-backup-${new Date().toISOString().slice(0, 10)}.json"`
    }
  });
}

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

async function updateOrderStatus(request, env, id, adminUser = null) {
  const body = await readJson(request);
  if (!ORDER_STATUSES.includes(body.status)) return json({ error: "Invalid order status" }, 400);
  const hasTracking = Object.prototype.hasOwnProperty.call(body, "tracking_number");
  if (hasTracking && String(body.tracking_number || "").trim().length > 80) {
    return json({ error: "Tracking number must be 80 characters or fewer" }, 400);
  }
  const current = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Order not found" }, 404);
  if (current.status === "cancelled" && body.status !== "cancelled") {
    return json({ error: "Cancelled orders cannot be reopened" }, 409);
  }
  const statements = [];
  const trackingNumber = hasTracking ? String(body.tracking_number || "").trim() : String(current.tracking_number || "");
  const assigningTracking = hasTracking && trackingNumber && !String(current.tracking_number || "").trim();
  const nextStatus = body.status === "cancelled"
    ? "cancelled"
    : assigningTracking && current.status !== "cancelled"
      ? "shipped"
      : body.status;
  if (body.status === "cancelled" && current.status !== "cancelled") {
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO order_stock_releases (order_id)
      SELECT id FROM orders WHERE id = ? AND status != 'cancelled'
    `).bind(id));
    statements.push(env.DB.prepare("DELETE FROM coupon_redemptions WHERE order_id = ?").bind(id));
  }
  statements.push(env.DB.prepare("UPDATE orders SET status = ?, tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(nextStatus, trackingNumber || null, id));
  await env.DB.batch(statements);
  invalidateProductEnrichment();
  const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (adminUser) await writeAuditLog(env, adminUser.email, "update_order_status", "order", id, { from: current.status, to: nextStatus, tracking_number: trackingNumber || null });
  if (nextStatus === "cancelled" && current.status !== "cancelled") {
    await createAdminNotification(env, {
      type: "cancelled_order",
      priority: "urgent",
      title: "Order cancelled",
      message: `${updated.customer_name || updated.customer_email} · ${updated.order_number || updated.id}`,
      dedupeKey: `cancelled-order:${id}`,
      orderId: id
    }).catch(() => null);
    await sendOrderEmail(env, updated, "cancelled");
  }
  if (nextStatus === "shipped" && current.status !== "shipped") {
    await sendOrderEmail(env, updated, "shipped");
  }
  if (nextStatus === "delivered" && current.status !== "delivered" && !current.delivery_email_sent_at) {
    const deliverySent = await sendOrderEmail(env, updated, "delivery");
    if (deliverySent) {
      await env.DB.prepare("UPDATE orders SET delivery_email_sent_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id).run();
    }
  }
  return json({ order: formatOrder(updated) });
}

async function sendOrderEmail(env, row, type) {
  const fromEmail = String(env.BREVO_FROM_EMAIL || "").trim();
  const recipient = String(row?.customer_email || "").trim();
  if (!isRealCustomerEmail(recipient)) return false;

  const emailType = ["confirmation", "shipped", "delivery", "cancelled"].includes(type) ? type : "confirmation";
  const order = formatOrder(row);
  const isReplacement = order.order_type === "replacement";
  const isPreorder = order.order_type === "preorder" || order.items.some(item => item.preorder);
  const orderLabel = isReplacement ? "replacement order" : "order";
  const itemLines = order.items.map(item => {
    const selection = [item.size, item.variant, item.color].filter(Boolean).join(" · ");
    const details = selection ? ` (${selection})` : "";
    return `${item.name}${details} · Qty ${item.quantity} · ${formatInr(item.price * item.quantity)}`;
  });
  const firstName = String(order.customer_name || "there").trim().split(/\s+/)[0] || "there";
  const subject = {
    confirmation: `${isReplacement ? "Replacement order" : "Order"} ${order.order_number} received · Glamia`,
    shipped: `Your Glamia ${orderLabel} ${order.order_number} is on the way`,
    delivery: `Your Glamia ${orderLabel} ${order.order_number} has been delivered`,
    cancelled: `Your Glamia ${orderLabel} ${order.order_number} was cancelled`
  }[emailType];
  const eventLabel = {
    confirmation: isReplacement ? "Your replacement product order is ready" : "Thank you for your order",
    shipped: `Your ${orderLabel} is on the way`,
    delivery: `Your ${orderLabel} has been delivered`,
    cancelled: `Your ${orderLabel} has been cancelled`
  }[emailType];
  const eventTime = emailType === "confirmation" ? order.created_at : order.updated_at;
  const shipping = order.shipping || {};
  const shippingLine = [shipping.line1, shipping.line2, shipping.city, shipping.state, shipping.pin, shipping.country || "India"]
    .filter(Boolean).join(", ");
  const trackingLine = order.tracking_number ? `Tracking number: ${order.tracking_number}` : "";
  const preorderLine = isPreorder ? "This order includes a pre-order item. We’ll keep you updated as it moves toward dispatch." : "";
  const statusLine = emailType === "cancelled"
    ? "If you did not request this cancellation, please contact Glamia support."
    : emailType === "shipped" && !trackingLine
      ? "Your tracking details will be shared as soon as they are available."
      : "";
  const htmlItems = order.items.map(item => {
    const selection = [item.size, item.variant, item.color].filter(Boolean).join(" · ");
    return `<li><strong>${escapeHtml(item.name)}</strong>${selection ? ` · ${escapeHtml(selection)}` : ""} · Qty ${Number(item.quantity) || 0} · ${formatInr(item.price * item.quantity)}</li>`;
  }).join("");
  const htmlContent = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#241f18;line-height:1.6"><h1 style="letter-spacing:.18em">GLAMIA</h1><p>Hi ${escapeHtml(firstName)},</p><h2>${escapeHtml(eventLabel)}</h2><p>Order <strong>${escapeHtml(order.order_number)}</strong> · ${escapeHtml(formatOrderDate(eventTime))}</p>${statusLine ? `<p>${escapeHtml(statusLine)}</p>` : ""}${trackingLine ? `<p>${escapeHtml(trackingLine)}</p>` : ""}${preorderLine ? `<p>${escapeHtml(preorderLine)}</p>` : ""}<ul>${htmlItems}</ul><p>Subtotal: ${formatInr(order.subtotal)}<br>Discount: ${formatInr(order.discount)}<br><strong>Total: ${formatInr(order.total)}</strong></p><p>Payment: ${escapeHtml(formatPaymentMethod(order.payment_method).toUpperCase())}</p>${shippingLine ? `<p>Delivery address: ${escapeHtml(shippingLine)}</p>` : ""}<p>Warmly,<br>Team Glamia</p></body></html>`;
  const textContent = [
    `Hi ${firstName},`,
    "",
    eventLabel,
    `Order ${order.order_number} · ${formatOrderDate(eventTime)}`,
    statusLine,
    trackingLine,
    preorderLine,
    "",
    ...itemLines,
    "",
    `Subtotal: ${formatInr(order.subtotal)}`,
    `Discount: ${formatInr(order.discount)}`,
    `Total: ${formatInr(order.total)}`,
    `Payment: ${formatPaymentMethod(order.payment_method).toUpperCase()}`,
    shippingLine ? `Delivery address: ${shippingLine}` : "",
    "",
    "Warmly,",
    "Team Glamia"
  ].filter(Boolean).join("\n");

  return deliverBrevoEmail(env, {
    eventType: `order-${emailType}`,
    dedupeKey: `order:${order.id}:${emailType}`,
    recipient,
    userEmail: recipient,
    orderId: order.id,
    payload: {
      sender: { name: env.BREVO_FROM_NAME || "Glamia", email: fromEmail },
      to: [{ email: recipient, name: order.customer_name || recipient }],
      subject,
      htmlContent,
      textContent
    }
  });
}

async function sendReturnEmail(env, returnRequest, status) {
  const fromEmail = String(env.BREVO_FROM_EMAIL || "").trim();
  const recipient = String(returnRequest?.customer_email || returnRequest?.order?.customer_email || "").trim();
  if (!isRealCustomerEmail(recipient) || !returnRequest?.id) return false;

  const requestType = returnRequest.type === "exchange" ? "exchange" : "return/refund";
  const orderNumber = returnRequest.order?.order_number || returnRequest.order_id || "your order";
  const statusCopy = {
    requested: "We’ve received your request and our team will review it shortly.",
    approved: "Your request has been approved. We’ll share the next steps shortly.",
    rejected: "We’re unable to approve this request. Please contact Glamia support if you need help.",
    received: "We’ve received the returned item and will complete the next step shortly.",
    refunded: returnRequest.refund_destination === "store_credit"
      ? `A store credit of ${formatInr(returnRequest.refund_amount)} has been added to your Glamia account.`
      : `Your refund of ${formatInr(returnRequest.refund_amount)} has been marked for processing.`,
    completed: "Your after-sales request is now complete.",
    cancelled: "Your after-sales request has been cancelled."
  }[status] || "Your after-sales request has been updated.";
  const firstName = String(returnRequest.order?.customer_name || recipient).trim().split(/\s+/)[0] || "there";
  const subject = `Glamia ${requestType} update for ${orderNumber} · ${status}`;
  const eventLabel = `${requestType[0].toUpperCase()}${requestType.slice(1)} request · ${status}`;
  const eventTime = returnRequest.updated_at || returnRequest.created_at;
  const notes = String(returnRequest.notes || "").trim();
  const htmlContent = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#241f18;line-height:1.6"><h1 style="letter-spacing:.18em">GLAMIA</h1><p>Hi ${escapeHtml(firstName)},</p><h2>${escapeHtml(eventLabel)}</h2><p>Order <strong>${escapeHtml(orderNumber)}</strong> · ${escapeHtml(formatOrderDate(eventTime))}</p><p>${escapeHtml(statusCopy)}</p>${notes ? `<p>Note from Glamia: ${escapeHtml(notes)}</p>` : ""}<p>Warmly,<br>Team Glamia</p></body></html>`;
  const textContent = [
    `Hi ${firstName},`,
    "",
    eventLabel,
    `Order ${orderNumber} · ${formatOrderDate(eventTime)}`,
    "",
    statusCopy,
    notes ? `Note from Glamia: ${notes}` : "",
    "",
    "Warmly,",
    "Team Glamia"
  ].filter(Boolean).join("\n");

  return deliverBrevoEmail(env, {
    eventType: `return-${status}`,
    dedupeKey: `return:${returnRequest.id}:${status}`,
    recipient,
    userEmail: recipient,
    orderId: returnRequest.order_id || returnRequest.order?.id || null,
    payload: {
      sender: { name: env.BREVO_FROM_NAME || "Glamia", email: fromEmail },
      to: [{ email: recipient, name: returnRequest.order?.customer_name || recipient }],
      subject,
      htmlContent,
      textContent
    }
  });
}

async function deliverBrevoEmail(env, { eventType, dedupeKey = null, recipient, userEmail = null, orderId = null, payload, existingId = null }) {
  let id = existingId;
  let current = existingId
    ? await env.DB.prepare("SELECT * FROM email_delivery_log WHERE id = ?").bind(existingId).first().catch(() => null)
    : null;
  if (!id && dedupeKey) {
    current = await env.DB.prepare("SELECT * FROM email_delivery_log WHERE dedupe_key = ?").bind(dedupeKey).first().catch(() => null);
    if (current?.status === "sent") return true;
    id = current?.id || null;
  }
  if (!id) {
    id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO email_delivery_log (id, event_type, dedupe_key, recipient, order_id, user_email, payload_json, status, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`)
      .bind(id, eventType, dedupeKey, recipient, orderId, userEmail, JSON.stringify(payload)).run().catch(() => null);
    if (dedupeKey) {
      current = await env.DB.prepare("SELECT * FROM email_delivery_log WHERE dedupe_key = ?").bind(dedupeKey).first().catch(() => null);
      if (current) id = current.id;
    }
  }
  if (!current) current = await env.DB.prepare("SELECT * FROM email_delivery_log WHERE id = ?").bind(id).first().catch(() => null);
  if (current?.status === "sent") return true;
  const attempts = Number(current?.attempts || 0) + 1;
  const apiKey = String(env.BREVO_API_KEY || "").trim();
  const fromEmail = String(env.BREVO_FROM_EMAIL || "").trim();
  if (!apiKey || !fromEmail) {
    await env.DB.prepare("UPDATE email_delivery_log SET status = 'skipped', attempts = ?, last_error = ?, next_attempt_at = NULL WHERE id = ?")
      .bind(attempts, "Brevo is not configured", id).run().catch(() => null);
    return false;
  }
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const responseText = await response.text();
    if (!response.ok) {
      const retryAt = attempts < 5 ? new Date(Date.now() + Math.min(60 * 60_000, 2 ** attempts * 60_000)).toISOString() : null;
      await env.DB.prepare("UPDATE email_delivery_log SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?")
        .bind(attempts, `Brevo ${response.status}: ${responseText.slice(0, 500)}`, retryAt, id).run().catch(() => null);
      return false;
    }
    let providerId = "";
    try { providerId = JSON.parse(responseText)?.messageId || ""; } catch {}
    await env.DB.prepare("UPDATE email_delivery_log SET status = 'sent', attempts = ?, provider_id = ?, last_error = NULL, next_attempt_at = NULL, sent_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(attempts, providerId, id).run().catch(() => null);
    return true;
  } catch (error) {
    const retryAt = attempts < 5 ? new Date(Date.now() + Math.min(60 * 60_000, 2 ** attempts * 60_000)).toISOString() : null;
    await env.DB.prepare("UPDATE email_delivery_log SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?")
      .bind(attempts, String(error?.message || error).slice(0, 500), retryAt, id).run().catch(() => null);
    return false;
  }
}

async function processDueEmailEvents(env) {
  const { results } = await env.DB.prepare(`
    SELECT * FROM email_delivery_log
    WHERE status IN ('pending', 'failed')
      AND attempts < 5
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= CURRENT_TIMESTAMP)
    ORDER BY created_at ASC
    LIMIT 20
  `).all().catch(() => ({ results: [] }));
  for (const row of results || []) {
    let payload;
    try { payload = JSON.parse(row.payload_json); } catch { continue; }
    await deliverBrevoEmail(env, {
      eventType: row.event_type,
      dedupeKey: row.dedupe_key || null,
      recipient: row.recipient,
      userEmail: row.user_email,
      orderId: row.order_id,
      payload,
      existingId: row.id
    });
  }
}

function addR2References(value, references) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("/api/assets/")) {
      try { references.add(decodeURIComponent(text.replace("/api/assets/", ""))); } catch {}
    } else if (/^(products|reviews)\//.test(text)) {
      references.add(text);
    }
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
      try { addR2References(JSON.parse(text), references); } catch {}
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => addR2References(entry, references));
    return;
  }
  if (typeof value === "object") Object.values(value).forEach((entry) => addR2References(entry, references));
}

async function referencedR2Keys(env) {
  const references = new Set();
  // These are the tables that can currently store product/review media. Scan
  // every column, including JSON and legacy key columns, so future media
  // fields do not silently turn into cleanup candidates.
  for (const table of ["products", "reviews", "product_questions", "hero_slides", "storefront_settings"]) {
    const result = await env.DB.prepare(`SELECT * FROM ${table}`).all().catch(() => ({ results: [] }));
    for (const row of result.results || []) addR2References(row, references);
  }
  return references;
}

async function orphanR2Keys(env, references, now) {
  const orphanKeys = [];
  let scanned = 0;
  for (const prefix of R2_CLEANUP_PREFIXES) {
    let cursor;
    do {
      const page = await env.PRODUCT_IMAGES.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const object of page.objects || []) {
        scanned += 1;
        if (references.has(object.key)) continue;
        const uploadedAt = object.uploaded ? new Date(object.uploaded).getTime() : NaN;
        // A grace period prevents an image uploaded during an unfinished
        // listing edit from being deleted before the admin can save it.
        if (!Number.isFinite(uploadedAt) || now - uploadedAt < R2_CLEANUP_GRACE_MS) continue;
        orphanKeys.push(object.key);
      }
      cursor = page.truncated ? page.cursor : null;
    } while (cursor);
  }
  return { orphanKeys: [...new Set(orphanKeys)], scanned };
}

async function runWeeklyR2Cleanup(env) {
  const taskKey = "r2-orphan-cleanup";
  const now = Date.now();
  const leaseUntil = now + 30 * 60 * 1000;
  try {
    const claim = await env.DB.prepare(`
      INSERT INTO maintenance_tasks (task_key, last_run_at, lease_until)
      VALUES (?, NULL, ?)
      ON CONFLICT(task_key) DO UPDATE SET lease_until = excluded.lease_until
      WHERE (last_run_at IS NULL OR last_run_at <= ?)
        AND (lease_until IS NULL OR lease_until <= ?)
    `).bind(taskKey, leaseUntil, now - R2_CLEANUP_INTERVAL_MS, now).run();
    if (Number(claim.meta?.changes || 0) !== 1) return;

    const references = await referencedR2Keys(env);
    const { orphanKeys, scanned } = await orphanR2Keys(env, references, now);
    for (let index = 0; index < orphanKeys.length; index += 1000) {
      await env.PRODUCT_IMAGES.delete(orphanKeys.slice(index, index + 1000));
    }
    await env.DB.prepare("UPDATE maintenance_tasks SET last_run_at = ?, lease_until = NULL WHERE task_key = ?")
      .bind(now, taskKey).run();
    console.log("Weekly R2 orphan cleanup completed", { scanned, referenced: references.size, deleted: orphanKeys.length });
  } catch (error) {
    // A missing migration should never affect storefront traffic. Once the
    // migration is applied, the next five-minute cron tick will retry.
    await env.DB.prepare("UPDATE maintenance_tasks SET lease_until = NULL WHERE task_key = ?")
      .bind(taskKey).run().catch(() => null);
    console.error("Weekly R2 orphan cleanup unavailable", error?.message || error);
  }
}

async function listEmailEvents(env) {
  const { results } = await env.DB.prepare("SELECT id, event_type, recipient, order_id, status, attempts, provider_id, last_error, next_attempt_at, created_at, sent_at FROM email_delivery_log ORDER BY created_at DESC LIMIT 200").all();
  return json({ events: results });
}

async function retryEmailEvent(env, id, user) {
  const row = await env.DB.prepare("SELECT * FROM email_delivery_log WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "Email event not found" }, 404);
  if (row.status === "sent") return json({ ok: true, status: "sent" });
  if (Number(row.attempts || 0) >= 5) return json({ error: "This email has reached its retry limit" }, 409);
  let payload;
  try { payload = JSON.parse(row.payload_json); } catch { return json({ error: "Email payload is invalid" }, 500); }
  const sent = await deliverBrevoEmail(env, { eventType: row.event_type, dedupeKey: row.dedupe_key || null, recipient: row.recipient, userEmail: row.user_email, orderId: row.order_id, payload, existingId: id });
  await writeAuditLog(env, user.email, "retry_email", "email_delivery", id, { sent });
  return json({ ok: sent, status: sent ? "sent" : "failed" });
}

function isRealCustomerEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && !normalized.endsWith("@glamia.local");
}

function formatInr(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatOrderDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

async function listCustomers(env) {
  const { results } = await env.DB.prepare(`
    SELECT u.email, u.name, u.role, u.dob, u.phone, u.created_at, u.last_login_at,
      COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS total_spent
    FROM users u
    LEFT JOIN orders o ON o.customer_email = u.email AND o.status != 'cancelled'
    GROUP BY u.email
    ORDER BY u.created_at DESC
  `).all();
  return json({ customers: results });
}

function taxStateKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function classifyTaxState(state, settings) {
  const saleState = String(state || "").trim();
  const businessState = String(settings?.business_state || "").trim();
  const businessCode = String(settings?.business_state_code || "").trim();
  if (!saleState || (!businessState && !businessCode)) return "unclassified";
  if (taxStateKey(saleState) === taxStateKey(businessState) || saleState === businessCode) return "intra_state";
  return "inter_state";
}

function roundTax(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function getTaxSettings(env) {
  const row = await env.DB.prepare("SELECT business_state, business_state_code, gstin, updated_at FROM tax_settings WHERE id = 1").first();
  return json({ settings: {
    business_state: row?.business_state || "",
    business_state_code: row?.business_state_code || "",
    gstin: row?.gstin || "",
    updated_at: row?.updated_at || null
  } });
}

async function updateTaxSettings(request, env, user) {
  const body = await readJson(request);
  const businessState = String(body.business_state || "").trim().slice(0, 100);
  const businessStateCode = String(body.business_state_code || "").trim().replace(/\D/g, "").slice(0, 2);
  const gstin = String(body.gstin || "").trim().toUpperCase();
  if (businessStateCode && !/^\d{2}$/.test(businessStateCode)) return json({ error: "Choose a valid two-digit GST state code" }, 400);
  if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) return json({ error: "GSTIN must contain 15 letters or numbers" }, 400);
  await env.DB.prepare(`
    INSERT INTO tax_settings (id, business_state, business_state_code, gstin, updated_at)
    VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      business_state = excluded.business_state,
      business_state_code = excluded.business_state_code,
      gstin = excluded.gstin,
      updated_at = CURRENT_TIMESTAMP
  `).bind(businessState, businessStateCode, gstin).run();
  await writeAuditLog(env, user.email, "update_tax_settings", "tax_settings", "1", {
    business_state: businessState,
    business_state_code: businessStateCode,
    gstin_configured: Boolean(gstin)
  });
  return getTaxSettings(env);
}

async function taxComplianceReport(env) {
  const [settingsRow, productResult, orderResult] = await Promise.all([
    env.DB.prepare("SELECT business_state, business_state_code, gstin, updated_at FROM tax_settings WHERE id = 1").first(),
    env.DB.prepare(`
      SELECT id, name, category, subcategory, color, price, status,
        hsn_sac_code, hsn_sac_type, gst_rate, gst_tax_inclusive, created_at
      FROM products
      ORDER BY created_at DESC, id DESC
    `).all(),
    env.DB.prepare(`
      SELECT o.id, o.order_number, o.created_at, o.subtotal, o.discount, o.total,
        o.payment_method, o.shipping_json, o.items_json,
        oi.product_id, oi.product_name, oi.unit_price, oi.quantity, oi.size, oi.color,
        oi.hsn_sac_code AS line_hsn_sac_code, oi.hsn_sac_type AS line_hsn_sac_type,
        oi.gst_rate AS line_gst_rate, oi.gst_tax_inclusive AS line_gst_tax_inclusive,
        p.name AS catalog_name, p.category, p.subcategory,
        p.hsn_sac_code AS catalog_hsn_sac_code, p.hsn_sac_type AS catalog_hsn_sac_type,
        p.gst_rate AS catalog_gst_rate, p.gst_tax_inclusive AS catalog_gst_tax_inclusive
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.status != 'cancelled'
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 5000
    `).all()
  ]);

  const settings = {
    business_state: settingsRow?.business_state || "",
    business_state_code: settingsRow?.business_state_code || "",
    gstin: settingsRow?.gstin || "",
    updated_at: settingsRow?.updated_at || null
  };
  const products = (productResult.results || []).map(row => ({
    id: row.id,
    name: row.name,
    category: row.category || "",
    subcategory: row.subcategory || "",
    color: row.color || "",
    price: Number(row.price || 0),
    status: row.status || "",
    hsn_sac_code: row.hsn_sac_code || "",
    hsn_sac_type: row.hsn_sac_type || "HSN",
    gst_rate: row.gst_rate === null || row.gst_rate === undefined ? null : Number(row.gst_rate),
    gst_tax_inclusive: row.gst_tax_inclusive === undefined ? true : Boolean(row.gst_tax_inclusive),
    created_at: row.created_at || null
  }));
  const productsById = new Map(products.map(product => [String(product.id), product]));
  const groupedOrders = new Map();
  for (const row of orderResult.results || []) {
    if (!groupedOrders.has(row.id)) groupedOrders.set(row.id, { row, items: [] });
    if (row.product_id) groupedOrders.get(row.id).items.push(row);
  }
  for (const order of groupedOrders.values()) {
    if (order.items.length) continue;
    let rawItems = [];
    try { rawItems = JSON.parse(order.row.items_json || "[]"); } catch {}
    order.items = rawItems.map(item => {
      const product = productsById.get(String(item.id || ""));
      return {
        product_id: item.id,
        product_name: item.name || item.product_name || product?.name || item.id || "Product",
        unit_price: item.price ?? product?.price ?? 0,
        quantity: item.quantity,
        size: item.size || "",
        color: item.color || product?.color || "",
        category: product?.category || "",
        subcategory: product?.subcategory || "",
        line_hsn_sac_code: item.hsn_sac_code || "",
        line_hsn_sac_type: item.hsn_sac_type || "HSN",
        line_gst_rate: item.gst_rate ?? null,
        line_gst_tax_inclusive: item.gst_tax_inclusive === undefined ? true : item.gst_tax_inclusive,
        catalog_hsn_sac_code: product?.hsn_sac_code || "",
        catalog_hsn_sac_type: product?.hsn_sac_type || "HSN",
        catalog_gst_rate: product?.gst_rate ?? null,
        catalog_gst_tax_inclusive: product?.gst_tax_inclusive === undefined ? true : product.gst_tax_inclusive
      };
    });
  }

  const sales = [];
  const totals = { gross_sales: 0, taxable_value: 0, tax_amount: 0, cgst: 0, sgst: 0, igst: 0 };
  for (const order of groupedOrders.values()) {
    let shipping = {};
    try { shipping = JSON.parse(order.row.shipping_json || "{}"); } catch {}
    const classification = classifyTaxState(shipping.state, settings);
    const orderSubtotal = Math.max(0, Number(order.row.subtotal || 0));
    const orderDiscount = Math.max(0, Number(order.row.discount || 0));
    const lines = order.items.map(item => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const gross = Math.max(0, Number(item.unit_price || 0) * quantity);
      const discountShare = orderSubtotal > 0 ? Math.min(gross, orderDiscount * (gross / orderSubtotal)) : 0;
      const net = Math.max(0, gross - discountShare);
      const code = String(item.line_hsn_sac_code || item.catalog_hsn_sac_code || "").trim().toUpperCase();
      const type = String(item.line_hsn_sac_type || item.catalog_hsn_sac_type || "HSN").trim().toUpperCase() === "SAC" ? "SAC" : "HSN";
      const rateValue = item.line_gst_rate !== null && item.line_gst_rate !== undefined ? item.line_gst_rate : item.catalog_gst_rate;
      const rate = rateValue === null || rateValue === undefined || rateValue === "" ? null : Number(rateValue);
      const inclusive = item.line_gst_tax_inclusive === undefined || item.line_gst_tax_inclusive === null
        ? Boolean(item.catalog_gst_tax_inclusive)
        : Boolean(item.line_gst_tax_inclusive);
      const taxable = rate === null || !Number.isFinite(rate) ? 0 : inclusive ? net / (1 + rate / 100) : net;
      const tax = rate === null || !Number.isFinite(rate) ? 0 : inclusive ? net - taxable : taxable * rate / 100;
      const line = {
        product_id: item.product_id || "",
        product_name: item.product_name || item.catalog_name || "Product",
        category: item.category || "",
        subcategory: item.subcategory || "",
        code,
        code_type: type,
        quantity,
        gross_value: roundTax(gross),
        taxable_value: roundTax(taxable),
        tax_amount: roundTax(tax),
        gst_rate: Number.isFinite(rate) ? rate : null,
        tax_status: !code ? "missing_code" : !Number.isFinite(rate) ? "missing_rate" : "ready"
      };
      return line;
    });
    const taxableValue = roundTax(lines.reduce((sum, line) => sum + line.taxable_value, 0));
    const taxAmount = roundTax(lines.reduce((sum, line) => sum + line.tax_amount, 0));
    const cgst = classification === "intra_state" ? roundTax(taxAmount / 2) : 0;
    const sgst = classification === "intra_state" ? roundTax(taxAmount - cgst) : 0;
    const igst = classification === "inter_state" ? taxAmount : 0;
    const hasMissing = lines.some(line => line.tax_status !== "ready");
    sales.push({
      id: order.row.id,
      order_number: order.row.order_number || fallbackOrderNumber(order.row),
      created_at: order.row.created_at,
      state: shipping.state || "Unknown",
      state_classification: classification,
      payment_method: formatPaymentMethod(order.row.payment_method),
      order_total: Number(order.row.total || 0),
      taxable_value: taxableValue,
      tax_amount: taxAmount,
      cgst,
      sgst,
      igst,
      tax_status: hasMissing ? "needs_setup" : "ready",
      lines
    });
    totals.gross_sales += Number(order.row.total || 0);
    totals.taxable_value += taxableValue;
    totals.tax_amount += taxAmount;
    totals.cgst += cgst;
    totals.sgst += sgst;
    totals.igst += igst;
  }
  Object.keys(totals).forEach(key => { totals[key] = roundTax(totals[key]); });
  const mappedProducts = products.filter(product => product.hsn_sac_code && Number.isFinite(product.gst_rate));
  const summary = {
    orders: sales.length,
    gross_sales: totals.gross_sales,
    taxable_value: totals.taxable_value,
    tax_amount: totals.tax_amount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    intra_state_orders: sales.filter(sale => sale.state_classification === "intra_state").length,
    inter_state_orders: sales.filter(sale => sale.state_classification === "inter_state").length,
    unclassified_orders: sales.filter(sale => sale.state_classification === "unclassified").length,
    ready_products: mappedProducts.length,
    missing_code_products: products.filter(product => !product.hsn_sac_code).length,
    missing_rate_products: products.filter(product => product.hsn_sac_code && !Number.isFinite(product.gst_rate)).length,
    hsn_products: products.filter(product => product.hsn_sac_type !== "SAC").length,
    sac_products: products.filter(product => product.hsn_sac_type === "SAC").length
  };
  return json({ settings, products, sales, summary, generated_at: new Date().toISOString() });
}

/* Coupon scoping: 'all', 'category' (scope_value = category/subcategory name) or 'product' (scope_value = product id). */
function couponTargetRules(coupon) {
  let rules = [];
  try {
    rules = JSON.parse(coupon.target_rules || "[]");
  } catch {
    rules = [];
  }
  return Array.isArray(rules)
    ? rules.map(rule => ({
      type: String(rule?.type || "").trim().toLowerCase(),
      value: String(rule?.value ?? rule?.id ?? "").trim()
    })).filter(rule => ["category", "subcategory", "subsubcategory", "product"].includes(rule.type) && rule.value)
    : [];
}

function couponMatches(coupon, row, productId) {
  const rules = couponTargetRules(coupon);
  if (rules.length) {
    const category = String(row.category || "").trim().toLowerCase();
    const subcategory = String(row.subcategory || "").trim().toLowerCase();
    const subSubcategory = String(row.sub_subcategory || row.subsubcategory || row.subSubcategory || "").trim().toLowerCase();
    return rules.some(rule => {
      if (rule.type === "product") return rule.value === productId;
      if (rule.type === "category") return rule.value.toLowerCase() === category;
      if (rule.type === "subsubcategory") return rule.value.toLowerCase() === subSubcategory;
      return rule.value.toLowerCase() === subcategory;
    });
  }
  const scope = coupon.scope || "all";
  if (scope === "category") {
    const targets = (coupon.scope_value || "")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const cat = String(row.category || "").trim().toLowerCase();
    const sub = String(row.subcategory || "").trim().toLowerCase();
    return targets.includes(cat) || targets.includes(sub);
  }
  if (scope === "product") {
    const targets = (coupon.scope_value || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    return targets.includes(productId);
  }
  return true;
}

function normalizeCouponEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidCouponEmail(value) {
  const email = normalizeCouponEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function couponAvailability(coupon, env, user) {
  const now = Date.now();
  const startsAt = coupon.starts_at ? new Date(coupon.starts_at).getTime() : null;
  const endsAt = coupon.ends_at ? new Date(coupon.ends_at).getTime() : null;
  if (startsAt && now < startsAt) return "This coupon is not active yet";
  if (endsAt && now > endsAt) return "This coupon has expired";

  const emailTargetCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM coupon_email_targets WHERE coupon_code = ?"
  ).bind(coupon.code).first();
  if (Number(emailTargetCount?.count || 0) > 0) {
    const email = normalizeCouponEmail(user?.email);
    if (!email) return "This coupon is reserved for selected customer accounts";
    const allowed = await env.DB.prepare(
      "SELECT 1 AS allowed FROM coupon_email_targets WHERE coupon_code = ? AND email = ? LIMIT 1"
    ).bind(coupon.code, email).first();
    if (!allowed) return "This coupon is not available for this account";
  }

  if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
    const usage = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_code = ?"
    ).bind(coupon.code).first();
    if (Number(usage?.count || 0) >= Number(coupon.usage_limit)) return "This coupon has reached its usage limit";
  }

  if (user?.email && coupon.per_user_limit !== null && coupon.per_user_limit !== undefined) {
    const personalUsage = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_code = ? AND customer_email = ?"
    ).bind(coupon.code, normalizeCouponEmail(user.email)).first();
    if (Number(personalUsage?.count || 0) >= Number(coupon.per_user_limit)) {
      return "You have already used this coupon the maximum number of times";
    }
  }
  return null;
}

function couponEligibleSubtotal(coupon, requested, catalog) {
  let eligible = 0;
  for (const entry of requested) {
    const row = catalog.get(entry.id);
    if (!row || !couponMatches(coupon, row, entry.id)) continue;
    eligible += effectivePrice(row) * Math.max(1, Math.floor(Number(entry.quantity) || 1));
  }
  return eligible;
}

function couponDiscount(coupon, eligibleSubtotal) {
  const raw = coupon.type === "percent"
    ? Math.round((eligibleSubtotal * Number(coupon.value || 0)) / 100)
    : Math.min(Number(coupon.value || 0), eligibleSubtotal);
  const cap = coupon.max_discount === null || coupon.max_discount === undefined || coupon.max_discount === ""
    ? null
    : Number(coupon.max_discount);
  return cap !== null && Number.isFinite(cap) && cap >= 0 ? Math.min(raw, Math.floor(cap), eligibleSubtotal) : Math.min(raw, eligibleSubtotal);
}

function couponMinimumCartError(coupon, cartSubtotal) {
  const minimum = Number(coupon.min_cart_value);
  if (!Number.isFinite(minimum) || minimum <= 0 || Number(cartSubtotal) >= minimum) return null;
  return `This coupon requires a minimum cart value of ${formatInr(Math.floor(minimum))}`;
}

async function validateCoupon(request, env, user) {
  const body = await readJson(request);
  const code = String(body.code || "").trim().toUpperCase();
  const requested = normalizeOrderItems(body.items);
  if (!requested.length) return json({ error: "Your cart is empty" }, 400);
  const coupon = await env.DB.prepare("SELECT * FROM coupons WHERE code = ? AND active = 1").bind(code).first();
  if (!coupon) return json({ error: "That coupon code is not valid" }, 400);
  const availabilityError = await couponAvailability(coupon, env, user);
  if (availabilityError) return json({ error: availabilityError }, 400);
  const catalog = await loadLiveProductsById(env, requested);
  const cartSubtotal = requested.reduce((sum, entry) => {
    const row = catalog.get(entry.id);
    return sum + (row ? effectivePrice(row) * Math.max(1, Math.floor(Number(entry.quantity) || 1)) : 0);
  }, 0);
  const minimumCartError = couponMinimumCartError(coupon, cartSubtotal);
  if (minimumCartError) return json({ error: minimumCartError }, 400);
  const eligible = couponEligibleSubtotal(coupon, requested, catalog);
  if (eligible <= 0) {
    const targetMsg = coupon.scope === "category" ? `for "${coupon.scope_value}" items` : coupon.scope === "product" ? "for a specific product" : "";
    return json({ error: `This coupon does not apply to the items in your cart ${targetMsg}`.trim() }, 400);
  }
  const discount = couponDiscount(coupon, eligible);
  return json({
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    scope: coupon.scope || "all",
    scope_value: coupon.scope_value || "",
    targets: couponTargetRules(coupon),
    starts_at: coupon.starts_at || null,
    ends_at: coupon.ends_at || null,
    usage_limit: coupon.usage_limit ?? null,
    per_user_limit: coupon.per_user_limit ?? 1,
    max_discount: coupon.max_discount ?? null,
    min_cart_value: coupon.min_cart_value ?? null,
    discount
  });
}

async function listCoupons(env) {
  const [couponRows, emailTargetRows] = await env.DB.batch([
    env.DB.prepare(`
      SELECT c.*, COUNT(r.id) AS usage_count
      FROM coupons c
      LEFT JOIN coupon_redemptions r ON r.coupon_code = c.code
      GROUP BY c.code
      ORDER BY c.created_at DESC
    `),
    env.DB.prepare("SELECT coupon_code, email FROM coupon_email_targets ORDER BY email ASC")
  ]);
  const emailsByCoupon = new Map();
  for (const row of emailTargetRows.results || []) {
    if (!emailsByCoupon.has(row.coupon_code)) emailsByCoupon.set(row.coupon_code, []);
    emailsByCoupon.get(row.coupon_code).push(row.email);
  }
  return json({ coupons: (couponRows.results || []).map(row => ({
    ...row,
    active: Boolean(row.active),
    targets: couponTargetRules(row),
    email_targets: emailsByCoupon.get(row.code) || [],
    usage_count: Number(row.usage_count || 0)
  })) });
}

async function createCoupon(request, env) {
  const body = await readJson(request);
  const code = String(body.code || "").trim().toUpperCase();
  const type = body.type === "flat" ? "flat" : "percent";
  const value = Math.floor(Number(body.value));
  const scope = ["all", "category", "product", "targeted"].includes(body.scope) ? body.scope : "all";
  const scopeValue = String(body.scope_value || "").trim();
  const rawTargets = Array.isArray(body.targets) ? body.targets : [];
  const targets = rawTargets.map(target => ({
    type: String(target?.type || "").trim().toLowerCase(),
    value: String(target?.value ?? target?.id ?? "").trim()
  })).filter(target => ["category", "subcategory", "subsubcategory", "product"].includes(target.type) && target.value);
  const rawEmailTargets = Array.isArray(body.email_targets) ? body.email_targets : [];
  if (rawEmailTargets.length > 500) return json({ error: "Select no more than 500 eligible email addresses" }, 400);
  const emailTargets = [...new Set(rawEmailTargets.map(normalizeCouponEmail).filter(Boolean))];
  if (emailTargets.some(email => !isValidCouponEmail(email))) {
    return json({ error: "Every eligible email address must be valid" }, 400);
  }
  const startsAt = body.starts_at ? new Date(body.starts_at) : null;
  const endsAt = body.ends_at ? new Date(body.ends_at) : null;
  const usageLimit = body.usage_limit === "" || body.usage_limit === null || body.usage_limit === undefined
    ? null
    : Math.floor(Number(body.usage_limit));
  const perUserLimit = body.per_user_limit === "" || body.per_user_limit === null || body.per_user_limit === undefined
    ? 1
    : Math.floor(Number(body.per_user_limit));
  const maxDiscount = body.max_discount === "" || body.max_discount === null || body.max_discount === undefined
    ? null
    : Math.floor(Number(body.max_discount));
  const minCartValue = body.min_cart_value === "" || body.min_cart_value === null || body.min_cart_value === undefined
    ? null
    : Math.floor(Number(body.min_cart_value));
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) throw httpError("Use 3-24 letters, numbers, or dashes for the code", 400);
  if (!Number.isFinite(value) || value <= 0) throw httpError("Coupon value must be positive", 400);
  if (type === "percent" && value > 90) throw httpError("Percent discounts are capped at 90%", 400);
  if (body.starts_at && Number.isNaN(startsAt.getTime())) throw httpError("Coupon start time is invalid", 400);
  if (body.ends_at && Number.isNaN(endsAt.getTime())) throw httpError("Coupon end time is invalid", 400);
  if (startsAt && endsAt && startsAt >= endsAt) throw httpError("Coupon end time must be after its start time", 400);
  if (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 1)) throw httpError("Usage limit must be a positive whole number", 400);
  if (!Number.isSafeInteger(perUserLimit) || perUserLimit < 1) throw httpError("Per-account limit must be a positive whole number", 400);
  if (maxDiscount !== null && (!Number.isSafeInteger(maxDiscount) || maxDiscount < 0)) throw httpError("Maximum discount must be zero or a positive whole number", 400);
  if (minCartValue !== null && (!Number.isSafeInteger(minCartValue) || minCartValue < 0)) throw httpError("Minimum cart value must be zero or a positive whole number", 400);
  if (scope === "targeted" && !targets.length) return json({ error: "Select at least one category, subcategory, or product" }, 400);
  if (scope === "targeted" && targets.length > 100) return json({ error: "Select no more than 100 coupon targets" }, 400);
  if (scope === "targeted") {
    const productTargets = targets.filter(target => target.type === "product").map(target => target.value);
    const categoryTargets = targets.filter(target => target.type === "category").map(target => target.value);
    const subcategoryTargets = targets.filter(target => target.type === "subcategory").map(target => target.value);
    const [productMatches, categoryMatches, subcategoryMatches] = await env.DB.batch([
      env.DB.prepare(`
        SELECT id AS value FROM products
        WHERE id IN (SELECT CAST(value AS TEXT) FROM json_each(?))
      `).bind(JSON.stringify(productTargets)),
      env.DB.prepare(`
        SELECT LOWER(name) AS value FROM categories
        WHERE LOWER(name) IN (SELECT LOWER(CAST(value AS TEXT)) FROM json_each(?))
      `).bind(JSON.stringify(categoryTargets)),
      env.DB.prepare(`
        SELECT LOWER(name) AS value FROM subcategories
        WHERE LOWER(name) IN (SELECT LOWER(CAST(value AS TEXT)) FROM json_each(?))
      `).bind(JSON.stringify(subcategoryTargets))
    ]);
    const existingProducts = new Set((productMatches.results || []).map(row => row.value));
    const existingCategories = new Set((categoryMatches.results || []).map(row => row.value));
    const existingSubcategories = new Set((subcategoryMatches.results || []).map(row => row.value));
    for (const target of targets) {
      if (target.type === "product") {
        if (!existingProducts.has(target.value)) return json({ error: `Pick a product that exists (${target.value})` }, 400);
      } else if (target.type === "category") {
        if (!existingCategories.has(target.value.toLowerCase())) return json({ error: `Category \"${target.value}\" does not exist` }, 400);
      } else if (target.type === "subcategory") {
        if (!existingSubcategories.has(target.value.toLowerCase())) return json({ error: `Subcategory \"${target.value}\" does not exist` }, 400);
      }
    }
  }
  if (scope === "category") {
    const targets = scopeValue.split(",").map(s => s.trim()).filter(Boolean);
    if (!targets.length) return json({ error: "Select or enter a category" }, 400);
    const { results: matches } = await env.DB.prepare(`
      SELECT LOWER(name) AS value FROM categories
      WHERE LOWER(name) IN (SELECT LOWER(CAST(value AS TEXT)) FROM json_each(?))
      UNION
      SELECT LOWER(name) AS value FROM subcategories
      WHERE LOWER(name) IN (SELECT LOWER(CAST(value AS TEXT)) FROM json_each(?))
      UNION
      SELECT LOWER(category) AS value FROM products
      WHERE LOWER(category) IN (SELECT LOWER(CAST(value AS TEXT)) FROM json_each(?))
      UNION
      SELECT LOWER(subcategory) AS value FROM products
      WHERE LOWER(subcategory) IN (SELECT LOWER(CAST(value AS TEXT)) FROM json_each(?))
    `).bind(...Array(4).fill(JSON.stringify(targets))).all();
    const existing = new Set(matches.map(row => row.value));
    for (const t of targets) {
      if (!existing.has(t.toLowerCase())) {
        return json({ error: `Category "${t}" does not exist` }, 400);
      }
    }
  }
  if (scope === "product") {
    const targets = scopeValue.split(",").map(s => s.trim()).filter(Boolean);
    if (!targets.length) return json({ error: "Select at least one product" }, 400);
    const { results: matches } = await env.DB.prepare(`
      SELECT id FROM products WHERE id IN (SELECT CAST(value AS TEXT) FROM json_each(?))
    `).bind(JSON.stringify(targets)).all();
    const existing = new Set(matches.map(row => row.id));
    for (const t of targets) {
      if (!existing.has(t)) return json({ error: `Pick a product that exists (${t})` }, 400);
    }
  }
  try {
    const statements = [env.DB.prepare(`
      INSERT INTO coupons (code, type, value, active, scope, scope_value, target_rules, starts_at, ends_at, usage_limit, per_user_limit, max_discount, min_cart_value)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      code,
      type,
      value,
      scope,
      scope === "all" ? "" : scopeValue,
      JSON.stringify(scope === "targeted" ? targets : []),
      startsAt ? startsAt.toISOString() : null,
      endsAt ? endsAt.toISOString() : null,
      usageLimit,
      perUserLimit,
      maxDiscount,
      minCartValue
    )];
    if (emailTargets.length) {
      statements.push(env.DB.prepare(`
        INSERT INTO coupon_email_targets (coupon_code, email)
        SELECT ?, CAST(value AS TEXT) FROM json_each(?)
      `).bind(code, JSON.stringify(emailTargets)));
    }
    await env.DB.batch(statements);
  } catch {
    throw httpError("A coupon with that code already exists", 400);
  }
  return json({ coupon: {
    code, type, value, scope, scope_value: scope === "all" ? "" : scopeValue,
    targets: scope === "targeted" ? targets : [],
    starts_at: startsAt ? startsAt.toISOString() : null,
    ends_at: endsAt ? endsAt.toISOString() : null,
    usage_limit: usageLimit,
    per_user_limit: perUserLimit,
    max_discount: maxDiscount,
    min_cart_value: minCartValue,
    email_targets: emailTargets,
    active: true
  } }, 201);
}

async function deleteCoupon(env, code) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM coupon_email_targets WHERE coupon_code = ?").bind(code),
    env.DB.prepare("DELETE FROM coupons WHERE code = ?").bind(code)
  ]);
  return json({ ok: true });
}

async function resetProducts(env) {
  await env.DB.prepare("DELETE FROM products").run();
  await env.DB.prepare("DELETE FROM product_sizes").run();
  await env.DB.prepare("DELETE FROM cart_adds").run();
  await env.DB.prepare("DELETE FROM wishlist_adds").run();
  await env.DB.prepare("DELETE FROM reviews").run();
  const statement = env.DB.prepare(`
    INSERT INTO products (
      id, seller_email, name, category, brand, price, mrp, stock, rating, status, featured, color, sizes_json, image_url, description, material
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await env.DB.batch(seedProducts.map(product => statement.bind(
    product[0],
    product[1],
    product[2],
    product[3],
    product[4],
    product[5],
    product[6],
    product[7],
    product[8],
    product[9],
    product[10],
    product[11],
    JSON.stringify(product[12]),
    product[13],
    product[14],
    product[15]
  )));
  const sizeStockStatements = seedProducts.flatMap(product => {
    const sizes = product[12];
    const base = Math.floor(product[7] / sizes.length);
    const remainder = product[7] % sizes.length;
    return sizes.map((size, index) => env.DB.prepare(
      "INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)"
    ).bind(product[0], size, base + (index < remainder ? 1 : 0)));
  });
  await env.DB.batch(sizeStockStatements);
  return json({ ok: true });
}

function validateMoney(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw httpError(`${label} must be a positive whole number`, 400);
  return number;
}

function validateStock(value, label = "Stock") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw httpError(`${label} must be a non-negative whole number`, 400);
  return number;
}

function validateImageUrl(value, label = "Image", optional = false) {
  const url = String(value || "").trim();
  if (!url && optional) return "";
  if (!url || url.length > 2048) throw httpError(`${label} URL is invalid`, 400);
  if (url.startsWith("/api/assets/")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error();
  } catch {
    throw httpError(`${label} URL is invalid`, 400);
  }
  return url;
}

function validateSizeList(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0 || sizes.length > 30) {
    throw httpError("Add between 1 and 30 sizes", 400);
  }
  const seen = new Set();
  for (const size of sizes) {
    const label = String(size || "").trim();
    const key = label.toLowerCase();
    if (!label || label.length > 20 || seen.has(key)) throw httpError("Sizes must be unique and non-empty", 400);
    seen.add(key);
  }
}

function validateSizeStockObject(sizeStock) {
  if (sizeStock === undefined || sizeStock === null) return;
  if (typeof sizeStock !== "object" || Array.isArray(sizeStock)) throw httpError("size_stock must be an object of size -> stock", 400);
  for (const value of Object.values(sizeStock)) validateStock(value, "Size stock");
}

function validateProduct(product, { requireImages = true } = {}) {
  const required = ["name", "category", "brand", "price", "mrp", "stock", "color", "material", "description"];
  for (const key of required) {
    if (product[key] === undefined || product[key] === "") throw httpError(`Missing ${key}`, 400);
  }
  for (const key of ["name", "category", "brand", "color", "material", "description"]) {
    if (String(product[key]).trim().length === 0 || String(product[key]).length > 500) throw httpError(`${key} is invalid`, 400);
  }
  const price = validateMoney(product.price, "Price");
  const mrp = validateMoney(product.mrp, "MRP");
  validateStock(product.stock);
  if (price > mrp) throw httpError("MRP should be higher than price", 400);
  validateSizeList(product.sizes);
  validateSizeStockObject(product.size_stock);
  if (!Array.isArray(product.images) || !product.images.length || (requireImages && (product.images.length < 4 || product.images.length > 6))) {
    throw httpError("Add between 4 and 6 images (first is the thumbnail)", 400);
  }
  product.images.forEach(image => validateImageUrl(image));
  if (product.variants !== undefined) {
    if (!Array.isArray(product.variants)) throw httpError("Variants must be a list", 400);
    if (product.variants.length > 20) throw httpError("Too many variants", 400);
    const colors = new Set();
    for (const variant of product.variants) {
      if (!variant || !String(variant.color || "").trim()) {
        throw httpError("Each variant needs a colour", 400);
      }
      const color = String(variant.color).trim().toLowerCase();
      if (colors.has(color)) throw httpError("Variant colours must be unique", 400);
      colors.add(color);
      validateSizeList(variant.sizes);
      if (!Array.isArray(variant.images) || variant.images.length < MIN_VARIANT_IMAGES || variant.images.length > MAX_VARIANT_IMAGES) {
        throw httpError(`Each variant needs ${MIN_VARIANT_IMAGES}–${MAX_VARIANT_IMAGES} images`, 400);
      }
      variant.images.forEach(image => validateImageUrl(image, "Variant image"));
      if (!Number.isSafeInteger(Number(variant.stock)) || Number(variant.stock) < 0) {
        throw httpError("Variant stock is invalid", 400);
      }
      if (variant.size_stock !== undefined && variant.size_stock !== null &&
          (typeof variant.size_stock !== "object" || Array.isArray(variant.size_stock))) {
        throw httpError("Variant size stock is invalid", 400);
      }
      validateSizeStockObject(variant.size_stock);
      if (!variant.sizes.length || variant.sizes.some(size => !String(size || "").trim())) {
        throw httpError(`Each ${String(variant.color || "").trim()} variant needs at least one size`, 400);
      }
    }
  }
}

function formatProduct(row) {
  let images = jsonArray(row.images_json);
  if (!images.length && row.image_url) images = [row.image_url];
  let thumbnails = jsonArray(row.thumbnail_images_json);
  if (!thumbnails.length && row.thumbnail_url) thumbnails = [row.thumbnail_url];
  if (!thumbnails.length && images.length) thumbnails = [images[0]];
  let variants = jsonArray(row.variants_json);
  const reviewCount = Number(row.review_count) || 0;
  return {
    id: row.id,
    seller_email: row.seller_email,
    name: row.name,
    category: row.category,
    brand: row.brand,
    price: row.price,
    mrp: row.mrp,
    stock: row.stock,
    rating: reviewCount ? Math.round(Number(row.review_avg) * 10) / 10 : row.rating,
    review_count: reviewCount,
    status: row.status,
    featured: Boolean(row.featured),
    color: row.color,
    variant_group: row.variant_group || null,
    deal_ends_at: row.deal_ends_at || null,
    deal_starts_at: row.deal_starts_at || null,
    deal_price: row.deal_price || null,
    preorder_enabled: Boolean(row.preorder_enabled),
    preorder_release_at: row.preorder_release_at || null,
    preorder_limit: row.preorder_limit === null || row.preorder_limit === undefined ? null : Number(row.preorder_limit),
    preorder_sold: Number(row.preorder_sold || 0),
    size_chart_url: row.size_chart_url || null,
    subcategory: row.subcategory || "",
    material: row.material || "",
    specifications: row.specifications || "",
    sizes: jsonArray(row.sizes_json),
    image: row.image_url,
    image_url: row.image_url,
    image_key: row.image_key,
    images,
    thumbnail: thumbnails[0] || row.image_url || "",
    thumbnail_url: row.thumbnail_url || thumbnails[0] || row.image_url || "",
    thumbnail_key: row.thumbnail_key || null,
    thumbnail_source_url: row.thumbnail_source_url || images[0] || "",
    thumbnail_images: thumbnails,
    variants,
    description: row.description,
    cost_price: Number(row.cost_price || 0),
    reorder_point: Number(row.reorder_point ?? 15),
    hsn_sac_code: row.hsn_sac_code || "",
    hsn_sac_type: row.hsn_sac_type || "HSN",
    gst_rate: row.gst_rate === null || row.gst_rate === undefined ? null : Number(row.gst_rate),
    gst_tax_inclusive: row.gst_tax_inclusive === undefined ? true : Boolean(row.gst_tax_inclusive),
    created_at: row.created_at
  };
}

function formatProductCard(row) {
  const reviewCount = Number(row.review_count) || 0;
  let thumbnails = jsonArray(row.thumbnail_images_json);
  if (!thumbnails.length && row.thumbnail_url) thumbnails = [row.thumbnail_url];
  if (!thumbnails.length && row.image_url) thumbnails = [row.image_url];
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory || "",
    brand: row.brand,
    price: row.price,
    mrp: row.mrp,
    stock: row.stock,
    rating: reviewCount ? Math.round(Number(row.review_avg) * 10) / 10 : row.rating,
    review_count: reviewCount,
    status: row.status,
    featured: Boolean(row.featured),
    color: row.color,
    material: row.material || "",
    sizes: jsonArray(row.sizes_json),
    image: thumbnails[0] || row.image_url || "",
    image_url: thumbnails[0] || row.image_url || "",
    thumbnail: thumbnails[0] || row.image_url || "",
    thumbnail_url: thumbnails[0] || row.image_url || "",
    thumbnail_images: thumbnails,
    variant_group: row.variant_group || null,
    deal_starts_at: row.deal_starts_at || null,
    deal_ends_at: row.deal_ends_at || null,
    deal_price: row.deal_price || null,
    preorder_enabled: Boolean(row.preorder_enabled),
    preorder_release_at: row.preorder_release_at || null,
    preorder_limit: row.preorder_limit === null || row.preorder_limit === undefined ? null : Number(row.preorder_limit),
    preorder_sold: Number(row.preorder_sold || 0),
    reorder_point: Number(row.reorder_point ?? 15),
    created_at: row.created_at,
    compact: true
  };
}

async function currentUser(request, env) {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const session = cookies[HOST_SESSION_COOKIE] || cookies[SESSION_COOKIE];
  if (!session) return null;
  try {
    return await verifySession(session, env, request);
  } catch {
    return null;
  }
}

async function signSession(user, env) {
  if (!env.SESSION_SECRET) throw httpError("Session secret is not configured", 500);
  const account = await env.DB.prepare("SELECT session_version FROM users WHERE email = ?").bind(user.email).first();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
    role: user.role,
    iat: now,
    nbf: now,
    exp: now + SESSION_MAX_AGE,
    sv: Number(account?.session_version || 0)
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(encodedPayload, env.SESSION_SECRET);
  return `${encodedPayload}.${signature}`;
}

async function verifySession(session, env, request) {
  if (!env.SESSION_SECRET) throw new Error("Missing SESSION_SECRET");
  const [encodedPayload, signature] = session.split(".");
  const expected = await hmac(encodedPayload, env.SESSION_SECRET);
  let valid = false;
  try {
    valid = signature?.length === expected.length &&
      Boolean(await Promise.resolve(crypto.subtle.timingSafeEqual(
        base64UrlToBytes(signature),
        base64UrlToBytes(expected)
      )));
  } catch {
    valid = false;
  }
  if (!valid) throw new Error("Bad session signature");
  const payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
  const now = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload !== "object" || !payload.email || !payload.iat || payload.iat > now + 300 || (payload.nbf && payload.nbf > now + 300)) {
    throw new Error("Invalid session claims");
  }
  if (payload.exp <= now || payload.exp - payload.iat > SESSION_MAX_AGE) throw new Error("Session expired");
  if (payload.sv !== undefined) {
    const account = await env.DB.prepare("SELECT session_version FROM users WHERE email = ?").bind(String(payload.email).toLowerCase()).first();
    if (!account || Number(account.session_version || 0) !== Number(payload.sv)) throw new Error("Session revoked");
  }
  payload.role = adminEmails(env, request).includes(String(payload.email).toLowerCase()) ? "admin" : "seller";
  return payload;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function adminEmails(env, request) {
  const raw = env.ADMIN_EMAILS || [];
  const emails = (Array.isArray(raw) ? raw : String(raw).split(",")).map(email => email.trim().toLowerCase()).filter(Boolean);
  if (request && isLocalDemoRequest(request, env)) emails.push(DEMO_ADMIN_EMAIL);
  return [...new Set(emails)];
}

function isLocalDemoRequest(request, env) {
  const hostname = new URL(request.url).hostname;
  return String(env.DEMO_ADMIN_ENABLED).toLowerCase() === "true" &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function requireUser(user) {
  if (!user) throw httpError("Sign in with Google first", 401);
}

function requireAdmin(user) {
  requireUser(user);
  if (user.role !== "admin") throw httpError("Admin email is not whitelisted", 403);
}

function assertSameOrigin(request, url) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) throw httpError("Cross-origin requests are not allowed", 403);
  const referer = request.headers.get("Referer");
  if (!origin && referer) {
    try {
      if (new URL(referer).origin !== url.origin) throw httpError("Cross-origin requests are not allowed", 403);
    } catch (error) {
      if (error.status) throw error;
      throw httpError("Invalid request origin", 403);
    }
  }
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw httpError("Cross-origin requests are not allowed", 403);
  }
  if (request.headers.get("X-Requested-With") !== "Glamia" && !origin && !referer) {
    throw httpError("Request origin could not be verified", 403);
  }
}

async function enforceRateLimit(request, url, env, ctx) {
  const limit = RATE_LIMITS.get(url.pathname);
  if (!limit) return;
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const key = `${url.pathname}:${await hashIdentifier(ip)}`;
  const now = Date.now();
  try {
    const bucket = await env.DB.prepare(`
      INSERT INTO request_rate_limits (bucket_key, window_started_at, request_count)
      VALUES (?, ?, 1)
      ON CONFLICT(bucket_key) DO UPDATE SET
        window_started_at = CASE
          WHEN excluded.window_started_at - request_rate_limits.window_started_at >= ?
          THEN excluded.window_started_at
          ELSE request_rate_limits.window_started_at
        END,
        request_count = CASE
          WHEN excluded.window_started_at - request_rate_limits.window_started_at >= ?
          THEN 1
          ELSE request_rate_limits.request_count + 1
        END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING window_started_at, request_count
    `).bind(key, now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_WINDOW_MS).first();
    if (Number(bucket?.request_count || 0) > limit) throw httpError("Too many requests. Please try again shortly.", 429);
    if (Number(bucket?.request_count) === 1 && ctx?.waitUntil) {
      ctx.waitUntil(env.DB.prepare("DELETE FROM request_rate_limits WHERE window_started_at < ?")
        .bind(now - RATE_LIMIT_WINDOW_MS * 2).run().catch(() => {}));
    }
    return;
  } catch (error) {
    if (error?.status === 429) throw error;
    // Keep local development usable before migrations are applied. The
    // deployed Worker should always have the D1 table from the migration.
  }

  enforceRateLimitInMemory(request, url, limit);
}

function enforceRateLimitInMemory(request, url, limit) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const key = `${ip}:${url.pathname}`;
  const now = Date.now();
  if (requestRateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of requestRateBuckets) {
      if (now - bucket.started > RATE_LIMIT_WINDOW_MS * 2) requestRateBuckets.delete(bucketKey);
    }
  }
  const bucket = requestRateBuckets.get(key) || { started: now, count: 0 };
  if (now - bucket.started > RATE_LIMIT_WINDOW_MS) {
    bucket.started = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  requestRateBuckets.set(key, bucket);
  if (bucket.count > limit) throw httpError("Too many requests. Please try again shortly.", 429);
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map(cookie => {
    const [key, ...value] = cookie.trim().split("=");
    return [key, value.join("=")];
  }).filter(([key]) => key));
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw httpError("Request body must be valid JSON", 400);
  }
}

async function readFormData(request) {
  try {
    return await request.formData();
  } catch {
    throw httpError("Request body must be valid form data", 400);
  }
}

function base64UrlToBytes(value) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64UrlDecodeToString(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'sha256-On1TqejLHzYPtlgCG4EQtHKn2f1u8Plk+C210XpYbec=' https://accounts.google.com https://www.googletagmanager.com; style-src 'self' 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https://accounts.google.com https://www.googleapis.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com; frame-src https://accounts.google.com; form-action 'self'");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  if (headers.get("Content-Type")?.includes("application/json")) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function sessionCookieName(request) {
  return new URL(request.url).protocol === "https:" ? HOST_SESSION_COOKIE : SESSION_COOKIE;
}

function makeSessionCookie(request, token, maxAge = SESSION_MAX_AGE) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(request)}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(request, name) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

async function hashIdentifier(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "").toLowerCase()));
  return base64UrlEncodeBytes(new Uint8Array(digest)).slice(0, 32);
}

async function writeAuditLog(env, adminEmail, action, entityType, entityId, details = {}) {
  try {
    await env.DB.prepare(`INSERT INTO admin_audit_log (id, admin_email, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), String(adminEmail || "").toLowerCase(), action, entityType, entityId || null, JSON.stringify(details)).run();
    return true;
  } catch (error) {
    // Audit logging must never break a successful customer action, but a
    // failed write must remain visible in Worker logs for alerting/diagnosis.
    console.error("audit_log_write_failed", {
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      error: String(error?.message || error || "Unknown audit log error").slice(0, 300)
    });
    return false;
  }
}

async function listAuditLog(env) {
  const { results } = await env.DB.prepare("SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 200").all();
  return json({ entries: results });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
