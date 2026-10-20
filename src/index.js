import { APP_TIME_ZONE, IST_OFFSET_MS, istDayKey, toISTTimestamp, parseStoredTimestamp, parseISTInput, istTimestampReplacer } from './time-zone.js';
import { canManageEmployee, publicProductView, readBoundedBody, validSessionClaims } from "./security.js";
import { merchantAdmin, processMerchantSync, scheduleMerchantSync } from "./google-merchant.js";
import { creditAuthority, creditWallet, creditAdminData, grantStoreCredits, saveCreditSettings, decideCreditRefund, ensureReferralCode, claimSignupReferral, validateReferral, qualifyCreditReferral } from "./store-credits.js";
import { billFontBytes, billLogoBytes, canReadOrderBill, createOrderBillPdf } from "./order-bills.js";
import { storeProductVideo, validateProductVideo, serveProductVideo } from './product-video.js';
import { readAboutPage, saveAboutPage } from "./about.js";
import { applyGatewayState } from "./payment-state.js";
import { claimPaymentCreation } from "./payment-creation.js";
import { approveGatewayRefund, executeGatewayRefund, reconcileGatewayRefund, recoverRazorpayRefund, publicGatewayRefund, refundPaise } from "./gateway-refunds.js";
import { customerReturnView, selectReturnLines, returnAllocation, remainingReturnLines } from "./customer-after-sales.js";
import { returnDocument, saveReturnLogistics } from "./return-logistics.js";
import { selectedVariantCopy, linkedSpecificationCopy } from './product-trust.js';
import { customerPromises,deliveryPromise,shippingPolicyPromise } from './customer-promises.js';
import { attachCancellationRefunds, cancellationRefundView } from "./cancellation-refunds.js";
import { purchasedReturnLines, supportLineReferences } from './support-return-access.js';
import { storefrontCss, wibrawlStorefrontCss, wibrawlStorefrontStyleHash, storefrontStyleHash, storefrontScriptHashes, storefrontStyleFiles, storefrontDeferredStyleFile, storefrontRoutePreloads, storefrontRouteCriticalStyles } from './storefront-styles.js';
import { inlineProductImage } from './product-image-bootstrap.js';
import { normalizeWibrawlReels } from './wibrawl-reels.js';
import { wibrawlFirstScreenImage } from './wibrawl-first-screen-image.js';
import { WIBRAWL_HOSTNAME, WIBRAWL_ORIGIN, STOREFRONT_ORIGINS, WIBRAWL_HERO_LAYOUTS, storefrontForUrl, productStorefront, storefrontOrigin } from './storefront-identity.js';

const SESSION_COOKIE = "mm_session";
const HOST_SESSION_COOKIE = "__Host-mm_session";
const SHARED_SESSION_COOKIE = "__Secure-mm_shared_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const DAILY_UPLOAD_LIMIT = 50 * 1024 * 1024;
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const APPLE_CERTS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_MOBILE_CALLBACK_PATH = "/api/auth/apple/mobile/callback";
const APPLE_WEB_CALLBACK_PATH = "/api/auth/apple/web/callback";
const APPLE_WEB_FLOW_COOKIE = "__Host-glamia_apple_flow";
const APPLE_MOBILE_FLOW_SECONDS = 10 * 60;
const DEMO_ADMIN_EMAIL = "demo-admin@glamia.local";
const LOW_STOCK_THRESHOLD = 15;
const CANCELLATION_WINDOW_DAYS = 2;
const PAYMENT_ORDER_RETENTION_DAYS = 1;
const RETURN_WINDOW_DAYS = 7;
const EMPLOYEE_SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const EMPLOYEE_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
// Cloudflare Workers currently caps PBKDF2 iteration counts at 100,000.
// Existing employee records keep and use their stored iteration count.
const EMPLOYEE_PASSWORD_ITERATIONS = 100000;
const EMPLOYEE_LOGIN_MAX_FAILURES = 5;
const EMPLOYEE_LOGIN_LOCK_MS = 15 * 60 * 1000;
const EMPLOYEE_POSITION_OPTIONS = [
  { id: "admin", label: "Admin" },
  { id: "manager", label: "Manager" },
  { id: "customer_relationship", label: "Customer relationship" },
  { id: "inventory_manager", label: "Store manager" },
  { id: "packing_staff", label: "Packing staff" }
];
const EMPLOYEE_PERMISSION_OPTIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "storefront", label: "Storefront" },
  { id: "hero", label: "Hero Studio" },
  { id: "events", label: "Events" },
  { id: "cinematic_reel", label: "Cinematic reel" },
  { id: "tax", label: "GST & HSN" },
  { id: "coupons", label: "Coupons" },
  { id: "credits", label: "Store credits & referrals" },
  { id: "labels", label: "Labels" },
  { id: "employees", label: "Employees" },
  { id: "manage_store", label: "Manage store" },
  { id: "notifications", label: "Notifications" },
  { id: "packing", label: "Packing" },
  { id: "orders", label: "Orders" },
  { id: "products", label: "All products" },
  { id: "add_product", label: "Add listing" },
  { id: "bulk_listing", label: "Bulk listing" },
  { id: "inventory", label: "Inventory" },
  { id: "customers", label: "Customers" },
  { id: "reviews", label: "Reviews" },
  { id: "questions", label: "Product questions" },
  { id: "deals", label: "Deals" },
  { id: "categories", label: "Categories" },
  { id: "returns", label: "Returns" },
  { id: "support", label: "Customer support" },
  { id: "system", label: "System" },
  { id: "google_analytics", label: "Google Analytics" }
];
const EMPLOYEE_POSITION_IDS = new Set(EMPLOYEE_POSITION_OPTIONS.map((item) => item.id));
const EMPLOYEE_POSITION_DEFAULTS = {
  admin: EMPLOYEE_PERMISSION_OPTIONS.map((item) => item.id),
  manager: EMPLOYEE_PERMISSION_OPTIONS.map((item) => item.id),
  customer_relationship: ["dashboard", "orders", "customers", "reviews", "questions", "returns", "support", "notifications"],
  inventory_manager: ["dashboard", "hero", "products", "add_product", "bulk_listing", "inventory", "categories", "tax", "labels", "deals", "notifications"],
  packing_staff: ["packing"]
};
const ADMIN_NOTIFICATION_PERMISSIONS = Object.freeze({
  new_order: "orders",
  cancelled_order: "orders",
  order_packed: "orders",
  low_stock: "inventory",
  out_of_stock: "inventory",
  new_review: "reviews",
  product_question: "questions",
  return_request: "returns",
  exchange_request: "returns",
  support_ticket: "support"
});
const R2_CLEANUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const R2_CLEANUP_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const R2_CLEANUP_PREFIXES = ["products/", "product-videos/", "reviews/"];
const CANONICAL_ORIGIN = "https://glamiastore.com";
const PRODUCTION_HOSTNAMES = new Set(["glamiastore.com", "www.glamiastore.com", WIBRAWL_HOSTNAME]);
const storefrontForRequest = storefrontForUrl;
const PUBLIC_CACHE_VERSION = `2026-10-20-footer-v55-${storefrontStyleHash.slice(0, 12)}-${wibrawlStorefrontStyleHash.slice(0, 12)}`;
const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const RAZORPAY_CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
const PHONEPE_SANDBOX_BASE = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const PHONEPE_PRODUCTION_BASE = "https://api.phonepe.com/apis/pg";
const PHONEPE_SANDBOX_TOKEN_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";
const PHONEPE_PRODUCTION_TOKEN_URL = "https://api.phonepe.com/apis/identity-manager/v1/oauth/token";
let phonePeTokenCache = { token: "", expiresAt: 0, environment: "" };
let googleKeysCache = { keys: null, expiresAt: 0 };
let appleKeysCache = { keys: null, expiresAt: 0 };
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMITS = new Map([
  ["/api/auth/google", 20],
  ["/api/auth/apple", 20],
  ["/api/auth/apple/mobile/start", 15],
  ["/api/auth/apple/mobile/callback", 30],
  ["/api/auth/apple/mobile/exchange", 20],
  ["/api/auth/apple/web/start", 15],
  [APPLE_WEB_CALLBACK_PATH, 30],
  ["/api/employee/auth/login", 10],
  ["/api/employee/push-tokens", 30],
  ["/api/search", 60],
  ["/api/analytics/track", 120],
  ["/api/orders", 30],
  ["/api/payments/create", 20],
  ["/api/payments/razorpay/verify", 30],
  ["/api/payments/phonepe/status", 60],
  ["/api/payments/webhooks/razorpay", 120],
  ["/api/payments/webhooks/phonepe", 120],
  ["/api/order-tracking", 20],
  ["/api/coupons/validate", 60],
  ["/api/coupons/available", 60],
  ["/api/notifications", 60],
  ["/api/notifications/read", 60],
  ["/api/push-tokens", 30],
  ["/api/uploads/image", 30],
  ["/api/uploads/video", 10],
  ["/api/support/tickets", 30],
  ["/api/cart-events", 120],
  ["/api/wishlist-events", 120]
]);
// Fallback only for local startup/migration failures. Production traffic uses
// the shared D1 bucket below so limits apply across Worker isolates.
const requestRateBuckets = new Map();
let rateLimitCleanupAt = 0;
let productEnrichmentCache = { expiresAt: 0, entries: new Map() };
const PRODUCT_REFERENCE_CACHE_MAX_ENTRIES = 1000;
const PRODUCT_REFERENCE_CACHE_TTL_MS = 60_000;
const productReferenceCache = new Map();
let employeeNotificationMaintenance = { completedAt: 0, inFlight: null };
const DASHBOARD_CACHE_TTL_MS = 45_000;
const PAGINATION_COUNT_CACHE_TTL_MS = 30_000;
const paginationCountCache = new Map();
let dashboardStatsCache = { expiresAt: 0, generation: 0, payload: null };
let dashboardStatsInFlight = null;
function invalidateDashboardStats() {
  paginationCountCache.clear();
  dashboardStatsCache = { expiresAt: 0, generation: dashboardStatsCache.generation + 1, payload: null };
}
const invalidateProductEnrichment = () => {
  productEnrichmentCache = { expiresAt: 0, entries: new Map() };
  productReferenceCache.clear();
  invalidateDashboardStats();
};
let googleAnalyticsTokenCache = { accessToken: "", expiresAt: 0, clientEmail: "" };

async function cachedCount(env, key, sql, bindings = []) {
  const now = Date.now();
  const cached = paginationCountCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const row = await env.DB.prepare(sql).bind(...bindings).first();
  const value = Number(row?.count || 0);
  // Bound filter-specific counts so arbitrary search terms cannot grow isolate memory.
  if (paginationCountCache.size >= 500) paginationCountCache.delete(paginationCountCache.keys().next().value);
  paginationCountCache.set(key, { value, expiresAt: now + PAGINATION_COUNT_CACHE_TTL_MS });
  return value;
}

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
      if (["GET", "HEAD"].includes(request.method) && !url.pathname.startsWith("/api/") && url.hostname === "www.glamiastore.com" && url.origin !== CANONICAL_ORIGIN) {
        return withSecurityHeaders(new Response(null, {
          status: 301,
          headers: {
            Location: `${CANONICAL_ORIGIN}${url.pathname}${url.search}`,
            "Cache-Control": "public, max-age=86400"
          }
        }));
      }
      if (["GET", "HEAD"].includes(request.method) && isAdminPagePath(url.pathname)) {
        const adminUser = await currentUser(request, env);
        if (adminUser?.role !== "admin") {
          const home = PRODUCTION_HOSTNAMES.has(url.hostname) ? `${CANONICAL_ORIGIN}/` : `${url.origin}/`;
          return withSecurityHeaders(new Response(null, {
            status: 302,
            headers: {
              Location: home,
              "Cache-Control": "no-store"
            }
          }));
        }
      }
      if (request.method === "GET" && url.pathname === "/demo-admin") return withSecurityHeaders(await loginAsDemoAdmin(request, env, true));
      if (request.method === "GET" && url.pathname === "/sitemap.xml") return withSecurityHeaders(await getSitemap(request, env));
      if (request.method === "GET" && url.pathname === "/robots.txt") return withSecurityHeaders(await getRobots(request));
      if (["GET", "HEAD"].includes(request.method) && url.pathname.startsWith("/.well-known/")) {
        const association = appLinkAssociation(url.pathname, env);
        if (association) return withSecurityHeaders(request.method === "HEAD" ? new Response(null, { status: association.status, headers: association.headers }) : association);
      }
      if (url.pathname === "/downloads/glamia-shopper.apk") {
        return withSecurityHeaders(await serveShopperApk(request, env));
      }
      // Tax reference data is generated into the public asset bundle from the
      // supplied HSN/SAC and GST state workbooks. Let these JSON files reach
      // the asset handler before the public-page/SEO router evaluates them as
      // application routes.
      if (request.method === "GET" && url.pathname.startsWith("/data/tax/")) {
        return withSecurityHeaders(await env.ASSETS.fetch(request));
      }
      // Versioned analytics helpers contain three path segments, like a
      // canonical product URL. Serve them before the product/SEO router.
      if (["GET", "HEAD"].includes(request.method) && url.pathname.startsWith("/analytics/")) {
        return withSecurityHeaders(await env.ASSETS.fetch(request));
      }
      if (url.pathname.startsWith("/api/")) {
        if (["GET", "HEAD"].includes(request.method) && url.pathname.startsWith("/api/assets/products/")) {
          return withSecurityHeaders(await cachedProductImage(request, env, url, ctx));
        }
        const cacheTtl = publicApiCacheTtl(request, url);
        const db = cacheTtl && typeof env.DB?.withSession === "function"
          ? env.DB.withSession("first-unconstrained")
          : env.DB;
        const requestEnv = db === env.DB ? env : { ...env, DB: db };
        const response = cacheTtl
          ? await cachedPublicResponse(request, ctx, cacheTtl, () => routeApi(request, requestEnv, url, ctx))
          : await routeApi(request, requestEnv, url, ctx);
        if (response.ok && !["GET", "HEAD", "OPTIONS"].includes(request.method) && /^\/api\/(admin|employee)\/hero(?:\/|$)/.test(url.pathname)) {
          await invalidateHeroCache(request, adminHeroStorefront(request));
        }
        if (response.ok && !["GET", "HEAD", "OPTIONS"].includes(request.method) && /\/(products|orders|returns|payments)(\/|$)/.test(url.pathname)) {
          scheduleMerchantSync(env, ctx, { path: canonicalProductPath, price: currentSellingPrice });
        }
        return withSecurityHeaders(response);
      }
      const pageCacheTtl = publicPageCacheTtl(request, url);
      const pageDb = pageCacheTtl && typeof env.DB?.withSession === "function"
        ? env.DB.withSession("first-unconstrained")
        : env.DB;
      const pageEnv = pageDb === env.DB ? env : { ...env, DB: pageDb };
      const page = pageCacheTtl
        ? await cachedPublicResponse(request, ctx, pageCacheTtl, () => renderPublicPage(request, pageEnv, ctx))
        : await renderPublicPage(request, env, ctx);
      if (page) return withSecurityHeaders(page);
      const assetResponse = await env.ASSETS.fetch(request);
      if (isAdminPagePath(url.pathname) || (url.pathname === "/returns" && storefrontForRequest(url) === "wibrawl") || ["/cart", "/checkout", "/profile", "/address", "/orders", "/wishlist", "/reviews", "/credits", "/login", "/notifications", "/saved-for-later"].includes(url.pathname)) {
        const headers = new Headers(assetResponse.headers);
        headers.set("Cache-Control", "no-store");
        headers.set("X-Robots-Tag", "noindex, nofollow");
        let body = (headers.get('Content-Type') || '').includes('text/html')
          ? (await assetResponse.text()).replace('</head>', `${storefrontResourceHints(url.pathname)}</head>`)
          : assetResponse.body;
        if (url.pathname === '/cart' && typeof body === 'string') {
          try {
            const settingsRequest = new Request(new URL('/api/storefront-settings?cache=1', url));
            const settings = await (await cachedPublicResponse(settingsRequest, ctx, 60, () => getStorefrontSettings(env, false, storefrontForRequest(url)))).json();
            const { renderCartShell } = await import('./cart-shell.jsx');
            const shell = renderCartShell(settings, storefrontForRequest(url));
            const style = storefrontRouteCriticalStyles.cart;
            const payload = JSON.stringify({ path: '/cart', settings }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
            body = body.replace('<div id="root"></div>', `<div id="root">${shell}</div>`)
              .replace(/<div id="initial-loader"[\s\S]*?<div id="root"/, '<div id="root"')
              .replace('</head>', `<style id="glamia-cart-styles">${style.css}</style><script type="application/json" id="glamia-cart-bootstrap">${payload}</script></head>`);
            for (const file of storefrontStyleFiles) body = body.replace(new RegExp(`<link[^>]+href="/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g'), `<link rel="preload" as="style" href="/${escapeHtml(style.file)}" data-glamia-storefront-css />`);
            body = body.replace(/<link\b[^>]*\bas="font"[^>]*>/g, '');
          } catch (error) { console.error('cart_shell_render_failed', { error_type: error.name }); }
        }
        return withSecurityHeaders(new Response(body, { status: assetResponse.status, headers }));
      }
      // Worker Assets' SPA fallback returns index.html with 200 even for missing
      // pages/files. Keep the navigable shell but report a real, non-indexable 404.
      if (assetResponse.ok && (assetResponse.headers.get("Content-Type") || "").includes("text/html") && !await isKnownSpaFallback(url.pathname, env)) {
        const headers = new Headers(assetResponse.headers);
        headers.set("Cache-Control", "no-store");
        headers.set("X-Robots-Tag", "noindex, nofollow");
        return withSecurityHeaders(new Response(assetResponse.body, { status: 404, headers }));
      }
      return withSecurityHeaders(assetResponse);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error("request_failed", { path: url.pathname.slice(0, 120), request_id: request.headers.get("CF-Ray") || null, error_type: error.name || "Error", status });
      // Detailed diagnostics are restricted to explicitly enabled loopback development.
      if (status >= 500 && isLocalDemoRequest(request, env)) console.error("Local API error", error);
      return withSecurityHeaders(json({ error: status >= 500 ? "Server error" : (error.message || "Request failed") }, status));
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(processMerchantSync(env, { path: canonicalProductPath, price: currentSellingPrice }));
    ctx.waitUntil(processDueEmailEvents(env));
    ctx.waitUntil(runWeeklyR2Cleanup(env));
    ctx.waitUntil(expirePendingGatewayOrders(env));
    ctx.waitUntil(processGatewayRefunds(env));
    ctx.waitUntil(purgeExpiredPaymentOrders(env));
    ctx.waitUntil(runPageViewRollup(env));
    ctx.waitUntil(sendDueEventAlerts(env));
    ctx.waitUntil(env.DB.prepare("DELETE FROM apple_mobile_login_flows WHERE expires_at < unixepoch()").run());
  }
};

// Serve verified-link associations only after the real signing identities are configured.
function appLinkAssociation(path, env) {
  if (path === "/.well-known/assetlinks.json") {
    const fingerprints = String(env.ANDROID_APP_LINK_SHA256 || "").split(/[;,\s]+/).filter(value => /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(value));
    if (!fingerprints.length) return new Response(null, { status: 404 });
    return json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.glamia.store", sha256_cert_fingerprints: fingerprints } }], 200, { "Cache-Control": "public, max-age=3600" });
  }
  if (path === "/.well-known/apple-app-site-association") {
    const teamId = String(env.APPLE_TEAM_ID || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(teamId)) return new Response(null, { status: 404 });
    return json({ applinks: { apps: [], details: [{ appID: `${teamId}.com.glamia.store`, paths: ["*"] }] } }, 200, { "Cache-Control": "public, max-age=3600" });
  }
  return null;
}

function paymentIncompleteOrderPredicate(alias = "o", expiredOnly = false) {
  const cancelledAt = `${alias}.updated_at`;
  const expiry = expiredOnly
    ? `AND datetime(${cancelledAt}) <= datetime('now', '-${PAYMENT_ORDER_RETENTION_DAYS} day')`
    : "";
  return `(
    ${alias}.status = 'cancelled'
    AND ${alias}.payment_status = 'failed'
    AND ${alias}.payment_gateway IN ('razorpay', 'phonepe')
    ${expiry}
  )`;
}

function slugifyName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function productUrlSlug(value, fallback = "collection") {
  return slugifyName(value) || fallback;
}

function canonicalProductPath(product) {
  const publicCode = String(product?.product_code || "").trim();
  const internalId = String(product?.id || "").trim();
  const stableId = publicCode || internalId;
  const nameSlug = productUrlSlug(product?.name, stableId || "item");
  // New URLs carry both the readable product code and the immutable UUID.
  // Existing UUID-backed products keep their current URL shape, so their
  // indexed links do not change until they receive a public product code.
  const suffix = publicCode && internalId && publicCode.toLowerCase() !== internalId.toLowerCase()
    ? `-${publicCode.toLowerCase()}-${internalId.toLowerCase()}`
    : stableId ? `-${stableId.toLowerCase()}` : "";
  // The stable suffix prevents a future rename or same-name re-edit from
  // taking over an existing product URL.
  return `/${productUrlSlug(product?.category)}/${productUrlSlug(product?.subcategory)}/${nameSlug}${suffix}`;
}

function compactProductCodePart(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function productSegmentCode(value, fallback) {
  const raw = String(value || "").trim();
  const words = raw.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length > 1) {
    const initials = words.map(word => word[0]).join("").toUpperCase().slice(0, 4);
    if (initials) return initials;
  }
  return compactProductCodePart(raw).slice(0, 3) || fallback;
}

async function productBrandCode(env, brand) {
  const compact = compactProductCodePart(brand);
  const firstThree = compact.slice(0, 3) || "BRD";
  const { results } = await env.DB.prepare("SELECT DISTINCT brand FROM products WHERE TRIM(COALESCE(brand, '')) != ''").all();
  const collides = results.some(row => {
    const existing = compactProductCodePart(row.brand);
    return existing && existing !== compact && existing.slice(0, 3) === firstThree;
  });
  if (!collides) return { token: firstThree, prefixBeforeGlamia: false };
  if (compact.length > 3) return { token: compact.slice(0, 4), prefixBeforeGlamia: false };
  // A later three-letter brand cannot gain a fourth character. Keep the full
  // brand token before GM so the exceptional code remains visibly distinct.
  return { token: compact || "BRD", prefixBeforeGlamia: true };
}

async function nextProductSequence(env) {
  const bumped = await env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name = 'product_number' RETURNING value").first().catch(() => null);
  if (bumped) return Number(bumped.value);
  await env.DB.prepare("INSERT OR IGNORE INTO counters (name, value) VALUES ('product_number', 0)").run().catch(() => {});
  const retried = await env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name = 'product_number' RETURNING value").first().catch(() => null);
  return retried ? Number(retried.value) : null;
}

function buildProductCode(brandCode, category, subcategory, sequence, prefixBeforeGlamia = false, suffix = "") {
  const categoryCode = productSegmentCode(category, "CAT");
  const subcategoryCode = productSegmentCode(subcategory, "GEN");
  const sequenceCode = String(sequence).padStart(4, "0");
  const prefix = prefixBeforeGlamia ? `${brandCode}-GM` : `GM-${brandCode}`;
  return `${prefix}-${categoryCode}-${subcategoryCode}-${sequenceCode}${suffix}`;
}

/* Order numbers: GM/WB-<DDMMYYYY IST>-<product initials>-<5-digit sequence>,
   e.g. GM-12092026-MSW-00001. The sequence lives in the counters table and is
   bumped atomically per order; gaps are possible when a checkout fails after
   the number is taken, which is expected for sequential identifiers. */


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

function buildOrderNumber(initials, sequence, storefront = "glamia") {
  const tail = sequence == null
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()
    : String(sequence).padStart(5, "0");
  return (storefront === "wibrawl" ? "WB" : "GM") + "-" + istDateString() + "-" + initials + "-" + tail;
}

const DEFAULT_PAGE_DESCRIPTION = "Shop curated apparel and accessories from independent ateliers — free and fast shipping across India, with secure payments available.";

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

async function getPublicCatalogRows(env, category = "", storefront = "glamia") {
  try {
    const categoryFilter = category ? "AND LOWER(TRIM(p.category)) = LOWER(TRIM(?))" : "";
    const visibility = storefront === "wibrawl" ? "('wibrawl', 'both')" : "('glamia', 'both')";
    const statement = env.DB.prepare(`
      SELECT p.id, p.product_code, p.name, p.category, p.subcategory, p.brand, p.price, p.mrp, p.color,
        p.description, p.image_url, p.thumbnail_url, p.deal_starts_at,
        p.deal_ends_at, p.deal_price, p.created_at, p.updated_at,
        (SELECT COALESCE(SUM(oi.quantity), 0)
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id AND o.status != 'cancelled') AS sold_total
      FROM products p
      WHERE p.status = 'live' AND COALESCE(p.storefront_visibility, 'glamia') IN ${visibility} ${categoryFilter}
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    const result = category ? await statement.bind(category).all() : await statement.all();
    return { available: true, rows: result.results || [] };
  } catch {
    return { available: false, rows: [] };
  }
}

function catalogBotContent(title, description, rows, origin, storefront = "glamia") {
  const links = rows.map(row => {
    const image = absoluteImageUrl(row.thumbnail_url || row.image_url, origin);
    const price = currentSellingPrice(row);
    return `<li>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(row.name)}" width="120" height="150" />` : ""}<a href="${canonicalProductPath(row)}">${escapeHtml(row.name)}</a><span>${escapeHtml(row.brand || "Glamia")} · ${escapeHtml(row.category || "Apparel")} · ${escapeHtml(row.subcategory || "Collection")} · ₹${Number(price).toLocaleString("en-IN")}</span></li>`;
  }).join("");
  const brand = storefront === "wibrawl" ? "Wibrawl" : "Glamia";
  const emptyCopy = storefront === "wibrawl" ? "The first Wibrawl drop is on its way. Check back soon." : "Explore the Glamia collection and discover curated pieces from independent ateliers.";
  return `<main class="catalog-page"><p class="eyebrow">${brand} collection</p><h1>${escapeHtml(title)}</h1><p class="catalog-description">${escapeHtml(description)}</p>${rows.length ? `<ul class="catalog-bot-list">${links}</ul>` : `<p>${emptyCopy}</p>`}</main>`;
}

function productBotContent(product, price, images, inStock, relatedRows) {
  const category = String(product.category || "Apparel").trim();
  const subcategory = String(product.subcategory || "Collection").trim();
  const categoryHref = `/category/${encodeURIComponent(category)}`;
  const subcategoryHref = `${categoryHref}?sub=${encodeURIComponent(subcategory)}`;
  const sizes = (product.sizes || []).map(value => String(value || "").trim()).filter(Boolean);
  const availability = product.preorder_enabled ? "Available for pre-order" : inStock ? "In stock" : "Currently out of stock";
  const description = String(product.description || `${product.name} is a considered ${subcategory.toLowerCase()} piece from ${product.brand || "Glamia"}, selected for everyday comfort and lasting style.`).trim();
  const specifications = String(product.specifications || "").split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^colou?r(?:way)?\s*:/i.test(line));
  if (product.color) specifications.unshift(`Colourway: ${product.color}`);
  const imageMarkup = images.slice(0, 4).map((image, index) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(`${product.name}${index ? ` — view ${index + 1}` : ""}`)}" width="640" height="800"${index ? ' loading="lazy"' : ""} />`).join("");
  const details = [
    ["Category", category],
    ["Subcategory", subcategory],
    ["Colour", product.color],
    ["Material", product.material],
    ["What's in the box", product.what_in_box],
    ["Available sizes", sizes.join(", ")],
    ["Availability", availability]
  ].filter(([, value]) => String(value || "").trim()).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const related = relatedRows.slice(0, 6).map(row => `<li><a href="${canonicalProductPath(row)}">${escapeHtml(row.name)}</a><span>${escapeHtml(row.subcategory || row.category || "Glamia collection")} · ₹${Number(currentSellingPrice(row)).toLocaleString("en-IN")}</span></li>`).join("");
  const specificationMarkup = specifications.length
    ? `<section class="seo-product-specifications" aria-labelledby="product-specifications-heading"><h2 id="product-specifications-heading">Product specifications</h2><ul>${specifications.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>`
    : "";
  return `<main class="page-main seo-product-page"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><a href="${categoryHref}">${escapeHtml(category)}</a><span aria-hidden="true">›</span><a href="${subcategoryHref}">${escapeHtml(subcategory)}</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHtml(product.name)}</span></nav><article class="detail-page"><div class="detail-gallery">${imageMarkup}</div><div class="detail-copy"><p class="eyebrow">${escapeHtml(product.brand || "Glamia")}</p><h1>${escapeHtml(product.name)}</h1><p class="detail-price">₹${Number(price).toLocaleString("en-IN")}${Number(product.mrp) > price ? ` <del>₹${Number(product.mrp).toLocaleString("en-IN")}</del>` : ""}</p><p class="muted">${escapeHtml(category)} · ${escapeHtml(subcategory)}${product.color ? ` · ${escapeHtml(product.color)}` : ""}${Number(product.rating) > 0 ? ` · ${Number(product.rating)} / 5${Number(product.review_count) > 0 ? ` from ${Number(product.review_count)} review${Number(product.review_count) === 1 ? "" : "s"}` : " rating"}` : ""}</p><p class="detail-description">${escapeHtml(description)}</p><section aria-labelledby="product-details-heading"><h2 id="product-details-heading">Product details</h2><dl class="seo-product-details">${details}</dl></section>${specificationMarkup}<p class="seo-shop-note">Secure online payments are available through trusted payment providers. Shipping and return information is shown before an order is placed.</p><p><a href="${subcategoryHref}">Explore more ${escapeHtml(subcategory)}</a> · <a href="/policies">Delivery and return policies</a> · <a href="/support">Customer support</a></p></div></article>${related ? `<section class="seo-related-products" aria-labelledby="related-products-heading"><h2 id="related-products-heading">More from ${escapeHtml(category)}</h2><ul>${related}</ul></section>` : ""}</main>`;
}

const standalonePolicyPaths = {
  terms: "/terms-and-conditions",
  privacy: "/privacy-policy",
  "refund-cancellation": "/refund-cancellation-policy",
  returns: "/return-policy",
  shipping: "/shipping-policy"
};

function policiesBotContent(selectedId = "",experience={}) {
  const sections = [
    ["terms", "Terms & Conditions", "Glamia is a brand name owned and operated by SHREE SHAYAM HOSIERY. Glamia’s Platform includes https://glamiastore.com/, its mobile site, and app. By using it, you agree to provide accurate information, follow applicable law, and respect Glamia’s intellectual property. Orders become legally binding once accepted. These terms are governed by the laws of India; the jurisdiction field in the supplied policy document still needs confirmation before production."],
    ["privacy", "Privacy Policy", "Glamia may collect account, contact, identity, address, order, transaction, preference, and relevant payment information to provide services, support orders, personalise the experience, communicate updates, prevent fraud, and meet legal obligations. The Glamia Employees app also processes employee IDs, names, staff emails when supplied, permissions, sessions, and work activity needed for assigned staff workspaces; employee accounts are created and managed by Glamia administrators. Developer and privacy contact: SHREE SHAYAM HOSIERY (Glamia), support@glamiastore.com. Information may be shared with affiliates, sellers, logistics providers, service providers, payment providers, and authorities where lawful. Users can access, update, or request deletion of their information, subject to legal and operational retention needs."],
    ["refund-cancellation", "Refund & Cancellation Policy", "Eligible undispatched orders can be cancelled. For settled payments, Glamia records a verified original-payment refund case and restores purchased store credits separately. Customer orders show queued, processing, confirmed or needs-review progress. Damaged, defective, or not-as-described items should be reported to customer service within 7 days of receipt. Refunds following physical returns require approval and courier collection or warehouse receipt. Provider confirmation does not mean the bank has posted the funds; bank posting time varies."],
    ["returns", "Return Policy", "Eligible returns or size exchanges may be requested within 7 days of the recorded delivery. Purchased-item eligibility applies. An eligible size exchange immediately places a linked zero-value replacement for normal packing and delivery; original-item collection is arranged separately. For returns, refunds require approval and confirmed courier collection or warehouse receipt plus payment verification. Care arranges manual pickup; a printable label becomes available after courier tracking is saved. Contact care for no-printer or missed-pickup help. Provider confirmation does not guarantee immediate bank posting."],
    ["shipping", "Shipping Policy", `Shipping is free. ${shippingPolicyPromise(experience)} Delivery is attempted at the address supplied at purchase. Courier booking and tracking are arranged manually.`]
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

function canonicalOriginForRequest(url) {
  if (url.hostname.toLowerCase() === WIBRAWL_HOSTNAME) return WIBRAWL_ORIGIN;
  return PRODUCTION_HOSTNAMES.has(url.hostname) ? CANONICAL_ORIGIN : url.origin;
}

function isAdminPagePath(path) {
  return path === "/admin" || path.startsWith("/admin/");
}

async function isKnownSpaFallback(path, env) {
  if (isAdminPagePath(path) || ["/", "/index.html", "/offers", "/just-arrived", "/best-sellers", "/search", "/about", "/contact", "/support", "/policies", ...Object.values(standalonePolicyPaths), "/track-order", "/cart", "/checkout", "/profile", "/address", "/orders", "/wishlist", "/reviews", "/credits", "/login"].includes(path)) return true;
  const alias = path.match(/^\/([a-z0-9-]+)$/)?.[1];
  if (!alias) return false;
  // Slug aliases such as /women are legitimate routes. This bounded category
  // read runs only on otherwise-unrecognized HTML paths, never on JS/CSS assets.
  const { results } = await env.DB.prepare("SELECT name FROM categories").all();
  return (results || []).some(row => slugifyName(row.name) === alias);
}

/* Server-side meta + content for public pages. Every visitor gets real
   Open Graph/Twitter tags, canonical URL and Product JSON-LD in the HTML;
   known crawlers receive a self-contained static rendering inside #root so
   indexing never depends on browser-side API requests. */
function storefrontResourceHints(path, storefront = 'glamia') {
  if (path === '/' && storefront !== 'wibrawl') return '';
  const type = path === '/' ? 'catalogue' : path === '/cart' ? 'CartPage' : path === '/checkout' ? 'CheckoutPage'
    : ['/profile', '/address', '/orders', '/wishlist', '/reviews'].includes(path) ? 'AccountPages'
    : /^\/(?!admin\/|category\/)[^/]+\/[^/]+\/[^/]+$/.test(path) ? 'ProductDetailPage'
    : ['/login', '/contact', '/support', '/policies'].includes(path) ? 'PublicPages' : 'catalogue';
  const assets = storefrontRoutePreloads[type];
  return (assets?.scripts || []).map(file => `<link rel="modulepreload" crossorigin href="/${escapeHtml(file)}" />`).join('')
    + (type === 'ProductDetailPage' ? '' : (assets?.styles || []).filter(file => !storefrontStyleFiles.includes(file)).map(file => `<link rel="preload" as="style" href="/${escapeHtml(file)}" />`).join(''));
}

async function renderPublicPage(request, env, ctx) {
  const url = new URL(request.url);
  const storefront = storefrontForRequest(url);
  const started = Date.now();
  const serverTimings = [];
  async function timed(name, task) {
    const start = Date.now();
    try { return await task(); }
    finally { serverTimings.push(`${name};dur=${Date.now() - start}`); }
  }
  const path = url.pathname;
  const legacyProductMatch = path.match(/^\/product\/([^/]+)$/);
  const seoProductMatch = path.match(/^\/(?!category(?:\/|$)|product(?:\/|$))([^/]+)\/([^/]+)\/([^/]+)$/i);
  const categoryMatch = path.match(/^\/category\/([^/]+)$/);
  const catalogPath = new Set(["/", "/offers", "/just-arrived", "/best-sellers"]);
  const infoPath = new Set(["/about", "/contact", "/support", "/policies", ...Object.values(standalonePolicyPaths)]);
  if (!catalogPath.has(path) && !infoPath.has(path) && !legacyProductMatch && !seoProductMatch && !categoryMatch) return null;

  // Public presentation reads are independent. Start them alongside the static
  // shell rather than paying a sequential asset -> database waterfall.
  const catalogueParameters = new URLSearchParams({ view: 'cards', include_stock: '1', limit: '24', sort: path === '/just-arrived' ? 'newest' : 'featured', facets: '1' });
  if (path === '/offers') catalogueParameters.set('offers', '1');
  if (path === '/best-sellers') catalogueParameters.set('featured', '1');
  const catalogueDataPromise = catalogPath.has(path) && path !== '/' && !url.search
    ? timed('catalog', () => listProducts(env, null, 'public', catalogueParameters, storefront).then(response => response.json())).catch(() => null) : null;
  const catalogPromise = catalogPath.has(path)
    ? catalogueDataPromise ? catalogueDataPromise.then(data => data ? { rows: data.products, available: true } : getPublicCatalogRows(env, "", storefront))
      : timed('catalog', () => getPublicCatalogRows(env, "", storefront)) : null;
  const homepageSettingsPromise = path === "/"
    ? timed('settings', () => getStorefrontSettings(env, false, storefront).then(response => response.json())).catch(() => null)
    : null;
  const productSettingsPromise = (legacyProductMatch || seoProductMatch || (catalogPath.has(path) && path !== '/')) && !CRAWLER_UA.test(request.headers.get('User-Agent') || '')
    ? timed('settings', () => getStorefrontSettings(env, false, storefront).then(response => response.json())).catch(() => null)
    : null;
  const heroPromise = path === "/" && !CRAWLER_UA.test(request.headers.get("User-Agent") || "")
    ? timed('hero', () => listHeroSlides(env, false, storefront).then(response => response.json())).catch(() => null)
    : null;
  const shellResponse = await timed('shell', () => env.ASSETS.fetch(new URL("/index.html", url)));
  if (!shellResponse.ok) return null;
  let html = await shellResponse.text();
  if (storefront === 'wibrawl') {
    html = html
      .replace('<html lang="en">', '<html lang="en" data-brand="wibrawl" data-theme="light">')
      .replace('<link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=glamia-vector" />', '<link rel="icon" type="image/svg+xml" sizes="any" href="/wibrawl/favicon.svg?v=master-a" />')
      .replace('<link rel="apple-touch-icon" href="/glamia-g-favicon.png" />', '')
      .replace('<div class="initial-loader-brand" role="img" aria-label="Glamia"><img class="glamia-loader-logo" src="/glamia/logo-light.svg" alt="" width="257" height="50" /></div>', '<div class="initial-loader-brand" role="img" aria-label="Wibrawl"><img class="wibrawl-logo" src="/wibrawl/logo.svg?v=master-a" alt="" width="1025" height="815" /></div>');
  }
  const origin = canonicalOriginForRequest(url);
  const isBot = CRAWLER_UA.test(request.headers.get("User-Agent") || "");
  // Only public presentation data is embedded. Session/account data always
  // remains in private, uncached API responses.
  const bootstrapPromise = path === "/" && !isBot
    ? Promise.all([heroPromise, homepageSettingsPromise])
      .then(([hero, settings]) => hero && settings ? { hero, settings, storefront } : null)
      .catch(() => null)
    : null;

  let title = storefront === "wibrawl" ? "Wibrawl | Pick your side. Wear your world." : "Glamia — Curated Apparel & Accessories";
  let description = storefront === "wibrawl" ? "Everyday graphic tees for self-expression. Your vibe. Your rules." : DEFAULT_PAGE_DESCRIPTION;
  let ogType = "website";
  let ogImage = storefront === "wibrawl" ? `${origin}/wibrawl/streetwear-campaign-1440.webp` : `${origin}/glamia-social-banner.png`;
  let canonical = `${origin}${path}`;
  let headExtras = "";
  let botContent = "";
  let renderedFirstScreen = false;
  function firstScreenStyles(type) {
    const style = storefrontRouteCriticalStyles[type];
    for (const file of storefrontStyleFiles) html = html.replace(new RegExp(`<link[^>]+href="/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g'), `<link rel="preload" as="style" fetchpriority="low" href="/${escapeHtml(style.file)}" data-glamia-storefront-css />`);
    headExtras += `<style id="glamia-${type}-styles">${style.css}</style>`;
    renderedFirstScreen = true;
  }

  if (legacyProductMatch || seoProductMatch) {
    const productReference = decodeURIComponent((seoProductMatch || legacyProductMatch)[seoProductMatch ? 3 : 1]);
    const pathContext = seoProductMatch ? { category: seoProductMatch[1], subcategory: seoProductMatch[2] } : null;
    // UUID-bearing canonical links can use the indexed product lookup directly.
    // The live/status check below and canonical redirect still validate the URL.
    const canonicalId = productReference.match(/(?:^|-)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)?.[1];
    const resolvedId = canonicalId?.toLowerCase() || await resolveProductReference(env, productReference, pathContext);
    const visibility = storefront === "wibrawl" ? "('wibrawl', 'both')" : "('glamia', 'both')";
    const row = resolvedId ? await env.DB.prepare(`${PRODUCT_SELECT}
      WHERE p.id = ? AND p.status = 'live'
      GROUP BY p.id`).bind(resolvedId).first() : null;
    if (!row) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    const owner = productStorefront(row, storefront);
    if (owner !== storefront) {
      const destination = new URL(canonicalProductPath(row), storefrontOrigin(owner));
      if (url.searchParams.has('size')) destination.searchParams.set('size', url.searchParams.get('size'));
      return Response.redirect(destination.href, 302);
    }
    const [[stockProduct], siblingColours] = await Promise.all([
      withSizeStock(env, [row]),
      row.color_group_id ? env.DB.prepare(`SELECT color FROM products WHERE color_group_id=? AND status='live' AND COALESCE(storefront_visibility, 'glamia') IN ${visibility}`).bind(row.color_group_id).all() : Promise.resolve({ results: [] })
    ]);
    const product = selectedVariantCopy(stockProduct,siblingColours.results.map(item=>item.color));
    const price = currentSellingPrice(product);
    const requestedSize = url.searchParams.get("size");
    const selectedSize = (product.sizes || []).includes(requestedSize) ? requestedSize : "";
    const inStock = selectedSize ? Number(product.size_stock?.[selectedSize] || 0) > 0 : (product.sizes || []).length ? Object.values(product.size_stock || {}).some((quantity) => Number(quantity) > 0) : Number(product.stock || 0) > 0;
    const availablePreorder = product.preorder_enabled && (product.preorder_limit == null || Number(product.preorder_limit) > Number(product.preorder_sold || 0));
    const images = (product.images || []).map((image) => absoluteImageUrl(image, origin)).filter(Boolean);
    ogImage = images[0] || absoluteImageUrl(product.image_url, origin);
    title = `${product.name} | ${storefront === "wibrawl" ? "Wibrawl" : "Glamia"}`;
    description = String(product.description || `${product.name} — ${product.brand || (storefront === "wibrawl" ? "Wibrawl" : "Glamia")} curated piece in ${product.color || "a timeless finish"}.`).slice(0, 300);
    ogType = "product";
    const canonicalPath = canonicalProductPath(product);
    canonical = `${origin}${canonicalPath}`;
    if (path !== canonicalPath) return new Response(null, { status: 301, headers: { Location: `${canonical}${selectedSize ? `?size=${encodeURIComponent(selectedSize)}` : ""}`, "Cache-Control": "public, max-age=3600" } });
    const relatedCatalog = isBot ? await getPublicCatalogRows(env, product.category, storefront) : { rows: [] };
    const relatedRows = (relatedCatalog.rows || []).filter(candidate => candidate.id !== product.id);
    botContent = productBotContent(product, price, images.length ? images : [ogImage].filter(Boolean), inStock, relatedRows);
    const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description || undefined, image: images.slice(0, 4), sku: product.product_code || product.id, category: [product.category, product.subcategory].filter(Boolean).join(" > ") || undefined, color: product.color || undefined, material: product.material || undefined, size: selectedSize || undefined, brand: { "@type": "Brand", name: product.brand || "Glamia" }, offers: { "@type": "Offer", url: `${canonical}${selectedSize ? `?size=${encodeURIComponent(selectedSize)}` : ""}`, priceCurrency: "INR", price, availability: availablePreorder ? "https://schema.org/PreOrder" : !product.preorder_enabled && inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", itemCondition: "https://schema.org/NewCondition" }, ...(Number(product.rating) > 0 && Number(product.review_count) > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(product.rating), reviewCount: Number(product.review_count) } } : {}) };
    headExtras = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;
    if (!isBot) {
      const publicProduct = publicProductView(product);
      publicProduct.first_image_inline = await timed('image', () => inlineProductImage(publicProduct, env, origin));
      const productSettings = await productSettingsPromise;
      const bootstrapProduct = publicProduct.first_image_inline ? { ...publicProduct, first_image_inline: { source: publicProduct.first_image_inline.source, from_dom: true } } : publicProduct;
      const payload = JSON.stringify({ path, product: bootstrapProduct, settings: productSettings }, istTimestampReplacer).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      headExtras += `<script type="application/json" id="glamia-product-bootstrap">${payload}</script>`;
      try {
        const { renderProductShell } = await import('./product-shell.jsx');
        const shell = await timed('render', async () => renderProductShell(publicProduct, productSettings, pathContext, storefront));
        html = html.replace('<div id="root"></div>', `<div id="root">${shell}</div>`)
          .replace(/<div id="initial-loader"[\s\S]*?<div id="root"/, '<div id="root"');
        firstScreenStyles('product');
      } catch (error) { console.error('product_shell_render_failed', { error_type: error.name }); }
    }
  }

  if (categoryMatch) {
    const category = decodeURIComponent(categoryMatch[1]);
    const catalog = await getPublicCatalogRows(env, category, storefront);
    if (catalog.available && !catalog.rows.length) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    const canonicalCategory = catalog.rows[0]?.category || category;
    title = `${canonicalCategory} collection | ${storefront === "wibrawl" ? "Wibrawl" : "Glamia"}`;
    description = storefront === "wibrawl" ? `Shop ${canonicalCategory} tees from Wibrawl. Pick your side. Wear your world.` : `Shop the ${canonicalCategory} edit — curated pieces from independent ateliers, delivered fast across India.`;
    canonical = `${origin}/category/${encodeURIComponent(canonicalCategory)}`;
    botContent = catalogBotContent(`${canonicalCategory} collection`, description, catalog.rows.slice(0, 24), origin, storefront);
    headExtras = `<script type="application/ld+json">${JSON.stringify(catalogJsonLd(catalog.rows.slice(0, 24), origin)).replace(/</g, "\\u003c")}</script>`;
  }

  if (catalogPath.has(path)) {
    const catalog = await catalogPromise;
    let rows = catalog.rows;
    if (path === "/offers") rows = rows.filter(row => currentSellingPrice(row) < Number(row.mrp || row.price || 0));
    if (path === "/best-sellers") rows = [...rows].sort((left, right) => Number(right.sold_total || 0) - Number(left.sold_total || 0));
    if (path === "/") {
      // Reuse the public settings already required for the first screen. Do not
      // issue a second settings query solely for homepage sharing metadata.
      const settings = await homepageSettingsPromise;
      const seo = settings?.seo || {};
      title = storefront === "wibrawl" ? "Wibrawl | Pick your side. Wear your world." : heroText(seo.title, "Glamia — Curated apparel for every wardrobe", 120);
      description = storefront === "wibrawl" ? "Everyday graphic tees for self-expression. Your vibe. Your rules." : heroText(seo.description, "Discover refined everyday pieces, occasionwear, and accessories from independent ateliers.", 220);
      if (storefront !== "wibrawl") ogImage = absoluteImageUrl(normalizeSeoImage(seo.image, `${origin}/glamia-social-banner.png`), origin);
      botContent = catalogBotContent(storefront === "wibrawl" ? "Tees for every side" : "Curated apparel and accessories", description, rows.slice(0, 24), origin, storefront);
    } else {
      const titles = storefront === "wibrawl" ? { "/offers": "Loot Deals", "/just-arrived": "Just Spawned", "/best-sellers": "Current Meta" } : { "/offers": "Offers", "/just-arrived": "Just arrived", "/best-sellers": "Best sellers" };
      const brand = storefront === "wibrawl" ? "Wibrawl" : "Glamia";
      title = `${titles[path]} | ${brand}`;
      description = storefront === "wibrawl" ? `${titles[path]} from Wibrawl. Pick your side. Wear your world.` : `${titles[path]} from Glamia — curated apparel and accessories from independent ateliers, delivered fast across India.`;
      botContent = catalogBotContent(titles[path], description, rows.slice(0, 24), origin, storefront);
    }
    headExtras = `<script type="application/ld+json">${JSON.stringify(catalogJsonLd(rows.slice(0, 24), origin)).replace(/</g, "\\u003c")}</script>`;
    if (path !== '/' && storefront !== "wibrawl" && !isBot && catalogueDataPromise) {
      const [data, settings] = await Promise.all([catalogueDataPromise, productSettingsPromise]);
      if (data) {
        const catalogue = { ...data, identity: catalogueParameters.toString() };
        const categories = ['All', ...new Set(data.products.map(product => product.category).filter(Boolean))];
        const payload = JSON.stringify({ path, settings, catalogue }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        headExtras += `<script type="application/json" id="glamia-catalogue-bootstrap">${payload}</script>`;
        try {
          const { renderCatalogueShell } = await import('./catalogue-shell.jsx');
          const shell = await timed('render', async () => renderCatalogueShell({ path, title: title.replace(/ \| Glamia$/, ''), settings, catalogue, categories }));
          html = html.replace('<div id="root"></div>', `<div id="root">${shell}</div>`)
            .replace(/<div id="initial-loader"[\s\S]*?<div id="root"/, '<div id="root"');
          firstScreenStyles('catalogue');
        } catch (error) { console.error('catalogue_shell_render_failed', { error_type: error.name }); }
      }
    }
  }

  if (infoPath.has(path)) {
    const info = {
      "/about": ["About Glamia", "Follow the story and point of view behind Glamia."],
      "/contact": ["Contact Glamia", "Questions about an order, product, or delivery? Our team is here to help."],
      "/support": ["Glamia customer support", "Find help with orders, returns, exchanges, delivery, and your account."],
      "/policies": ["Glamia policies", "Review delivery, returns, exchanges, privacy, and checkout information before you shop."],
      "/terms-and-conditions": ["Glamia Terms & Conditions", "Read Glamia’s terms for using the website, mobile site, app, and placing orders."],
      "/privacy-policy": ["Glamia Privacy Policy", "Learn how Glamia collects, uses, shares, protects, and retains personal data."],
      "/refund-cancellation-policy": ["Glamia Refund & Cancellation Policy", "Review Glamia’s order cancellation, damaged-item, and refund rules."],
      "/return-policy": ["Glamia Return Policy", "Review Glamia’s return, exchange, eligibility, and inspection rules."],
      "/shipping-policy": ["Glamia Shipping Policy", "Review Glamia’s shipping methods, delivery timing, delays, and charges."]
    }[path];
    const brand = storefront === "wibrawl" ? "Wibrawl" : "Glamia";
    const heading = storefront === "wibrawl" ? info[0].replace("Glamia", "Wibrawl") : info[0];
    title = `${heading} | ${brand}`;
    description = info[1];
    botContent = path === "/policies" || Object.values(standalonePolicyPaths).includes(path)
      ? policiesBotContent(Object.entries(standalonePolicyPaths).find(([, value]) => value === path)?.[0] || "",(await storefrontSettingsObject(env)).customer_experience)
      : `<main class="info-page"><p class="eyebrow">${brand}</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(info[1])}</p><p><a href="/best-sellers">Browse the collection</a> · <a href="/orders">Track your order</a></p></main>`;
    if (path === "/about") {
      const about = await readAboutPage(env);
      title = `${about.headline} | ${brand}`;
      description = about.introduction.slice(0, 220);
      botContent = `<main class="info-page"><p class="eyebrow">${escapeHtml(about.eyebrow)}</p><h1>${escapeHtml(about.headline)}</h1><p>${escapeHtml(about.introduction)}</p><ol>${about.timeline.map(item => `<li><p>${escapeHtml(item.period)}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.body)}</p></li>`).join("")}</ol></main>`;
    }
  }

  const metaTags = [
    `<meta property="og:site_name" content="${storefront === "wibrawl" ? "Wibrawl" : "Glamia"}" />`,
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

  const bootstrap = bootstrapPromise ? await bootstrapPromise : null;
  if (bootstrap) {
    // A tiny first-screen thumbnail can travel with the document, saving a
    // second network round trip. Larger/external media keeps its normal URL.
    const firstFrame = bootstrap.hero?.slides?.[0]?.frames?.[0];
    const originalHeroImage = firstFrame?.image;
    const campaignInline = storefront === 'wibrawl' && bootstrap.hero.slides[0]?.imagery === 'campaign';
    if (campaignInline) bootstrap.hero.slides[0].campaign_image = wibrawlFirstScreenImage;
    if (bootstrap.hero.slides[0]?.imagery !== 'campaign' && firstFrame?.image?.startsWith('/api/assets/products/')) {
      try {
        // Reuse the immutable public-image edge cache instead of doing an R2
        // round trip each time the short-lived homepage cache expires.
        const imageUrl = new URL(firstFrame.image, url);
        const image = await timed('hero_media', () => cachedProductImage(new Request(imageUrl), env, imageUrl, ctx));
        const type = image.headers.get('Content-Type');
        const size = Number(image.headers.get('Content-Length'));
        if (image.ok && Number.isFinite(size) && size > 0 && size <= 32768 && /^image\/(webp|png|jpeg)$/.test(type || '')) {
          const bytes = new Uint8Array(await image.arrayBuffer());
          firstFrame.image = `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`;
        } else await image.body?.cancel();
      } catch { /* The original public URL remains a safe fallback. */ }
    }
    // Inline first-screen rules from the same built CSS. Preload the complete
    // stylesheet without blocking this shell; React waits for it before mount.
    // Other routes retain their normal external stylesheet.
    for (const file of storefrontStyleFiles) {
      html = html.replace(new RegExp(`<link[^>]+href="/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g'), `<link rel="preload" as="style" href="/${escapeHtml(storefrontDeferredStyleFile)}" data-glamia-storefront-css />`);
    }
    headExtras += `<style id="glamia-storefront-styles">${storefront === "wibrawl" ? wibrawlStorefrontCss : storefrontCss}</style>`;
    try {
      const renderedShell = await timed('render', async () => {
        const { renderHomepageShell } = await import('./homepage-shell.jsx');
        return renderHomepageShell(bootstrap);
      });
      html = html.replace('<div id="root"></div>', `<div id="root">${renderedShell}</div>`)
        .replace(/<div id="initial-loader"[\s\S]*?<div id="root"/, '<div id="root"');
    } catch (error) {
      console.error('public_shell_render_failed', { error_type: error.name });
    }
    const serializedBootstrap = firstFrame?.image?.startsWith('data:image/') ? {
      ...bootstrap,
      hero: { ...bootstrap.hero, first_image_from_dom: true, slides: bootstrap.hero.slides.map((slide, index) => index === 0 ? { ...slide, frames: slide.frames.map((frame, frameIndex) => frameIndex === 0 ? { ...frame, image: originalHeroImage } : frame) } : slide) }
    } : campaignInline ? {
      ...bootstrap,
      hero: { ...bootstrap.hero, campaign_image_from_dom: true, slides: bootstrap.hero.slides.map((slide, index) => index === 0 ? { ...slide, campaign_image: undefined } : slide) }
    } : bootstrap;
    const data = JSON.stringify(serializedBootstrap, istTimestampReplacer).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const firstImage = bootstrap.hero?.slides?.[0]?.frames?.[0]?.image;
    // A relative uploaded asset is safe to preload; external/user-supplied
    // URLs are left to the image element and the existing CSP.
    if (bootstrap.hero.slides[0]?.imagery !== 'campaign' && firstImage?.startsWith("/api/assets/") && !firstImage.startsWith("//")) {
      headExtras += `<link rel="preload" as="image" href="${escapeHtml(firstImage)}" fetchpriority="high" />`;
    }
    headExtras += `<script type="application/json" id="glamia-storefront-bootstrap">${data}</script>`;
  }
  html = html
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace("</head>", `${metaTags}${headExtras}${isBot || renderedFirstScreen ? '' : storefrontResourceHints(path, storefront)}</head>`);
  // The common font characters are already in the verified first-screen CSS.
  // Keep the ordinary font files for all other characters and private routes.
  if (renderedFirstScreen || (path === '/' && bootstrap && !isBot)) html = html.replace(/<link\b[^>]*\bas="font"[^>]*>/g, '');
  if (storefront === 'wibrawl') html = html.replace(/<link\b[^>]*href="\/fonts\/cormorant[^>]*\bas="font"[^>]*>/g, '');
  if (isBot && botContent) {
    html = html
      .replace('<div id="root"></div>', `<div id="root">${botContent}</div>`)
      .replace(/<div id="initial-loader"[\s\S]*?<div id="root"/, '<div id="root"')
      .replace(/<script[^>]+src="https:\/\/accounts\.google\.com\/gsi\/client"[^>]*><\/script>/i, "")
      .replace(/<script\s+type="module"[^>]*><\/script>/i, "");
  }

  serverTimings.push(`total;dur=${Date.now() - started}`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8", "Vary": "User-Agent", "Cache-Control": "public, max-age=120, s-maxage=300, stale-while-revalidate=1800", "Server-Timing": serverTimings.join(', ') } });
}

async function getSitemap(request, env) {
  const url = new URL(request.url);
  const origin = canonicalOriginForRequest(url);
  const visibility = storefrontForRequest(url) === "wibrawl" ? "('wibrawl', 'both')" : "('glamia', 'both')";
  const staticPaths = ["/", "/offers", "/just-arrived", "/best-sellers", "/about", "/contact", "/support", "/policies", ...Object.values(standalonePolicyPaths)];
  let productRows = [];
  try {
    const result = await env.DB.prepare(`
      SELECT p.id, p.product_code, p.name, p.category, p.subcategory, p.images_json, p.image_url, p.thumbnail_url, p.updated_at, p.created_at
      FROM products p
      WHERE p.status = 'live' AND COALESCE(p.storefront_visibility, 'glamia') IN ${visibility}
        AND NOT EXISTS (
          SELECT 1 FROM merchant_product_details details
          WHERE details.product_id = p.id
            AND CASE WHEN json_valid(details.metadata_json)
              THEN json_type(details.metadata_json, '$.isSample') ELSE 'null' END = 'true'
        )
      ORDER BY p.updated_at DESC, p.created_at DESC
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
  const origin = canonicalOriginForRequest(new URL(request.url));
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
  if (request.method !== "GET" || request.headers.get("Cookie") || request.headers.get("Authorization")) return 0;
  const cacheEnabled = url.searchParams.get("cache") === "1";
  if (cacheEnabled && url.pathname === "/api/categories") return 300;
  if (cacheEnabled && (url.pathname === "/api/hero" || url.pathname === "/api/storefront-settings")) return 60;
  if (cacheEnabled && /^\/api\/products\/[^/]+$/.test(url.pathname)) return 30;
  if (cacheEnabled && /^\/api\/products\/[^/]+\/(reviews|questions)$/.test(url.pathname)) return 20;
  if (cacheEnabled && url.pathname === "/api/search" && url.searchParams.get("q")) return 20;
  if (url.pathname === "/api/products" && url.searchParams.get("view") === "cards" && [null, "public"].includes(url.searchParams.get("scope"))) return 30;
  return 0;
}

function publicPageCacheTtl(request, url) {
  if (request.method !== "GET" || request.headers.get("Cookie") || request.headers.get("Authorization")) return 0;
  const path = url.pathname;
  const standaloneInfoPath = [
    "/contact", "/support", "/policies", "/terms-and-conditions", "/privacy-policy",
    "/refund-cancellation-policy", "/return-policy", "/shipping-policy"
  ].includes(path);
  const isPublicPage = path === "/" || ["/offers", "/just-arrived", "/best-sellers"].includes(path)
    || /^\/category\/[^/]+$/i.test(path)
    || /^\/product\/[^/]+$/i.test(path)
    || /^\/[^/]+\/[^/]+\/[^/]+$/i.test(path)
    || standaloneInfoPath;
  return isPublicPage ? 60 : 0;
}

async function cachedPublicResponse(request, ctx, ttl, producer) {
  const cache = globalThis.caches?.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set("__glamia_cache", PUBLIC_CACHE_VERSION);
  // Crawler HTML deliberately has no React script. Never serve it to shoppers.
  if (!cacheUrl.pathname.startsWith("/api/")) cacheUrl.searchParams.set("__glamia_render", CRAWLER_UA.test(request.headers.get("User-Agent") || "") ? "crawler" : "interactive");
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set('Server-Timing', 'edge_cache;desc="HIT"');
      // Cloudflare can add its default browser TTL to Cache API hits. Keep
      // browsers revalidating, while retaining the existing short edge TTL.
      headers.set('Cache-Control', `public, max-age=0, must-revalidate, s-maxage=${ttl}, stale-while-revalidate=${Math.max(ttl * 5, 300)}`);
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
    }
  }
  const response = await producer();
  if (!response || response.status !== 200) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=0, must-revalidate, s-maxage=${ttl}, stale-while-revalidate=${Math.max(ttl * 5, 300)}`);
  const cacheable = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
  return cacheable;
}

async function invalidateStorefrontCache(request, storefront = null) {
  const cache = globalThis.caches?.default;
  if (!cache) return;
  const requestUrl = new URL(request.url);
  const origins = STOREFRONT_ORIGINS.includes(requestUrl.origin)
    ? storefront === "wibrawl" ? [WIBRAWL_ORIGIN] : storefront === "glamia" ? STOREFRONT_ORIGINS.slice(0, 2) : STOREFRONT_ORIGINS
    : [requestUrl.origin];
  try { await Promise.all(origins.flatMap(origin => ["/api/storefront-settings?cache=1", "/"].flatMap(path =>
    (path === "/" ? ["crawler", "interactive"] : [null]).map(mode => {
      const cacheUrl = new URL(path, origin);
      cacheUrl.searchParams.set("__glamia_cache", PUBLIC_CACHE_VERSION);
      if (mode) cacheUrl.searchParams.set("__glamia_render", mode);
      return cache.delete(new Request(cacheUrl.toString(), { method: "GET" }));
    })))); }
  catch (error) { console.error("Storefront cache invalidation failed", error); }
}

async function invalidateHeroCache(request, storefront) {
  const cache = globalThis.caches?.default;
  if (!cache) return;
  const requestUrl = new URL(request.url);
  const origins = STOREFRONT_ORIGINS.includes(requestUrl.origin)
    ? storefront === "wibrawl" ? [WIBRAWL_ORIGIN] : STOREFRONT_ORIGINS.slice(0, 2)
    : [requestUrl.origin];
  try {
    await Promise.all(origins.flatMap(origin => [null, 'interactive', 'crawler'].map(mode => {
      const url = new URL(mode ? '/' : '/api/hero?cache=1', origin);
      if (['localhost', '127.0.0.1'].includes(url.hostname) && storefront === 'wibrawl') url.searchParams.set('wibrawl-preview', '1');
      url.searchParams.set('__glamia_cache', PUBLIC_CACHE_VERSION);
      if (mode) url.searchParams.set('__glamia_render', mode);
      return cache.delete(new Request(url, {method:'GET'}));
    })));
  } catch (error) { console.error('Hero cache invalidation failed', error); }
}

async function routeApi(request, env, url, ctx) {
  const path = url.pathname;
  // Native Expo clients do not have a browser Origin/Referer. Their explicit
  // mobile marker plus bearer session is the CSRF boundary for app requests.
  const isExternalCallback = ["/api/payments/webhooks/razorpay", "/api/payments/webhooks/phonepe", APPLE_MOBILE_CALLBACK_PATH, APPLE_WEB_CALLBACK_PATH].includes(path);
  if (!path.startsWith("/api/employee/") && !isExternalCallback) assertSameOrigin(request, url);
  await enforceRateLimit(request, url, env, ctx);
  const user = await currentUser(request, env);
  if (user?.employee_id && !user.is_owner) await authorizeEmployeeWebsiteRequest(request, url, user);

  if (path === "/api/admin/credits" || path.startsWith("/api/admin/credits/")) {
    requireAdmin(user);
    return handleCreditAdmin(request, env, user, path, url);
  }

  if (request.method === "GET" && path === "/api/about") return json(await readAboutPage(env));
  if (path === "/api/admin/about") {
    requireAdmin(user);
    if (request.method === "GET") return json(await readAboutPage(env));
    if (request.method === "PUT") {
      const updated = await saveAboutPage(env, await readJson(request), user.email);
      await writeAuditLog(env, user.email, "update", "about_page", "1", { moment_count: updated.timeline.length });
      return json(updated);
    }
  }

  if (path === "/api/admin/google-merchant" || path.startsWith("/api/admin/google-merchant/")) {
    requireAdmin(user);
    if (user.employee_id && !user.is_owner && /\/(register|verify)$/.test(path)) throw httpError("This action is reserved for an owner", 403);
    return merchantAdmin(request, env, url, ctx, { path: canonicalProductPath, price: currentSellingPrice });
  }

  if (request.method === "POST" && path === "/api/employee/auth/login") {
    return employeeLogin(request, env);
  }
  if (request.method === "POST" && path === "/api/employee/auth/logout") {
    return employeeLogout(request, env);
  }
  if (request.method === "GET" && path === "/api/employee/session") {
    return getEmployeeSession(request, env);
  }
  if (request.method === "POST" && path === "/api/employee/push-tokens") {
    const employeeSession = await requireEmployee(request, env);
    return registerEmployeePushToken(request, env, employeeSession.employee);
  }
  if (request.method === "DELETE" && path === "/api/employee/push-tokens") {
    const employeeSession = await requireEmployee(request, env);
    return removeEmployeePushToken(request, env, employeeSession.employee);
  }

  // Employee admin workspaces deliberately use a separate route namespace.
  // Every route checks the employee's current permission before touching the
  // same data/actions exposed by the browser admin console. This keeps the
  // mobile UI convenient without making the UI itself the security boundary.
  const employeeAdmin = path.startsWith("/api/employee/admin/");
  if (employeeAdmin) {
    const employeeSession = await requireEmployee(request, env);
    const employee = employeeSession.employee;
    const actor = employeeAdminActor(employee, env);
    const permission = (id) => requireEmployeePermission(employeeSession, id);
    const anyPermission = (ids) => requireEmployeeAnyPermission(employeeSession, ids);

    if (path === "/api/employee/admin/credits" || path.startsWith("/api/employee/admin/credits/")) {
      if (!employeeIsOwner(employee, env)) permission("credits");
      return handleCreditAdmin(request, env, actor, path.replace("/api/employee/admin/", "/api/admin/"), url);
    }

    if (request.method === "GET" && path === "/api/employee/admin/dashboard") {
      permission("dashboard");
      return dashboardStats(env);
    }
    if (request.method === "GET" && path === "/api/employee/admin/products") {
      anyPermission(["products", "add_product", "bulk_listing", "inventory", "deals", "tax", "coupons"]);
      return listProducts(env, actor, "admin", url.searchParams);
    }
    if (request.method === "POST" && path === "/api/employee/admin/products") {
      permission("add_product");
      return createProduct(request, env, employeeCatalogActor(employee), ctx);
    }
    if (request.method === "POST" && path === "/api/employee/admin/bulk-products") {
      permission("bulk_listing");
      const body = await readJson(request);
      const products = Array.isArray(body.products) ? body.products.slice(0, 100) : [];
      if (!products.length) return json({ error: "Add at least one listing to import" }, 400);
      const created = [];
      const errors = [];
      for (const [index, product] of products.entries()) {
        try {
          const response = await createProduct(new Request(request.url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify(product)
          }), env, employeeCatalogActor(employee), ctx);
          const data = await response.json();
          if (!response.ok) errors.push({ row: index + 1, error: data.error || "Listing could not be created" });
          else created.push(data.product || data);
        } catch (error) {
          errors.push({ row: index + 1, error: String(error?.message || "Listing could not be created") });
        }
      }
      return json({ ok: errors.length === 0, created, errors }, errors.length && !created.length ? 400 : 200);
    }
    const employeeAdminProduct = path.match(/^\/api\/employee\/admin\/products\/([^/]+)$/);
    if (employeeAdminProduct && request.method === "PATCH") {
      anyPermission(["products", "inventory", "deals", "tax"]);
      const body = await readJson(request);
      const allowed = allowedEmployeeProductFields(employee);
      const unexpected = Object.keys(body).filter((key) => !allowed.has(key));
      if (unexpected.length) return json({ error: "This account cannot change those listing fields" }, 403);
      const response = await updateProduct(new Request(request.url, {
        method: "PATCH",
        headers: request.headers,
        body: JSON.stringify(body)
      }), env, decodeURIComponent(employeeAdminProduct[1]), actor, ctx);
      return response;
    }
    if (request.method === "GET" && path === "/api/employee/admin/categories") {
      anyPermission(["categories", "products", "add_product", "coupons", "hero"]);
      return listCategories(env, "glamia", true);
    }
    if (request.method === "POST" && path === "/api/employee/admin/categories") {
      permission("categories");
      return createCategory(request, env);
    }
    const employeeAdminCategory = path.match(/^\/api\/employee\/admin\/categories\/([^/]+)$/);
    if (employeeAdminCategory && request.method === "DELETE") {
      permission("categories");
      return deleteCategory(env, decodeURIComponent(employeeAdminCategory[1]));
    }
    if (request.method === "POST" && path === "/api/employee/admin/subcategories") {
      permission("categories");
      return createSubcategory(request, env);
    }
    const employeeAdminSubcategory = path.match(/^\/api\/employee\/admin\/subcategories\/([^/]+)\/([^/]+)$/);
    if (employeeAdminSubcategory && request.method === "DELETE") {
      permission("categories");
      return deleteSubcategory(env, decodeURIComponent(employeeAdminSubcategory[1]), decodeURIComponent(employeeAdminSubcategory[2]));
    }
    if (request.method === "GET" && path === "/api/employee/admin/orders") {
      anyPermission(["orders", "labels"]);
      return listOrders(env, actor, "admin", url.searchParams);
    }
    const employeeAdminOrder = path.match(/^\/api\/employee\/admin\/orders\/([^/]+)$/);
    if (employeeAdminOrder && request.method === "PATCH") {
      anyPermission(["orders", "labels"]);
      const body = await readJson(request);
      if (!employeeHasPermission(employee, "orders")) {
        const unexpected = Object.keys(body).filter((key) => key !== "tracking_number");
        if (unexpected.length) return json({ error: "Labels access can only update tracking numbers" }, 403);
      }
      return updateOrderStatus(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify(body) }), env, decodeURIComponent(employeeAdminOrder[1]), actor);
    }
    if (request.method === "GET" && path === "/api/employee/admin/returns") {
      permission("returns");
      return listReturns(env, actor, "admin");
    }
    const employeeAdminReturn = path.match(/^\/api\/employee\/admin\/returns\/([^/]+)$/);
    if (employeeAdminReturn && request.method === "PATCH") {
      permission("returns");
      return updateReturnRequest(request, env, actor, decodeURIComponent(employeeAdminReturn[1]), ctx);
    }
    if (request.method === "GET" && path === "/api/employee/admin/support/tickets") {
      permission("support");
      return listSupportTickets(env, actor, "admin");
    }
    const employeeSupportContext = path.match(/^\/api\/employee\/admin\/support\/tickets\/([^/]+)\/(order-context|return-access)$/);
    if (employeeSupportContext && (request.method==='GET' || request.method==='PATCH')) {
      permission('support');
      const id=decodeURIComponent(employeeSupportContext[1]);
      if(request.method==='GET' && employeeSupportContext[2]==='order-context') return supportTicketOrderContext(env,actor,id);
      if(request.method==='PATCH' && employeeSupportContext[2]==='return-access') return updateSupportReturnAccess(request,env,actor,id);
    }
    const employeeAdminSupportMessage = path.match(/^\/api\/employee\/admin\/support\/tickets\/([^/]+)\/messages$/);
    if (employeeAdminSupportMessage && ["GET", "POST"].includes(request.method)) {
      permission("support");
      return request.method === "GET"
        ? listSupportMessages(env, actor, decodeURIComponent(employeeAdminSupportMessage[1]))
        : createSupportMessage(request, env, actor, decodeURIComponent(employeeAdminSupportMessage[1]));
    }
    const employeeAdminSupportTicket = path.match(/^\/api\/employee\/admin\/support\/tickets\/([^/]+)$/);
    if (employeeAdminSupportTicket && request.method === "PATCH") {
      permission("support");
      return updateSupportTicket(request, env, actor, decodeURIComponent(employeeAdminSupportTicket[1]));
    }
    if (request.method === "GET" && path === "/api/employee/admin/customers") {
      permission("customers");
      return listCustomers(env);
    }
    const employeeCustomerOrders = path.match(/^\/api\/employee\/admin\/customers\/([^/]+)\/orders$/);
    if (employeeCustomerOrders && request.method === "GET") {
      permission("customers");
      permission("orders");
      return listAdminCustomerOrders(env, actor, decodeURIComponent(employeeCustomerOrders[1]), url.searchParams);
    }
    if (request.method === "GET" && path === "/api/employee/admin/reviews") {
      permission("reviews");
      return listAllReviews(env);
    }
    const employeeAdminReview = path.match(/^\/api\/employee\/admin\/reviews\/([^/]+)$/);
    if (employeeAdminReview && request.method === "PATCH") {
      permission("reviews");
      return moderateReview(request, env, decodeURIComponent(employeeAdminReview[1]));
    }
    if (employeeAdminReview && request.method === "DELETE") {
      permission("reviews");
      return deleteReview(env, decodeURIComponent(employeeAdminReview[1]));
    }
    if (request.method === "GET" && path === "/api/employee/admin/questions") {
      permission("questions");
      return listAllProductQuestions(env);
    }
    const employeeAdminQuestion = path.match(/^\/api\/employee\/admin\/questions\/([^/]+)$/);
    if (employeeAdminQuestion && request.method === "PATCH") {
      permission("questions");
      return moderateProductQuestion(request, env, actor, decodeURIComponent(employeeAdminQuestion[1]));
    }
    if (request.method === "GET" && path === "/api/employee/admin/coupons") {
      permission("coupons");
      return listCoupons(env);
    }
    if (request.method === "POST" && path === "/api/employee/admin/coupons") {
      permission("coupons");
      return createCoupon(request, env);
    }
    const employeeAdminCoupon = path.match(/^\/api\/employee\/admin\/coupons\/([^/]+)$/);
    if (employeeAdminCoupon && request.method === "PATCH") {
      permission("coupons");
      return updateCoupon(request, env, decodeURIComponent(employeeAdminCoupon[1]));
    }
    if (employeeAdminCoupon && request.method === "DELETE") {
      permission("coupons");
      return deleteCoupon(env, decodeURIComponent(employeeAdminCoupon[1]));
    }
    if (request.method === "GET" && path === "/api/employee/admin/storefront-settings") {
      permission("storefront");
      return getStorefrontSettings(env, true, adminHeroStorefront(request));
    }
    if (request.method === "PUT" && path === "/api/employee/admin/storefront-settings") {
      permission("storefront");
      const body = await readJson(request);
      // Reel changes use their own permission even when older clients submit the full settings object.
      const safeBody = { ...body };
      delete safeBody.cinematic_reel;
      return updateStorefrontSettings(new Request(request.url, { method: "PUT", headers: request.headers, body: JSON.stringify(safeBody) }), env);
    }
    if (request.method === "GET" && path === "/api/employee/admin/cinematic-reel") {
      permission("cinematic_reel");
      return getCinematicReelSettings(env, adminHeroStorefront(request));
    }
    if (request.method === "PUT" && path === "/api/employee/admin/cinematic-reel") {
      permission("cinematic_reel");
      return updateCinematicReelSettings(request, env);
    }
    if (request.method === "GET" && path === "/api/employee/admin/events") {
      permission("events");
      return listEvents(env);
    }
    if (request.method === "POST" && path === "/api/employee/admin/events") {
      permission("events");
      return createEvent(request, env, actor);
    }
    const employeeAdminEvent = path.match(/^\/api\/employee\/admin\/events\/([^/]+)$/);
    if (employeeAdminEvent && request.method === "PATCH") {
      permission("events");
      return updateEvent(request, env, decodeURIComponent(employeeAdminEvent[1]), actor);
    }
    if (employeeAdminEvent && request.method === "DELETE") {
      permission("events");
      return deleteEvent(request, env, decodeURIComponent(employeeAdminEvent[1]), actor);
    }
    if (request.method === "GET" && path === "/api/employee/admin/tax") {
      permission("tax");
      const [settingsResponse, reportResponse] = await Promise.all([getTaxSettings(env), taxComplianceReport(env)]);
      return json({ settings: await settingsResponse.json(), report: await reportResponse.json() });
    }
    if (request.method === "PATCH" && path === "/api/employee/admin/tax-settings") {
      permission("tax");
      return updateTaxSettings(request, env, actor);
    }
    if (request.method === "GET" && path === "/api/employee/admin/analytics") {
      permission("google_analytics");
      return googleAnalyticsReport(env);
    }
    if (request.method === "GET" && path === "/api/employee/admin/system") {
      permission("system");
      const [healthResponse, eventsResponse] = await Promise.all([healthCheck(env), listEmailEvents(env)]);
      return json({ health: await healthResponse.json(), events: (await eventsResponse.json()).events || [] });
    }
    const employeeAdminEmailEvent = path.match(/^\/api\/employee\/admin\/system\/email-events\/([^/]+)\/retry$/);
    if (employeeAdminEmailEvent && request.method === "POST") {
      permission("system");
      return retryEmailEvent(env, decodeURIComponent(employeeAdminEmailEvent[1]), actor);
    }
    if (request.method === "GET" && path === "/api/employee/admin/employees") {
      permission("employees");
      return listEmployees(env, actor);
    }
    if (request.method === "POST" && path === "/api/employee/admin/employees") {
      permission("employees");
      return createEmployee(request, env, actor);
    }
    const employeeAdminEmployee = path.match(/^\/api\/employee\/admin\/employees\/([^/]+)$/);
    if (employeeAdminEmployee && request.method === "PATCH") {
      permission("employees");
      return updateEmployee(request, env, decodeURIComponent(employeeAdminEmployee[1]), actor);
    }
    if (employeeAdminEmployee && request.method === "DELETE") {
      permission("employees");
      return deleteEmployee(env, decodeURIComponent(employeeAdminEmployee[1]), actor);
    }
    return json({ error: "Employee admin area not found" }, 404);
  }
  if (request.method === "GET" && path === "/api/employee/dashboard") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "dashboard");
    return employeeDashboard(env);
  }
  if (request.method === "GET" && path === "/api/employee/products") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeeAnyPermission(employeeSession, ["products", "add_product", "inventory", "hero", "deals", "tax", "coupons", "bulk_listing"]);
    return listEmployeeProducts(env);
  }
  if (request.method === "POST" && path === "/api/employee/products") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "add_product");
    return createEmployeeProduct(request, env, employeeSession.employee, ctx);
  }
  const employeeProduct = path.match(/^\/api\/employee\/products\/([^/]+)$/);
  if (employeeProduct && request.method === "PATCH") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeeAnyPermission(employeeSession, ["products", "inventory"]);
    return updateEmployeeProduct(request, env, decodeURIComponent(employeeProduct[1]), employeeSession.employee, ctx);
  }
  if (request.method === "GET" && path === "/api/employee/categories") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeeAnyPermission(employeeSession, ["categories", "products", "add_product"]);
    return listCategories(env, "glamia", true);
  }
  if (request.method === "POST" && path === "/api/employee/categories") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "categories");
    return createCategory(request, env);
  }
  if (request.method === "POST" && path === "/api/employee/subcategories") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "categories");
    return createSubcategory(request, env);
  }
  if (request.method === "GET" && path === "/api/employee/hero") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "hero");
    return listHeroSlides(env, true, adminHeroStorefront(request));
  }
  if (request.method === "GET" && path === "/api/employee/hero/insights") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "hero");
    return heroInsights(env, adminHeroStorefront(request));
  }
  if (request.method === "POST" && path === "/api/employee/hero") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "hero");
    return createHeroSlide(request, env);
  }
  if (request.method === "PUT" && path === "/api/employee/hero/order") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "hero");
    return reorderHeroSlides(request, env);
  }
  const employeeHero = path.match(/^\/api\/employee\/hero\/([^/]+)$/);
  if (employeeHero && request.method === "PATCH") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "hero");
    return updateHeroSlide(request, env, decodeURIComponent(employeeHero[1]));
  }
  if (employeeHero && request.method === "DELETE") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "hero");
    return deleteHeroSlide(env, decodeURIComponent(employeeHero[1]), adminHeroStorefront(request));
  }
  if (request.method === "GET" && path === "/api/employee/orders") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "packing");
    return listEmployeeOrders(env, url.searchParams.get("status") || "unpacked", employeeSession);
  }
  const employeeOrder = path.match(/^\/api\/employee\/orders\/([^/]+)$/);
  if (employeeOrder && request.method === "GET") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "packing");
    return getEmployeeOrder(env, decodeURIComponent(employeeOrder[1]), employeeSession);
  }
  const employeePackedOrder = path.match(/^\/api\/employee\/orders\/([^/]+)\/packed$/);
  if (employeePackedOrder && request.method === "POST") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "packing");
    return markEmployeeOrderPacked(env, decodeURIComponent(employeePackedOrder[1]), employeeSession);
  }
  if (request.method === "GET" && path === "/api/employee/notifications") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "notifications");
    return listEmployeeNotifications(env, employeeSession.employee);
  }
  if (request.method === "GET" && path === "/api/employee/notifications/count") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "notifications");
    return getEmployeeNotificationCount(env, employeeSession.employee);
  }
  if (request.method === "POST" && path === "/api/employee/notifications/read-all") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "notifications");
    await markAllEmployeeNotificationsRead(env, employeeSession.employee);
    return listEmployeeNotifications(env, employeeSession.employee);
  }
  if (request.method === "DELETE" && path === "/api/employee/notifications/cleared") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "notifications");
    await env.DB.prepare(`
      UPDATE employee_notification_states
      SET dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = ? AND read_at IS NOT NULL
    `).bind(employeeSession.employee.id).run();
    return listEmployeeNotifications(env, employeeSession.employee);
  }
  const employeeNotification = path.match(/^\/api\/employee\/notifications\/([^/]+)$/);
  if (employeeNotification && request.method === "PATCH") {
    const employeeSession = await requireEmployee(request, env);
    requireEmployeePermission(employeeSession, "notifications");
    return updateEmployeeNotification(request, env, employeeSession.employee, decodeURIComponent(employeeNotification[1]));
  }

  if (request.method === "GET" && path === "/api/config") {
    return json({
      googleClientId: env.GOOGLE_CLIENT_ID || "",
      googleAnalyticsMeasurementId: env.GA4_MEASUREMENT_ID || "",
      appleWebAvailable: appleWebConfigured(env),
    });
  }

  if (request.method === "GET" && path === "/api/session/storefront-bridge") {
    return bridgeStorefrontSession(request, user);
  }

  if (request.method === "GET" && path === "/api/session") {
    const profileStatus = user && user.role !== "admin"
      ? await getProfileCompletionStatus(env, user)
      : { profile_complete: true, needs_profile_completion: false };
    const response = json({ user, ...profileStatus });
    promoteStorefrontSession(request, user, response);
    return response;
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
  if (request.method === "POST" && path === "/api/auth/apple") {
    return loginWithApple(request, env);
  }
  if (request.method === "GET" && path === "/api/auth/apple/mobile/config") {
    return json({ available: Boolean(appleMobileServiceId(env)) }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && path === "/api/auth/apple/mobile/start") {
    return startAppleMobileLogin(request, env);
  }
  if (request.method === "POST" && path === APPLE_MOBILE_CALLBACK_PATH) {
    return completeAppleMobileLogin(request, env);
  }
  if (request.method === "POST" && path === "/api/auth/apple/mobile/exchange") {
    return exchangeAppleMobileLogin(request, env);
  }
  if (request.method === "GET" && path === "/api/auth/apple/web/start") {
    return startAppleWebLogin(env);
  }
  if (request.method === "POST" && path === APPLE_WEB_CALLBACK_PATH) {
    return completeAppleWebLogin(request, env);
  }

  if (request.method === "GET" && path === "/api/auth/demo-admin") {
    return loginAsDemoAdmin(request, env);
  }

  if (request.method === "POST" && path === "/api/logout") {
    if (user?.email) {
      // Global sign-out revokes both sessions and their notification destinations.
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE email = ?").bind(user.email),
        env.DB.prepare("UPDATE customer_push_tokens SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE user_email = ? AND active = 1").bind(user.email)
      ]);
    }
    const response = json({ user: null });
    response.headers.append("Set-Cookie", clearSessionCookie(request, HOST_SESSION_COOKIE));
    response.headers.append("Set-Cookie", clearSessionCookie(request, SESSION_COOKIE));
    if (sharedSessionHost(request)) response.headers.append("Set-Cookie", clearSessionCookie(request, SHARED_SESSION_COOKIE));
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
  if (request.method === "DELETE" && path === "/api/account") {
    requireUser(user);
    return deleteCustomerAccount(request, env, user);
  }

  if (request.method === "GET" && path === "/api/loyalty") {
    requireUser(user);
    return json(await creditWallet(env, user, url.searchParams.get("summary") === "1"));
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
    return listProducts(env, user, url.searchParams.get("scope") || "public", url.searchParams, storefrontForRequest(url));
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
    const vector = storefrontForRequest(url) === "wibrawl" ? null : await vectorSearchProducts(env, query, limit);
    if (vector) return json(vector);
    const fallback = await listProducts(env, user, "public", new URLSearchParams({ q: query, view: "cards", limit: String(limit) }), storefrontForRequest(url));
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
    return listHeroSlides(env, false, storefrontForRequest(request.url));
  }

  if (request.method === "GET" && path === "/api/storefront-settings") {
    return getStorefrontSettings(env, false, storefrontForRequest(url));
  }

  if (request.method === "POST" && path === "/api/payments/create") {
      return createGatewayPayment(request, env, user);
  }

  if (request.method === "POST" && path === "/api/payments/razorpay/verify") {
    return verifyRazorpayPayment(request, env, user, ctx);
  }

  if (request.method === "GET" && path === "/api/payments/phonepe/status") {
    return getPhonePePaymentStatus(request, env, user, url, ctx);
  }

  if (request.method === "POST" && path === "/api/payments/webhooks/razorpay") {
    return handleRazorpayWebhook(request, env);
  }

  if (request.method === "POST" && path === "/api/payments/webhooks/phonepe") {
    return handlePhonePeWebhook(request, env, ctx);
  }

  if (request.method === "GET" && path === "/api/postal-lookup") {
    return lookupIndianPostalCode(url.searchParams.get("pin"),env);
  }

  if (request.method === "POST" && path === "/api/products") {
    requireUser(user);
    return createProduct(request, env, user, ctx);
  }

  if (request.method === "POST" && path === "/api/uploads/video") {
    requireUser(user);
    const quotaRequired = !adminEmails(env, request).includes(String(user.email).toLowerCase());
    return json(await storeProductVideo(request, env, user, {
      ownerKey: await hashIdentifier(user.email),
      reserve: bytes => quotaRequired ? reserveUploadQuota(env, user.email, bytes) : Promise.resolve(),
      release: bytes => quotaRequired ? releaseUploadQuota(env, user.email, bytes) : Promise.resolve()
    }));
  }

  if (request.method === "POST" && path === "/api/uploads/image") {
    requireUser(user);
    return uploadImage(request, env, user);
  }

  if (request.method === "GET" && path === "/api/orders") {
    requireUser(user);
    return listOrders(env, user, url.searchParams.get("scope") || "own", url.searchParams);
  }

  if (request.method === "GET" && path === "/api/notifications") {
    requireUser(user);
    return listCustomerNotifications(env, user);
  }
  if (request.method === "GET" && path === "/api/saved-items") {
    requireUser(user);
    return getCustomerSavedItems(env, user);
  }
  if (request.method === "POST" && path === "/api/saved-items/merge") {
    requireUser(user);
    return changeCustomerSavedItems(request, env, user, true);
  }
  if (request.method === "PATCH" && path === "/api/saved-items") {
    requireUser(user);
    return changeCustomerSavedItems(request, env, user, false);
  }
  if (request.method === "GET" && path === "/api/notification-preferences") {
    requireUser(user);
    return getCustomerNotificationPreferences(env, user);
  }
  if (request.method === "PUT" && path === "/api/notification-preferences") {
    requireUser(user);
    return updateCustomerNotificationPreferences(request, env, user);
  }
  if (request.method === "POST" && path === "/api/notifications/read") {
    requireUser(user);
    return markCustomerNotificationsRead(request, env, user);
  }
  if (request.method === "POST" && path === "/api/push-tokens") {
    requireUser(user);
    return registerCustomerPushToken(request, env, user);
  }
  if (request.method === "DELETE" && path === "/api/push-tokens") {
    requireUser(user);
    return removeCustomerPushToken(request, env, user);
  }

  if (request.method === "GET" && path === "/api/order-tracking") {
    return trackPublicOrder(env, url.searchParams.get("order_id"), url.searchParams.get("email"));
  }

  if (request.method === "POST" && path === "/api/orders") {
    return createOrder(request, env, user);
  }

  const orderInvoice = path.match(/^\/api\/orders\/([^/]+)\/invoice$/);
  if (orderInvoice && request.method === "GET") {
    return orderInvoiceResponse(env, user, decodeURIComponent(orderInvoice[1]), url.searchParams.get("token"));
  }
  const orderBill = path.match(/^\/api\/orders\/([^/]+)\/bill$/);
  if (orderBill && request.method === "GET") {
    return orderBillResponse(env, user, decodeURIComponent(orderBill[1]), url.searchParams.get("token") || "");
  }

  const customerSupportOrder=path.match(/^\/api\/orders\/([^/]+)\/support-context$/);
  if(customerSupportOrder && request.method==='GET') {
    requireUser(user);
    const order=await env.DB.prepare('SELECT * FROM orders WHERE id=? AND LOWER(TRIM(customer_email))=?')
      .bind(decodeURIComponent(customerSupportOrder[1]),String(user.email).trim().toLowerCase()).first();
    if(!order)return json({error:'Order not found'},404);
    return json(await supportOrderContextData(env,order));
  }
  const orderAction = path.match(/^\/api\/orders\/([^/]+)\/(cancel|returns)$/);
  if (orderAction && request.method === "GET" && orderAction[2] === "returns") {
    requireUser(user);
    return customerOrderReturnOptions(env, user, decodeURIComponent(orderAction[1]));
  }
  if (orderAction && request.method === "POST") {
    requireUser(user);
    const orderId = decodeURIComponent(orderAction[1]);
    return orderAction[2] === "cancel"
      ? cancelOwnOrder(request, env, user, orderId, ctx)
      : createReturnRequest(request, env, user, orderId);
  }

  if (request.method === "GET" && path === "/api/returns") {
    requireUser(user);
    return listReturns(env, user, url.searchParams.get("scope") || "own");
  }

  const returnDocumentRoute=path.match(/^\/api\/returns\/([^/]+)\/(label|receipt)$/);
  const returnDocumentAccess=path.match(/^\/api\/returns\/([^/]+)\/document-access$/);
  if(returnDocumentAccess && request.method==='POST') {
    requireUser(user);
    return createReturnDocumentAccess(request,env,user,decodeURIComponent(returnDocumentAccess[1]));
  }
  if(returnDocumentRoute && request.method==='GET') {
    const returned=await getReturnRequest(env,decodeURIComponent(returnDocumentRoute[1]));
    if(!user) {
      const valid=returned && await consumeReturnDocumentAccess(env,returned.id,returnDocumentRoute[2],url.searchParams.get('access'));
      if(!valid) return json({error:'Sign in to download this document'},401);
      return returnDocument(env,returned,returnDocumentRoute[2]);
    }
    if(!returned || (String(returned.customer_email).toLowerCase()!==user.email.toLowerCase() && user.role!=='admin')) return json({error:'Not found'},404);
    if(user.role==='admin' && String(returned.customer_email).toLowerCase()!==user.email.toLowerCase()) requireReturnsAdmin(user);
    return returnDocument(env,returned,returnDocumentRoute[2]);
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
  const supportEscalateRoute=path.match(/^\/api\/support\/tickets\/([^/]+)\/escalate$/);
  if(supportEscalateRoute&&request.method==='POST'){
    requireUser(user);return escalateOwnSupportTicket(env,user,decodeURIComponent(supportEscalateRoute[1]));
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

  if (request.method === "POST" && path === "/api/coupons/available") {
    requireUser(user);
    return listAvailableCoupons(request, env, user);
  }

  if (request.method === "POST" && path === "/api/cart-events") {
    requireUser(user);
    return trackCartEvent(request, env, user);
  }

  if (request.method === "POST" && path === "/api/wishlist-events") {
    requireUser(user);
    return trackWishlistEvent(request, env, user);
  }

  if (["GET", "HEAD"].includes(request.method) && path.startsWith("/api/assets/product-videos/")) {
    return serveProductVideo(request, env, path.slice("/api/assets/".length));
  }
  if (["GET", "HEAD"].includes(request.method) && path.startsWith("/api/assets/")) {
    return serveR2Asset(env, path.replace("/api/assets/", ""), request.method === "HEAD");
  }

  const productResource = path.match(/^\/api\/products\/([^/]+)$/);
  if (productResource && request.method === "GET") {
    const context = url.searchParams.has("category") || url.searchParams.has("subcategory")
      ? { category: url.searchParams.get("category") || "", subcategory: url.searchParams.get("subcategory") || "" }
      : null;
    return getProduct(env, url.searchParams.get('scope') === 'cart' ? null : user, decodeURIComponent(productResource[1]), context, url.searchParams.get('scope') === 'cart' ? 'all' : storefrontForRequest(url));
  }
  if (productResource && request.method === "DELETE") {
    requireUser(user);
    return deleteProduct(env, user, decodeURIComponent(productResource[1]), ctx);
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
    return listCategories(env, storefrontForRequest(url), user?.role === "admin");
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
    return updateProduct(request, env, decodeURIComponent(adminProduct[1]), user, ctx);
  }

  const adminOrder = path.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (adminOrder && request.method === "PATCH") {
    requireAdmin(user);
    return updateOrderStatus(request, env, decodeURIComponent(adminOrder[1]), user);
  }

  const adminOrderReturn = path.match(/^\/api\/admin\/returns\/orders\/([^/]+)$/);
  const returnCompletionRoute=path.match(/^\/api\/admin\/returns\/([^/]+)\/complete$/);
  if(returnCompletionRoute && request.method==='POST') return completeReturnComplaint(request,env,user,decodeURIComponent(returnCompletionRoute[1]));
  const returnPickupRoute=path.match(/^\/api\/admin\/returns\/([^/]+)\/pickup$/);
  if(returnPickupRoute && request.method==='POST') {
    return confirmReturnPickup(request,env,user,decodeURIComponent(returnPickupRoute[1]));
  }
  const returnReceiptRoute=path.match(/^\/api\/admin\/returns\/([^/]+)\/receipt$/);
  if(returnReceiptRoute && request.method==='POST') return confirmWarehouseReceipt(request,env,user,decodeURIComponent(returnReceiptRoute[1]),ctx);
  const returnLogisticsRoute=path.match(/^\/api\/admin\/returns\/([^/]+)\/logistics$/);
  if(returnLogisticsRoute && request.method==='PATCH') {
    requireReturnsAdmin(user);
    const id=decodeURIComponent(returnLogisticsRoute[1]);
    const current=await getReturnRequest(env,id);
    if(!current) return json({error:'Not found'},404);
    const settings=await storefrontSettingsObject(env,true);
    await saveReturnLogistics(request,env,current,user.email,{warehouse_address:settings.fulfillment?.warehouse_address,shipping:current.order?.shipping,customer_name:current.order?.customer_name});
    await createCustomerNotification(env,{email:current.customer_email,type:'return_update',title:'Your return instructions were updated',message:'Open your orders to view pickup, label and inspection details.',orderId:current.order_id,deepLink:'/orders',dedupeKey:`return-logistics:${id}:${crypto.randomUUID()}`});
    return json({request:await getReturnRequest(env,id)});
  }
  if (adminOrderReturn && ["GET", "POST"].includes(request.method)) {
    requireReturnsAdmin(user);
    const orderId = decodeURIComponent(adminOrderReturn[1]);
    return request.method === "GET" ? adminOrderReturnOptions(request, env, user, orderId)
      : createReturnRequest(request, env, user, orderId, { adminInitiated: true });
  }
  const cancellationRefund = path.match(/^\/api\/admin\/orders\/([^/]+)\/cancellation-refund(?:\/(process|reconcile|recover))?$/);
  if (cancellationRefund && ['GET','POST'].includes(request.method)) {
    requireAdmin(user);
    return handleCancellationRefund(request,env,user,decodeURIComponent(cancellationRefund[1]),cancellationRefund[2]);
  }
  const adminGatewayRefund = path.match(/^\/api\/admin\/returns\/([^/]+)\/refund(?:\/(approve|execute|reconcile|recover|process))?$/);
  if (adminGatewayRefund && ["GET", "POST"].includes(request.method)) {
    requireAdmin(user);
    return handleGatewayRefund(request, env, user, decodeURIComponent(adminGatewayRefund[1]), adminGatewayRefund[2]);
  }
  const adminReturn = path.match(/^\/api\/admin\/returns\/([^/]+)$/);
  if (adminReturn && request.method === "PATCH") {
    requireAdmin(user);
    return updateReturnRequest(request, env, user, decodeURIComponent(adminReturn[1]), ctx);
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
  const adminCustomerOrders = path.match(/^\/api\/admin\/customers\/([^/]+)\/orders$/);
  if (adminCustomerOrders && request.method === "GET") {
    return listAdminCustomerOrders(env, user, decodeURIComponent(adminCustomerOrders[1]), url.searchParams);
  }
  if (request.method === "GET" && path === "/api/admin/coupon-recipients") {
    requireAdmin(user);
    return listCouponRecipients(env);
  }

  if (request.method === "GET" && path === "/api/admin/employees") {
    requireAdmin(user);
    return listEmployees(env, user);
  }
  if (request.method === "POST" && path === "/api/admin/employees") {
    requireAdmin(user);
    return createEmployee(request, env, user);
  }
  const adminEmployee = path.match(/^\/api\/admin\/employees\/([^/]+)$/);
  if (adminEmployee && request.method === "PATCH") {
    requireAdmin(user);
    return updateEmployee(request, env, decodeURIComponent(adminEmployee[1]), user);
  }
  if (adminEmployee && request.method === "DELETE") {
    requireAdmin(user);
    return deleteEmployee(env, decodeURIComponent(adminEmployee[1]), user);
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
  const supportContextRoute=path.match(/^\/api\/admin\/support\/tickets\/([^/]+)\/(order-context|return-access)$/);
  if(supportContextRoute){
    const id=decodeURIComponent(supportContextRoute[1]);
    if(request.method==='GET' && supportContextRoute[2]==='order-context') return supportTicketOrderContext(env,user,id);
    if(request.method==='PATCH' && supportContextRoute[2]==='return-access') return updateSupportReturnAccess(request,env,user,id);
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
  if (request.method === "GET" && path === "/api/admin/notifications/count") {
    requireAdmin(user);
    return getAdminNotificationCount(env);
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
    return listHeroSlides(env, true, adminHeroStorefront(request));
  }

  if (request.method === "GET" && path === "/api/admin/hero/insights") {
    requireAdmin(user);
    return heroInsights(env, adminHeroStorefront(request));
  }

  if (request.method === "GET" && path === "/api/admin/storefront-settings") {
    requireAdmin(user);
    return getStorefrontSettings(env, true, adminHeroStorefront(request));
  }

  if (request.method === "PUT" && path === "/api/admin/storefront-settings") {
    requireAdmin(user);
    return updateStorefrontSettings(request, env);
  }

  if (request.method === "GET" && path === "/api/admin/events") {
    requireAdmin(user);
    return listEvents(env);
  }

  if (request.method === "POST" && path === "/api/admin/events") {
    requireAdmin(user);
    return createEvent(request, env, user);
  }

  const adminEvent = path.match(/^\/api\/admin\/events\/([^/]+)$/);
  if (adminEvent && request.method === "PATCH") {
    requireAdmin(user);
    return updateEvent(request, env, decodeURIComponent(adminEvent[1]), user);
  }
  if (adminEvent && request.method === "DELETE") {
    requireAdmin(user);
    return deleteEvent(request, env, decodeURIComponent(adminEvent[1]), user);
  }

  if (request.method === "GET" && path === "/api/admin/cinematic-reel") {
    requireAdmin(user);
    return getCinematicReelSettings(env, adminHeroStorefront(request));
  }

  if (request.method === "PUT" && path === "/api/admin/cinematic-reel") {
    requireAdmin(user);
    return updateCinematicReelSettings(request, env);
  }

  if (request.method === "POST" && path === "/api/admin/hero") {
    requireAdmin(user);
    return createHeroSlide(request, env);
  }

  if (request.method === "PUT" && path === "/api/admin/hero/order") {
    requireAdmin(user);
    return reorderHeroSlides(request, env);
  }

  const adminHero = path.match(/^\/api\/admin\/hero\/([^/]+)$/);
  if (adminHero && request.method === "PATCH") {
    requireAdmin(user);
    return updateHeroSlide(request, env, decodeURIComponent(adminHero[1]));
  }
  if (adminHero && request.method === "DELETE") {
    requireAdmin(user);
    return deleteHeroSlide(env, decodeURIComponent(adminHero[1]), adminHeroStorefront(request));
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
  if (adminCoupon && request.method === "PATCH") {
    requireAdmin(user);
    return updateCoupon(request, env, decodeURIComponent(adminCoupon[1]));
  }
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
  const googleClientIds = allowedGoogleClientIds(env);
  if (!googleClientIds.length) {
    return json({ error: "Configure GOOGLE_CLIENT_ID in wrangler.jsonc" }, 500);
  }

  const profile = await verifyGoogleIdToken(credential, googleClientIds);
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

  if (!existing && referralCode) await validateReferral(env, user.email, referralCode);

  await env.DB.prepare(`
    INSERT INTO users (email, google_sub, name, picture, role, last_login_at, referral_onboarding_open)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
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
    await claimSignupReferral(env, user.email, referralCode);
  }
  await ensureReferralCode(env, user.email);

  Object.assign(user, await resolveWebsiteWorkspaceIdentity(user, env, request));
  const profileStatus = user.role === "admin"
    ? { profile_complete: true, needs_profile_completion: false }
    : await getProfileCompletionStatus(env, user);
  const token = await signSession(user, env);
  const mobile = request.headers.get("X-Glamia-Mobile") === "1";
  return json({
    user: { ...user, needs_profile_completion: profileStatus.needs_profile_completion },
    ...profileStatus,
    ...(mobile ? { session_token: token } : {})
  }, 200, mobile ? {} : {
    "Set-Cookie": makeSessionCookie(request, token)
  });
}

async function loginWithApple(request, env) {
  const body = await readJson(request);
  const identityToken = String(body.identity_token || body.identityToken || "").trim();
  if (!identityToken) return json({ error: "Missing Apple identity token" }, 400);
  const profile = await verifyAppleIdentityToken(identityToken, env);
  const appleSub = String(profile.sub || "").trim();
  if (!appleSub) return json({ error: "Apple account identity is missing" }, 401);

  const linked = await env.DB.prepare("SELECT * FROM users WHERE apple_sub = ? LIMIT 1").bind(appleSub).first();
  const email = String(profile.email || linked?.email || "").trim().toLowerCase();
  if (!email || !isRealCustomerEmail(email)) {
    return json({ error: "Apple did not provide an account email. Please use the original Apple authorization or Google sign-in." }, 401);
  }
  const providedName = String(body.name || "").trim().slice(0, 160);
  const name = providedName || linked?.name || email;
  const role = adminEmails(env, request).includes(email) ? "admin" : "seller";
  const user = { sub: `apple:${appleSub}`, email, name, picture: "", role };
  const existing = linked || await env.DB.prepare("SELECT auth_email_sent_at, name, first_name FROM users WHERE email = ?").bind(email).first();
  const authEmailType = existing ? (!existing.auth_email_sent_at ? "first-login" : null) : "welcome";
  if (!existing && body.referral_code) await validateReferral(env, email, body.referral_code);

  await env.DB.prepare(`
    INSERT INTO users (email, google_sub, apple_sub, name, picture, role, last_login_at, referral_onboarding_open)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
    ON CONFLICT(email) DO UPDATE SET
      apple_sub = excluded.apple_sub,
      name = CASE WHEN COALESCE(users.first_name, '') <> '' THEN users.name ELSE excluded.name END,
      role = excluded.role,
      last_login_at = CURRENT_TIMESTAMP
  `).bind(email, `apple:${appleSub}`, appleSub, name, "", role).run();
  if (!existing && body.referral_code) await claimSignupReferral(env, email, body.referral_code);
  await ensureReferralCode(env, email);

  const storedIdentity = await env.DB.prepare("SELECT name FROM users WHERE email = ?").bind(email).first();
  user.name = storedIdentity?.name || name;
  if (authEmailType) {
    const sent = await sendAuthEmail(env, user, authEmailType);
    if (sent) await env.DB.prepare("UPDATE users SET auth_email_sent_at = CURRENT_TIMESTAMP WHERE email = ?").bind(email).run();
  }
  Object.assign(user, await resolveWebsiteWorkspaceIdentity(user, env, request));
  const profileStatus = user.role === "admin"
    ? { profile_complete: true, needs_profile_completion: false }
    : await getProfileCompletionStatus(env, user);
  const token = await signSession(user, env);
  const mobile = request.headers.get("X-Glamia-Mobile") === "1";
  return json({
    user: { ...user, needs_profile_completion: profileStatus.needs_profile_completion },
    ...profileStatus,
    ...(mobile ? { session_token: token } : {})
  }, 200, mobile ? {} : { "Set-Cookie": makeSessionCookie(request, token) });
}

function appleMobileServiceId(env) {
  const value = String(env.APPLE_SERVICE_ID || "").trim();
  return /^[A-Za-z0-9.-]{3,128}$/.test(value) && value !== String(env.APPLE_CLIENT_ID || "com.glamia.store").trim() ? value : "";
}

function appleWebConfigured(env) {
  return Boolean(appleMobileServiceId(env) && /^[A-Z0-9]{10}$/.test(String(env.APPLE_TEAM_ID || "").trim())
    && /^[A-Z0-9]{10}$/.test(String(env.APPLE_KEY_ID || "").trim())
    && String(env.APPLE_PRIVATE_KEY || "").includes("BEGIN PRIVATE KEY"));
}

// Exchange Apple's one-time web authorization code using a short-lived, server-signed client secret.
async function exchangeAppleWebCode(code, env) {
  const serviceId = appleMobileServiceId(env);
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: String(env.APPLE_KEY_ID).trim(), typ: "JWT" }));
  const claims = base64UrlEncode(JSON.stringify({ iss: String(env.APPLE_TEAM_ID).trim(), iat: issuedAt, exp: issuedAt + 300, aud: "https://appleid.apple.com", sub: serviceId }));
  const pem = String(env.APPLE_PRIVATE_KEY).replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), character => character.charCodeAt(0)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  const clientSecret = `${header}.${claims}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: serviceId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: `${CANONICAL_ORIGIN}${APPLE_WEB_CALLBACK_PATH}` }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw httpError("Apple authorization could not be verified", 401);
  const body = await response.json();
  if (!body.id_token) throw httpError("Apple did not return an identity token", 401);
  return body.id_token;
}

function appleWebFlowCookie(value, maxAge) {
  return `${APPLE_WEB_FLOW_COOKIE}=${value}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
}

function appleWebRedirect(error) {
  const location = error ? `/login?apple_error=${error}` : "/";
  return new Response(null, { status: 303, headers: { Location: location, "Set-Cookie": appleWebFlowCookie("", 0), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

// A SameSite=None, HttpOnly browser cookie binds Apple's cross-site POST to the initiating browser.
async function startAppleWebLogin(env) {
  if (!appleWebConfigured(env)) return json({ error: "Apple sign-in is not configured yet" }, 503);
  const state = `w-${crypto.randomUUID()}`;
  const nonce = crypto.randomUUID();
  const browserSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  await env.DB.prepare("INSERT INTO apple_mobile_login_flows (state, nonce, verifier_hash, expires_at) VALUES (?, ?, ?, unixepoch() + ?)")
    .bind(state, nonce, await appleMobileSha256Hex(browserSecret), APPLE_MOBILE_FLOW_SECONDS).run();
  const authorize = new URL("https://appleid.apple.com/auth/authorize");
  authorize.searchParams.set("client_id", appleMobileServiceId(env));
  authorize.searchParams.set("redirect_uri", `${CANONICAL_ORIGIN}${APPLE_WEB_CALLBACK_PATH}`);
  authorize.searchParams.set("response_type", "code id_token");
  authorize.searchParams.set("response_mode", "form_post");
  authorize.searchParams.set("scope", "name email");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  return new Response(null, { status: 303, headers: { Location: authorize.toString(), "Set-Cookie": appleWebFlowCookie(browserSecret, APPLE_MOBILE_FLOW_SECONDS), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

// The flow is consumed once, and only a verified Apple code can establish a Glamia browser session.
async function completeAppleWebLogin(request, env) {
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) return appleWebRedirect("failed");
  const form = new URLSearchParams(new TextDecoder().decode(await readBoundedBody(request, 16 * 1024)));
  const state = String(form.get("state") || "");
  const browserSecret = parseCookies(request.headers.get("Cookie") || "")[APPLE_WEB_FLOW_COOKIE] || "";
  if (!/^w-[a-f0-9-]{36}$/i.test(state) || !/^(?:[a-f0-9-]{36}){2}$/i.test(browserSecret)) return appleWebRedirect("failed");
  const flow = await env.DB.prepare("DELETE FROM apple_mobile_login_flows WHERE state = ? AND verifier_hash = ? AND expires_at > unixepoch() RETURNING nonce")
    .bind(state, await appleMobileSha256Hex(browserSecret)).first();
  if (!flow) return appleWebRedirect("failed");
  if (form.get("error")) return appleWebRedirect("cancelled");
  if (!appleWebConfigured(env) || !form.get("code")) return appleWebRedirect("failed");
  try {
    const token = await exchangeAppleWebCode(String(form.get("code")), env);
    const profile = await verifyAppleIdentityToken(token, { ...env, APPLE_CLIENT_ID: appleMobileServiceId(env) });
    if (profile.nonce !== flow.nonce) return appleWebRedirect("failed");
    let name = "";
    try {
      const user = JSON.parse(String(form.get("user") || "{}"));
      name = [user?.name?.firstName, user?.name?.lastName].map(value => String(value || "").trim()).filter(Boolean).join(" ").slice(0, 160);
    } catch { /* Apple provides the name only on the first authorization. */ }
    const loginRequest = new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity_token: token, name }) });
    const loginResponse = await loginWithApple(loginRequest, { ...env, APPLE_CLIENT_ID: appleMobileServiceId(env) });
    if (!loginResponse.ok) return appleWebRedirect("failed");
    const response = appleWebRedirect("");
    response.headers.append("Set-Cookie", loginResponse.headers.get("Set-Cookie"));
    return response;
  } catch (error) {
    console.error("Apple web sign-in failed", error?.message || "Unknown error");
    return appleWebRedirect("failed");
  }
}

async function appleMobileSha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

// Start a browser flow bound to a verifier that remains only in the originating app.
async function startAppleMobileLogin(request, env) {
  const serviceId = appleMobileServiceId(env);
  if (!serviceId) return json({ error: "Apple sign-in for Android is not configured yet" }, 503);
  const body = await readJson(request);
  const verifierHash = String(body.verifier_hash || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(verifierHash)) return json({ error: "Invalid Apple sign-in verifier" }, 400);
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO apple_mobile_login_flows (state, nonce, verifier_hash, expires_at) VALUES (?, ?, ?, unixepoch() + ?)")
    .bind(state, nonce, verifierHash, APPLE_MOBILE_FLOW_SECONDS).run();
  const authorize = new URL("https://appleid.apple.com/auth/authorize");
  authorize.searchParams.set("client_id", serviceId);
  authorize.searchParams.set("redirect_uri", `${CANONICAL_ORIGIN}${APPLE_MOBILE_CALLBACK_PATH}`);
  authorize.searchParams.set("response_type", "code id_token");
  authorize.searchParams.set("response_mode", "form_post");
  authorize.searchParams.set("scope", "name email");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  return json({ authorization_url: authorize.toString(), redirect_url: "glamia-store://apple-auth" }, 200, { "Cache-Control": "no-store" });
}

// Apple posts to this HTTPS return URL; only a one-time opaque ticket returns to the app.
async function completeAppleMobileLogin(request, env) {
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return json({ error: "Invalid Apple callback" }, 415);
  }
  const bytes = await readBoundedBody(request, 16 * 1024);
  const form = new URLSearchParams(new TextDecoder().decode(bytes));
  const state = String(form.get("state") || "");
  if (!/^[a-f0-9-]{36}$/i.test(state)) return json({ error: "Invalid Apple sign-in state" }, 400);
  const flow = await env.DB.prepare("SELECT nonce, ticket_hash FROM apple_mobile_login_flows WHERE state = ? AND expires_at > unixepoch()")
    .bind(state).first();
  if (!flow || flow.ticket_hash) return json({ error: "Apple sign-in expired or was already completed" }, 401);
  const redirect = new URL("glamia-store://apple-auth");
  if (form.get("error")) {
    await env.DB.prepare("DELETE FROM apple_mobile_login_flows WHERE state = ?").bind(state).run();
    redirect.searchParams.set("error", "cancelled");
    return new Response(null, { status: 303, headers: { Location: redirect.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const identityToken = String(form.get("id_token") || "");
  const serviceId = appleMobileServiceId(env);
  if (!serviceId || !identityToken) return json({ error: "Apple identity token was not returned" }, 401);
  const profile = await verifyAppleIdentityToken(identityToken, { ...env, APPLE_CLIENT_ID: serviceId });
  if (profile.nonce !== flow.nonce) return json({ error: "Apple sign-in nonce mismatch" }, 401);
  let name = "";
  try {
    const user = JSON.parse(String(form.get("user") || "{}"));
    name = [user?.name?.firstName, user?.name?.lastName].map(value => String(value || "").trim()).filter(Boolean).join(" ").slice(0, 160);
  } catch { /* Apple may omit the one-time display name on subsequent sign-ins. */ }
  const mobileRequest = new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Glamia-Mobile": "1" }, body: JSON.stringify({ identity_token: identityToken, name }) });
  const loginResponse = await loginWithApple(mobileRequest, { ...env, APPLE_CLIENT_ID: serviceId });
  if (!loginResponse.ok) return loginResponse;
  const result = await loginResponse.json();
  const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const saved = await env.DB.prepare("UPDATE apple_mobile_login_flows SET ticket_hash = ?, result_json = ? WHERE state = ? AND ticket_hash IS NULL AND expires_at > unixepoch()")
    .bind(await appleMobileSha256Hex(ticket), JSON.stringify(result), state).run();
  if (Number(saved.meta?.changes || 0) !== 1) return json({ error: "Apple sign-in was already completed" }, 401);
  redirect.searchParams.set("ticket", ticket);
  return new Response(null, { status: 303, headers: { Location: redirect.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

// A stolen callback URL alone cannot redeem the ticket without the app's verifier.
async function exchangeAppleMobileLogin(request, env) {
  const body = await readJson(request);
  const ticket = String(body.ticket || "");
  const verifier = String(body.verifier || "");
  if (!/^(?:[a-f0-9-]{36}){2}$/i.test(ticket) || !/^[a-f0-9]{64}$/i.test(verifier)) {
    return json({ error: "Invalid Apple sign-in exchange" }, 400);
  }
  const row = await env.DB.prepare("DELETE FROM apple_mobile_login_flows WHERE ticket_hash = ? AND verifier_hash = ? AND expires_at > unixepoch() RETURNING result_json")
    .bind(await appleMobileSha256Hex(ticket), await appleMobileSha256Hex(verifier.toLowerCase())).first();
  if (!row?.result_json) return json({ error: "Apple sign-in expired or was already used" }, 401);
  return json(JSON.parse(row.result_json), 200, { "Cache-Control": "no-store" });
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

function allowedGoogleClientIds(env) {
  return [...new Set([env.GOOGLE_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID]
    .flatMap(value => Array.isArray(value) ? value : String(value || "").split(","))
    .map(value => String(value || "").trim())
    .filter(value => value && !value.includes("REPLACE_WITH")))];
}

async function verifyGoogleIdToken(token, clientIds) {
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
  const allowedAudiences = Array.isArray(clientIds) ? clientIds : [clientIds];
  if (!allowedAudiences.includes(payload.aud)) throw httpError("Google token audience mismatch", 401);
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

async function verifyAppleIdentityToken(token, env) {
  const [encodedHeader, encodedPayload, encodedSignature] = String(token).split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || String(token).split(".").length !== 3) {
    throw httpError("Invalid Apple identity token", 401);
  }
  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecodeToString(encodedHeader));
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
  } catch {
    throw httpError("Invalid Apple identity token", 401);
  }
  if (header?.alg !== "RS256") throw httpError("Unsupported Apple token algorithm", 401);
  const keys = await fetchAppleKeys();
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw httpError("Apple signing key not found", 401);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  if (!valid) throw httpError("Apple identity token signature is invalid", 401);
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== "https://appleid.apple.com") throw httpError("Invalid Apple token issuer", 401);
  if (payload.exp <= now || payload.iat > now + 300) throw httpError("Apple identity token expired", 401);
  const expectedAudience = String(env.APPLE_CLIENT_ID || "com.glamia.store").trim();
  if (expectedAudience && payload.aud !== expectedAudience) throw httpError("Apple token audience mismatch", 401);
  if (payload.email_verified !== undefined && ![true, "true", 1, "1"].includes(payload.email_verified)) {
    throw httpError("Apple email must be verified", 401);
  }
  return payload;
}

async function fetchAppleKeys() {
  if (appleKeysCache.keys && appleKeysCache.expiresAt > Date.now()) return appleKeysCache.keys;
  const response = await fetch(APPLE_CERTS_URL);
  if (!response.ok) throw httpError("Unable to fetch Apple signing keys", 502);
  const body = await response.json();
  appleKeysCache = { keys: body.keys || [], expiresAt: Date.now() + 5 * 60 * 1000 };
  return appleKeysCache.keys;
}

const PRODUCT_SELECT = `
  SELECT p.*, AVG(r.rating) AS review_avg, COUNT(r.id) AS review_count
  FROM products p
  LEFT JOIN reviews r ON r.product_id = p.id AND r.status = 'visible'
`;

const PRODUCT_CARD_SELECT = `
  SELECT
    p.id, p.product_code, p.name, p.category, p.subcategory, p.brand, p.price, p.mrp, p.stock,
    p.rating, p.status, p.featured, p.storefront_visibility, p.color, p.material, p.sizes_json,
    p.color_hex, p.returnable,
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

async function listProducts(env, user, scope, searchParams = new URLSearchParams(), storefront = "glamia") {
  if (scope === "admin") {
    requireAdmin(user);
    const requestedLimit = Number(searchParams.get("limit"));
    const hasPagination = Number.isSafeInteger(requestedLimit) && requestedLimit > 0;
    if (!hasPagination) return json({ products: await withSizeStock(env, await allProductRows(env)) });
    const limit = Math.min(requestedLimit, 100);
    const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
    const offset = (page - 1) * limit;
    const { results } = await env.DB.prepare(`${PRODUCT_SELECT} GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all();
    const products = await withSizeStock(env, results);
    const total = await cachedCount(env, "admin-products", "SELECT COUNT(*) AS count FROM products");
    return json({ products, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), has_more: offset + products.length < total } });
  }
  if (scope === "seller") {
    requireUser(user);
    if (user.role === "admin") return json({ products: await withSizeStock(env, await allProductRows(env)) });
    const { results } = await env.DB.prepare(`${PRODUCT_SELECT} WHERE p.seller_email = ? GROUP BY p.id ORDER BY p.created_at DESC`)
      .bind(user.email)
      .all();
    return json({ products: await withSizeStock(env, results) });
  }

  const visibility = scope === "cart" ? "('glamia', 'wibrawl', 'both')" : storefront === "wibrawl" ? "('wibrawl', 'both')" : "('glamia', 'both')";
  const where = ["p.status = 'live'", `COALESCE(p.storefront_visibility, 'glamia') IN ${visibility}`];
  const activePrice="CASE WHEN p.deal_price IS NOT NULL AND (p.deal_starts_at IS NULL OR julianday(p.deal_starts_at)<=julianday('now')) AND julianday(p.deal_ends_at)>julianday('now') THEN p.deal_price ELSE p.price END";
  const bindings = [];
  const requestedIds = [...new Set(String(searchParams.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean))].slice(0, 100);
  if (scope === "cart" && !requestedIds.length) throw httpError("Provide product IDs for your bag", 400);
  const category = String(searchParams.get("category") || "").trim();
  const subcategory = String(searchParams.get("subcategory") || "").trim();
  const color = String(searchParams.get("color") || "").trim();
  const material = String(searchParams.get("material") || "").trim();
  const size = String(searchParams.get("size") || "").trim();
  const search = productSearchQuery(searchParams.get("q"));
  const minPrice = Number(searchParams.get("min_price"));
  const maxPrice = Number(searchParams.get("max_price"));
  if (requestedIds.length) {
    // One JSON binding leaves room for filters and pagination within D1's parameter limit.
    where.push("p.id IN (SELECT value FROM json_each(?))");
    bindings.push(JSON.stringify(requestedIds));
  }
  if (category) { where.push("p.category = ?"); bindings.push(category); }
  if (subcategory) { where.push("p.subcategory = ?"); bindings.push(subcategory); }
  const facetWhere=[...where],facetBindings=[...bindings];
  if(searchParams.get('color_family')){
    const family=searchParams.get('color_family').toLowerCase();
    const words={blue:['blue','navy','cyan','aqua'],green:['green','olive','teal','sage','mint','emerald'],red:['red','wine','maroon','burgundy'],pink:['pink','rose'],purple:['purple','violet','lilac','plum'],brown:['brown','chocolate','coffee'],white:['white','ivory','cream'],black:['black','charcoal','graphite'],yellow:['yellow','mustard','gold'],orange:['orange','rust','terracotta'],beige:['beige','sand','tan'],grey:['grey','gray']}[family]||[family.replace(/[%_]/g,'')];
    where.push('('+words.map(()=>"LOWER(p.color) LIKE ?").join(' OR ')+')');bindings.push(...words.map(word=>'%'+word+'%'));
  }
  if(searchParams.get('offers')==='1')where.push(`(${activePrice})<p.mrp`);
  if(searchParams.get('featured')==='1')where.push('p.featured=1');
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
  if (Number.isFinite(minPrice) && searchParams.has("min_price")) { where.push(`(${activePrice}) >= ?`); bindings.push(Math.max(0,minPrice)); }
  if (Number.isFinite(maxPrice) && searchParams.has("max_price")) { where.push(`(${activePrice}) <= ?`); bindings.push(Math.max(0,maxPrice)); }

  const sortSql = {
    featured: "p.featured DESC, COALESCE(AVG(r.rating),0) DESC, p.created_at DESC, p.id ASC",
    newest: "p.created_at DESC",
    price_low: `(${activePrice}) ASC, p.created_at DESC, p.id ASC`,
    price_high: `(${activePrice}) DESC, p.created_at DESC, p.id ASC`,
    rating: "COALESCE(AVG(r.rating),0) DESC, COUNT(r.id) DESC, p.created_at DESC, p.id ASC"
  }[searchParams.get("sort") || "featured"] || "p.featured DESC, p.created_at DESC, p.id ASC";
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
  const shouldEnrich = !wantsCards || searchParams.get("include_stock") === "1";
  const enrichedProducts = shouldEnrich
    ? await withSizeStock(env, results, wantsCards ? formatProductCard : formatProduct)
    : results.map(formatProductCard);
  const products = enrichedProducts.map(publicProductView);
  if (!limit) return json({ products });
  const total = await cachedCount(
    env,
    `public-products:${where.join("|")}:${JSON.stringify(bindings)}`,
    `SELECT COUNT(*) AS count FROM products p WHERE ${where.join(" AND ")}`,
    bindings
  );
  let facets;
  if(searchParams.get('facets')==='1'&&page===1){
    const {results:colors}=await env.DB.prepare(`SELECT DISTINCT p.color FROM products p WHERE ${facetWhere.join(' AND ')} AND p.color!='' ORDER BY p.color LIMIT 100`).bind(...facetBindings).all();
    const {results:sizes}=await env.DB.prepare(`SELECT DISTINCT ps.size FROM products p JOIN product_sizes ps ON ps.product_id=p.id WHERE ${facetWhere.join(' AND ')} AND ps.stock>0 ORDER BY ps.size LIMIT 100`).bind(...facetBindings).all();
    facets={colors:colors.map(row=>row.color),sizes:sizes.map(row=>row.size)};
  }
  return json({ products, facets, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), has_more: offset + products.length < total } });
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

/* Fold new raw page-view events into compact IST buckets. The cursor is the
   pair (created_at, id), so events sharing SQLite's second-resolution timestamp
   are still processed exactly once. The INSERT and cursor advance are one D1
   batch, making retries safe. */
async function runPageViewRollup(env) {
  try {
    const state = await env.DB.prepare("SELECT last_created_at, last_id FROM analytics_rollup_state WHERE id = 1").first();
    const lastCreatedAt = String(state?.last_created_at || "");
    const lastId = String(state?.last_id || "");
    const cursorWhere = "(created_at > ? OR (created_at = ? AND id > ?))";
    const pending = await env.DB.prepare(`SELECT 1 AS pending FROM page_views WHERE ${cursorWhere} ORDER BY created_at ASC, id ASC LIMIT 1`)
      .bind(lastCreatedAt, lastCreatedAt, lastId)
      .first();
    if (!pending) return;

    const batch = `WITH batch AS (
      SELECT id, created_at,
        date(created_at, '+5 hours', '+30 minutes') AS day,
        CAST(strftime('%H', datetime(created_at, '+5 hours', '+30 minutes')) AS INTEGER) AS hour,
        path, referrer_host, device, country
      FROM page_views
      WHERE ${cursorWhere}
      ORDER BY created_at ASC, id ASC
      LIMIT 1000
    )`;
    const aggregate = `${batch}
      INSERT INTO page_view_rollups
        (day, hour, path, referrer_host, device, country, views)
      SELECT day, hour, path, referrer_host, device, country, COUNT(*)
      FROM batch
      GROUP BY day, hour, path, referrer_host, device, country
      ON CONFLICT(day, hour, path, referrer_host, device, country)
      DO UPDATE SET views = page_view_rollups.views + excluded.views`;
    const advance = `${batch}
      UPDATE analytics_rollup_state
      SET last_created_at = COALESCE((SELECT created_at FROM batch ORDER BY created_at DESC, id DESC LIMIT 1), last_created_at),
          last_id = COALESCE((SELECT id FROM batch ORDER BY created_at DESC, id DESC LIMIT 1), last_id)
      WHERE id = 1`;
    await env.DB.batch([
      env.DB.prepare(aggregate).bind(lastCreatedAt, lastCreatedAt, lastId),
      env.DB.prepare(advance).bind(lastCreatedAt, lastCreatedAt, lastId)
    ]);
  } catch (error) {
    // Keep scheduled maintenance non-blocking if a deployment is between
    // migrations; the next scheduled run retries after the schema is ready.
    console.error("Page-view rollup failed", error?.message || error);
  }
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

// Refresh only the affected listing group; inventory-only edits never invoke AI.
function scheduleProductVectorUpdate(env, ctx, id, variantGroup = null) {
  if (!env.AI || !env.VEC || !ctx?.waitUntil) return;
  ctx.waitUntil((async () => {
    const { results } = await env.DB.prepare(`
      SELECT id, status, name, brand, category, subcategory, color, material, description
      FROM products WHERE id = ? OR variant_group = ?
    `).bind(id, variantGroup).all();
    const removed = results.filter(row => row.status !== "live").map(row => String(row.id));
    if (!results.some(row => row.id === id)) removed.push(String(id));
    if (removed.length) await env.VEC.deleteByIds(removed);
    const live = results.filter(row => row.status === "live");
    for (let index = 0; index < live.length; index += VECTOR_EMBED_BATCH) {
      const batch = live.slice(index, index + VECTOR_EMBED_BATCH);
      const embeddings = await embedTexts(env, batch.map(productEmbeddingText));
      await env.VEC.upsert(batch.map((row, position) => ({ id: String(row.id), values: embeddings[position] })));
    }
  })().catch(() => console.error("Product search index refresh failed")));
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
    const products = hits.map(id => byId.get(id)).filter(Boolean).map(formatProductCard).map(publicProductView);
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
  // Keep this request's snapshot stable if a concurrent stock write clears the shared cache.
  const entries = productEnrichmentCache.entries;
  const ids = [...new Set(products.map(product => product.id).filter(Boolean))];
  const uncachedIds = ids.filter(id => !entries.has(id));
  // D1 accepts at most 100 bound variables per statement, including large admin catalogs.
  for (let offset = 0; offset < uncachedIds.length; offset += 80) {
    const missingIds = uncachedIds.slice(offset, offset + 80);
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
      entries.set(id, { sizeStock: {}, sold: 0, soldRecent: 0 });
    }
    for (const row of sizeResult.results || []) {
      entries.get(row.product_id).sizeStock[row.size] = Number(row.stock || 0);
    }
    for (const row of salesResult.results || []) {
      const entry = entries.get(row.product_id);
      entry.sold = Number(row.sold_total || 0);
      entry.soldRecent = Number(row.sold_7d || 0);
    }
  }
  return products.map(product => {
    const metrics = entries.get(product.id);
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
  const cacheKey = [value.toLowerCase(), productUrlSlug(context?.category, ""), productUrlSlug(context?.subcategory, "")].join("|");
  const cached = productReferenceCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.id;
  if (cached) productReferenceCache.delete(cacheKey);
  const remember = id => {
    if (!id) return id;
    if (productReferenceCache.size >= PRODUCT_REFERENCE_CACHE_MAX_ENTRIES) productReferenceCache.delete(productReferenceCache.keys().next().value);
    productReferenceCache.set(cacheKey, { id: String(id), expiresAt: Date.now() + PRODUCT_REFERENCE_CACHE_TTL_MS });
    return String(id);
  };
  // Canonical URLs end in the readable product code for new listings. Legacy
  // URLs still end in the internal UUID, so both forms resolve directly.
  const canonicalId = value.match(/(?:^|-)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)?.[1] || "";
  const direct = await env.DB.prepare("SELECT id FROM products WHERE id = ? OR (? != '' AND lower(id) = ?) OR lower(COALESCE(product_code, '')) = ? LIMIT 1")
    .bind(value, canonicalId.toLowerCase(), canonicalId.toLowerCase(), value.toLowerCase()).first();
  if (direct) return remember(direct.id);
  const { results } = await env.DB.prepare("SELECT id, product_code, name, category, subcategory FROM products WHERE status = 'live'").all();
  const candidates = results
    .map(row => ({ id: String(row.id), productCode: String(row.product_code || "").toLowerCase(), slug: slugifyName(row.name), category: productUrlSlug(row.category), subcategory: productUrlSlug(row.subcategory) }))
    .filter(row => row.slug);
  const normalizedValue = value.toLowerCase();
  const exact = candidates.filter(row => row.slug === normalizedValue);
  const canonical = candidates.filter(row => `${row.slug}-${row.id.toLowerCase()}` === normalizedValue);
  const publicCodeCanonical = candidates.filter(row => row.productCode && `${row.slug}-${row.productCode}` === normalizedValue);
  if (publicCodeCanonical.length === 1) return remember(publicCodeCanonical[0].id);
  if (canonical.length === 1) return remember(canonical[0].id);
  // Keep the short-id form compatible with the first rollout of this URL
  // system, so links shared during that window still reach the right item.
  const shortened = candidates.filter(row => `${row.slug}-${row.id.slice(0, 8).toLowerCase()}` === normalizedValue);
  if (shortened.length === 1) return remember(shortened[0].id);
  const contextMatches = context
    ? candidates.filter(row => row.slug === normalizedValue && row.category === productUrlSlug(context.category) && row.subcategory === productUrlSlug(context.subcategory))
    : [];
  if (contextMatches.length === 1) return remember(contextMatches[0].id);
  if (exact.length === 1) return remember(exact[0].id);
  // Tolerate links saved under an older name: <old-slug>-<8-char-id> resolves
  // while the trailing id chunk still identifies the listing.
  for (const candidate of candidates) {
    for (const token of [candidate.id.toLowerCase(), candidate.id.slice(0, 8).toLowerCase()]) {
      if (!token || !normalizedValue.endsWith(`-${token}`)) continue;
      const prefix = normalizedValue.slice(0, -(token.length + 1));
      if (candidate.slug === prefix || candidate.slug.startsWith(`${prefix}-`) || prefix.startsWith(candidate.slug)) return remember(candidate.id);
    }
  }
  // Never guess when a plain name is shared by multiple live listings. The
  // canonical URL always carries the stable id suffix, so an ambiguous alias
  // must fail rather than exposing the wrong product.
  return "";
}

async function getProduct(env, user, reference, context = null, storefront = "glamia") {
  const canManage = user?.role === "admin";
  const sellerEmail = String(user?.email || "").toLowerCase();
  const visibility = storefront === "all" ? "('glamia', 'wibrawl', 'both')" : storefront === "wibrawl" ? "('wibrawl', 'both')" : "('glamia', 'both')";
  const resolvedId = await resolveProductReference(env, reference, context);
  if (!resolvedId) return json({ error: "Product not found" }, 404);
  const row = await env.DB.prepare(`${PRODUCT_SELECT}
    WHERE p.id = ? AND (p.status = 'live' AND COALESCE(p.storefront_visibility, 'glamia') IN ${visibility} OR ? = 1 OR LOWER(p.seller_email) = ?)
    GROUP BY p.id`)
    .bind(resolvedId, canManage ? 1 : 0, sellerEmail)
    .first();
  if (!row) {
    const exclusive = await env.DB.prepare("SELECT * FROM products WHERE id = ? AND status = 'live'").bind(resolvedId).first();
    if (exclusive && productStorefront(exclusive, storefront) !== storefront) return json({ error: "This product belongs to the other store", redirect_url: storefrontOrigin(productStorefront(exclusive, storefront)) + canonicalProductPath(exclusive) }, 409);
    return json({ error: "Product not found" }, 404);
  }
  let colourwayRows = [];
  if (row.variant_group) {
    const { results } = await env.DB.prepare(`${PRODUCT_SELECT}
      WHERE p.variant_group = ? AND (p.status = 'live' AND COALESCE(p.storefront_visibility, 'glamia') IN ${visibility} OR ? = 1 OR LOWER(p.seller_email) = ?)
      GROUP BY p.id ORDER BY p.created_at ASC`)
      .bind(row.variant_group, canManage ? 1 : 0, sellerEmail)
      .all();
    colourwayRows = results;
  }
  // Enrich the primary product and its colourways in one stock batch. The
  // colourway query intentionally keeps its existing ordering and contents.
  // withSizeStock deduplicates IDs, so the primary row is not queried twice.
  const enriched = await withSizeStock(env, [row, ...colourwayRows]);
  const visible = enriched.map((product) => canManage || (sellerEmail && product.seller_email?.toLowerCase() === sellerEmail) ? product : publicProductView(product));
  const product = visible[0];
  const colourways = visible.slice(1);
  return json({ product:selectedVariantCopy(product,visible.map(item=>item.color)), colourways });
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
    storefront: row.storefront || "glamia",
    variant: "editorial",
    layout: row.layout || "poster",
    imagery: row.imagery || "products",
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

function adminHeroStorefront(request) {
  const url = new URL(request.url);
  const storefront = url.searchParams.get("storefront") || storefrontForRequest(url);
  if (!["glamia", "wibrawl"].includes(storefront)) throw httpError("Unknown storefront", 400);
  return storefront;
}

async function listHeroSlides(env, admin = false, storefront = "glamia") {
  const slideQuery = admin
    ? "SELECT * FROM hero_slides WHERE storefront = ? ORDER BY position ASC, created_at ASC"
    : "SELECT * FROM hero_slides WHERE storefront = ? AND active = 1 ORDER BY position ASC, created_at ASC";
  const { results: rows } = await env.DB.prepare(slideQuery).bind(storefront).all();
  // Hero frames need only their linked products, not the entire catalog and review aggregates.
  const ids = [...new Set(rows.flatMap(row => heroArray(row.product_ids_json).slice(0, 3)).filter(id => typeof id === "string" && id.trim()))];
  const productsById = new Map();
  for (let offset = 0; offset < ids.length; offset += 80) {
    const batch = ids.slice(offset, offset + 80);
    const { results } = await env.DB.prepare(`SELECT id, name, image_url, thumbnail_url, color FROM products WHERE status = 'live' AND id IN (${batch.map(() => "?").join(",")}) AND storefront_visibility IN (?, 'both')`).bind(...batch, storefront).all();
    for (const product of results) productsById.set(product.id, { ...product, image: admin ? product.image_url : product.thumbnail_url || product.image_url });
  }
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
    const startMs = startsAt ? (strict ? parseISTInput(startsAt) : parseStoredTimestamp(startsAt)).getTime() : 0;
    const endMs = endsAt ? (strict ? parseISTInput(endsAt) : parseStoredTimestamp(endsAt)).getTime() : NaN;
    if (!text || !endsAt || !Number.isFinite(endMs) || (startsAt && !Number.isFinite(startMs)) || (startsAt && endMs <= startMs)) {
      if (strict) throw httpError(`Scheduled announcement ${index + 1} needs text, a valid start time, and an end time after it`, 400);
      continue;
    }
    items.push({
      id: String(item?.id || `announcement-${index + 1}`).trim().slice(0, 100),
      text,
      starts_at: startsAt ? new Date(startMs).toISOString() : "",
      ends_at: new Date(endMs).toISOString()
    });
  }
  return items;
}

function heroProductIds(body) {
  if (!Array.isArray(body.product_ids)) return [];
  return [...new Set(body.product_ids.map(id => String(id || "").trim()).filter(Boolean))].slice(0, 3);
}

async function validateHeroPayload(body, env, storefront = "glamia") {
  const layout = body.layout ?? "poster";
  const imagery = body.imagery ?? "products";
  if (!WIBRAWL_HERO_LAYOUTS.includes(layout)) throw httpError("Unknown hero layout", 400);
  if (!["products", "campaign"].includes(imagery)) throw httpError("Unknown hero imagery", 400);
  if (body.active !== undefined && typeof body.active !== "boolean") throw httpError("Hero visibility must be true or false", 400);
  const title = heroText(body.title, "", 100);
  const tagline = heroText(body.tagline, "", 240);
  if (title.length < 2 || title.length > 100) throw httpError("Hero headline must be 2–100 characters", 400);
  if (tagline.length < 2 || tagline.length > 240) throw httpError("Hero tagline must be 2–240 characters", 400);
  const productIds = heroProductIds(body);
  if (!productIds.length) throw httpError("Select at least one live product for the hero slide", 400);
  if (productIds.length > 3) throw httpError("A hero slide can show at most 3 products", 400);
  const placeholders = productIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT id FROM products WHERE id IN (${placeholders}) AND status = 'live' AND storefront_visibility IN (?, 'both')`)
    .bind(...productIds, storefront).all();
  const liveIds = new Set(results.map(row => row.id));
  const missing = productIds.find(id => !liveIds.has(id));
  if (missing) throw httpError("Hero slides can only use live products available on this storefront", 400);
  const words = Array.isArray(body.words)
    ? [...new Set(body.words.map(word => String(word || "").trim().toUpperCase()).filter(Boolean))].slice(0, 5)
    : [];
  return {
    variant: "editorial",
    layout,
    imagery,
    eyebrow: heroText(body.eyebrow, storefront === "wibrawl" ? "The Wibrawl Edit" : "The Glamia Edit", 60),
    title,
    tagline,
    ctaLabel: heroText(body.cta_label, "Shop now", 40),
    ctaCategory: String(body.cta_category || "").trim(),
    productIds,
    words,
    active: body.active === undefined ? true : Boolean(body.active),
    position: body.position !== null && body.position !== undefined && body.position !== "" && Number.isSafeInteger(Number(body.position)) && Number(body.position) >= 0 ? Number(body.position) : null
  };
}

async function createHeroSlide(request, env) {
  const body = await readJson(request);
  const storefront = adminHeroStorefront(request);
  const next = await validateHeroPayload(body, env, storefront);
  const last = await env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS position FROM hero_slides WHERE storefront = ?").bind(storefront).first();
  const id = crypto.randomUUID();
  const position = next.position ?? Number(last?.position ?? -1) + 1;
  await env.DB.prepare(`
    INSERT INTO hero_slides (
      id, variant, eyebrow, title, tagline, cta_label, cta_category, product_ids_json,
      words_json, position, active, storefront, layout, imagery
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, next.variant, next.eyebrow, next.title, next.tagline, next.ctaLabel, next.ctaCategory,
    JSON.stringify(next.productIds), JSON.stringify(next.words), position, next.active ? 1 : 0, storefront, next.layout, next.imagery
  ).run();
  return json({ ok: true, id }, 201);
}

async function updateHeroSlide(request, env, id) {
  const storefront = adminHeroStorefront(request);
  const current = await env.DB.prepare("SELECT * FROM hero_slides WHERE id = ? AND storefront = ?").bind(id, storefront).first();
  if (!current) return json({ error: "Hero slide not found" }, 404);
  const body = await readJson(request);
  // A stale or removed product must never prevent an admin from hiding its slide.
  if (Object.keys(body).length === 1 && body.active === false) {
    await env.DB.prepare("UPDATE hero_slides SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND storefront = ?").bind(id, storefront).run();
    return json({ ok: true, id });
  }
  const merged = {
    variant: body.variant ?? current.variant,
    layout: body.layout ?? current.layout,
    imagery: body.imagery ?? current.imagery,
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
  const next = await validateHeroPayload(merged, env, storefront);
  await env.DB.prepare(`
    UPDATE hero_slides SET variant = ?, eyebrow = ?, title = ?, tagline = ?, cta_label = ?,
      cta_category = ?, product_ids_json = ?, words_json = ?, position = ?,
      active = ?, layout = ?, imagery = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND storefront = ?
  `).bind(
    next.variant, next.eyebrow, next.title, next.tagline, next.ctaLabel, next.ctaCategory,
    JSON.stringify(next.productIds), JSON.stringify(next.words),
    next.position ?? Number(current.position), next.active ? 1 : 0, next.layout, next.imagery, id, storefront
  ).run();
  return json({ ok: true, id });
}

async function deleteHeroSlide(env, id, storefront = "glamia") {
  const result = await env.DB.prepare("DELETE FROM hero_slides WHERE id = ? AND storefront = ?").bind(id, storefront).run();
  if (!result.meta.changes) return json({ error: "Hero slide not found" }, 404);
  return json({ ok: true });
}

async function reorderHeroSlides(request, env) {
  const storefront = adminHeroStorefront(request);
  const body = await readJson(request);
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
    throw httpError("Provide each slide ID once in display order", 400);
  }
  const { results } = await env.DB.prepare("SELECT id FROM hero_slides WHERE storefront = ?").bind(storefront).all();
  const currentIds = new Set(results.map(row => row.id));
  if (ids.length !== currentIds.size || ids.some(id => !currentIds.has(id))) {
    throw httpError("The slide list changed. Reload it before reordering", 409);
  }
  if (ids.length) await env.DB.batch(ids.map((id, position) => env.DB.prepare("UPDATE hero_slides SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND storefront = ?").bind(position, id, storefront)));
  return json({ ok: true });
}

async function heroInsights(env, storefront = "glamia") {
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
  const products = productRows.filter(row => [storefront, "both"].includes(row.storefront_visibility || "glamia")).map(formatProduct);
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

function paymentGatewayStatus(env, settings = {}) {
  const razorpayCredentials = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const razorpayWebhook = Boolean(env.RAZORPAY_WEBHOOK_SECRET);
  const phonepeCredentials = Boolean(env.PHONEPE_CLIENT_ID && env.PHONEPE_CLIENT_SECRET && env.PHONEPE_CLIENT_VERSION);
  const phonepeWebhook = Boolean(
    (env.PHONEPE_WEBHOOK_SECRET && env.PHONEPE_WEBHOOK_ID) ||
    (env.PHONEPE_WEBHOOK_USERNAME && env.PHONEPE_WEBHOOK_PASSWORD)
  );
  return {
    razorpay: {
      enabled: settings.razorpay_enabled !== false,
      configured: razorpayCredentials,
      webhook_ready: razorpayWebhook,
      ready: razorpayCredentials && razorpayWebhook
    },
    phonepe: {
      enabled: settings.phonepe_enabled !== false,
      configured: phonepeCredentials,
      webhook_ready: phonepeWebhook,
      ready: phonepeCredentials && phonepeWebhook
    }
  };
}

function paymentMethods(env, settings = {}) {
  const status = paymentGatewayStatus(env, settings);
  const methods = [];
  if (status.razorpay.enabled && status.razorpay.ready) methods.push({ id: "razorpay", label: "Razorpay", description: "Cards, UPI, netbanking and wallets" });
  if (status.phonepe.enabled && status.phonepe.ready) methods.push({ id: "phonepe", label: "PhonePe", description: "UPI, cards and netbanking" });
  return methods;
}

const EVENT_TYPES = new Set(["sale", "launch", "seasonal", "announcement", "campaign"]);
const EVENT_STATUSES = new Set(["draft", "published", "archived"]);
const EVENT_THEMES = new Set(["evergreen", "terracotta", "cobalt", "plum", "sand", "graphite", "festival", "aurora", "sunset", "prism", "spotlight"]);

function eventSlug(value, id = "") {
  const base = String(value || "event")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "event";
  const suffix = String(id || crypto.randomUUID()).replace(/-/g, "").slice(0, 8).toLowerCase();
  return `${base}-${suffix}`;
}

function eventLifecycle(row, now = Date.now()) {
  const status = String(row?.status || "draft");
  if (status === "draft") return "draft";
  if (status === "archived") return "archived";
  const startsAt = String(row?.starts_at || "").trim();
  const endsAt = String(row?.ends_at || "").trim();
  const startsAtMs = startsAt ? Date.parse(startsAt) : 0;
  const endsAtMs = endsAt ? Date.parse(endsAt) : 0;
  if (startsAtMs && Number.isFinite(startsAtMs) && startsAtMs > now) return "upcoming";
  if (endsAtMs && Number.isFinite(endsAtMs) && endsAtMs <= now) return "ended";
  return "live";
}

function normalizeEventRow(row) {
  const startsAt = String(row?.starts_at || "").trim();
  const endsAt = String(row?.ends_at || "").trim();
  const lifecycle = eventLifecycle(row);
  return {
    id: String(row?.id || ""),
    slug: String(row?.slug || ""),
    name: String(row?.name || ""),
    type: String(row?.type || "sale"),
    status: String(row?.status || "draft"),
    theme: String(row?.theme || "evergreen"),
    headline: String(row?.headline || ""),
    message: String(row?.message || ""),
    coupon_code: String(row?.coupon_code || "").toUpperCase(),
    cta_label: String(row?.cta_label || "Shop the edit"),
    cta_href: String(row?.cta_href || "/offers"),
    starts_at: startsAt,
    ends_at: endsAt,
    show_on_home: Boolean(row?.show_on_home),
    show_after_sign_in: Boolean(row?.show_after_sign_in),
    show_once: Boolean(row?.show_once),
    notify_customers: Boolean(row?.notify_customers),
    lifecycle,
    active: String(row?.status || "draft") === "published" && lifecycle === "live",
    created_at: row?.created_at || "",
    updated_at: row?.updated_at || ""
  };
}

function normalizeEventDate(value, label) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = parseISTInput(text);
  if (Number.isNaN(date.getTime())) throw httpError(`${label} is invalid`, 400);
  return date.toISOString();
}

function eventPayload(body, current = {}) {
  const input = body?.event && typeof body.event === "object" ? body.event : body || {};
  const name = String(input.name ?? current.name ?? "").trim().slice(0, 80);
  const headline = String(input.headline ?? current.headline ?? "").trim().slice(0, 90);
  const message = String(input.message ?? current.message ?? "").trim().slice(0, 260);
  if (name.length < 2) throw httpError("Event name must be 2–80 characters", 400);
  if (headline.length < 2) throw httpError("Event headline must be 2–90 characters", 400);
  if (message.length < 2) throw httpError("Event message must be 2–260 characters", 400);
  const type = String(input.type ?? current.type ?? "sale").trim().toLowerCase();
  if (!EVENT_TYPES.has(type)) throw httpError("Event type is invalid", 400);
  const status = String(input.status ?? current.status ?? "draft").trim().toLowerCase();
  if (!EVENT_STATUSES.has(status)) throw httpError("Event status is invalid", 400);
  const theme = String(input.theme ?? current.theme ?? "evergreen").trim().toLowerCase();
  if (!EVENT_THEMES.has(theme)) throw httpError("Event theme is invalid", 400);
  const couponCode = String(input.coupon_code ?? current.coupon_code ?? "").trim().toUpperCase().slice(0, 24);
  if (couponCode && !/^[A-Z0-9_-]+$/.test(couponCode)) throw httpError("Coupon code can use only letters, numbers, hyphens, and underscores", 400);
  const ctaHref = String(input.cta_href ?? current.cta_href ?? "/offers").trim().slice(0, 180);
  if (!/^\/(?!\/)[^\\\u0000-\u001f]*$/.test(ctaHref)) throw httpError("Event CTA must use an internal site path", 400);
  const startsAt = normalizeEventDate(input.starts_at ?? current.starts_at, "Event start time");
  const endsAt = normalizeEventDate(input.ends_at ?? current.ends_at, "Event end time");
  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) throw httpError("Event end time must be after its start time", 400);
  return {
    name,
    type,
    status,
    theme,
    headline,
    message,
    coupon_code: couponCode,
    cta_label: String(input.cta_label ?? current.cta_label ?? "Shop the edit").trim().slice(0, 40) || "Shop the edit",
    cta_href: ctaHref || "/offers",
    starts_at: startsAt,
    ends_at: endsAt,
    show_on_home: input.show_on_home === undefined ? Boolean(current.show_on_home ?? true) : Boolean(input.show_on_home),
    show_after_sign_in: input.show_after_sign_in === undefined ? Boolean(current.show_after_sign_in ?? true) : Boolean(input.show_after_sign_in),
    show_once: input.show_once === undefined ? Boolean(current.show_once ?? true) : Boolean(input.show_once),
    notify_customers: input.notify_customers === undefined ? Boolean(current.notify_customers ?? false) : Boolean(input.notify_customers)
  };
}

async function listEvents(env) {
  const { results } = await env.DB.prepare(`
    SELECT * FROM events
    ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      COALESCE(starts_at, '9999-12-31T23:59:59.999Z') DESC, created_at DESC
  `).all();
  return json({ events: results.map(normalizeEventRow) });
}

async function createEvent(request, env, adminUser) {
  const body = await readJson(request);
  const event = eventPayload(body);
  const id = crypto.randomUUID();
  const slug = eventSlug(event.name, id);
  await env.DB.prepare(`
    INSERT INTO events (
      id, slug, name, type, status, theme, headline, message, coupon_code,
      cta_label, cta_href, starts_at, ends_at, show_on_home,
      show_after_sign_in, show_once, notify_customers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, slug, event.name, event.type, event.status, event.theme, event.headline,
    event.message, event.coupon_code, event.cta_label, event.cta_href,
    event.starts_at, event.ends_at, event.show_on_home ? 1 : 0,
    event.show_after_sign_in ? 1 : 0, event.show_once ? 1 : 0, event.notify_customers ? 1 : 0
  ).run();
  await writeAuditLog(env, adminUser.email, "create_event", "event", id, { name: event.name, type: event.type, status: event.status });
  await invalidateStorefrontCache(request);
  const created = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
  return json({ ok: true, event: normalizeEventRow(created) }, 201);
}

async function updateEvent(request, env, id, adminUser) {
  const currentRow = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
  if (!currentRow) return json({ error: "Event not found" }, 404);
  const current = normalizeEventRow(currentRow);
  const body = await readJson(request);
  const event = eventPayload(body, current);
  await env.DB.prepare(`
    UPDATE events SET name = ?, type = ?, status = ?, theme = ?, headline = ?, message = ?,
      coupon_code = ?, cta_label = ?, cta_href = ?, starts_at = ?, ends_at = ?,
      show_on_home = ?, show_after_sign_in = ?, show_once = ?, notify_customers = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    event.name, event.type, event.status, event.theme, event.headline, event.message,
    event.coupon_code, event.cta_label, event.cta_href, event.starts_at, event.ends_at,
    event.show_on_home ? 1 : 0, event.show_after_sign_in ? 1 : 0, event.show_once ? 1 : 0, event.notify_customers ? 1 : 0, id
  ).run();
  await writeAuditLog(env, adminUser.email, "update_event", "event", id, { from: current.status, to: event.status, name: event.name });
  await invalidateStorefrontCache(request);
  const updated = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
  return json({ ok: true, event: normalizeEventRow(updated) });
}

async function deleteEvent(request, env, id, adminUser) {
  const current = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Event not found" }, 404);
  await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
  await writeAuditLog(env, adminUser.email, "delete_event", "event", id, { name: current.name, slug: current.slug });
  await invalidateStorefrontCache(request);
  return json({ ok: true });
}

async function getActiveEvents(env) {
  const now = new Date().toISOString();
  // Choose each placement independently in one D1 read so a popup-only event cannot displace the homepage.
  const { results } = await env.DB.prepare(`
    SELECT 'home' AS placement, e.* FROM (
      SELECT * FROM events WHERE status = 'published' AND show_on_home = 1
        AND (starts_at IS NULL OR starts_at = '' OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at = '' OR ends_at > ?)
      ORDER BY COALESCE(starts_at, '') DESC, updated_at DESC LIMIT 1
    ) e
    UNION ALL
    SELECT 'sign_in' AS placement, e.* FROM (
      SELECT * FROM events WHERE status = 'published' AND show_after_sign_in = 1
        AND (starts_at IS NULL OR starts_at = '' OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at = '' OR ends_at > ?)
      ORDER BY COALESCE(starts_at, '') DESC, updated_at DESC LIMIT 1
    ) e
  `).bind(now, now, now, now).all();
  return { home: results.find((row) => row.placement === "home") || null, signIn: results.find((row) => row.placement === "sign_in") || null };
}

const STOREFRONT_DEFAULTS = {
  announcement: {
    visible: true,
    text: "Complimentary shipping across India · Secure checkout",
    items: []
  },
  trust_strip: {
    visible: true,
    items: [
      { id: "shipping", visible: true, title: "Free & Fast Shipping", body: "Complimentary on every order" },
      { id: "returns", visible: true, title: "7-Day Easy Returns", body: "Eligible returns and size exchanges · policy conditions apply" },
      { id: "secure", visible: true, title: "Secure Payments", body: "Protected checkout with trusted providers" }
    ]
  },
  fulfillment: {
    warehouse_address: ""
  },
  payments: {
    razorpay_enabled: true,
    phonepe_enabled: true
  },
  support_contact: {
    visible: false,
    country_code: "+91",
    phone_number: ""
  },
  socials: {
    instagram: "",
    facebook: "",
    youtube: "",
    tiktok: "",
    pinterest: "",
    x: "",
    linkedin: ""
  },
  cinematic_reel: {
    visible: true,
    eyebrow: "The current mood",
    title: "Pieces that move",
    emphasis: "with you.",
    description: "",
    product_ids: []
  }
};

const STOREFRONT_SOCIALS = [
  { id: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { id: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { id: "pinterest", label: "Pinterest", hosts: ["pinterest.com"] },
  { id: "x", label: "X", hosts: ["x.com", "twitter.com"] },
  { id: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] }
];

function normalizeSocialUrl(value, social, strict = false) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const fail = message => {
    if (strict) throw httpError(message, 400);
    return "";
  };
  if (text.length > 500) return fail(`${social.label} URL must be 500 characters or fewer`);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return fail(`Enter a valid ${social.label} URL`);
  }
  if (parsed.protocol !== "https:") return fail(`${social.label} URL must use HTTPS`);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = social.hosts.some(host => hostname === host || hostname.endsWith(`.${host}`));
  if (!allowed) return fail(`Use an official ${social.label} URL`);
  parsed.hash = "";
  return parsed.toString().slice(0, 500);
}

function normalizeSocialLinks(value, fallback = {}, strict = false) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(STOREFRONT_SOCIALS.map(social => [
    social.id,
    normalizeSocialUrl(source[social.id] === undefined ? fallback?.[social.id] : source[social.id], social, strict)
  ]));
}

function parseSettingObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeSeoImage(value, fallback = `${CANONICAL_ORIGIN}/glamia-social-banner.png`, strict = false) {
  const image = String(value ?? "").trim();
  if (!image) return fallback;
  try {
    const url = new URL(image);
    if (image.length <= 500 && url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Invalid URLs must not become sharing metadata. */ }
  if (strict) throw httpError("Social sharing image must be a valid HTTPS URL", 400);
  return fallback;
}

async function storefrontSettingsObject(env, includePrivate = false, storefront = "glamia") {
  const { results } = await env.DB.prepare("SELECT setting_key, value_json FROM storefront_settings").all();
  const raw = Object.fromEntries(results.map(row => [row.setting_key, parseSettingObject(row.value_json)]));
  const announcementTextValue = announcementText(raw.announcement?.text, STOREFRONT_DEFAULTS.announcement.text)
    .replace(/demo checkout available/ig, "secure checkout");
  const allAnnouncementItems = normalizeAnnouncementItems(raw.announcement?.items);
  const now = Date.now();
  const announcement = {
    visible: (raw.announcement?.visible === undefined ? STOREFRONT_DEFAULTS.announcement.visible : Boolean(raw.announcement.visible)) && Boolean(announcementTextValue),
    text: announcementTextValue,
    items: includePrivate ? allAnnouncementItems : allAnnouncementItems.filter(item => (!item.starts_at || Date.parse(item.starts_at) <= now) && Date.parse(item.ends_at) > now)
  };
  const announcementBoundaries = allAnnouncementItems.flatMap(item => [Date.parse(item.starts_at), Date.parse(item.ends_at)])
    .filter(time => Number.isFinite(time) && time > now);
  if (!includePrivate) announcement.next_change_at = announcementBoundaries.length ? new Date(Math.min(...announcementBoundaries)).toISOString() : null;
  // Resolve each placement separately so a sign-in-only event cannot hide the homepage event.
  const { home: activeEventRow, signIn: signInEventRow } = await getActiveEvents(env);
  const activeEvent = activeEventRow ? normalizeEventRow(activeEventRow) : null;
  const signInEvent = signInEventRow ? normalizeEventRow(signInEventRow) : null;
  const rawItems = Array.isArray(raw.trust_strip?.items) ? raw.trust_strip.items : [];
  const items = STOREFRONT_DEFAULTS.trust_strip.items.map(defaultItem => {
    const item = rawItems.find(entry => entry?.id === defaultItem.id) || {};
    return {
      id: defaultItem.id,
      visible: item.visible === undefined ? defaultItem.visible : Boolean(item.visible),
      title: heroText(item.title, defaultItem.title, 70),
      body: item.id === 'returns' && /^Simple exchanges, no questions\.?$/i.test(String(item.body || '').trim())
        ? defaultItem.body : heroText(item.body, defaultItem.body, 120)
    };
  });
  const supportContactVisible = raw.support_contact?.visible === undefined ? STOREFRONT_DEFAULTS.support_contact.visible : Boolean(raw.support_contact.visible);
  const supportContact = {
    visible: supportContactVisible,
    country_code: String(raw.support_contact?.country_code || STOREFRONT_DEFAULTS.support_contact.country_code),
    phone_number: includePrivate || supportContactVisible ? String(raw.support_contact?.phone_number || "") : ""
  };
  const socials = normalizeSocialLinks(raw[storefront === "wibrawl" ? "wibrawl_socials" : "socials"], STOREFRONT_DEFAULTS.socials);
  const rawCinematicReel = raw.cinematic_reel && typeof raw.cinematic_reel === "object" ? raw.cinematic_reel : {};
  const cinematicReel = {
    visible: rawCinematicReel.visible === undefined ? STOREFRONT_DEFAULTS.cinematic_reel.visible : Boolean(rawCinematicReel.visible),
    eyebrow: heroText(rawCinematicReel.eyebrow, STOREFRONT_DEFAULTS.cinematic_reel.eyebrow, 70),
    title: heroText(rawCinematicReel.title, STOREFRONT_DEFAULTS.cinematic_reel.title, 100),
    emphasis: heroText(rawCinematicReel.emphasis, STOREFRONT_DEFAULTS.cinematic_reel.emphasis, 100),
    description: heroText(rawCinematicReel.description, STOREFRONT_DEFAULTS.cinematic_reel.description, 180),
    product_ids: [...new Set((Array.isArray(rawCinematicReel.product_ids) ? rawCinematicReel.product_ids : []).map(value => String(value || "").trim()).filter(Boolean))].slice(0, 8)
  };
  return {
    announcement,
    // Keep the public app compatibility field, but Events is now the only
    // campaign source. Old Storefront campaign records are no longer used.
    ...(!includePrivate ? { sales_campaign: activeEvent || { active: false } } : {}),
    active_event: activeEvent,
    sign_in_event: signInEvent,
    trust_strip: {
      visible: raw.trust_strip?.visible === undefined ? true : Boolean(raw.trust_strip.visible),
      items
    },
    fulfillment: {
      warehouse_address: heroText(raw.fulfillment?.warehouse_address, STOREFRONT_DEFAULTS.fulfillment.warehouse_address, 320)
    },
    payments: {
      razorpay_enabled: raw.payments?.razorpay_enabled === undefined ? STOREFRONT_DEFAULTS.payments.razorpay_enabled : Boolean(raw.payments.razorpay_enabled),
      phonepe_enabled: raw.payments?.phonepe_enabled === undefined ? STOREFRONT_DEFAULTS.payments.phonepe_enabled : Boolean(raw.payments.phonepe_enabled),
      methods: paymentMethods(env, raw.payments),
      gateway_status: paymentGatewayStatus(env, raw.payments)
    },
    support_contact: supportContact,
    customer_experience: customerPromises(raw.customer_experience),
    socials,
    cinematic_reel: cinematicReel,
    ...(storefront === "wibrawl" ? { cinematic_reels: normalizeWibrawlReels(raw.wibrawl_cinematic_reels?.reels) } : {}),
    seo: {
      title: heroText(raw.seo?.title, "Glamia — Curated apparel for every wardrobe", 120),
      description: heroText(raw.seo?.description, "Discover refined everyday pieces, occasionwear, and accessories from independent ateliers.", 220),
      image: normalizeSeoImage(raw.seo?.image)
    }
  };
}

async function getStorefrontSettings(env, includePrivate = false, storefront = "glamia") {
  const settings = await storefrontSettingsObject(env, includePrivate, storefront);
  if (storefront === "wibrawl") delete settings.cinematic_reel;
  if (!includePrivate) delete settings.fulfillment;
  return json(settings);
}

async function updateStorefrontSettings(request, env) {
  const storefront = adminHeroStorefront(request);
  const body = await readJson(request);
  if (storefront === "wibrawl" && body.cinematic_reel !== undefined) throw httpError("Edit Wibrawl reels in Cinematic Reel Studio", 400);
  const current = await storefrontSettingsObject(env, true, storefront);
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
  const nextSocials = body.socials && typeof body.socials === "object" && !Array.isArray(body.socials)
    ? body.socials
    : current.socials;
  const nextCinematicReel = body.cinematic_reel && typeof body.cinematic_reel === "object"
    ? body.cinematic_reel
    : current.cinematic_reel;
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
      body: defaultItem.id==='returns' && /^Simple exchanges, no questions\.?$/i.test(String(item.body||'').trim()) ? defaultItem.body : heroText(item.body, defaultItem.body, 120)
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
    razorpay_enabled: nextPayments.razorpay_enabled === undefined ? current.payments.razorpay_enabled : Boolean(nextPayments.razorpay_enabled),
    phonepe_enabled: nextPayments.phonepe_enabled === undefined ? current.payments.phonepe_enabled : Boolean(nextPayments.phonepe_enabled)
  };
  const supportContact = {
    visible: nextSupportContact.visible === undefined ? current.support_contact.visible : Boolean(nextSupportContact.visible),
    country_code: normalizePhoneCountryCode(nextSupportContact.country_code),
    phone_number: nextSupportContact.phone_number ? normalizePhoneNumber(nextSupportContact.phone_number) : ""
  };
  if (supportContact.visible && !supportContact.phone_number) throw httpError("Add a support mobile number before showing it", 400);
  const socials = normalizeSocialLinks(nextSocials, current.socials, true);
  const experience=customerPromises(body.customer_experience||current.customer_experience);
  if(['dispatch','delhi','india'].some(key=>experience[`${key}_min`]>experience[`${key}_max`]))throw httpError('Delivery minimum must not exceed maximum',400);
  const seo = {
    title: heroText(nextSeo.title, current.seo.title, 120),
    description: heroText(nextSeo.description, current.seo.description, 220),
    image: normalizeSeoImage(nextSeo.image === undefined ? current.seo.image : nextSeo.image, `${CANONICAL_ORIGIN}/glamia-social-banner.png`, true)
  };
  const cinematicReel = {
    visible: nextCinematicReel.visible === undefined ? current.cinematic_reel.visible : Boolean(nextCinematicReel.visible),
    eyebrow: heroText(nextCinematicReel.eyebrow, current.cinematic_reel.eyebrow, 70),
    title: heroText(nextCinematicReel.title, current.cinematic_reel.title, 100),
    emphasis: heroText(nextCinematicReel.emphasis, current.cinematic_reel.emphasis, 100),
    description: heroText(nextCinematicReel.description, current.cinematic_reel.description, 180),
    product_ids: [...new Set((Array.isArray(nextCinematicReel.product_ids) ? nextCinematicReel.product_ids : current.cinematic_reel.product_ids).map(value => String(value || "").trim()).filter(Boolean))].slice(0, 8)
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
      .bind(storefront === "wibrawl" ? "wibrawl_socials" : "socials", JSON.stringify(socials)),
    env.DB.prepare("INSERT INTO storefront_settings(setting_key,value_json) VALUES(?,?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json").bind('customer_experience',JSON.stringify(experience)),
    ...(storefront === "glamia" && body.cinematic_reel !== undefined ? [env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("cinematic_reel", JSON.stringify(cinematicReel))] : []),
    env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("seo", JSON.stringify(seo))
  ]);
  await invalidateStorefrontCache(request);
  return json({
    ok: true,
    announcement,
    customer_experience:experience,
    trust_strip: trustStrip,
    fulfillment,
    payments: { ...payments, methods: paymentMethods(env, payments), gateway_status: paymentGatewayStatus(env, payments) },
    support_contact: supportContact,
    socials,
    cinematic_reel: cinematicReel,
    seo
  });
}

async function getCinematicReelSettings(env, storefront = "glamia") {
  const settings = await storefrontSettingsObject(env, true, storefront);
  return json(storefront === "wibrawl" ? { cinematic_reels: settings.cinematic_reels } : { cinematic_reel: settings.cinematic_reel });
}

async function updateCinematicReelSettings(request, env) {
  const storefront = adminHeroStorefront(request);
  const body = await readJson(request);
  if (storefront === "wibrawl") {
    let reels;
    try { reels = normalizeWibrawlReels(body.cinematic_reels, true); }
    catch (error) { throw httpError(error.message, 400); }
    const ids = [...new Set(reels.flatMap(reel => reel.product_ids))];
    if (ids.length) {
      const { results } = await env.DB.prepare(`SELECT id FROM products WHERE status = 'live' AND storefront_visibility IN ('wibrawl', 'both') AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
      if (results.length !== ids.length) throw httpError("Select only live Wibrawl or shared products", 400);
    }
    await env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind("wibrawl_cinematic_reels", JSON.stringify({ reels })).run();
    await invalidateStorefrontCache(request, storefront);
    return json({ ok: true, cinematic_reels: reels });
  }
  const current = await storefrontSettingsObject(env, true);
  const input = body.cinematic_reel && typeof body.cinematic_reel === "object" ? body.cinematic_reel : body;
  const currentReel = current.cinematic_reel || STOREFRONT_DEFAULTS.cinematic_reel;
  const cinematicReel = {
    visible: input.visible === undefined ? currentReel.visible : Boolean(input.visible),
    eyebrow: heroText(input.eyebrow, currentReel.eyebrow, 70),
    title: heroText(input.title, currentReel.title, 100),
    emphasis: heroText(input.emphasis, currentReel.emphasis, 100),
    description: heroText(input.description, currentReel.description, 180),
    product_ids: [...new Set((Array.isArray(input.product_ids) ? input.product_ids : currentReel.product_ids).map(value => String(value || "").trim()).filter(Boolean))].slice(0, 8)
  };
  await env.DB.prepare("INSERT INTO storefront_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
    .bind("cinematic_reel", JSON.stringify(cinematicReel)).run();
  await invalidateStorefrontCache(request, storefront);
  return json({ ok: true, cinematic_reel: cinematicReel });
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
    referral_onboarding_open: Boolean(row?.referral_onboarding_open),
    dob_updated_at: row?.dob_updated_at || null,
    dob_change_available_at: dobChangeAvailableAt,
    can_change_dob: !row?.dob || !dobChangeAvailableAt || Date.now() >= Date.parse(dobChangeAvailableAt)
  };
}

async function profileRow(env, email) {
  return env.DB.prepare(`
    SELECT name, first_name, middle_name, last_name, dob, gender, phone, dob_updated_at, referral_onboarding_open
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
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dob && dob <= istDayKey();
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
    if (Number.isNaN(parsedDob.getTime()) || parsedDob.toISOString().slice(0, 10) !== dob || dob > istDayKey()) {
      throw httpError("Date of birth must be a valid past date", 400);
    }
  }

  const dobChanged = String(current?.dob || "") !== dob;
  if (body.referral_code) {
    if (!current?.referral_onboarding_open) throw httpError("A referral can only be entered during account creation", 409);
    await validateReferral(env, user.email, body.referral_code);
  }
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
  if (current?.referral_onboarding_open && profileIsComplete(updatedRow)) {
    await claimSignupReferral(env, user.email, body.referral_code || "");
    updatedRow.referral_onboarding_open = false;
  }
  const updated = { ...formatProfile(updatedRow, { ...user, name }), phones: await profilePhones(env, user.email, updatedRow?.phone || "") };
  const token = await signSession({ ...user, name: updated.name }, env);
  return json(updated, 200, {
    "Set-Cookie": makeSessionCookie(request, token)
  });
}

async function deleteCustomerAccount(request, env, user) {
  const body = await readJson(request).catch(() => ({}));
  if (String(body.confirm || "").trim().toUpperCase() !== "DELETE") {
    return json({ error: "Type DELETE to confirm account removal" }, 400);
  }
  const email = String(user.email || "").trim().toLowerCase();
  const anonymizedEmail = `deleted-${crypto.randomUUID().replace(/-/g, "")}@privacy.glamia.invalid`;
  const statements = [
    env.DB.prepare("UPDATE orders SET customer_email = ?, customer_name = 'Deleted account', shipping_json = '{}' WHERE customer_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("UPDATE return_requests SET customer_email = ? WHERE customer_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("UPDATE reviews SET user_email = ?, user_name = 'Deleted customer' WHERE user_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("UPDATE product_questions SET customer_email = ?, customer_name = 'Deleted customer' WHERE customer_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("UPDATE support_tickets SET customer_email = ?, customer_name = 'Deleted customer' WHERE customer_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("UPDATE support_messages SET sender_email = ? WHERE sender_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("UPDATE coupon_redemptions SET customer_email = ? WHERE customer_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("UPDATE store_credit_accounts SET user_email = ? WHERE user_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("UPDATE store_credit_ledger SET user_email = ? WHERE user_email = ?").bind(anonymizedEmail, email),
    env.DB.prepare("DELETE FROM referral_codes WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM referral_rewards WHERE referred_email = ? OR referrer_email = ?").bind(email, email),
    env.DB.prepare("DELETE FROM upload_usage WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM cart_adds WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM wishlist_adds WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM user_credentials WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM profile_phones WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM user_addresses WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM restock_subscriptions WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM customer_notifications WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM customer_push_tokens WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM customer_saved_items WHERE user_email = ?").bind(email),
    env.DB.prepare("DELETE FROM customer_notification_preferences WHERE user_email = ?").bind(email),
    env.DB.prepare(`
      UPDATE users SET
        email = ?, google_sub = ?, apple_sub = NULL, name = 'Deleted account', picture = '',
        first_name = '', middle_name = '', last_name = '', phone = '', dob = '', gender = '',
        dob_updated_at = NULL, auth_email_sent_at = NULL, session_version = COALESCE(session_version, 0) + 1
      WHERE email = ?
    `).bind(anonymizedEmail, `deleted:${crypto.randomUUID()}`, email)
  ];
  await env.DB.batch(statements);
  return json({ ok: true });
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

async function lookupIndianPostalCode(value,env=null) {
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
      locality: String(office.Name || "").trim(),
      delivery_estimate:deliveryPromise(office.State,env?(await storefrontSettingsObject(env)).customer_experience:{})
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

const MAX_PRODUCT_IMAGES = 15;
const MIN_PRODUCT_IMAGES = 4;
const MAX_VARIANT_IMAGES = 15;
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

async function getSizeStockMap(env, productId) {
  const { results } = await env.DB.prepare("SELECT size, stock FROM product_sizes WHERE product_id = ?")
    .bind(productId).all();
  const map = {};
  for (const row of results) map[row.size] = row.stock;
  return map;
}

function validateColorHex(value, label = "Colour swatch") {
  const hex = String(value || "").trim();
  if (!hex) return "";
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw httpError(`${label} must be a 6-digit hex colour`, 400);
  return hex.toLowerCase();
}

function normalizeReturnable(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
  return value === true || value === 1 || value === "1" || String(value).trim().toLowerCase() === "true" || String(value).trim().toLowerCase() === "yes" ? 1 : 0;
}

function sanitizeVariants(variants) {
  return (variants || []).map(variant => ({
    color: String(variant.color || "").trim(),
    color_hex: validateColorHex(variant.color_hex, "Variant colour swatch"),
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
    const date = input.preorder_release_at === undefined ? parseStoredTimestamp(releaseInput) : parseISTInput(releaseInput);
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
      id, product_code, seller_email, name, category, brand, price, mrp, stock, rating, status, featured,
      color, color_hex, sizes_json, image_url, image_key, images_json, image_keys_json, thumbnail_url, thumbnail_key,
      thumbnail_images_json, thumbnail_keys_json, thumbnail_source_url, material, description, specifications, what_in_box, variants_json, variant_group,
      subcategory, size_chart_url, cost_price, reorder_point, preorder_enabled, preorder_release_at,
      preorder_limit, preorder_sold, hsn_sac_code, hsn_sac_type, gst_rate, gst_tax_inclusive, returnable,
      storefront_visibility, video_url
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).bind(
    entry.id,
    entry.productCode || null,
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
    entry.colorHex || "",
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
    entry.whatInBox || "",
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
    entry.gstTaxInclusive ?? 1,
    entry.returnable ?? 1,
    entry.storefrontVisibility || "glamia",
    entry.videoUrl || ""
  );
}

async function createProduct(request, env, user, ctx) {
  const product = await readJson(request);
  validateProduct(product);
  const videoUrl = await validateProductVideo(product.video_url, env, user);
  const storefrontVisibility = String(product.storefront_visibility || "glamia");
  if (!["glamia", "wibrawl", "both"].includes(storefrontVisibility)) return json({ error: "Choose Glamia, Wibrawl, or both storefronts" }, 400);
  if (!(await categoryExists(env, product.category))) {
    return json({ error: `Unknown category "${product.category}"` }, 400);
  }
  const rating = 0; // Ratings come only from published customer reviews.
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
  const productSequence = await nextProductSequence(env);
  if (!Number.isSafeInteger(productSequence) || productSequence < 1) {
    return json({ error: "Product numbering is not configured yet. Apply the latest database migration and try again." }, 503);
  }
  const brandCode = await productBrandCode(env, product.brand);
  const baseProductCode = buildProductCode(brandCode.token, product.category, subcategory, productSequence, brandCode.prefixBeforeGlamia);

  const entries = [{
    id: mainId,
    productCode: baseProductCode,
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
    colorHex: validateColorHex(product.color_hex),
    sizes: product.sizes,
    images,
    imageKeys,
    videoUrl,
    thumbnailSourceUrl,
    thumbnailImages: thumbnailImages.length ? thumbnailImages : [images[0]],
    thumbnailKeys: thumbnailKeys.length ? thumbnailKeys : [imageKeys[0] || ""].filter(Boolean),
    material: product.material,
    description: product.description,
    specifications: product.specifications || "",
    whatInBox: product.what_in_box || "",
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
    gstTaxInclusive: tax.gst_tax_inclusive,
    returnable: product.returnable === undefined ? 1 : normalizeReturnable(product.returnable),
    storefrontVisibility
  }];

  const createdVariants = [];
  for (const [variantIndex, variant] of variants.entries()) {
    const id = crypto.randomUUID();
    entries.push({
      id,
      productCode: `${baseProductCode}-C${String(variantIndex + 1).padStart(2, "0")}`,
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
      colorHex: variant.color_hex,
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
      whatInBox: product.what_in_box || "",
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
      gstTaxInclusive: tax.gst_tax_inclusive,
      returnable: product.returnable === undefined ? 1 : normalizeReturnable(product.returnable),
      storefrontVisibility
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
  scheduleProductVectorUpdate(env, ctx, mainId, groupId);
  return json({
    product: { ...formatProduct(created), size_stock: await getSizeStockMap(env, mainId) },
    variants: createdVariants
  }, 201);
}

async function updateProduct(request, env, id, adminUser = null, ctx) {
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Product not found" }, 404);

  let next = { ...current };
  if (body.video_url !== undefined && body.video_url !== (current.video_url || "")) {
    next.video_url = await validateProductVideo(body.video_url, env, adminUser);
  }
  let removedKeys = [];
  let removedSizeChartKeys = [];
  let sizePlan = null;

  if (body.status !== undefined) {
    if (!["review", "live", "hold", "archived"].includes(body.status)) return json({ error: "Invalid status" }, 400);
    next.status = body.status;
  }
  if (body.featured !== undefined) next.featured = Number(Boolean(body.featured));
  if (body.storefront_visibility !== undefined) {
    const visibility = String(body.storefront_visibility || "");
    if (!["glamia", "wibrawl", "both"].includes(visibility)) return json({ error: "Choose Glamia, Wibrawl, or both storefronts" }, 400);
    next.storefront_visibility = visibility;
  }

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
      const date = parseISTInput(body.deal_ends_at);
      if (Number.isNaN(date.getTime())) return json({ error: "Invalid deal end date" }, 400);
      next.deal_ends_at = date.toISOString();
      if (body.deal_starts_at === undefined && !next.deal_starts_at) next.deal_starts_at = new Date().toISOString();
    }
  }
  if (body.deal_starts_at !== undefined) {
    if (body.deal_starts_at === null || body.deal_starts_at === "") {
      next.deal_starts_at = null;
    } else {
      const date = parseISTInput(body.deal_starts_at);
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

    const catalogFields = ["name", "category", "brand", "price", "mrp", "color", "color_hex", "returnable", "material", "sizes", "description", "specifications", "what_in_box", "images", "thumbnail_urls", "thumbnail_keys", "thumbnail_source_url", "subcategory", "size_chart_url", "cost_price", "reorder_point", "variants"];
  const sharedCatalogFields = ["category", "brand", "price", "mrp", "returnable", "material", "description", "specifications", "what_in_box", "subcategory", "size_chart_url", "cost_price", "reorder_point", "storefront_visibility"];
  const hasSharedCatalogEdit = sharedCatalogFields.some(field => body[field] !== undefined);
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
      color_hex: body.color_hex !== undefined ? validateColorHex(body.color_hex) : validateColorHex(current.color_hex),
      returnable: body.returnable !== undefined ? normalizeReturnable(body.returnable) : normalizeReturnable(current.returnable),
      material: body.material ?? current.material,
      sizes: body.sizes ?? jsonArray(current.sizes_json),
      description: body.description ?? current.description,
      specifications: body.specifications ?? current.specifications ?? "",
      what_in_box: body.what_in_box ?? current.what_in_box ?? "",
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
      color_hex: merged.color_hex,
      returnable: merged.returnable,
      material: merged.material,
      description: merged.description,
      specifications: merged.specifications,
      what_in_box: merged.what_in_box,
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

  if (body.status === "live") {
    const publicationIssues = productPublicationIssues(next);
    if (current.variant_group) {
      const { results: variantRows } = await env.DB.prepare("SELECT * FROM products WHERE variant_group = ? AND id != ?")
        .bind(current.variant_group, id).all();
      for (const variantRow of variantRows) publicationIssues.push(...productPublicationIssues(variantRow).map((issue) => `${variantRow.color || "Linked colourway"}: ${issue}`));
    }
    const uniqueIssues = [...new Set(publicationIssues)];
    if (uniqueIssues.length) {
      return json({
        error: "This listing is not ready to go live. Complete the publish checks first.",
        code: "PUBLISH_VALIDATION_FAILED",
        issues: uniqueIssues
      }, 422);
    }
  }

  const updateStatement = env.DB.prepare(`
    UPDATE products SET
      name = ?, category = ?, brand = ?, price = ?, mrp = ?, stock = ?, color = ?, color_hex = ?, returnable = ?, material = ?,
      description = ?, specifications = ?, what_in_box = ?, sizes_json = ?, image_url = ?, image_key = ?, images_json = ?,
      image_keys_json = ?, thumbnail_url = ?, thumbnail_key = ?, thumbnail_images_json = ?, thumbnail_keys_json = ?, thumbnail_source_url = ?,
      variants_json = ?, status = ?, featured = ?, deal_ends_at = ?,
      deal_starts_at = ?, deal_price = ?, size_chart_url = ?, subcategory = ?, cost_price = ?, reorder_point = ?,
      preorder_enabled = ?, preorder_release_at = ?, preorder_limit = ?, hsn_sac_code = ?, hsn_sac_type = ?,
      gst_rate = ?, gst_tax_inclusive = ?, storefront_visibility = ?, video_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    next.name, next.category, next.brand, next.price, next.mrp, next.stock, next.color, next.color_hex ?? "", next.returnable ?? 1, next.material,
    next.description, next.specifications ?? "", next.what_in_box ?? "", next.sizes_json, next.image_url, next.image_key, next.images_json,
    next.image_keys_json, next.thumbnail_url ?? null, next.thumbnail_key ?? null, next.thumbnail_images_json ?? "[]", next.thumbnail_keys_json ?? "[]", next.thumbnail_source_url ?? "",
    next.variants_json, next.status, next.featured, next.deal_ends_at ?? null,
    next.deal_starts_at ?? null, next.deal_price ?? null, next.size_chart_url ?? null, next.subcategory ?? "", next.cost_price ?? 0,
    next.reorder_point ?? 15, next.preorder_enabled ? 1 : 0, next.preorder_release_at ?? null, next.preorder_limit ?? null,
    next.hsn_sac_code ?? "", next.hsn_sac_type ?? "HSN", next.gst_rate ?? null, next.gst_tax_inclusive ? 1 : 0, next.storefront_visibility || "glamia", next.video_url || "", id
  );
  const updateStatements = sizePlan ? [...sizePlan.statements] : [];
  if (current.variant_group && body.status !== undefined) {
    updateStatements.push(env.DB.prepare("UPDATE products SET status = ? WHERE variant_group = ? AND id != ?")
      .bind(body.status, current.variant_group, id));
  }
  const hasSharedGroupEdit = current.variant_group && (
    hasSharedCatalogEdit ||
    hasPreorderEdit ||
    hasTaxEdit ||
    body.featured !== undefined ||
    body.deal_ends_at !== undefined ||
    body.deal_starts_at !== undefined ||
    body.deal_price !== undefined
  );
  if (hasSharedGroupEdit) {
    updateStatements.push(env.DB.prepare(`
      UPDATE products SET
        category = ?, brand = ?, price = ?, mrp = ?, returnable = ?, material = ?,
        description = ?, what_in_box = ?, size_chart_url = ?, subcategory = ?, cost_price = ?, reorder_point = ?,
        preorder_enabled = ?, preorder_release_at = ?, preorder_limit = ?,
        hsn_sac_code = ?, hsn_sac_type = ?, gst_rate = ?, gst_tax_inclusive = ?,
        featured = ?, deal_ends_at = ?, deal_starts_at = ?, deal_price = ?, storefront_visibility = ?, updated_at = CURRENT_TIMESTAMP
      WHERE variant_group = ? AND id != ?
    `).bind(
      next.category, next.brand, next.price, next.mrp, next.returnable ?? 1, next.material,
      next.description, next.what_in_box ?? "", next.size_chart_url ?? null, next.subcategory ?? "", next.cost_price ?? 0, next.reorder_point ?? 15,
      next.preorder_enabled ? 1 : 0, next.preorder_release_at ?? null, next.preorder_limit ?? null,
      next.hsn_sac_code ?? "", next.hsn_sac_type ?? "HSN", next.gst_rate ?? null, next.gst_tax_inclusive ? 1 : 0,
      next.featured ? 1 : 0, next.deal_ends_at ?? null, next.deal_starts_at ?? null, next.deal_price ?? null, next.storefront_visibility || "glamia",
      current.variant_group, id
    ));
    if (body.specifications !== undefined) {
      const siblings = await env.DB.prepare('SELECT id,name,color,specifications FROM products WHERE variant_group = ? AND id != ?')
        .bind(current.variant_group, id).all();
      for (const sibling of siblings.results || []) {
        updateStatements.push(env.DB.prepare('UPDATE products SET specifications = ? WHERE id = ? AND variant_group = ?')
          .bind(linkedSpecificationCopy(next.specifications, sibling), sibling.id, current.variant_group));
      }
    }
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
  if (["status", "name", "brand", "category", "subcategory", "color", "material", "description"].some(key => body[key] !== undefined)) {
    scheduleProductVectorUpdate(env, ctx, id, current.variant_group);
  }
  if (adminUser) await writeAuditLog(env, adminUser.email, "update_product", "product", id, { fields: Object.keys(body) });
  return json({ product: { ...formatProduct(updated), size_stock: await getSizeStockMap(env, id) } });
}

async function deleteProduct(env, user, id, ctx) {
  const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!product) return json({ ok: true });
  if (user.role !== "admin" && product.seller_email !== user.email) throw httpError("You can delete only your own listings", 403);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM product_sizes WHERE product_id = ?").bind(id),
    env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id)
  ]);
  scheduleProductVectorUpdate(env, ctx, id);
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

async function listCategories(env, storefront = "glamia", includeUnassigned = false) {
  const visibility = storefront === "wibrawl" ? "('wibrawl', 'both')" : "('glamia', 'both')";
  const categoryFilter = includeUnassigned ? "" : `WHERE EXISTS (SELECT 1 FROM products p WHERE p.category = c.name AND p.status = 'live' AND COALESCE(p.storefront_visibility, 'glamia') IN ${visibility})`;
  const subcategoryFilter = includeUnassigned ? "" : `WHERE EXISTS (SELECT 1 FROM products p WHERE p.category = s.category AND p.subcategory = s.name AND p.status = 'live' AND COALESCE(p.storefront_visibility, 'glamia') IN ${visibility})`;
  const [categoryRows, subcategoryRows] = await env.DB.batch([
    env.DB.prepare(`SELECT c.name FROM categories c ${categoryFilter} ORDER BY c.name ASC`),
    env.DB.prepare(`SELECT s.category, s.name FROM subcategories s ${subcategoryFilter} ORDER BY s.category ASC, s.name ASC`)
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

/* Dashboard data is global to this store, so a short Worker-local cache avoids
   rerunning the full analytics fan-out for every admin tab and poll. Mutations
   invalidate it through invalidateProductEnrichment(), while the generation
   guard prevents an in-flight pre-mutation result from being cached. */
async function dashboardStats(env) {
  const now = Date.now();
  if (dashboardStatsCache.payload && dashboardStatsCache.expiresAt > now) return json(dashboardStatsCache.payload);
  const generation = dashboardStatsCache.generation;
  if (!dashboardStatsInFlight || dashboardStatsInFlight.generation !== generation) {
    const request = { generation, promise: null };
    request.promise = buildDashboardStats(env).then((payload) => {
      if (dashboardStatsCache.generation === generation) {
        dashboardStatsCache = { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, generation, payload };
      }
      if (dashboardStatsInFlight === request) dashboardStatsInFlight = null;
      return payload;
    }, (error) => {
      if (dashboardStatsInFlight === request) dashboardStatsInFlight = null;
      throw error;
    });
    dashboardStatsInFlight = request;
  }
  return json(await dashboardStatsInFlight.promise);
}

async function buildDashboardStats(env) {
  const [salesResult, cartResult, wishResult, productResult, customerResult, orderCount, returnCount, stateOrdersResult, hourOrdersResult, recoveryResult, paymentResult, funnelResult, viewsTotalResult, viewsByDayResult, viewsByPathResult, viewsByReferrerResult, viewsByDeviceResult, viewsByCountryResult, viewsByHourResult, viewsByDayHourResult] = await Promise.all([
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
    env.DB.prepare("SELECT COALESCE(SUM(views), 0) AS views FROM page_view_rollups WHERE day >= date('now', '+5 hours', '+30 minutes', '-29 days')").first(),
    env.DB.prepare(`
      WITH RECURSIVE days(day) AS (
        SELECT date('now', '+5 hours', '+30 minutes', '-29 days')
        UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date('now', '+5 hours', '+30 minutes')
      )
      SELECT days.day, COALESCE(SUM(r.views), 0) AS views
      FROM days
      LEFT JOIN page_view_rollups r ON r.day = days.day
      GROUP BY days.day
      ORDER BY days.day ASC
    `).all(),
    env.DB.prepare("SELECT path, SUM(views) AS views FROM page_view_rollups WHERE day >= date('now', '+5 hours', '+30 minutes', '-29 days') GROUP BY path ORDER BY views DESC LIMIT 8").all(),
    env.DB.prepare("SELECT referrer_host AS source, SUM(views) AS views FROM page_view_rollups WHERE day >= date('now', '+5 hours', '+30 minutes', '-29 days') AND referrer_host != '' GROUP BY referrer_host ORDER BY views DESC LIMIT 8").all(),
    env.DB.prepare("SELECT device, SUM(views) AS views FROM page_view_rollups WHERE day >= date('now', '+5 hours', '+30 minutes', '-29 days') GROUP BY device ORDER BY views DESC").all(),
    env.DB.prepare("SELECT country, SUM(views) AS views FROM page_view_rollups WHERE day >= date('now', '+5 hours', '+30 minutes', '-29 days') AND country != '' GROUP BY country ORDER BY views DESC LIMIT 8").all(),
    env.DB.prepare(`
      WITH RECURSIVE hours(hour) AS (
        SELECT 0
        UNION ALL
        SELECT hour + 1 FROM hours WHERE hour < 23
      )
      SELECT hours.hour, COALESCE(SUM(r.views), 0) AS views
      FROM hours
      LEFT JOIN (
        SELECT hour, SUM(views) AS views
        FROM page_view_rollups
        WHERE day >= date('now', '+5 hours', '+30 minutes', '-29 days')
        GROUP BY hour
      ) r ON r.hour = hours.hour
      GROUP BY hours.hour
      ORDER BY hours.hour ASC
    `).all(),
    env.DB.prepare(`
      SELECT
        day,
        hour,
        SUM(views) AS views
      FROM page_view_rollups
      WHERE day >= date('now', '+5 hours', '+30 minutes', '-29 days')
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
  const paymentTotal = Number(paymentResult?.total || 0);
  const paymentCancelled = Number(paymentResult?.cancelled || 0);
  const trackedCartCustomers = Number(funnelResult?.cart_customers || 0);
  const purchasingCustomers = Number(funnelResult?.purchasing_customers || 0);
  return {
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
      payment_cancellation_rate: paymentTotal ? Math.round((paymentCancelled / paymentTotal) * 100) : 0,
      payment_orders: paymentTotal,
      cancelled_payment_orders: paymentCancelled,
      tracked_cart_customers: trackedCartCustomers,
      purchasing_customers: purchasingCustomers,
      tracked_cart_to_order_rate: trackedCartCustomers ? Math.round((purchasingCustomers / trackedCartCustomers) * 100) : 0
    },
    totals: {
      ...totals,
      repeat_customers: customerResult.results.filter(row => Number(row.order_count || 0) > 1).length,
      return_rate: totalOrders ? Math.round((refundedOrCompleted / totalOrders) * 100) : 0
    }
  };
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
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowedTypes.has(file.type)) return json({ error: "Upload a JPEG, PNG, WebP, or GIF image" }, 400);
  const isThumbnail = uploadKind === "product-thumbnail";
  if (file.size > (isThumbnail ? 1 : 5) * 1024 * 1024) return json({ error: `${isThumbnail ? "Thumbnail" : "Image"} must be ${isThumbnail ? "1MB" : "5MB"} or smaller` }, 400);
  if (!(await hasValidFileSignature(file, file.type))) return json({ error: "The uploaded file content does not match its type" }, 400);

  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  const kind = isThumbnail ? "products/thumbs" : "products";
  const ownerKey = await hashIdentifier(user.email);
  const key = `${kind}/${ownerKey}/${crypto.randomUUID()}.${extension}`;
  // A caller-controlled upload kind must never bypass a non-admin's storage quota.
  const quotaRequired = !adminUpload;
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
  const usageDate = istDayKey();
  const result = await env.DB.prepare(`
    INSERT INTO upload_usage (user_email, usage_date, bytes) VALUES (?, ?, ?)
    ON CONFLICT(user_email, usage_date) DO UPDATE SET bytes = upload_usage.bytes + excluded.bytes
    WHERE upload_usage.bytes + excluded.bytes <= ?
  `).bind(String(email).toLowerCase(), usageDate, bytes, DAILY_UPLOAD_LIMIT).run();
  if (Number(result.meta?.changes || 0) !== 1) throw httpError("Your daily upload limit has been reached", 429);
}

async function releaseUploadQuota(env, email, bytes) {
  const usageDate = istDayKey();
  await env.DB.prepare("UPDATE upload_usage SET bytes = MAX(0, bytes - ?) WHERE user_email = ? AND usage_date = ?")
    .bind(bytes, String(email).toLowerCase(), usageDate).run();
}

async function serveShopperApk(request, env) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const key = "app-downloads/glamia-shopper.apk";
  const headOnly = request.method === "HEAD";
  const object = headOnly ? await env.PRODUCT_IMAGES.head(key) : await env.PRODUCT_IMAGES.get(key);
  if (!object) {
    return new Response(headOnly ? null : "The Android app download is coming soon.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  return new Response(headOnly ? null : object.body, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": 'attachment; filename="Glamia-Store.apk"',
      "Content-Length": String(object.size),
      "ETag": object.httpEtag,
      "Cache-Control": "no-store"
    }
  });
}

async function cachedProductImage(request, env, url, ctx) {
  // Uploads use immutable UUID keys. Product media is already public and never
  // contains account data, so cookies/authorization cannot vary this response.
  const cache = globalThis.caches?.default;
  const key = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
  const headOnly = request.method === 'HEAD';
  const hit = cache ? await cache.match(key) : null;
  if (hit) return headOnly ? new Response(null, { status: hit.status, headers: hit.headers }) : hit;
  const response = await serveR2Asset(env, url.pathname.slice('/api/assets/'.length), headOnly);
  if (cache && ctx?.waitUntil && !headOnly && response.status === 200) {
    ctx.waitUntil(cache.put(key, response.clone()).catch(error => {
      console.error('product_image_cache_failed', { error_type: error.name });
    }));
  }
  return response;
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

async function employeePushTokenRows(env, permission, ownerOnly = false) {
  const { results } = await env.DB.prepare(`
    SELECT t.token, e.position, e.permissions_json, e.employee_email, e.owner_approved
    FROM employee_push_tokens t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.active = 1 AND e.active = 1
    ORDER BY t.updated_at DESC
    LIMIT 500
  `).all();
  return (results || []).filter(row => ownerOnly ? employeeIsOwner(row, env) : employeeHasPermission(row, permission));
}

async function pushEmployeeNotification(env, id) {
  const notification = await env.DB.prepare(`
    SELECT id, type, title, message, priority, order_id, product_id, review_id, dismissed_at, employee_push_sent_at, owner_only
    FROM admin_notifications
    WHERE id = ?
  `).bind(id).first();
  if (!notification || notification.dismissed_at || notification.employee_push_sent_at) return;
  const claimed = await env.DB.prepare(`
    UPDATE admin_notifications
    SET employee_push_sent_at = CURRENT_TIMESTAMP
    WHERE id = ? AND employee_push_sent_at IS NULL
  `).bind(id).run();
  if (!Number(claimed.meta?.changes || 0)) return;
  const permission = notificationPermission(notification.type);
  if (!permission) return;
  const rows = await employeePushTokenRows(env, permission, Boolean(notification.owner_only));
  if (!rows.length) return;
  await sendExpoPushMessages(rows.map(row => row.token), {
    title: notification.title,
    body: notification.message,
    priority: notification.priority === "urgent" || notification.priority === "high" ? "high" : "default",
    channelId: "employee-updates",
    data: {
      type: notification.type,
      order_id: notification.order_id,
      product_id: notification.product_id,
      review_id: notification.review_id,
      deep_link: "/notifications"
    }
  }, env);
}

async function pushPendingEmployeeNotifications(env) {
  const { results } = await env.DB.prepare(`
    SELECT id
    FROM admin_notifications
    WHERE dismissed_at IS NULL AND employee_push_sent_at IS NULL
    ORDER BY created_at ASC
    LIMIT 100
  `).all();
  for (const row of results || []) await pushEmployeeNotification(env, row.id);
}

async function createAdminNotification(env, {
  type, title, message, dedupeKey, orderId = null, productId = null, reviewId = null, priority = "normal", ownerOnly = false, ctx = null
}) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO admin_notifications
      (id, type, priority, title, message, dedupe_key, order_id, product_id, review_id, created_at, owner_only)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dedupe_key) DO UPDATE SET
      priority = excluded.priority,
      title = excluded.title,
      message = excluded.message,
      order_id = excluded.order_id,
      product_id = excluded.product_id,
      review_id = excluded.review_id,
      created_at = excluded.created_at,
      employee_push_sent_at = NULL,
      owner_only = excluded.owner_only
  `).bind(
    id, type, priority, title, message, dedupeKey, orderId, productId, reviewId, new Date().toISOString(), ownerOnly ? 1 : 0
  ).run();
  const notification = await env.DB.prepare("SELECT id FROM admin_notifications WHERE dedupe_key = ?").bind(dedupeKey).first();
  const push = pushEmployeeNotification(env, notification?.id || id);
  if (ctx?.waitUntil) ctx.waitUntil(push.catch(() => null));
  else await push;
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
  await pushPendingEmployeeNotifications(env);
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
  await pushPendingEmployeeNotifications(env);
}

async function ensureEmployeeNotificationMaintenance(env) {
  const now = Date.now();
  if (employeeNotificationMaintenance.inFlight) return employeeNotificationMaintenance.inFlight;
  if (employeeNotificationMaintenance.completedAt > now - 60_000) return;
  const task = (async () => {
    await ensureStockNotifications(env);
    await ensurePendingOrderNotifications(env);
    employeeNotificationMaintenance.completedAt = Date.now();
  })().finally(() => {
    if (employeeNotificationMaintenance.inFlight === task) employeeNotificationMaintenance.inFlight = null;
  });
  employeeNotificationMaintenance.inFlight = task;
  return task;
}

async function listAdminNotifications(env) {
  await ensureEmployeeNotificationMaintenance(env);
  const { results } = await env.DB.prepare(`
    SELECT id, type, priority, title, message, order_id, product_id, review_id, read_at, created_at, owner_only
    FROM admin_notifications
    WHERE dismissed_at IS NULL
      AND NOT (
        type = 'new_order'
        AND EXISTS (
        SELECT 1 FROM orders o
          WHERE o.id = admin_notifications.order_id
            AND ${paymentIncompleteOrderPredicate("o", false)}
        )
      )
    ORDER BY created_at DESC
    LIMIT 200
  `).all();
  const unread = results.filter(notification => !notification.read_at).length;
  return json({ notifications: results, unread_count: unread });
}

function notificationPermission(type) {
  return ADMIN_NOTIFICATION_PERMISSIONS[String(type || "")] || "";
}

function employeeCanSeeNotification(employee, notification, env) {
  if (notification?.owner_only) return Boolean(env && employeeIsOwner(employee, env));
  const permission = notificationPermission(notification?.type);
  return Boolean(permission && employeeHasPermission(employee, permission));
}

async function employeeNotificationRows(env, employee) {
  await ensureEmployeeNotificationMaintenance(env);
  const { results } = await env.DB.prepare(`
    SELECT n.id, n.type, n.priority, n.title, n.message, n.order_id, n.product_id, n.review_id, n.owner_only,
      n.created_at, s.read_at AS employee_read_at, s.dismissed_at AS employee_dismissed_at
    FROM admin_notifications n
    LEFT JOIN employee_notification_states s
      ON s.notification_id = n.id AND s.employee_id = ?
    WHERE n.dismissed_at IS NULL
      AND (s.dismissed_at IS NULL)
      AND NOT (
        n.type = 'new_order'
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = n.order_id
            AND ${paymentIncompleteOrderPredicate("o", false)}
        )
      )
    ORDER BY CASE n.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, n.created_at DESC
    LIMIT 200
  `).bind(employee.id).all();
  return results
    .filter((notification) => employeeCanSeeNotification(employee, notification, env))
    .map((notification) => ({
      id: notification.id,
      type: notification.type,
      priority: notification.priority,
      title: notification.title,
      message: notification.message,
      order_id: notification.order_id,
      product_id: notification.product_id,
      review_id: notification.review_id,
      owner_only: notification.owner_only,
      read_at: notification.employee_read_at || null,
      created_at: notification.created_at
    }));
}

async function listEmployeeNotifications(env, employee) {
  const notifications = await employeeNotificationRows(env, employee);
  return json({
    notifications,
    unread_count: notifications.filter((notification) => !notification.read_at).length
  });
}

async function getEmployeeNotificationCount(env, employee) {
  const notifications = await employeeNotificationRows(env, employee);
  return json({ unread_count: notifications.filter((notification) => !notification.read_at).length });
}

async function markAllEmployeeNotificationsRead(env, employee) {
  const notifications = await employeeNotificationRows(env, employee);
  if (!notifications.length) return;
  await env.DB.batch(notifications.map((notification) => env.DB.prepare(`
    INSERT INTO employee_notification_states (employee_id, notification_id, read_at, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id, notification_id) DO UPDATE SET
      read_at = COALESCE(employee_notification_states.read_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
  `).bind(employee.id, notification.id)));
}

async function updateEmployeeNotification(request, env, employee, id) {
  const current = await env.DB.prepare(`
    SELECT n.id, n.type, n.owner_only, s.read_at, s.dismissed_at
    FROM admin_notifications n
    LEFT JOIN employee_notification_states s
      ON s.notification_id = n.id AND s.employee_id = ?
    WHERE n.id = ? AND n.dismissed_at IS NULL
      AND NOT (
        n.type = 'new_order'
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = n.order_id
            AND ${paymentIncompleteOrderPredicate("o", false)}
        )
      )
  `).bind(employee.id, id).first();
  if (!current || !employeeCanSeeNotification(employee, current, env)) return json({ error: "Notification not found" }, 404);
  const body = await readJson(request);
  let readAt = current.read_at || null;
  let dismissedAt = current.dismissed_at || null;
  if (body.read === true) readAt = new Date().toISOString();
  else if (body.read === false) readAt = null;
  if (body.dismissed === true) dismissedAt = new Date().toISOString();
  else if (body.dismissed === false) dismissedAt = null;
  if (body.read !== true && body.read !== false && body.dismissed !== true && body.dismissed !== false) {
    return json({ error: "Choose read or dismissed" }, 400);
  }
  await env.DB.prepare(`
    INSERT INTO employee_notification_states (employee_id, notification_id, read_at, dismissed_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id, notification_id) DO UPDATE SET
      read_at = excluded.read_at,
      dismissed_at = excluded.dismissed_at,
      updated_at = CURRENT_TIMESTAMP
  `).bind(employee.id, id, readAt, dismissedAt).run();
  return listEmployeeNotifications(env, employee);
}

async function getAdminNotificationCount(env) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS unread_count
    FROM admin_notifications
    WHERE dismissed_at IS NULL AND read_at IS NULL
      AND NOT (
        type = 'new_order'
        AND EXISTS (
          SELECT 1 FROM orders o
            WHERE o.id = admin_notifications.order_id
            AND ${paymentIncompleteOrderPredicate("o", false)}
        )
      )
  `).first();
  return json({ unread_count: Number(row?.unread_count || 0) });
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
  const normalized = String(value || "pending").trim().toLowerCase();
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
    credits_used: Number(row.credits_used || 0),
    payable_total: Number(row.payable_total ?? row.total),
    bill_available: Boolean(row.bill_issued_at),
    bill_number: row.bill_number || null,
    bill_issued_at: row.bill_issued_at || null,
    status: row.status,
    payment_method: formatPaymentMethod(row.payment_method),
    payment_gateway: row.payment_gateway || null,
    payment_status: row.payment_status || "pending",
    payment_reference: row.payment_reference || "",
    payment_updated_at: row.payment_updated_at || null,
    tracking_token: row.tracking_token || "",
    tracking_number: row.tracking_number || "",
    order_type: row.order_type || "standard",
    orderType: String(row.order_type || 'standard').toUpperCase(),
    is_replacement: row.order_type === 'replacement',
    isReplacement: row.order_type === 'replacement',
    replacement_fulfilment_mode: row.order_type==='replacement' ? (row.replacement_fulfilment_mode||'after_receipt') : null,
    original_order_id: row.replacement_for_order_id || null,
    originalOrderId: row.replacement_for_order_id || null,
    trackingNumber: row.tracking_number || '',
    ...(row.order_type === 'replacement' ? {tax_total:0,shipping_total:0} : {}),
    replacement_for_order_id: row.replacement_for_order_id || null,
    replacement_request_id: row.replacement_request_id || null,
    packing_status: row.status === "cancelled" ? "not_required" : (row.packing_status || "unpacked"),
    packed_at: row.packed_at || null,
    packed_by: row.packed_by || null,
    shipping,
    delivery_estimate:row.delivery_estimate||'',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// Payment confirmations need actual issued-bill metadata, not an assumption
// based on payment status. Read only after settlement; never issue a bill here.
async function formatPaymentOrder(env, row) {
  if (!row) return null;
  if (!["paid", "refunded"].includes(row.payment_status)) return formatOrder(row);
  const bill = await env.DB.prepare("SELECT bill_number, issued_at AS bill_issued_at FROM order_bills WHERE order_id = ? LIMIT 1").bind(row.id).first();
  return formatOrder({ ...row, bill_number: bill?.bill_number, bill_issued_at: bill?.bill_issued_at });
}

function fallbackOrderNumber(row) {
  const date = String(row.created_at || "").replace(/[^0-9]/g, "").slice(0, 8) || "00000000";
  const token = String(row.id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  return `GM-${date}-${token}`;
}

async function listOrders(env, user, scope, searchParams = new URLSearchParams()) {
  if (scope === "admin") {
    requireAdmin(user);
    const completed = searchParams.get("completed") === "1";
    const query = String(searchParams.get("q") || "").trim().slice(0, 100).replace(/[\\%_]/g, "");
    const filters = [`NOT ${paymentIncompleteOrderPredicate("o", true)}`];
    const args = [];
    const selectedOrder=String(searchParams.get('order')||'').trim().slice(0,128);
    if(selectedOrder){filters.push('o.id=?');args.push(selectedOrder);}
    if (completed) filters.push("(b.order_id IS NOT NULL OR (o.order_type='replacement' AND o.status='delivered'))");
    const year = String(searchParams.get('year') || 'all');
    if (year !== 'all' && (!/^\d{4}$/.test(year) || Number(year) < 1900)) return json({ error: 'Invalid order year' }, 400);
    const yearExpression = "strftime('%Y', o.created_at, '+5 hours', '+30 minutes')";
    const { results: years } = await env.DB.prepare(`SELECT ${yearExpression} AS year, COUNT(*) AS count FROM orders o LEFT JOIN order_bills b ON b.order_id=o.id WHERE NOT ${paymentIncompleteOrderPredicate('o', true)} ${completed ? "AND (b.order_id IS NOT NULL OR (o.order_type='replacement' AND o.status='delivered'))" : ''} AND ${yearExpression} IS NOT NULL GROUP BY year ORDER BY year DESC`).all();
    if (year !== 'all') { filters.push(`${yearExpression} = ?`); args.push(year); }
    if (query) { filters.push("(o.order_number LIKE ? OR o.customer_email LIKE ? OR o.customer_name LIKE ?)"); args.push(...Array(3).fill(`%${query}%`)); }
    const where = filters.join(" AND ");
    const requestedLimit = Number(searchParams.get("limit"));
    const hasPagination = Number.isSafeInteger(requestedLimit) && requestedLimit > 0;
    const limit = hasPagination ? Math.min(requestedLimit, 100) : null;
    const page = hasPagination ? Math.max(1, Math.floor(Number(searchParams.get("page")) || 1)) : 1;
    const offset = limit ? (page - 1) * limit : 0;
    const { results } = await env.DB.prepare(`
      SELECT o.*, b.bill_number, b.issued_at AS bill_issued_at
      FROM orders o LEFT JOIN order_bills b ON b.order_id = o.id
      WHERE ${where}
      ORDER BY ${completed ? "COALESCE(b.issued_at,o.delivered_at,o.created_at)" : "o.created_at"} DESC, o.id DESC${limit ? " LIMIT ? OFFSET ?" : ""}
    `).bind(...args, ...(limit ? [limit, offset] : [])).all();
    const orders = await attachCancellationRefunds(env,results.map(formatOrder));
    if (!limit) return json({ orders, years, selected_year: year });
    const total = query || completed || selectedOrder || year !== 'all'
      ? Number((await env.DB.prepare(`SELECT COUNT(*) AS count FROM orders o LEFT JOIN order_bills b ON b.order_id = o.id WHERE ${where}`).bind(...args).first())?.count || 0)
      : await cachedCount(env, "admin-orders", `SELECT COUNT(*) AS count FROM orders o WHERE NOT ${paymentIncompleteOrderPredicate("o", true)}`);
    return json({ orders, years, selected_year: year, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), has_more: offset + orders.length < total } });
  }
  const { results } = await env.DB.prepare(`
    SELECT o.*, b.bill_number, b.issued_at AS bill_issued_at FROM orders o LEFT JOIN order_bills b ON b.order_id = o.id
    WHERE o.customer_email = ?
      ${searchParams.get('cancellation_updates')==='1'?"AND o.status='cancelled'":''}
      AND NOT ${paymentIncompleteOrderPredicate("o", true)}
    ORDER BY o.created_at DESC
  `)
    .bind(String(user.email || "").trim().toLowerCase())
    .all();
  return json({ orders: await attachCancellationRefunds(env,results.map(formatOrder)) });
}

async function listCustomerNotifications(env, user) {
  const { results } = await env.DB.prepare(`
    SELECT n.id, n.type, n.title, n.message, n.order_id, n.deep_link, n.read_at, n.created_at
    FROM customer_notifications n
    LEFT JOIN orders o ON o.id = n.order_id
    WHERE n.user_email = ?
      AND NOT (
        n.type = 'order_placed'
        AND o.id IS NOT NULL
        AND ${paymentIncompleteOrderPredicate("o", false)}
      )
      AND NOT (o.id IS NOT NULL AND ${paymentIncompleteOrderPredicate("o", true)})
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 100
  `).bind(String(user.email || "").trim().toLowerCase()).all();
  return json({ notifications: results || [] });
}

// Signed-in saved selections are small account snapshots; mutations apply per item to avoid stale-device overwrites.
function savedItemId(value) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw httpError("Invalid saved product", 400);
  return id;
}

function savedCartLine(value, allowRemoval = false) {
  const quantity = Number(value?.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < (allowRemoval ? 0 : 1) || quantity > 10) throw httpError("Invalid saved quantity", 400);
  const size = String(value?.size || "").trim().slice(0, 32);
  const variant = String(value?.variant || "").trim().slice(0, 128);
  return { id: savedItemId(value?.id), size, variant, quantity };
}

function savedCartKey(line) { return JSON.stringify([line.id, line.size, line.variant]); }

function parseSavedArray(value) {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function savedItemsResponse(row) {
  return { cart: parseSavedArray(row?.cart_json), wishlist: parseSavedArray(row?.wishlist_json), saved_for_later: parseSavedArray(row?.saved_for_later_json), revision: Number(row?.revision || 0) };
}

async function getCustomerSavedItems(env, user) {
  const row = await env.DB.prepare("SELECT cart_json, wishlist_json, saved_for_later_json, revision FROM customer_saved_items WHERE user_email = ?")
    .bind(String(user.email).toLowerCase()).first();
  return json(savedItemsResponse(row));
}

async function changeCustomerSavedItems(request, env, user, merge) {
  const body = await readJson(request);
  if (!Array.isArray(body.cart) || !Array.isArray(body.wishlist) || body.cart.length > 100 || body.wishlist.length > 200) throw httpError("Saved items exceed the allowed size", 400);
  if (body.saved_for_later !== undefined && (!Array.isArray(body.saved_for_later) || body.saved_for_later.length > 100)) throw httpError("Saved for later exceeds the allowed size", 400);
  if (!merge && body.wishlist.some(entry => !entry || typeof entry !== "object" || typeof entry.saved !== "boolean")) throw httpError("Wishlist changes must be explicit", 400);
  const cartChanges = body.cart.map(line => savedCartLine(line, !merge));
  const laterChanges = (body.saved_for_later || []).map(line => savedCartLine(line, !merge));
  const wishlistChanges = body.wishlist.map(entry => merge
    ? { id: savedItemId(entry), saved: true }
    : { id: savedItemId(entry?.id), saved: entry?.saved === true });
  const email = String(user.email).trim().toLowerCase();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await env.DB.prepare("SELECT cart_json, wishlist_json, saved_for_later_json, revision FROM customer_saved_items WHERE user_email = ?").bind(email).first();
    if (!row) {
      await env.DB.prepare("INSERT OR IGNORE INTO customer_saved_items (user_email) VALUES (?)").bind(email).run();
      continue;
    }
    const prior = savedItemsResponse(row);
    const cart = new Map(prior.cart.map(line => [savedCartKey(line), line]));
    const wishlist = new Set(prior.wishlist);
    const later = new Map(prior.saved_for_later.map(line => [savedCartKey(line), line]));
    for (const line of cartChanges) {
      const key = savedCartKey(line);
      if (line.quantity === 0) cart.delete(key);
      else cart.set(key, { ...line, quantity: merge ? Math.max(line.quantity, Number(cart.get(key)?.quantity || 0)) : line.quantity });
    }
    for (const entry of wishlistChanges) entry.saved ? wishlist.add(entry.id) : wishlist.delete(entry.id);
    for (const line of laterChanges) {
      const key = savedCartKey(line);
      if (line.quantity === 0) later.delete(key);
      else later.set(key, { ...line, quantity: merge ? Math.max(line.quantity, Number(later.get(key)?.quantity || 0)) : line.quantity });
    }
    if (cart.size > 100 || wishlist.size > 200 || later.size > 100) throw httpError("Too many saved items", 400);
    const next = { cart: [...cart.values()], wishlist: [...wishlist], saved_for_later: [...later.values()] };
    const cartJson = JSON.stringify(next.cart);
    const wishlistJson = JSON.stringify(next.wishlist);
    const laterJson = JSON.stringify(next.saved_for_later);
    if (cartJson === row.cart_json && wishlistJson === row.wishlist_json && laterJson === row.saved_for_later_json) return json(prior);
    const updated = await env.DB.prepare(`
      UPDATE customer_saved_items SET cart_json = ?, wishlist_json = ?, saved_for_later_json = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_email = ? AND revision = ?
    `).bind(cartJson, wishlistJson, laterJson, email, row.revision).run();
    if (Number(updated.meta?.changes || 0)) return json({ ...next, revision: prior.revision + 1 });
  }
  throw httpError("Saved items changed on another device. Please retry.", 409);
}

async function getCustomerNotificationPreferences(env, user) {
  const row = await env.DB.prepare("SELECT event_push_enabled FROM customer_notification_preferences WHERE user_email = ?")
    .bind(String(user.email).toLowerCase()).first();
  return json({ event_push_enabled: Boolean(row?.event_push_enabled) });
}

async function updateCustomerNotificationPreferences(request, env, user) {
  const body = await readJson(request);
  if (typeof body.event_push_enabled !== "boolean") throw httpError("Choose whether event alerts are enabled", 400);
  const email = String(user.email).trim().toLowerCase();
  await env.DB.prepare(`
    INSERT INTO customer_notification_preferences (user_email, event_push_enabled) VALUES (?, ?)
    ON CONFLICT(user_email) DO UPDATE SET event_push_enabled = excluded.event_push_enabled, updated_at = CURRENT_TIMESTAMP
    WHERE customer_notification_preferences.event_push_enabled != excluded.event_push_enabled
  `).bind(email, body.event_push_enabled ? 1 : 0).run();
  return json({ event_push_enabled: body.event_push_enabled });
}

async function markCustomerNotificationsRead(request, env, user) {
  const body = await readJson(request).catch(() => ({}));
  const email = String(user.email || "").trim().toLowerCase();
  const id = String(body.id || "").trim();
  if (id) {
    await env.DB.prepare("UPDATE customer_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ? AND read_at IS NULL")
      .bind(id, email).run();
  } else {
    await env.DB.prepare("UPDATE customer_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_email = ? AND read_at IS NULL")
      .bind(email).run();
  }
  return json({ ok: true });
}

async function registerCustomerPushToken(request, env, user) {
  const body = await readJson(request);
  const token = String(body.token || "").trim();
  const platform = String(body.platform || "unknown").trim().toLowerCase().slice(0, 20) || "unknown";
  if (!token || token.length > 512) return json({ error: "A valid notification token is required" }, 400);
  const email = String(user.email || "").trim().toLowerCase();
  await env.DB.prepare(`
    INSERT INTO customer_push_tokens (id, user_email, token, platform, active, updated_at)
    VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(token) DO UPDATE SET
      user_email = excluded.user_email,
      platform = excluded.platform,
      active = 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE customer_push_tokens.user_email != excluded.user_email OR customer_push_tokens.platform != excluded.platform OR customer_push_tokens.active != 1
  `).bind(crypto.randomUUID(), email, token, platform).run();
  return json({ ok: true });
}

async function removeCustomerPushToken(request, env, user) {
  const body = await readJson(request).catch(() => ({}));
  const token = String(body.token || "").trim();
  const email = String(user.email || "").trim().toLowerCase();
  if (token) {
    await env.DB.prepare("UPDATE customer_push_tokens SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE token = ? AND user_email = ?")
      .bind(token, email).run();
  } else {
    await env.DB.prepare("UPDATE customer_push_tokens SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE user_email = ?")
      .bind(email).run();
  }
  return json({ ok: true });
}

async function sendExpoPushMessages(tokens, message, env = null) {
  if (env?.DISABLE_OUTBOUND_PUSH === "true") return;
  const uniqueTokens = [...new Set(tokens.map(token => String(token || "").trim()).filter(Boolean))];
  for (let index = 0; index < uniqueTokens.length; index += 100) {
    const chunk = uniqueTokens.slice(index, index + 100);
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(chunk.map(to => ({
          to,
          sound: "default",
          title: message.title,
          body: message.body,
          priority: message.priority,
          channelId: message.channelId,
          data: message.data || {}
        })))
      });
    } catch {
      // In-app notification history remains authoritative if a push provider
      // or network is temporarily unavailable.
    }
  }
}

// Each cron tick fans out a bounded set of live events to customers who explicitly opted in.
async function sendDueEventAlerts(env) {
  let events;
  try {
    ({ results: events } = await env.DB.prepare(`
      SELECT id, headline, message, cta_href FROM events
      WHERE status = 'published' AND notify_customers = 1
        AND (starts_at IS NULL OR julianday(starts_at) <= julianday('now'))
        AND (ends_at IS NULL OR julianday(ends_at) > julianday('now'))
      ORDER BY COALESCE(starts_at, created_at) DESC LIMIT 4
    `).all());
  } catch (error) {
    // The next cron tick will retry after a pending migration is applied.
    console.error("Event alert lookup failed", error);
    return;
  }
  for (const event of events || []) {
    const dedupePrefix = `event:${event.id}:`;
    const title = String(event.headline || "A Glamia moment is live").slice(0, 160);
    const body = String(event.message || "Explore the latest edit.").slice(0, 1000);
    const deepLink = String(event.cta_href || "/offers");
    const batch = crypto.randomUUID();
    // One indexed INSERT SELECT replaces a write per shopper and marks exactly this push batch.
    const inserted = await env.DB.prepare(`
      INSERT OR IGNORE INTO customer_notifications
        (id, user_email, type, title, message, deep_link, dedupe_key, dispatch_batch)
      SELECT lower(hex(randomblob(16))), p.user_email, 'event', ?, ?, ?, ? || p.user_email, ?
      FROM customer_notification_preferences p
      WHERE p.event_push_enabled = 1
        AND EXISTS (SELECT 1 FROM customer_push_tokens t WHERE t.user_email = p.user_email AND t.active = 1)
        AND NOT EXISTS (SELECT 1 FROM customer_notifications n WHERE n.dedupe_key = ? || p.user_email)
      ORDER BY p.user_email LIMIT 100
    `).bind(title, body, deepLink, dedupePrefix, batch, dedupePrefix).run();
    if (!Number(inserted.meta?.changes || 0)) continue;
    const { results: tokens } = await env.DB.prepare(`
      SELECT t.token FROM customer_notifications n
      JOIN customer_push_tokens t ON t.user_email = n.user_email AND t.active = 1
      JOIN customer_notification_preferences p ON p.user_email = n.user_email AND p.event_push_enabled = 1
      WHERE n.dispatch_batch = ?
    `).bind(batch).all();
    if (tokens?.length) await sendExpoPushMessages(tokens.map(row => row.token), { title, body, data: { type: "event", deep_link: deepLink } }, env);
  }
}

async function createCustomerNotification(env, { email, type, title, message, orderId = null, deepLink = "/orders", dedupeKey, ctx = null }) {
  const customerEmail = String(email || "").trim().toLowerCase();
  if (!customerEmail || !title || !message || !dedupeKey) return false;
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO customer_notifications
      (id, user_email, type, title, message, order_id, deep_link, dedupe_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), customerEmail, String(type || "update").slice(0, 40),
    String(title).slice(0, 160), String(message).slice(0, 1000), orderId, deepLink, dedupeKey
  ).run();
  if (!Number(result.meta?.changes || 0)) return false;
  const { results } = await env.DB.prepare("SELECT token FROM customer_push_tokens WHERE user_email = ? AND active = 1 ORDER BY updated_at DESC LIMIT 20")
    .bind(customerEmail).all();
  if (results?.length) {
    const push = sendExpoPushMessages(results.map(row => row.token), { title, body: message, data: { type, order_id: orderId, deep_link: deepLink } }, env);
    if (ctx?.waitUntil) ctx.waitUntil(push.catch(() => null));
    else await push;
  }
  return true;
}

async function notifyOrderPlaced(env, order, ctx = null) {
  if (!order || String(order.status || "").toLowerCase() === "cancelled" || String(order.payment_status || "").toLowerCase() !== "paid") return;
  let itemCount = 0;
  try {
    const items = JSON.parse(order.items_json || "[]");
    itemCount = Array.isArray(items) ? items.length : 0;
  } catch {
    itemCount = 0;
  }
  await createAdminNotification(env, {
    type: "new_order",
    title: "New order received",
    message: `${order.customer_name || order.customer_email} placed ${itemCount} item${itemCount === 1 ? "" : "s"} · ${order.order_number || order.id}`,
    dedupeKey: `order:${order.id}`, ctx,
    orderId: order.id
  }).catch(() => null);
  await createCustomerNotification(env, {
    email: order.customer_email,
    type: "order_placed",
    title: "Order placed",
    message: `We’ve received ${order.order_number || order.id}. We’ll keep you updated as it moves.`,
    orderId: order.id,
    dedupeKey: `customer-order:${order.id}:placed`, ctx
  }).catch(() => null);
}

function normalizeEmployeePosition(value) {
  const position = String(value || "packing_staff").trim().toLowerCase();
  return EMPLOYEE_POSITION_IDS.has(position) ? position : "packing_staff";
}

function employeePermissionsObject(value, position = "packing_staff") {
  let source = value;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = null; }
  }
  const defaults = new Set(EMPLOYEE_POSITION_DEFAULTS[normalizeEmployeePosition(position)] || EMPLOYEE_POSITION_DEFAULTS.packing_staff);
  const object = source && typeof source === "object" && !Array.isArray(source) ? source : null;
  return Object.fromEntries(EMPLOYEE_PERMISSION_OPTIONS.map(({ id }) => [id, object
    ? Object.prototype.hasOwnProperty.call(object, id) && object[id] === true
    : defaults.has(id)]));
}

function normalizeEmployeePermissions(value, position = "packing_staff") {
  let source = value;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = null; }
  }
  if (Array.isArray(source)) source = Object.fromEntries(source.map((permission) => [permission, true]));
  return employeePermissionsObject(source, position);
}

function employeeHasPermission(employee, permission) {
  return employeePermissionsObject(employee?.permissions_json || employee?.permissions, employee?.position)[permission] === true;
}

function requireEmployeePermission(session, permission) {
  if (!employeeHasPermission(session?.employee, permission)) throw httpError("This employee account does not have access to this area", 403);
}

function requireEmployeeAnyPermission(session, permissions) {
  if (!permissions.some((permission) => employeeHasPermission(session?.employee, permission))) {
    throw httpError("This employee account does not have access to this area", 403);
  }
}

function employeeIsOwner(employee, env) {
  return employee?.position === "admin" && Number(employee?.owner_approved) === 1 && adminEmails(env).includes(String(employee?.employee_email || "").trim().toLowerCase());
}

function employeePublicProfile(employee, env) {
  const position = normalizeEmployeePosition(employee.position);
  const owner = env ? employeeIsOwner(employee, env) : false;
  return {
    id: employee.id,
    employee_code: employee.employee_code,
    name: employee.name,
    employee_email: employee.employee_email || "",
    position,
    is_owner: owner,
    access_level: owner ? "owner" : position === "admin" ? "top_employee" : position,
    created_by_email: employee.created_by_email || "",
    created_by_employee_id: employee.created_by_employee_id || null,
    creation_origin: employee.created_by_owner ? "owner" : employee.created_by_employee_id ? "employee" : "unknown",
    permissions: { ...employeePermissionsObject(employee.permissions_json || employee.permissions, position), ...(owner ? { credits: true } : {}) },
    active: Boolean(employee.active)
  };
}

function employeeBearerToken(request) {
  const header = String(request.headers.get("Authorization") || "").trim();
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

async function digestBase64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return base64UrlEncodeBytes(new Uint8Array(digest));
}

async function hashEmployeePassword(password, salt, iterations = EMPLOYEE_PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password)),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64UrlToBytes(String(salt)), iterations: Number(iterations) || EMPLOYEE_PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return base64UrlEncodeBytes(new Uint8Array(bits));
}

async function generateEmployeePasswordRecord(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = base64UrlEncodeBytes(saltBytes);
  return {
    password_hash: await hashEmployeePassword(password, salt, EMPLOYEE_PASSWORD_ITERATIONS),
    password_salt: salt,
    password_iterations: EMPLOYEE_PASSWORD_ITERATIONS
  };
}

async function employeeLogin(request, env) {
  const body = await readJson(request);
  const employeeCode = String(body.employee_id || body.employee_code || "").trim().toUpperCase();
  const password = String(body.password || "");
  if (!employeeCode || !password) return json({ error: "Enter your employee ID and password" }, 400);
  if (employeeCode.length > 31 || password.length > 200) return json({ error: "Employee ID or password is incorrect" }, 401);
  const employee = await env.DB.prepare("SELECT * FROM employees WHERE employee_code = ? LIMIT 1").bind(employeeCode).first();
  if (!employee) return json({ error: "Employee ID or password is incorrect" }, 401);
  if (!Number(employee.active)) return json({ error: "This employee account is disabled. Contact an admin." }, 403);
  if (employee.locked_until && Date.parse(employee.locked_until) > Date.now()) {
    return json({ error: "Too many failed attempts. Try again in a few minutes." }, 429);
  }

  let passwordHash = "";
  try {
    passwordHash = await hashEmployeePassword(password, employee.password_salt, employee.password_iterations);
  } catch {
    return json({ error: "Employee login is not configured correctly" }, 500);
  }
  const valid = passwordHash.length === String(employee.password_hash || "").length &&
    Boolean(await Promise.resolve(crypto.subtle.timingSafeEqual(
      base64UrlToBytes(passwordHash), base64UrlToBytes(String(employee.password_hash || ""))
    )).catch(() => false));
  if (!valid) {
    // Increment failed attempts atomically so concurrent guesses cannot overwrite each other.
    await env.DB.prepare(`UPDATE employees SET
      failed_login_count = MIN(?, CASE WHEN locked_until IS NOT NULL AND locked_until <= ? THEN 1 ELSE failed_login_count + 1 END),
      locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= ? THEN 1 ELSE failed_login_count + 1 END) >= ? THEN ? ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(EMPLOYEE_LOGIN_MAX_FAILURES, new Date().toISOString(), new Date().toISOString(), EMPLOYEE_LOGIN_MAX_FAILURES, new Date(Date.now() + EMPLOYEE_LOGIN_LOCK_MS).toISOString(), employee.id).run();
    return json({ error: "Employee ID or password is incorrect" }, 401);
  }

  const token = base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digestBase64Url(token);
  const expiresAt = new Date(Date.now() + EMPLOYEE_SESSION_MAX_AGE * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE employees SET failed_login_count = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(employee.id),
    env.DB.prepare("INSERT INTO employee_sessions (token_hash, employee_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, employee.id, expiresAt)
  ]);
  return json({ token, expires_at: expiresAt, employee: employeePublicProfile(employee, env) });
}

async function requireEmployee(request, env) {
  const token = employeeBearerToken(request);
  if (!token || token.length > 300) throw httpError("Employee sign-in required", 401);
  const tokenHash = await digestBase64Url(token);
  const session = await env.DB.prepare(`
    SELECT s.token_hash, s.expires_at, s.last_seen_at AS session_last_seen_at, e.*
    FROM employee_sessions s
    JOIN employees e ON e.id = s.employee_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL
    LIMIT 1
  `).bind(tokenHash).first();
  if (!session || !Number(session.active) || !session.expires_at || Date.parse(session.expires_at) <= Date.now()) {
    throw httpError("Employee session expired. Sign in again.", 401);
  }
  const lastSeenAt = Date.parse(session.session_last_seen_at || "");
  if (!Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt >= EMPLOYEE_SESSION_TOUCH_INTERVAL_MS) {
    await env.DB.prepare("UPDATE employee_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND (last_seen_at IS NULL OR last_seen_at <= datetime('now', '-5 minutes'))")
      .bind(tokenHash).run().catch(() => {});
  }
  return { employee: session, tokenHash };
}

async function employeeLogout(request, env) {
  const token = employeeBearerToken(request);
  if (token) await env.DB.prepare("UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?")
    .bind(await digestBase64Url(token)).run();
  return json({ ok: true });
}

async function getEmployeeSession(request, env) {
  const session = await requireEmployee(request, env);
  return json({ employee: employeePublicProfile(session.employee, env), expires_at: session.employee.expires_at });
}

async function registerEmployeePushToken(request, env, employee) {
  const body = await readJson(request);
  const token = String(body.token || "").trim();
  const platform = String(body.platform || "unknown").trim().toLowerCase().slice(0, 20) || "unknown";
  if (!token || token.length > 512) return json({ error: "A valid notification token is required" }, 400);
  await env.DB.prepare(`
    INSERT INTO employee_push_tokens (id, employee_id, token, platform, active, updated_at)
    VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(token) DO UPDATE SET
      employee_id = excluded.employee_id,
      platform = excluded.platform,
      active = 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE employee_push_tokens.employee_id != excluded.employee_id OR employee_push_tokens.platform != excluded.platform OR employee_push_tokens.active != 1
  `).bind(crypto.randomUUID(), employee.id, token, platform).run();
  return json({ ok: true });
}

async function removeEmployeePushToken(request, env, employee) {
  const body = await readJson(request).catch(() => ({}));
  const token = String(body.token || "").trim();
  if (token) {
    await env.DB.prepare("UPDATE employee_push_tokens SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE token = ? AND employee_id = ?")
      .bind(token, employee.id).run();
  } else {
    await env.DB.prepare("UPDATE employee_push_tokens SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?")
      .bind(employee.id).run();
  }
  return json({ ok: true });
}

function employeeCatalogActor(employee) {
  return {
    email: String(employee?.employee_email || `${String(employee?.employee_code || "employee").toLowerCase()}@glamia.local`).trim().toLowerCase()
  };
}

function employeeAdminActor(employee, env) {
  return {
    ...employeeCatalogActor(employee),
    name: employee?.name || employee?.employee_code || "Glamia employee",
    role: "admin",
    employee_id: employee?.id || null,
    employee_position: normalizeEmployeePosition(employee?.position),
    is_owner: env ? employeeIsOwner(employee, env) : false,
    employee_permissions: employeePermissionsObject(employee?.permissions_json || employee?.permissions, employee?.position)
  };
}

async function employeeDashboard(env) {
  const [orders, unpacked, products, lowStock, inventory] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE status != 'cancelled'").first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM orders WHERE status != 'cancelled' AND payment_status IN ('paid', 'not_required') AND packing_status = 'unpacked' AND ${replacementFulfilmentPredicate()}`).first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM products").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE stock <= reorder_point").first(),
    env.DB.prepare("SELECT COALESCE(SUM(stock), 0) AS units FROM products").first()
  ]);
  return json({ stats: {
    orders: Number(orders?.count || 0),
    unpacked_orders: Number(unpacked?.count || 0),
    products: Number(products?.count || 0),
    low_stock: Number(lowStock?.count || 0),
    inventory_units: Number(inventory?.units || 0)
  } });
}

async function listEmployeeProducts(env) {
  return json({ products: await withSizeStock(env, await allProductRows(env)) });
}

async function createEmployeeProduct(request, env, employee, ctx) {
  return createProduct(request, env, employeeCatalogActor(employee), ctx);
}

// Field-level authorization is shared by both mobile product update routes.
function allowedEmployeeProductFields(employee) {
  const allowed = new Set();
  if (employeeHasPermission(employee, "products")) {
    ["video_url", "status", "featured", "preorder_enabled", "preorder_release_at", "preorder_limit", "name", "category", "brand", "price", "mrp", "color", "color_hex", "returnable", "material", "sizes", "description", "specifications", "what_in_box", "images", "thumbnail_urls", "thumbnail_keys", "thumbnail_source_url", "subcategory", "size_chart_url", "cost_price"].forEach((key) => allowed.add(key));
  }
  if (employeeHasPermission(employee, "inventory")) ["stock", "size_stock", "reorder_point", "variants"].forEach((key) => allowed.add(key));
  if (employeeHasPermission(employee, "deals")) ["deal_starts_at", "deal_ends_at", "deal_price"].forEach((key) => allowed.add(key));
  if (employeeHasPermission(employee, "tax")) ["hsn_sac_code", "hsn_sac_type", "gst_rate", "gst_tax_inclusive"].forEach((key) => allowed.add(key));
  return allowed;
}

async function updateEmployeeProduct(request, env, id, employee, ctx) {
  const body = await readJson(request);
  const allowed = allowedEmployeeProductFields(employee);
  const unexpected = Object.keys(body).filter((key) => !allowed.has(key));
  if (unexpected.length) return json({ error: "This account cannot change those listing fields" }, 403);
  const restrictedRequest = new Request(request.url, {
    method: "PATCH",
    headers: request.headers,
    body: JSON.stringify(body)
  });
  return updateProduct(restrictedRequest, env, id, employeeCatalogActor(employee), ctx);
}

function formatEmployeeOrder(row) {
  if (!row) return null;
  let rawItems = [];
  let shipping = {};
  try { rawItems = JSON.parse(row.items_json || "[]"); } catch { rawItems = []; }
  try { shipping = row.shipping_json ? JSON.parse(row.shipping_json) : {}; } catch { shipping = {}; }
  return {
    id: row.id,
    order_number: row.order_number || fallbackOrderNumber(row),
    customer_name: row.customer_name || "Customer",
    customer_email: row.customer_email || "",
    total: row.total,
    payment_status: row.payment_status || "pending",
    // Packing-only staff see a regular job; customer/admin contracts retain identity.
    order_type: row.order_type === 'replacement' ? 'standard' : (row.order_type || "standard"),
    status: row.status || "pending",
    packing_status: row.status === "cancelled" ? "not_required" : (row.packing_status || "unpacked"),
    packed_at: row.packed_at || null,
    packed_by: row.packed_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    shipping: {
      name: shipping.name || row.customer_name || "Customer",
      phone: shipping.phone || "",
      line1: shipping.line1 || "",
      line2: shipping.line2 || "",
      city: shipping.city || "",
      state: shipping.state || "",
      pin: shipping.pin || "",
      country: shipping.country || "India"
    },
    items: Array.isArray(rawItems) ? rawItems.map((item) => ({
      id: item.id || item.product_id || "",
      name: item.name || item.product_name || item.title || item.id || "Product",
      quantity: Math.max(1, Number(item.quantity) || 1),
      size: item.size || "",
      color: item.color || item.colour || "",
      variant: item.variant || "",
      image: item.image || item.image_url || item.thumbnail_url || "",
      preorder: Boolean(item.preorder)
    })) : []
  };
}

const EMPLOYEE_ORDER_SELECT = `
  SELECT id, order_number, customer_name, customer_email, items_json, total,
    payment_status, order_type, replacement_fulfilment_mode, replacement_request_id, status, packing_status, packed_at, packed_by,
    shipping_json, created_at, updated_at
  FROM orders
`;

async function listEmployeeOrders(env, status, _employeeSession) {
  const normalizedStatus = ["unpacked", "packed", "all"].includes(status) ? status : "unpacked";
  const conditions = ["status != 'cancelled'", "payment_status IN ('paid', 'not_required')", replacementFulfilmentPredicate()];
  const bindings = [];
  if (normalizedStatus !== "all") {
    conditions.push("packing_status = ?");
    bindings.push(normalizedStatus);
  }
  const { results } = await env.DB.prepare(`${EMPLOYEE_ORDER_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT 500`)
    .bind(...bindings).all();
  return json({ orders: results.map(formatEmployeeOrder), status: normalizedStatus });
}

async function getEmployeeOrder(env, id, _employeeSession) {
  const row = await env.DB.prepare(`${EMPLOYEE_ORDER_SELECT} WHERE id = ? OR order_number = ? LIMIT 1`).bind(id, id).first();
  if (!row || row.status === "cancelled") return json({ error: "Order not found" }, 404);
  if (!["paid", "not_required"].includes(row.payment_status)) return json({ error: "Payment must be confirmed before packing this order" }, 409);
  if (row.order_type==='replacement' && !await replacementReleased(env,row)) return json({error:"Replacement is held until the return is received"},409);
  return json({ order: formatEmployeeOrder(row) });
}

function replacementFulfilmentPredicate() {
  return "(orders.order_type!='replacement' OR EXISTS(SELECT 1 FROM return_requests r WHERE r.id=orders.replacement_request_id AND ((orders.replacement_fulfilment_mode='immediate' AND r.status IN ('approved','received','completed')) OR (r.status IN ('received','completed') AND r.returned_at IS NOT NULL))))";
}

async function replacementReleased(env,order) {
  return Boolean(await env.DB.prepare("SELECT id FROM return_requests WHERE id=? AND ((?='immediate' AND status IN ('approved','received','completed')) OR (status IN ('received','completed') AND returned_at IS NOT NULL))").bind(order.replacement_request_id,order.replacement_fulfilment_mode||'after_receipt').first());
}

async function writeEmployeeAuditLog(env, employeeId, action, orderId, details = {}) {
  try {
    await env.DB.prepare("INSERT INTO employee_audit_log (id, employee_id, action, order_id, details_json) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), employeeId, action, orderId || null, JSON.stringify(details)).run();
  } catch (error) {
    console.error("employee_audit_log_write_failed", { action, order_id: orderId || null, error: String(error?.message || error || "Unknown error").slice(0, 300) });
  }
}

async function markEmployeeOrderPacked(env, id, employeeSession) {
  const current = await env.DB.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1").bind(id, id).first();
  if (!current) return json({ error: "Order not found" }, 404);
  if (current.status === "cancelled") return json({ error: "Cancelled orders cannot be packed" }, 409);
  if (current.order_type==='replacement' && !await replacementReleased(env,current)) return json({error:"Replacement is held until the return is received"},409);
  if (!["paid", "not_required"].includes(current.payment_status)) return json({ error: "Payment must be confirmed before packing this order" }, 409);
  if (current.packing_status === "packed") return json({ order: formatEmployeeOrder(current), already_packed: true });
  const result = await env.DB.prepare(`
    UPDATE orders
    SET packing_status = 'packed', packed_at = CURRENT_TIMESTAMP, packed_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status != 'cancelled' AND payment_status IN ('paid', 'not_required') AND packing_status = 'unpacked'
      AND ${replacementFulfilmentPredicate()}
  `).bind(employeeSession.employee.id, current.id).run();
  if (!Number(result.meta?.changes || 0)) {
    const latest = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(current.id).first();
    if (latest?.packing_status === "packed" && latest.status !== "cancelled" && ["paid", "not_required"].includes(latest.payment_status)) return json({ order: formatEmployeeOrder(latest), already_packed: true });
    return json({ error: "Order could not be marked packed. Refresh and try again." }, 409);
  }
  const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(current.id).first();
  await writeEmployeeAuditLog(env, employeeSession.employee.id, "mark_order_packed", current.id, {
    order_number: updated.order_number || updated.id
  });
  await createAdminNotification(env, {
    type: "order_packed",
    priority: "high",
    title: "Order packed",
    message: `${updated.order_number || updated.id} packed by ${employeeSession.employee.name}`,
    dedupeKey: `order-packed:${current.id}`,
    orderId: current.id
  }).catch(() => null);
  await createCustomerNotification(env, {
    email: updated.customer_email,
    type: "order_packed",
    title: "Your order is packed",
    message: `${updated.order_number || updated.id} has been packed and is being prepared for dispatch.`,
    orderId: current.id,
    dedupeKey: `customer-order:${current.id}:packed`
  }).catch(() => null);
  return json({ order: formatEmployeeOrder(updated), already_packed: false });
}

function invoiceLineItems(order) {
  const subtotal = Math.max(0, Number(order.subtotal || 0));
  const discount = Math.max(0, Number(order.discount || 0));
  return (order.items || []).map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const gross = Math.max(0, Number(item.price || 0) * quantity);
    const discountShare = subtotal > 0 ? Math.min(gross, discount * (gross / subtotal)) : 0;
    const net = Math.max(0, gross - discountShare);
    const code = String(item.hsn_sac_code || "").trim().toUpperCase();
    const codeType = String(item.hsn_sac_type || "HSN").trim().toUpperCase() === "SAC" ? "SAC" : "HSN";
    const rateValue = item.gst_rate === null || item.gst_rate === undefined || item.gst_rate === "" ? null : Number(item.gst_rate);
    const rate = Number.isFinite(rateValue) ? rateValue : null;
    const inclusive = item.gst_tax_inclusive === undefined || item.gst_tax_inclusive === null ? true : Boolean(item.gst_tax_inclusive);
    const ready = Boolean(code) && rate !== null;
    const taxable = ready ? (inclusive ? net / (1 + rate / 100) : net) : 0;
    const tax = ready ? (inclusive ? net - taxable : taxable * rate / 100) : 0;
    return {
      name: item.name || item.product_name || item.id || "Product",
      selection: [item.size, item.variant, item.color].filter(Boolean).join(" · "),
      quantity,
      code,
      codeType,
      rate,
      gross: roundTax(gross),
      taxable: roundTax(taxable),
      tax: roundTax(tax),
      ready
    };
  });
}

async function orderInvoiceResponse(env, user, id, accessToken = "") {
  const row = await env.DB.prepare(`
    SELECT * FROM orders
    WHERE (id = ? OR order_number = ?)
      AND NOT ${paymentIncompleteOrderPredicate("orders", true)}
    LIMIT 1
  `).bind(id, id).first();
  if (!row) return new Response("Order not found", { status: 404 });
  const isAdmin = user?.role === "admin";
  const tokenMatches = accessToken && String(row.tracking_token || "") === String(accessToken).trim();
  const ownerMatches = user && String(row.customer_email || "").trim().toLowerCase() === String(user.email || "").trim().toLowerCase();
  if (!isAdmin && !ownerMatches && !tokenMatches) {
    return new Response("Not found", { status: 404 });
  }
  const taxSettings = await env.DB.prepare("SELECT business_state, business_state_code, gstin FROM tax_settings WHERE id = 1").first();
  const order = formatOrder(row);
  const lines = invoiceLineItems(order);
  const classification = classifyTaxState(order.shipping?.state, taxSettings);
  const taxable = roundTax(lines.reduce((sum, line) => sum + line.taxable, 0));
  const tax = roundTax(lines.reduce((sum, line) => sum + line.tax, 0));
  const cgst = classification === "intra_state" ? roundTax(tax / 2) : 0;
  const sgst = classification === "intra_state" ? roundTax(tax - cgst) : 0;
  const igst = classification === "inter_state" ? tax : 0;
  const shipping = order.shipping || {};
  const buyerAddress = [shipping.line1, shipping.line2, shipping.city, shipping.state, shipping.pin, shipping.country || "India"].filter(Boolean).join(", ");
  const missingTax = lines.some((line) => !line.ready) || classification === "unclassified";
  const demoDocument = ["demo", "cod", "replacement"].includes(String(row.payment_method || "").trim().toLowerCase());
  const previewDocument = demoDocument || missingTax;
  const taxableLabel = missingTax ? "Taxable value (configured lines)" : "Taxable value";
  const lineMarkup = lines.map((line) => `<tr><td><strong>${escapeHtml(line.name)}</strong>${line.selection ? `<small>${escapeHtml(line.selection)}</small>` : ""}</td><td>${line.quantity}</td><td>${escapeHtml(line.codeType)} ${escapeHtml(line.code || "—")}</td><td>${line.rate === null ? "—" : `${line.rate}%`}</td><td>${line.ready ? formatInr(line.taxable) : "—"}</td><td>${line.ready ? formatInr(line.tax) : "—"}</td><td>${formatInr(line.gross)}</td></tr>`).join("");
  const taxSummary = classification === "intra_state"
    ? `<tr><td>CGST</td><td>${formatInr(cgst)}</td></tr><tr><td>SGST</td><td>${formatInr(sgst)}</td></tr>`
    : classification === "inter_state"
      ? `<tr><td>IGST</td><td>${formatInr(igst)}</td></tr>`
      : `<tr><td>GST status</td><td>${tax ? formatInr(tax) : "Pending tax setup"}</td></tr>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(order.order_number)} · Glamia</title><style>body{margin:0;background:#f4f1eb;color:#242520;font:14px/1.5 Arial,sans-serif}.sheet{max-width:920px;margin:28px auto;padding:42px;background:#fff}@media(max-width:700px){.sheet{margin:0;padding:22px 16px}table{font-size:11px}}.top,.meta,.totals{display:flex;justify-content:space-between;gap:24px}.brand{letter-spacing:.28em;font-size:24px;margin:0 0 6px}.muted{color:#6e7069}.notice{border:1px solid #b56a4d;background:#fff6f0;padding:12px;margin:24px 0}.meta{border-top:1px solid #d8d4cb;border-bottom:1px solid #d8d4cb;padding:18px 0;margin:25px 0}.meta div{min-width:0}.meta strong,.meta span{display:block}.meta span{white-space:pre-wrap}.order-table{width:100%;border-collapse:collapse;margin:20px 0}.order-table th,.order-table td{padding:10px 7px;border-bottom:1px solid #e1ddd5;text-align:right;vertical-align:top}.order-table th:first-child,.order-table td:first-child{text-align:left}.order-table small{display:block;color:#6e7069}.totals{justify-content:flex-end}.totals table{min-width:290px;border-collapse:collapse}.totals td{padding:5px 0}.totals td:last-child{text-align:right}.grand{font-size:18px;border-top:1px solid #242520}.footer{margin-top:36px;padding-top:16px;border-top:1px solid #d8d4cb;color:#6e7069;font-size:12px}button{background:#242520;color:#fff;border:0;padding:10px 16px;cursor:pointer}@media print{body{background:#fff}.sheet{margin:0;max-width:none;padding:0}button{display:none}.notice{background:#fff}}</style></head><body><main class="sheet"><div class="top"><div><p class="brand">GLAMIA</p><span class="muted">Fashion, considered.</span></div><div style="text-align:right"><strong>${previewDocument ? "DEMO INVOICE PREVIEW" : "INVOICE PREVIEW"}</strong><br><span class="muted">${escapeHtml(order.order_number)}</span><br><button onclick="window.print()">Print / save PDF</button></div></div>${previewDocument ? `<div class="notice"><strong>Demo tax document — not a production tax invoice.</strong><br>Confirm GST classification, place of supply, invoice numbering, and tax treatment with your CA before enabling live payments.</div>` : ""}<div class="meta"><div><strong>Bill to</strong><span>${escapeHtml(order.customer_name || "Customer")}</span><span>${escapeHtml(order.customer_email || "")}</span><span>${escapeHtml(buyerAddress || "Address not supplied")}</span></div><div><strong>Order date</strong><span>${escapeHtml(formatOrderDate(order.created_at))}</span><strong style="margin-top:10px">Payment</strong><span>${escapeHtml(formatPaymentMethod(order.payment_method))} · ${escapeHtml(order.payment_status || "pending")}</span></div><div><strong>Seller</strong><span>Glamia</span><span>${escapeHtml(taxSettings?.business_state || "Business state not configured")}</span><span>${taxSettings?.gstin ? `GSTIN: ${escapeHtml(taxSettings.gstin)}` : "GSTIN not configured"}</span></div></div><table class="order-table"><thead><tr><th>Item</th><th>Qty</th><th>HSN/SAC</th><th>GST</th><th>Taxable</th><th>Tax</th><th>Amount</th></tr></thead><tbody>${lineMarkup || `<tr><td colspan="7">No line items</td></tr>`}</tbody></table><div class="totals"><table><tr><td>Subtotal</td><td>${formatInr(order.subtotal)}</td></tr><tr><td>Discount</td><td>−${formatInr(order.discount)}</td></tr><tr><td>Taxable value</td><td>${formatInr(taxable)}</td></tr>${taxSummary}<tr class="grand"><td><strong>Total</strong></td><td><strong>${formatInr(order.total)}</strong></td></tr>${order.credits_used ? `<tr><td>Store credits used</td><td>−${formatInr(order.credits_used)}</td></tr><tr><td>Paid by ${escapeHtml(formatPaymentMethod(order.payment_method))}</td><td>${formatInr(order.payable_total)}</td></tr>` : ""}</table></div><p class="footer">Place of supply: ${escapeHtml(shipping.state || "Not supplied")} · Classification: ${escapeHtml(classification.replace("_", " "))}. This preview reflects the tax codes and rates saved on the order at checkout.</p></main></body></html>`;
  const invoiceDocument = html
    .replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="/invoice.css">')
    .replace('<div style="text-align:right"><strong>', '<div class="invoice-top-actions"><span class="invoice-document-label">')
    .replace('</strong><br><span class="muted">', '</span><span class="invoice-number">')
    .replace('</span><br><button onclick="window.print()">', '</span><button onclick="window.print()">')
    .replace('<strong style="margin-top:10px">', '<strong>')
    .replace('<td>Taxable value</td>', `<td>${taxableLabel}</td>`)
    .replace('<p class="brand">GLAMIA</p>', '<div class="brand" aria-label="Glamia"><img src="/glamia-g-favicon.png" alt="Glamia logo" width="48" height="48"><span aria-hidden="true">LAMIA</span></div>')
    .replace('<button onclick="window.print()">', '<button type="button" id="invoice-print">')
    .replace('</body>', '<script src="/invoice.js" defer></script></body>');
  return new Response(invoiceDocument, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "Content-Disposition": `inline; filename="glamia-invoice-${String(order.order_number || id).replace(/[^A-Za-z0-9_-]/g, "-")}.html"`,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function orderBillResponse(env, user, id, accessToken = "") {
  const record = await env.DB.prepare(`SELECT b.*, o.customer_email, o.tracking_token FROM order_bills b
    JOIN orders o ON o.id = b.order_id WHERE o.id = ? OR o.order_number = ? LIMIT 1`).bind(id, id).first();
  if (!record || !canReadOrderBill(record, user, accessToken)) return new Response("Bill not found", { status: 404 });
  const order = formatOrder(JSON.parse(record.snapshot_json));
  const [fontBytes, logoBytes] = await Promise.all([billFontBytes(env), billLogoBytes(env)]);
  const bytes = await createOrderBillPdf({ order, seller: JSON.parse(record.seller_json), issuedAt: record.issued_at,
    fontBytes, logoBytes, lines: invoiceLineItems(order) });
  return new Response(bytes, { headers: {
    "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="Glamia-bill-${record.bill_number.replace(/[^A-Za-z0-9_-]/g, "-")}.pdf"`
  } });
}

async function trackPublicOrder(env, rawOrderId, rawEmail) {
  const orderId = String(rawOrderId || "").trim();
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!orderId || orderId.length > 100) return json({ error: "Enter an order ID to track" }, 400);
  if (email.length > 254) return json({ error: "Enter a valid email address" }, 400);
  const row = await env.DB.prepare(`
    SELECT id, order_number, items_json, status, payment_method, tracking_number,
      order_type, payment_status, total, payable_total, credits_used, payment_gateway, created_at, updated_at
    FROM orders
    WHERE (tracking_token = ?
      OR ((order_number = ? OR id = ?) AND customer_email = ?))
      AND NOT ${paymentIncompleteOrderPredicate("orders", true)}
    LIMIT 1
  `).bind(orderId, orderId, orderId, email).first();
  if (!row) return json({ error: "We could not find an order with that ID" }, 404);
  let rawItems = [];
  try { rawItems = JSON.parse(row.items_json || "[]"); } catch { rawItems = []; }
  const [safeOrder]=await attachCancellationRefunds(env,[row]);
  return json({ order: {
    order_number: row.order_number || fallbackOrderNumber(row),
    status: row.status || "pending",
    payment_method: formatPaymentMethod(row.payment_method),
    tracking_number: row.tracking_number || "",
    order_type: row.order_type || "standard",
    created_at: row.created_at,
    updated_at: row.updated_at,
    cancellation_refund: safeOrder.cancellation_refund || null,
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
  const visibility = "('glamia', 'wibrawl', 'both')";
  const { results } = await env.DB.prepare(`SELECT * FROM products WHERE status = 'live' AND COALESCE(storefront_visibility, 'glamia') IN ${visibility} AND id IN (${placeholders})`)
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

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")))));
}

async function sha256Hex(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")))));
}

function safeEqualText(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function paymentSiteOrigin(request, env) {
  const url = new URL(request.url);
  if (url.hostname === WIBRAWL_HOSTNAME) return WIBRAWL_ORIGIN;
  const configured = String(env.PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (/^https:\/\//i.test(configured)) return configured;
  return PRODUCTION_HOSTNAMES.has(url.hostname) ? CANONICAL_ORIGIN : url.origin;
}

function providerError(response, provider) {
  return response.json().catch(() => ({})).then((data) => {
    const detail = String(data?.error?.description || data?.message || data?.code || "").trim();
    const error = new Error(`${provider} could not start this payment${detail ? `: ${detail}` : ""}`);
    error.status = 502;
    return error;
  });
}

async function razorpayRequest(env, path, init = {}) {
  const keyId = String(env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) throw httpError("Razorpay is not configured on this deployment", 503);
  const auth = btoa(`${keyId}:${keySecret}`);
  return fetch(`${RAZORPAY_API_BASE}${path}`, {
    ...init,
    signal: init.signal || AbortSignal.timeout(10000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      ...(init.headers || {})
    }
  });
}

async function phonePeAccessToken(env) {
  const environment = String(env.PHONEPE_ENV || "sandbox").trim().toLowerCase() === "production" ? "production" : "sandbox";
  if (phonePeTokenCache.environment === environment && phonePeTokenCache.token && phonePeTokenCache.expiresAt > Date.now() + 60_000) {
    return phonePeTokenCache.token;
  }
  const clientId = String(env.PHONEPE_CLIENT_ID || "").trim();
  const clientSecret = String(env.PHONEPE_CLIENT_SECRET || "").trim();
  const clientVersion = String(env.PHONEPE_CLIENT_VERSION || "").trim();
  if (!clientId || !clientSecret || !clientVersion) throw httpError("PhonePe is not configured on this deployment", 503);
  const tokenResponse = await fetch(environment === "production" ? PHONEPE_PRODUCTION_TOKEN_URL : PHONEPE_SANDBOX_TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: clientId, client_version: clientVersion, client_secret: clientSecret, grant_type: "client_credentials" })
  });
  const data = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !data.access_token) throw httpError("PhonePe authorization failed. Check the PhonePe credentials and environment.", 502);
  phonePeTokenCache = {
    environment,
    token: String(data.access_token),
    expiresAt: Number(data.expires_at || 0) * 1000 || Date.now() + 10 * 60_000
  };
  return phonePeTokenCache.token;
}

async function phonePeRequest(env, path, init = {}) {
  const environment = String(env.PHONEPE_ENV || "sandbox").trim().toLowerCase() === "production" ? "production" : "sandbox";
  const base = environment === "production" ? PHONEPE_PRODUCTION_BASE : PHONEPE_SANDBOX_BASE;
  const token = await phonePeAccessToken(env);
  return fetch(`${base}${path}`, {
    ...init,
    signal: init.signal || AbortSignal.timeout(10000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `O-Bearer ${token}`,
      ...(init.headers || {})
    }
  });
}

async function failGatewayOrder(env, orderId, reference = "") {
  const changed = await applyGatewayState(env.DB, orderId, { status: "failed", reference });
  invalidateProductEnrichment();
  if (!changed) return;
  const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM customer_notifications WHERE order_id = ? AND type = 'order_placed'").bind(orderId),
    env.DB.prepare("DELETE FROM admin_notifications WHERE order_id = ? AND type = 'new_order'").bind(orderId)
  ]);
  await createAdminNotification(env, {
    type: "cancelled_order",
    priority: "normal",
    title: "Payment incomplete — order cancelled",
    message: `${updated.customer_name || updated.customer_email} · ${updated.order_number || updated.id}`,
    dedupeKey: `cancelled-payment:${orderId}`,
    orderId
  }).catch(() => null);
  await createCustomerNotification(env, {
    email: updated.customer_email,
    type: "order_payment_cancelled",
    title: "Payment not completed",
    message: `${updated.order_number || updated.id} was cancelled because the payment was not completed.`,
    orderId,
    dedupeKey: `customer-order:${orderId}:payment-cancelled`
  }).catch(() => null);
}

async function settleGatewayPayment(env, row, { status, paymentId = "", amount = null, reference = "", ctx = null } = {}) {
  if (!row) return null;
  const expectedAmount = Math.round(Number(row.payable_total ?? row.total ?? 0) * 100);
  if ((["paid", "authorized"].includes(status) && amount == null)
    || (amount != null && (!Number.isSafeInteger(Number(amount)) || Number(amount) !== expectedAmount))) {
    console.error("payment_amount_mismatch", { order_id: row.id, expected: expectedAmount, received: amount });
    throw httpError("Payment amount did not match this order. Please contact support for reconciliation.", 422);
  }
  const currentStatus = String(row.payment_status || "pending").trim().toLowerCase();
  if (status === "paid") {
    if (row.status === "cancelled") { await notifyLateGatewayPayment(env, row, paymentId, true); const latest=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(row.id).first();return (await attachCancellationRefunds(env,[formatOrder(latest)]))[0]; }
    if (currentStatus === "refunded") return formatOrder(row);
    if (currentStatus === "paid") {
      await notifyOrderPlaced(env, row, ctx);
      // Retry the durable side-effect, not the capture, if an earlier request
      // stopped after committing payment but before queuing its confirmation.
      if (!row.confirmation_email_sent_at) {
        const sent = await sendOrderEmail(env, row, "confirmation", { ctx });
        if (sent) await env.DB.prepare("UPDATE orders SET confirmation_email_sent_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
      }
      return formatPaymentOrder(env, row);
    }
    const changed = await applyGatewayState(env.DB, row.id, { status, paymentId, reference });
    const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(row.id).first();
    if (updated?.status === "cancelled") await notifyLateGatewayPayment(env, updated, paymentId, true);
    if (!changed || updated?.payment_status !== "paid" || updated.status === "cancelled") return updated ? formatPaymentOrder(env, updated) : null;
    await qualifyCreditReferral(env, updated);
    await notifyOrderPlaced(env, updated, ctx);
    if (updated && !updated.confirmation_email_sent_at) {
      const sent = await sendOrderEmail(env, updated, "confirmation", { ctx });
      if (sent) await env.DB.prepare("UPDATE orders SET confirmation_email_sent_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
    }
    return formatPaymentOrder(env, updated);
  }
  if (status === "authorized") {
    if (currentStatus === "paid" || row.status === "cancelled") return formatOrder(row);
    await applyGatewayState(env.DB, row.id, { status, paymentId, reference });
    const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(row.id).first();
    return formatOrder(updated);
  }
  if (status === "failed" && currentStatus !== "paid" && currentStatus !== "refunded") {
    await failGatewayOrder(env, row.id, paymentId || reference);
    const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(row.id).first();
    return formatOrder(updated);
  }
  return formatOrder(row);
}

async function paymentOrderForRequest(request, env, user, orderId, checkoutToken = "") {
  const normalizedId = String(orderId || "").trim();
  if (!normalizedId || normalizedId.length > 100) return null;
  if (user?.email) {
    return env.DB.prepare("SELECT * FROM orders WHERE id = ? AND customer_email = ? AND status != 'cancelled' LIMIT 1")
      .bind(normalizedId, String(user.email).trim().toLowerCase()).first();
  }
  const token = String(checkoutToken || "").trim();
  if (!token) return null;
  return env.DB.prepare("SELECT * FROM orders WHERE id = ? AND checkout_token = ? AND status != 'cancelled' LIMIT 1")
    .bind(normalizedId, token).first();
}

async function createRazorpayPayment(request, env, row) {
  const response = await razorpayRequest(env, "/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: Math.round(Number(row.payable_total ?? row.total ?? 0) * 100),
      currency: "INR",
      receipt: String(row.order_number || row.id).slice(0, 40),
      notes: { glamia_order_id: row.id }
    })
  });
  if (!response.ok) throw await providerError(response, "Razorpay");
  const paymentOrder = await response.json();
  if (!paymentOrder?.id || paymentOrder.currency !== "INR"
    || Number(paymentOrder.amount) !== Math.round(Number(row.payable_total ?? row.total) * 100)) {
    throw httpError("Razorpay returned an invalid order", 502);
  }
  await env.DB.prepare(`
    UPDATE orders
    SET gateway_order_id = ?, payment_creation_state = 'ready', payment_updated_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND payment_creation_claim = ? AND (gateway_order_id IS NULL OR gateway_order_id = ?)
  `).bind(paymentOrder.id, new Date().toISOString(), row.id, row.payment_creation_claim, paymentOrder.id).run();
  return {
    provider: "razorpay",
    key_id: String(env.RAZORPAY_KEY_ID),
    order_id: paymentOrder.id,
    amount: Number(paymentOrder.amount),
    currency: paymentOrder.currency || "INR",
    checkout_script: RAZORPAY_CHECKOUT_SCRIPT
  };
}

async function createPhonePePayment(request, env, row) {
  const merchantOrderId = `PP-${String(row.id).replace(/-/g, "").slice(0, 55)}`;
  // Persist our deterministic merchant reference before contacting PhonePe so
  // even a timeout/cancellation can be mapped by its authenticated callback.
  await env.DB.prepare("UPDATE orders SET gateway_order_id = ? WHERE id = ? AND payment_creation_claim = ? AND gateway_order_id IS NULL")
    .bind(merchantOrderId, row.id, row.payment_creation_claim).run();
  const redirectUrl = `${paymentSiteOrigin(request, env)}/checkout?phonepe_return=${encodeURIComponent(row.id)}&checkout_token=${encodeURIComponent(row.checkout_token || "")}`;
  const response = await phonePeRequest(env, "/checkout/v2/pay", {
    method: "POST",
    body: JSON.stringify({
      merchantOrderId,
      amount: Math.round(Number(row.payable_total ?? row.total ?? 0) * 100),
      expireAfter: 1800,
      paymentFlow: { type: "PG_CHECKOUT", merchantUrls: { redirectUrl } },
      metaInfo: { udf1: row.id, udf2: row.order_number || "" }
    })
  });
  if (!response.ok) throw await providerError(response, "PhonePe");
  const paymentOrder = await response.json();
  const checkoutUrl = String(paymentOrder?.redirectUrl || "").trim();
  if (!paymentOrder?.orderId || !/^https:\/\//i.test(checkoutUrl)) throw httpError("PhonePe did not return a valid checkout session", 502);
  await env.DB.prepare("INSERT OR IGNORE INTO payment_reconciliation_events(id,provider,provider_order_id,internal_order_id,event_type,amount_paise,currency) VALUES (?,'phonepe',?,?,'session_created',?,'INR')")
    .bind(`phonepe-session:${row.id}`, String(paymentOrder.orderId), row.id, Math.round(Number(row.payable_total ?? row.total) * 100)).run();
  await env.DB.prepare(`
    UPDATE orders
    SET gateway_order_id = ?, gateway_checkout_url = ?, payment_creation_state = 'ready',
      payment_updated_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND payment_creation_claim = ? AND gateway_order_id = ?
  `).bind(merchantOrderId, checkoutUrl, new Date().toISOString(), row.id, row.payment_creation_claim, merchantOrderId).run();
  return {
    provider: "phonepe",
    merchant_order_id: merchantOrderId,
    checkout_url: checkoutUrl,
    expires_at: paymentOrder.expireAt || null
  };
}

async function createGatewayPayment(request, env, user) {
  const body = await readJson(request);
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(String(body.checkout_token || "").trim())) {
    throw httpError("A checkout session token is required. Refresh checkout and try again.", 400);
  }
  const provider = String(body.payment_method || "").trim().toLowerCase();
  if (!["razorpay", "phonepe", "store_credit"].includes(provider)) throw httpError("Choose a valid payment method", 400);
  const localResponse = await createOrder(null, env, user, { allowGateway: true, body });
  const localData = await localResponse.json().catch(() => ({}));
  if (!localResponse.ok) return json(localData, localResponse.status);
  const order = localData.order;
  const row = await env.DB.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").bind(order?.id).first();
  if (!row) throw httpError("The payment order could not be prepared", 500);
  if (Number(row.payable_total ?? row.total) === 0) {
    await notifyOrderPlaced(env, row);
    const sent = await sendOrderEmail(env, row, "confirmation");
    if (sent) await env.DB.prepare("UPDATE orders SET confirmation_email_sent_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
    return json({ order: await formatPaymentOrder(env, row), payment_status: "paid" }, localData.idempotent ? 200 : 201);
  }
  if (row.payment_gateway !== provider) throw httpError("The payment order could not be prepared", 409);
  if (row.payment_status === "paid") return json({ order: await formatPaymentOrder(env, row), payment_status: "paid" });
  if (row.status === "cancelled" || !["pending", "authorized"].includes(row.payment_status)) {
    throw httpError("This payment attempt is closed. Start a new checkout attempt.", 409);
  }
  if (["creating", "uncertain"].includes(row.payment_creation_state)) {
    throw httpError("Payment preparation is in progress or awaiting reconciliation. Do not start another payment; check this order with support.", 409);
  }

  if (provider === "razorpay" && row.gateway_order_id) {
    return json({ order: formatOrder(row), payment: { provider, key_id: String(env.RAZORPAY_KEY_ID), order_id: row.gateway_order_id, amount: Math.round(Number(row.payable_total ?? row.total ?? 0) * 100), currency: "INR", checkout_script: RAZORPAY_CHECKOUT_SCRIPT } });
  }
  if (provider === "phonepe" && row.gateway_checkout_url) {
    return json({ order: formatOrder(row), payment: { provider, merchant_order_id: row.gateway_order_id, checkout_url: row.gateway_checkout_url } });
  }

  const claim = await claimPaymentCreation(env.DB, row.id, provider);
  if (!claim) throw httpError("Payment preparation is already in progress. Check this order again shortly.", 409);
  row.payment_creation_claim = claim;
  try {
    const payment = provider === "razorpay"
      ? await createRazorpayPayment(request, env, row)
      : await createPhonePePayment(request, env, row);
    const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(row.id).first();
    if (updated.status === "cancelled") throw httpError("This order was cancelled during payment preparation. Contact support; do not pay.", 409);
    if (updated.payment_status === "paid") return json({ order: await formatPaymentOrder(env, updated), payment_status: "paid" });
    return json({ order: formatOrder(updated), payment }, localData.idempotent ? 200 : 201);
  } catch (error) {
    // A failed response does not prove the provider rejected its POST. Retain
    // the claim and reservation; only verified reconciliation may release it.
    await env.DB.prepare("UPDATE orders SET payment_creation_state = 'uncertain' WHERE id = ? AND payment_creation_claim = ? AND payment_creation_state = 'creating'")
      .bind(row.id, claim).run();
    await createAdminNotification(env, { type: "cancelled_order", priority: "urgent", title: "Payment session needs reconciliation",
      message: `${row.order_number || row.id}: ${provider} session creation could not be safely confirmed. Check the provider before cancelling or retrying.`,
      dedupeKey: `payment-creation:${row.id}`, orderId: row.id });
    throw error;
  }
}

async function verifyRazorpayPayment(request, env, user, ctx = null) {
  const body = await readJson(request);
  const order = await paymentOrderForRequest(request, env, user, body.order_id, body.checkout_token);
  if (!order || order.payment_gateway !== "razorpay") return json({ error: "Payment order not found" }, 404);
  const paymentId = String(body.razorpay_payment_id || "").trim();
  const returnedOrderId = String(body.razorpay_order_id || "").trim();
  const signature = String(body.razorpay_signature || "").trim();
  if (!paymentId || !returnedOrderId || !signature || returnedOrderId !== String(order.gateway_order_id || "")) {
    return json({ error: "Razorpay payment response is invalid" }, 400);
  }
  const expected = await hmacHex(`${order.gateway_order_id}|${paymentId}`, env.RAZORPAY_KEY_SECRET);
  if (!safeEqualText(expected, signature)) return json({ error: "Razorpay payment verification failed" }, 400);
  const response = await razorpayRequest(env, `/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
  if (!response.ok) return json({ error: "Razorpay payment status could not be checked. Your payment will be reconciled automatically." }, 502);
  const payment = await response.json().catch(() => ({}));
  if (String(payment.id || "") !== paymentId || String(payment.order_id || "") !== String(order.gateway_order_id || "") || payment.currency !== "INR") {
    return json({ error: "Razorpay payment details did not match this order" }, 400);
  }
  const amount = Number(payment.amount);
  const paymentStatus = String(payment.status || "").toLowerCase();
  const nextStatus = paymentStatus === "captured" ? "paid" : paymentStatus === "authorized" ? "authorized" : paymentStatus === "failed" ? "failed" : "pending";
  const updated = await settleGatewayPayment(env, order, { status: nextStatus, paymentId, amount, ctx });
  if (nextStatus === "pending") return json({ order: updated, payment_status: "pending" }, 202);
  return json({ order: updated, payment_status: updated?.payment_status || "pending" });
}

async function getPhonePePaymentStatus(request, env, user, url, ctx = null) {
  const orderId = url.searchParams.get("order_id") || url.searchParams.get("local_order_id");
  const checkoutToken = url.searchParams.get("checkout_token") || "";
  const order = await paymentOrderForRequest(request, env, user, orderId, checkoutToken);
  if (!order || order.payment_gateway !== "phonepe") return json({ error: "Payment order not found" }, 404);
  if (String(order.payment_status || "").toLowerCase() === "paid") return json({ order: await formatPaymentOrder(env, order), payment_status: "paid" });
  const merchantOrderId = String(order.gateway_order_id || "").trim();
  if (!merchantOrderId) return json({ error: "PhonePe payment session is not ready" }, 409);
  const response = await phonePeRequest(env, `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false&errorContext=true`, { method: "GET" });
  if (!response.ok) return json({ error: "PhonePe payment status could not be checked. Please try again." }, 502);
  const status = await response.json().catch(() => ({}));
  if (status.merchantOrderId && status.merchantOrderId !== merchantOrderId) throw httpError("PhonePe order mapping did not match", 422);
  await verifyPhonePeSessionIdentity(env, order.id, status);
  const state = String(status.state || "PENDING").toUpperCase();
  const paymentDetail = Array.isArray(status.paymentDetails) ? status.paymentDetails.at(-1) : null;
  const paymentId = String(paymentDetail?.transactionId || "").trim();
  const nextStatus = state === "COMPLETED" ? "paid" : state === "FAILED" ? "failed" : "pending";
  if (nextStatus === "paid" && !paymentId) throw httpError("PhonePe payment reference is missing; reconcile this payment before fulfilment", 422);
  const updated = await settleGatewayPayment(env, order, { status: nextStatus, paymentId, amount: status.amount == null ? null : Number(status.amount), ctx });
  if (nextStatus === "pending") return json({ order: updated, payment_status: "pending", provider_state: state }, 202);
  return json({ order: updated, payment_status: updated?.payment_status || "pending", provider_state: state });
}

async function handleRazorpayWebhook(request, env) {
  const secret = String(env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) return json({ error: "Webhook secret is not configured" }, 503);
  const rawBody = new TextDecoder().decode(await readBoundedBody(request, 1024 * 1024));
  const signature = String(request.headers.get("X-Razorpay-Signature") || "").trim();
  const expected = await hmacHex(rawBody, secret);
  if (!signature || !safeEqualText(expected, signature)) return json({ error: "Invalid webhook signature" }, 401);
  const payload = parseWebhookJson(rawBody);
  const event = String(payload.event || "").trim().toLowerCase();
  const payment = payload.payload?.payment?.entity || {};
  const providerOrder = payload.payload?.order?.entity || {};
  const providerOrderId = String(payment.order_id || providerOrder.id || "").trim();
  if (!providerOrderId) return json({ ok: true });
  let row = await env.DB.prepare("SELECT * FROM orders WHERE payment_gateway = 'razorpay' AND gateway_order_id = ? LIMIT 1").bind(providerOrderId).first();
  if (!row) {
    // A provider may accept creation before our POST times out. Its signed notes
    // can recover that mapping, but never replace an existing provider reference.
    const internalId = String(payment.notes?.glamia_order_id || providerOrder.notes?.glamia_order_id || "");
    const candidate = internalId ? await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND payment_gateway = 'razorpay' AND payment_creation_state IN ('creating','uncertain') AND gateway_order_id IS NULL")
      .bind(internalId).first() : null;
    if (candidate && payment.currency === "INR" && Number(payment.amount) === Math.round(Number(candidate.payable_total ?? candidate.total) * 100)) {
      await env.DB.prepare("UPDATE orders SET gateway_order_id = ?, payment_creation_state = 'ready' WHERE id = ? AND gateway_order_id IS NULL AND payment_creation_state IN ('creating','uncertain')")
        .bind(providerOrderId, candidate.id).run();
      row = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND gateway_order_id = ?").bind(candidate.id, providerOrderId).first();
    }
    if (!row) {
      await recordUnmappedPayment(env, "razorpay", providerOrderId, payment.id, event, payment.amount ?? providerOrder.amount, payment.currency ?? providerOrder.currency);
      return json({ ok: true, reconciliation_required: true });
    }
  }
  const status = event === "payment.captured" || event === "order.paid" ? "paid" : event === "payment.authorized" ? "authorized" : event === "payment.failed" ? "failed" : "pending";
  if (["paid", "authorized"].includes(status) && String(payment.currency || providerOrder.currency || "") !== "INR") throw httpError("Webhook currency did not match this order", 422);
  if (["paid", "authorized"].includes(status) && (!payment.id || payment.order_id !== providerOrderId
    || payment.status !== (status === "paid" ? "captured" : "authorized"))) throw httpError("Webhook payment identity or state did not match", 422);
  await settleGatewayPayment(env, row, {
    status,
    paymentId: payment.id || row.gateway_payment_id || "",
    amount: payment.amount ?? providerOrder.amount ?? null,
    reference: providerOrderId
  });
  return json({ ok: true });
}

async function handlePhonePeWebhook(request, env, ctx) {
  const rawBody = new TextDecoder().decode(await readBoundedBody(request, 1024 * 1024));
  const hmacSecret = String(env.PHONEPE_WEBHOOK_SECRET || "").trim();
  const expectedKeyId = String(env.PHONEPE_WEBHOOK_ID || "").trim();
  const receivedKeyId = String(request.headers.get("x-phonepe-checksum-key-id") || "").trim();
  let valid = false;
  if (hmacSecret) {
    const signature = String(request.headers.get("x-phonepe-checksum-signature") || request.headers.get("phonepe-checksum-signature") || "").trim();
    valid = Boolean(signature) && (!expectedKeyId || expectedKeyId === receivedKeyId) && safeEqualText(await hmacHex(rawBody, hmacSecret), signature);
  } else if (env.PHONEPE_WEBHOOK_USERNAME && env.PHONEPE_WEBHOOK_PASSWORD) {
    const authorization = String(request.headers.get("Authorization") || "").trim();
    valid = safeEqualText(await sha256Hex(`${env.PHONEPE_WEBHOOK_USERNAME}:${env.PHONEPE_WEBHOOK_PASSWORD}`), authorization);
  }
  if (!valid) return json({ error: "Invalid webhook authentication" }, 401);
  const payload = parseWebhookJson(rawBody);
  const event = String(payload.event || "").trim().toLowerCase();
  // PhonePe documents both enveloped refund events and bare UPI/netbanking
  // refund payloads. A callback only prompts an authenticated status GET.
  if (["pg.refund.completed", "pg.refund.failed"].includes(event)
    || (!event && payload.refundId && ["COMPLETED", "FAILED"].includes(payload.state))) {
    const reconciliation = handlePhonePeRefundWebhook(env, payload.payload || payload);
    if (ctx?.waitUntil) {
      // Acknowledge within PhonePe's 3–5 second window even when its GET is slow.
      // The existing durable pending case remains eligible for cron fallback.
      ctx.waitUntil(reconciliation.catch(error => console.error("phonepe_refund_webhook_failed", { error_type: error.name || "Error" })));
      return json({ ok: true });
    }
    return reconciliation;
  }
  const providerPayload = payload.payload || {};
  const merchantOrderId = String(providerPayload.merchantOrderId || "").trim();
  if (!merchantOrderId) return json({ ok: true });
  const row = await env.DB.prepare("SELECT * FROM orders WHERE payment_gateway = 'phonepe' AND gateway_order_id = ? LIMIT 1").bind(merchantOrderId).first();
  if (!row) {
    await recordUnmappedPayment(env, "phonepe", merchantOrderId, providerPayload.paymentDetails?.at(-1)?.transactionId, event, providerPayload.amount, "INR");
    return json({ ok: true, reconciliation_required: true });
  }
  const paymentDetail = Array.isArray(providerPayload.paymentDetails) ? providerPayload.paymentDetails.at(-1) : null;
  const state = String(providerPayload.state || "").toUpperCase();
  const status = state === "COMPLETED" ? "paid" : state === "FAILED" ? "failed" : "pending";
  await verifyPhonePeSessionIdentity(env, row.id, providerPayload);
  if (status === "paid" && !paymentDetail?.transactionId) throw httpError("PhonePe payment reference is missing", 422);
  await settleGatewayPayment(env, row, {
    status,
    paymentId: paymentDetail?.transactionId || "",
    amount: providerPayload.amount == null ? null : Number(providerPayload.amount),
    reference: merchantOrderId
  });
  return json({ ok: true });
}

async function handlePhonePeRefundWebhook(env, payload) {
  const merchantId = typeof payload.merchantRefundId === "string" ? payload.merchantRefundId.trim() : "";
  const providerId = typeof payload.refundId === "string" ? payload.refundId.trim() : "";
  if ((!merchantId && !providerId) || merchantId.length > 63 || providerId.length > 160) return json({ ok: true });
  // Never match by order alone: one order can have multiple partial refunds.
  const column = merchantId ? "id" : "provider_refund_id";
  const reference = merchantId || providerId;
  let refund = await env.DB.prepare(`SELECT * FROM gateway_refunds WHERE provider='phonepe' AND ${column}=?`).bind(reference).first();
  if (!refund) refund = await env.DB.prepare(`SELECT * FROM cancellation_refunds WHERE provider='phonepe' AND ${column}=?`).bind(reference).first();
  if (!refund || !refund.create_attempted || !["pending", "submitting", "reconciliation_required"].includes(refund.state)) return json({ ok: true });
  if ((providerId && refund.provider_refund_id && providerId !== refund.provider_refund_id)
    || (payload.originalMerchantOrderId && payload.originalMerchantOrderId !== refund.provider_order_id)
    || (payload.amount != null && payload.amount !== refund.gateway_paise)) return json({ ok: true });
  // Wait for the submitting operation to save its response/reference first.
  if (refund.state === "submitting" && !refund.provider_refund_id) return json({ ok: true });
  const current = await reconcileGatewayRefund(env.DB, refund,
    (provider, path, init) => gatewayRefundTransport(env, provider, path, init), "system:phonepe-refund-webhook");
  if (current.kind === "cancellation") await notifyCancellationRefund(env, current);
  else await notifyGatewayRefund(env, current);
  return json({ ok: true });
}

async function recordUnmappedPayment(env, provider, providerOrderId, paymentId, event, amount, currency) {
  if (!/captured|paid|completed|authorized/.test(event)) return;
  const id = `${provider}:${providerOrderId}:${paymentId || "unknown"}:${event}`;
  await env.DB.prepare("INSERT OR IGNORE INTO payment_reconciliation_events(id,provider,provider_order_id,provider_payment_id,event_type,amount_paise,currency) VALUES (?,?,?,?,?,?,?)")
    .bind(id, provider, String(providerOrderId).slice(0,160), String(paymentId || "").slice(0,160), event.slice(0,80), Number.isSafeInteger(Number(amount)) ? Number(amount) : null, String(currency || "").slice(0,10)).run();
  await createAdminNotification(env, { type: "cancelled_order", priority: "urgent", title: "Unmapped payment needs reconciliation",
    message: `${provider} payment ${String(paymentId || providerOrderId).slice(0,160)} has no verified internal order mapping. Check the gateway; do not retry or assume a refund.`,
    dedupeKey: `unmapped-payment:${id}` });
}

async function verifyPhonePeSessionIdentity(env, id, payload) {
  const session = await env.DB.prepare("SELECT provider_order_id FROM payment_reconciliation_events WHERE id = ? AND event_type = 'session_created'")
    .bind(`phonepe-session:${id}`).first();
  if (session && payload.orderId !== session.provider_order_id) throw httpError("PhonePe provider session did not match this order", 422);
  if (payload.currency && payload.currency !== "INR") throw httpError("PhonePe currency did not match this order", 422);
}

function parseWebhookJson(rawBody) {
  try {
    const payload = JSON.parse(rawBody);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    return payload;
  } catch { throw httpError("Webhook body must be valid JSON", 400); }
}

async function notifyLateGatewayPayment(env, row, paymentId, verifiedCapture=false) {
  if(row.payment_status==='refunded')return;
  // Called only after settlement validated captured amount/provider evidence.
  // Preserve cancellation and never re-reserve stock or overwrite another charge.
  let recovery;
  if(verifiedCapture&&paymentId&&row.payment_gateway===row.payment_method&&['razorpay','phonepe'].includes(row.payment_gateway)) {
    await env.DB.prepare(`UPDATE orders SET gateway_payment_id=?,payment_status='paid',payment_updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='cancelled' AND payment_status!='refunded'
        AND (gateway_payment_id IS NULL OR gateway_payment_id='' OR gateway_payment_id=?)`)
      .bind(paymentId,row.id,paymentId).run();
    await processCancellationRefund(env,row.id);
    recovery=await env.DB.prepare('SELECT state FROM cancellation_refunds WHERE order_id=?').bind(row.id).first();
  } else {
    await env.DB.prepare("UPDATE orders SET gateway_payment_id=COALESCE(gateway_payment_id,?),payment_updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='cancelled' AND payment_status!='refunded'")
      .bind(paymentId||'captured-unresolved',row.id).run();
  }
  await createAdminNotification(env, {
    type: "cancelled_order", priority: recovery&&['approved','pending','processed'].includes(recovery.state)?'normal':'urgent',
    title: recovery&&['approved','pending','processed'].includes(recovery.state)?'Late captured payment refund tracked':'Captured payment needs review',
    message: `${row.order_number || row.id} was already cancelled when its payment was captured. ${recovery&&['approved','pending','processed'].includes(recovery.state)?`The existing cancellation refund is ${recovery.state}; follow that case, not a second payout.`:'Check the gateway and refund or reconcile this charge.'}`,
    dedupeKey: `late-payment:${row.id}:${paymentId || "captured"}`, orderId: row.id
  });
}

async function reconcileExpiringGatewayOrder(env, row) {
  if (!row.gateway_order_id) return; // Creation may have timed out after provider acceptance.
  if (row.payment_gateway === "razorpay") {
    const response = await razorpayRequest(env, `/orders/${encodeURIComponent(row.gateway_order_id)}/payments`, { method: "GET" });
    if (!response.ok) throw httpError("Gateway reconciliation is unavailable", 502);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw httpError("Gateway reconciliation response is invalid", 502);
    const captured = data.items.find(payment => payment.status === "captured");
    const authorized = data.items.find(payment => payment.status === "authorized");
    const payment = captured || authorized;
    if (payment) {
      if (payment.order_id !== row.gateway_order_id || payment.currency !== "INR") throw httpError("Gateway reconciliation details did not match", 422);
      await settleGatewayPayment(env, row, { status: captured ? "paid" : "authorized", paymentId: payment.id, amount: payment.amount });
      return;
    }
    // Preserve an in-flight attempt; expire only empty/all-failed attempts.
    if (data.items.every(payment => payment.status === "failed")) await failGatewayOrder(env, row.id, "expired");
    return;
  }
  if (row.payment_gateway === "phonepe") {
    const response = await phonePeRequest(env, `/checkout/v2/order/${encodeURIComponent(row.gateway_order_id)}/status?details=false&errorContext=true`, { method: "GET" });
    if (!response.ok) throw httpError("Gateway reconciliation is unavailable", 502);
    const data = await response.json();
    await verifyPhonePeSessionIdentity(env, row.id, data);
    if (data.state === "COMPLETED" && !data.paymentDetails?.at(-1)?.transactionId) throw httpError("PhonePe payment reference is missing", 422);
    if (data.state === "COMPLETED") await settleGatewayPayment(env, row, { status: "paid", paymentId: data.paymentDetails?.at(-1)?.transactionId || "", amount: data.amount });
    else if (data.state === "FAILED") await failGatewayOrder(env, row.id, "expired");
  }
}

async function expirePendingGatewayOrders(env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT * FROM orders
      WHERE payment_method IN ('razorpay', 'phonepe')
        AND payment_status IN ('pending', 'authorized')
        AND status = 'pending'
        AND created_at <= datetime('now', '-45 minutes')
      ORDER BY COALESCE(payment_updated_at, created_at) ASC
      LIMIT 10
    `).all();
    for (const row of results || []) {
      try { await reconcileExpiringGatewayOrder(env, row); }
      catch { console.error("gateway_reconciliation_failed", { order_id: row.id, provider: row.payment_gateway }); }
      // Rotate unresolved orders through the bounded cron batch; a temporary
      // provider failure must not cancel a potentially paid order.
      await env.DB.prepare("UPDATE orders SET payment_updated_at = ? WHERE id = ? AND status = 'pending' AND payment_status IN ('pending', 'authorized')")
        .bind(new Date().toISOString(), row.id).run();
    }
  } catch (error) {
    console.error("gateway_expiry_failed", String(error?.message || error || "Unknown gateway expiry error").slice(0, 300));
  }
}

async function purgeExpiredPaymentOrders(env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT o.id
      FROM orders o
      WHERE ${paymentIncompleteOrderPredicate("o", true)}
      ORDER BY o.updated_at ASC
      LIMIT 100
    `).all();
    for (const row of results || []) {
      const orderId = String(row.id || "").trim();
      if (!orderId) continue;
      // Recheck eligibility inside the transaction, not just in the earlier scan:
      // a payment update between the scan and batch must preserve all order data.
      const retentionEligibility = `${paymentIncompleteOrderPredicate("o", true)} AND NULLIF(o.gateway_payment_id, '') IS NULL AND NOT EXISTS (SELECT 1 FROM admin_notifications n WHERE n.order_id = o.id AND n.dedupe_key LIKE 'late-payment:%')`;
      const eligibleOrder = `EXISTS (SELECT 1 FROM orders o WHERE o.id = ? AND ${retentionEligibility})`;
      await env.DB.batch([
        ...["customer_notifications", "admin_notifications", "email_delivery_log", "coupon_redemptions", "inventory_reservations", "order_stock_releases", "order_items", "return_requests", "employee_audit_log"]
          .map(table => env.DB.prepare(`DELETE FROM ${table} WHERE order_id = ? AND ${eligibleOrder}`).bind(orderId, orderId)),
        env.DB.prepare(`DELETE FROM admin_audit_log WHERE entity_type = 'order' AND entity_id = ? AND ${eligibleOrder}`).bind(orderId, orderId),
        env.DB.prepare(`
          DELETE FROM orders AS o
          WHERE id = ? AND ${retentionEligibility}
        `).bind(orderId)
      ]);
    }
  } catch (error) {
    console.error("payment_order_retention_failed", String(error?.message || error || "Unknown payment-order retention error").slice(0, 300));
  }
}

async function createOrder(request, env, user, { allowGateway = false, body: providedBody = null } = {}) {
  const requestStorefront = request?.url ? storefrontForRequest(new URL(request.url)) : "glamia";
  const body = providedBody || await readJson(request);
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

  const requestedPaymentMethod = String(body.payment_method || "").trim().toLowerCase();
  if (!["razorpay", "phonepe", "store_credit"].includes(requestedPaymentMethod)) {
    throw httpError("Choose Razorpay or PhonePe", 400);
  }
  const gatewayPayment = ["razorpay", "phonepe"].includes(requestedPaymentMethod);
  if (gatewayPayment && !allowGateway) {
    throw httpError("Use the payment checkout to start a live payment", 400);
  }
  let paymentMethod = requestedPaymentMethod;
  const storefront = await storefrontSettingsObject(env);
  const customerEmail = user
    ? String(user.email || "").trim().toLowerCase()
    : String(body.email || "").trim().toLowerCase();
  if (!user && (customerEmail.length > 254 || !isRealCustomerEmail(customerEmail))) {
    throw httpError("Enter a valid email for order confirmation and delivery updates", 400);
  }
  const checkoutTokenInput = String(body.checkout_token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(checkoutTokenInput)) {
    throw httpError("Checkout session token is invalid. Refresh the checkout page and try again.", 400);
  }
  if (checkoutTokenInput) {
    const existing = await env.DB.prepare("SELECT * FROM orders WHERE checkout_token = ? LIMIT 1")
      .bind(checkoutTokenInput).first();
    if (existing) {
      if (String(existing.customer_email || "").trim().toLowerCase() !== customerEmail) {
        throw httpError("This checkout session is no longer valid. Refresh the checkout page and try again.", 409);
      }
      if (existing.status !== "cancelled" && String(existing.payment_status || "").toLowerCase() !== "failed") {
        return json({ order: formatOrder(existing), idempotent: true });
      }
      throw httpError("This checkout attempt is closed. Refresh checkout to start a new attempt.", 409);
    }
  }
  const checkoutToken = checkoutTokenInput;
  let paymentStatus = "pending";
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
    const lineTotal = unitPrice * quantity;
    if (!Number.isSafeInteger(lineTotal * 100) || lineTotal < 0 || !Number.isSafeInteger((subtotal + lineTotal) * 100)) {
      throw httpError("A product price exceeds the supported checkout amount. Please contact support.", 400);
    }
    subtotal += lineTotal;
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
  let couponInstanceId = '';
  const couponAdminExempt = isWhitelistedCouponAdmin(env, user);
  let couponAllowsCredits = false;
  const code = String(body.coupon || "").trim().toUpperCase();
  if (code) {
    if (!user) throw httpError("Sign in to use a coupon", 401);
    const storedCoupon = await env.DB.prepare("SELECT * FROM coupons WHERE code = ? AND (active = 1 OR ? = 1)").bind(code, couponAdminExempt ? 1 : 0).first();
    if (!storedCoupon) throw httpError("That coupon code is not valid", 400);
    const coupon = couponForCustomer(storedCoupon, env, user);
    const availabilityError = await couponAvailability(coupon, env, user);
    if (availabilityError) throw httpError(availabilityError, 400);
    const minimumCartError = couponMinimumCartError(coupon, subtotal);
    if (minimumCartError) throw httpError(minimumCartError, 400);
    const eligible = couponEligibleSubtotal(coupon, requested, catalog);
    if (eligible <= 0) throw httpError("This coupon does not apply to the items in your cart", 400);
    discount = couponDiscount(coupon, eligible);
    couponCode = coupon.code;
    couponInstanceId = coupon.instance_id;
    couponAllowsCredits = Boolean(coupon.allow_store_credits);
  }

  const total = subtotal - discount;
  if (!Number.isSafeInteger(total * 100) || total < 0) throw httpError("The checkout total is invalid. Please contact support.", 400);
  const creditsUsed = body.credits_used === undefined ? 0 : Number(body.credits_used);
  if (!Number.isSafeInteger(creditsUsed) || creditsUsed < 0 || creditsUsed > total) throw httpError("Enter a valid store credit amount", 400);
  if (creditsUsed && !user) throw httpError("Sign in to use store credits", 401);
  if (creditsUsed && couponCode && !couponAllowsCredits) throw httpError("This coupon cannot be combined with store credits. Remove the coupon or turn off credits.", 409);
  const payableTotal = total - creditsUsed;
  if (payableTotal === 0) { paymentMethod = "store_credit"; paymentStatus = "paid"; }
  else if (paymentMethod === "store_credit") throw httpError("Store credits do not cover this order. Choose a payment provider for the remaining amount.", 400);
  else if (!storefront.payments.methods.some((method) => method.id === paymentMethod)) throw httpError("This payment provider is not configured yet", 409);
  const id = crypto.randomUUID();
  const sequence = await nextOrderSequence(env);
  const orderNumber = buildOrderNumber(productNameInitials(items[0]?.name), sequence, requestStorefront);
  const customerName = user?.name || address.name;
  const orderType = hasPreorder ? "preorder" : "standard";

  const orderInsertStatement = env.DB.prepare(`
      INSERT INTO orders (id, order_number, tracking_token, checkout_token, customer_email, customer_name, items_json, subtotal, discount, coupon_code, total, status, payment_method, payment_gateway, payment_status, shipping_json, order_type, credits_used, payable_total,delivery_estimate,coupon_instance_id,coupon_admin_exempt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?)
    `).bind(
    id, orderNumber, trackingToken, checkoutToken, customerEmail, customerName, JSON.stringify(items), subtotal, discount,
    couponCode, total, payableTotal === 0 ? "confirmed" : "pending", paymentMethod, payableTotal > 0 ? paymentMethod : null, paymentStatus, JSON.stringify(address), orderType, creditsUsed, payableTotal,deliveryPromise(address.state,storefront.customer_experience),couponInstanceId,couponCode && couponAdminExempt ? 1 : 0
  );
  // Insert first so the database stock trigger sees the available snapshot;
  // every following adjustment remains in the same atomic D1 batch.
  const checkoutStatements = [orderInsertStatement];
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
    checkoutStatements.push(env.DB.prepare("INSERT INTO coupon_redemptions (id, coupon_code, customer_email, order_id,coupon_instance_id) VALUES (?, ?, ?, ?,?)")
      .bind(crypto.randomUUID(), couponCode, customerEmail, id,couponInstanceId));
  }

  try {
    await env.DB.batch(checkoutStatements);
  } catch (error) {
    const detail = String(error?.message || error || "");
    if (/unique constraint failed: orders\.checkout_token/i.test(detail) && checkoutToken) {
      const existing = await env.DB.prepare("SELECT * FROM orders WHERE checkout_token = ? AND customer_email = ? LIMIT 1")
        .bind(checkoutToken, customerEmail).first();
      if (existing) return json({ order: formatOrder(existing), idempotent: true });
    }
    if (/insufficient .*stock/i.test(detail)) {
      throw httpError("Some items sold out while you were checking out. Please refresh your cart.", 409);
    }
    if (/coupon redemption limit/i.test(detail)) {
      throw httpError("This coupon reached its usage limit while you were checking out.", 409);
    }
    if (/Coupon instance changed|Coupon redemption identity mismatch/i.test(detail)) {
      throw httpError("This coupon changed while you were checking out. Apply it again before paying.", 409);
    }
    if (/Insufficient store credits|Coupon cannot be combined|Invalid checkout credits/i.test(detail)) throw httpError("Store credits changed or cannot be combined with this coupon. Refresh checkout and try again.", 409);
    if (/pre-order limit/i.test(detail)) {
      throw httpError("This pre-order limit was reached while you were checking out. Please refresh and try again.", 409);
    }
    throw error;
  }
  invalidateProductEnrichment();

  const created = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  return json({ order: formatOrder(created) }, 201);
}

async function cancelOwnOrder(request, env, user, id, ctx = null) {
  const current = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND customer_email = ?")
    .bind(id, String(user.email || "").trim().toLowerCase()).first();
  if (!current) return json({ error: "Order not found" }, 404);
  if (current.status === "cancelled") return json({ order: (await attachCancellationRefunds(env,[formatOrder(current)]))[0] });
  if (!["pending", "confirmed"].includes(current.status)) {
    return json({ error: "This order can no longer be cancelled. Please request a return instead." }, 409);
  }
  if(String(current.tracking_number||'').trim())return json({error:'Dispatch has already been arranged. Contact care or request a return after delivery.'},409);
  const createdAt = Date.parse(current.created_at || "");
  if (Number.isFinite(createdAt) && Date.now() - createdAt > CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return json({ error: `This order is outside the ${CANCELLATION_WINDOW_DAYS}-day cancellation window. Please request a return instead.` }, 409);
  }
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'confirmed') AND COALESCE(tracking_number, '') = ''")
      .bind(id),
    env.DB.prepare(`
      INSERT OR IGNORE INTO order_stock_releases (order_id)
      SELECT id FROM orders
      WHERE id = ? AND status = 'cancelled' AND changes() = 1
    `).bind(id),
    env.DB.prepare("DELETE FROM coupon_redemptions WHERE order_id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'cancelled')").bind(id,id)
  ]);
  const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if(updated.status!=='cancelled')return json({error:'This order changed before cancellation. Refresh its dispatch status or contact care.'},409);
  invalidateProductEnrichment();
  if (Number(results[1]?.meta?.changes || 0) === 1) {
    await writeAuditLog(env, user.email, "cancel_order", "order", id, { stock_restored: true });
  }
  await createAdminNotification(env, {
    type: "cancelled_order",
    priority: "urgent",
    title: "Order cancelled",
    message: `${updated.customer_name || updated.customer_email} cancelled ${updated.order_number || updated.id}`,
    dedupeKey: `cancelled-order:${id}`,
    orderId: id
  }).catch(() => null);
  await createCustomerNotification(env, {
    email: updated.customer_email,
    type: "order_cancelled",
    title: "Order cancelled",
    message: `${updated.order_number || updated.id} has been cancelled.`,
    orderId: id,
    dedupeKey: `customer-order:${id}:cancelled`
  }).catch(() => null);
  if (Number(results[0]?.meta?.changes || 0) === 1) {
    await sendOrderEmail(env, updated, "cancelled");
  }
  const processing=processCancellationRefund(env,id);
  if(ctx?.waitUntil)ctx.waitUntil(processing);else await processing;
  const latest=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  return json({ order: (await attachCancellationRefunds(env,[formatOrder(latest)]))[0] });
}

function requireReturnsAdmin(user) {
  requireAdmin(user);
  if (user.employee_id && !user.is_owner && user.employee_permissions?.returns !== true) throw httpError("Returns permission is required", 403);
}

function orderReturnWindow(order) {
  const raw = String(order.delivered_at || "");
  const timestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw) ? raw.replace(" ", "T") + "Z" : raw;
  const deliveredAt = new Date(timestamp).getTime();
  return !Number.isFinite(deliveredAt) || Date.now() - deliveredAt > RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

async function customerOrderReturnOptions(env, user, orderId) {
  const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND LOWER(customer_email)=?").bind(orderId,user.email.toLowerCase()).first();
  if(!order) return json({error:"Order not found"},404);
  const items=await purchasedReturnLines(env,orderId);
  const {results:previousCases}=await env.DB.prepare('SELECT status,selected_items_json FROM return_requests WHERE order_id=?').bind(orderId).all();
  const remaining=remainingReturnLines(items,previousCases);
  const lines=[];
  const allocations=Number(order.total)>0 ? returnAllocation(items,order.total) : [];
  for(const item of remaining.filter(item=>item.remaining_quantity>0)) {
    const {results:sizes}=await env.DB.prepare(`SELECT ps.size,ps.stock FROM product_sizes ps JOIN products p ON p.id=ps.product_id
      WHERE ps.product_id=? AND p.status='live' AND p.stock>=1 AND ps.stock>=1 AND LOWER(ps.size)!=LOWER(?) ORDER BY ps.size`).bind(item.product_id,item.size||"").all();
    lines.push({line_id:item.id,product_id:item.product_id,product_name:item.product_name,color:item.color,image_url:item.image_url,size:item.size,quantity:item.remaining_quantity,purchased_quantity:item.quantity,returned_quantity:item.returned_quantity,
      returnable:Boolean(item.eligible_returnable),standard_returnable:item.returnable_snapshot===1,support_return_enabled:Boolean(item.support_return_enabled),policy_snapshot_known:item.returnable_snapshot!==null,available_sizes:sizes,
      amount_paise:allocations.find(line=>line.id===item.id)?.amount_paise || 0});
  }
  const existing=await env.DB.prepare("SELECT id FROM return_requests WHERE order_id=? AND status NOT IN ('rejected','cancelled','refunded','completed') LIMIT 1").bind(orderId).first();
  const paymentOptions=adminReturnPaymentOptions(order);
  const eligible=lines.some(item=>item.returnable)&&order.status==='delivered'&&!orderReturnWindow(order)&&!existing&&(paymentOptions.refund_available||paymentOptions.exchange_available);
  return json({items:lines,delivered_at:order.delivered_at,return_window_days:RETURN_WINDOW_DAYS,eligible,
    eligibility_message:existing?'An after-sales case already exists. Contact care for any additional items.':order.status!=='delivered'?'Returns open after delivery.':!order.delivered_at?'Contact care to verify the delivery date for this older order.':orderReturnWindow(order)?'The return window has closed. Contact care for an exception.':!lines.length?'All purchased quantities already have a return or exchange request.':!lines.some(item=>item.returnable)?'These items are not eligible for standard returns. Contact care to ask for an order-specific exception.':!paymentOptions.refund_available&&!paymentOptions.exchange_available?'This order has no eligible settled payment. Contact care for help.':'',
    ...paymentOptions});
}

async function createReturnDocumentAccess(request,env,user,id) {
  const current=await env.DB.prepare('SELECT id,customer_email FROM return_requests WHERE id=?').bind(id).first();
  if(!current || current.customer_email.toLowerCase()!==user.email.toLowerCase()) return json({error:'Not found'},404);
  const {kind}=await readJson(request);
  if(!['label','receipt'].includes(kind)) return json({error:'Choose a valid document'},400);
  const account=await env.DB.prepare('SELECT session_version FROM users WHERE email=?').bind(user.email.toLowerCase()).first();
  if(!account) return json({error:'Sign in again'},401);
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  const hash=await returnDocumentHash(token);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM return_document_tokens WHERE expires_at<CURRENT_TIMESTAMP'),
    env.DB.prepare("INSERT INTO return_document_tokens(token_hash,return_id,kind,user_email,session_version,expires_at) VALUES(?,?,?,?,?,datetime('now','+2 minutes'))").bind(hash,id,kind,user.email.toLowerCase(),Number(account.session_version||0))
  ]);
  return json({path:`/api/returns/${encodeURIComponent(id)}/${kind}?access=${token}`});
}

async function returnDocumentHash(token) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function consumeReturnDocumentAccess(env,id,kind,token) {
  if(!/^[a-f0-9]{64}$/.test(token||'')) return false;
  const row=await env.DB.prepare(`DELETE FROM return_document_tokens WHERE token_hash=? AND return_id=? AND kind=? AND expires_at>CURRENT_TIMESTAMP
    AND EXISTS(SELECT 1 FROM users u WHERE LOWER(u.email)=return_document_tokens.user_email AND COALESCE(u.session_version,0)=return_document_tokens.session_version) RETURNING return_id`)
    .bind(await returnDocumentHash(token),id,kind).first();
  return Boolean(row);
}

function adminReturnPaymentOptions(order) {
  const refundAvailable = Number(order.total) >= 1 && ["paid", "demo"].includes(order.payment_status);
  const exchangeAvailable = ["paid", "demo"].includes(order.payment_status) || (order.order_type === "replacement" && order.payment_status === "not_required");
  const originalAvailable = refundAvailable && order.payment_status === "paid" && ["razorpay", "phonepe"].includes(order.payment_method)
    && order.payment_gateway === order.payment_method && Boolean(order.gateway_order_id && order.gateway_payment_id);
  return { refund_available: refundAvailable, exchange_available: exchangeAvailable, original_refund_available: originalAvailable };
}

async function adminOrderReturnOptions(request, env, user, orderId) {
  requireReturnsAdmin(user);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) return json({ error: "Order not found" }, 404);
  const existing = await env.DB.prepare("SELECT id FROM return_requests WHERE order_id = ? AND status NOT IN ('rejected', 'cancelled', 'refunded', 'completed') ORDER BY created_at DESC LIMIT 1").bind(orderId).first();
  const purchased=await purchasedReturnLines(env,orderId);
  const {results:previousCases}=await env.DB.prepare('SELECT status,selected_items_json FROM return_requests WHERE order_id=?').bind(orderId).all();
  const remaining=remainingReturnLines(purchased,previousCases);
  const purchasedItems=returnAllocation(remaining,order.total).filter(item=>item.remaining_quantity>0).map(item=>({line_id:item.id,product_id:item.product_id,product_name:item.product_name,size:item.size,quantity:item.remaining_quantity,purchased_quantity:item.quantity,returned_quantity:item.returned_quantity,returnable:Boolean(item.eligible_returnable),amount_paise:item.amount_paise}));
  // Only the purchased products are exposed; Returns staff need no catalog-edit permission.
  const { results } = await env.DB.prepare(`SELECT oi.id AS line_id, oi.product_id, oi.product_name, oi.size, oi.quantity,
    ps.size AS replacement_size, ps.stock AS replacement_stock
    FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id AND p.status='live'
    LEFT JOIN product_sizes ps ON ps.product_id=p.id AND ps.stock >= 1 AND p.stock >= 1 AND LOWER(ps.size) != LOWER(oi.size)
    WHERE oi.order_id=? ORDER BY oi.id,ps.size`).bind(orderId).all();
  const lines = new Map();
  for (const row of results) {
    const key = row.line_id;
    if (!lines.has(key)) lines.set(key, { line_id:row.line_id,product_id: row.product_id, product_name: row.product_name, size: row.size, quantity: row.quantity, available_sizes: [] });
    if (row.replacement_size) lines.get(key).available_sizes.push({ size: row.replacement_size, stock: row.replacement_stock });
  }
  return json({ order: formatOrder(order), existing_request: existing ? await getReturnRequest(env, existing.id) : null,
    exchange_items: [...lines.values()].filter(item=>remaining.find(line=>line.id===item.line_id)?.remaining_quantity>0).map(item=>({...item,quantity:remaining.find(line=>line.id===item.line_id).remaining_quantity})), purchased_items:purchasedItems,...adminReturnPaymentOptions(order), return_window_expired: orderReturnWindow(order),
    return_window_days: RETURN_WINDOW_DAYS, can_override_return_window: Boolean(user.is_owner && adminEmails(env, request).includes(String(user.email || "").toLowerCase())) });
}

async function createReturnRequest(request, env, user, orderId, { adminInitiated = false } = {}) {
  if (adminInitiated) requireReturnsAdmin(user);
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
  const order = await (adminInitiated ? env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId)
    : env.DB.prepare("SELECT * FROM orders WHERE id = ? AND customer_email = ?").bind(orderId, String(user.email || "").trim().toLowerCase())).first();
  if (!order) return json({ error: "Order not found" }, 404);
  if (["cod", "demo"].includes(order.payment_method) && refundDestination === "original") {
    return json({ error: "Demo-payment refunds are available only as Glamia store credits" }, 400);
  }
  if (order.status !== "delivered") return json({ error: "Returns and refunds open after delivery" }, 409);
  const activeCase=await env.DB.prepare("SELECT id FROM return_requests WHERE order_id=? AND status NOT IN ('rejected','cancelled','refunded','completed') LIMIT 1").bind(orderId).first();
  if(activeCase)return json({error:'An after-sales request is already being processed. Follow it in Your orders.'},409);
  const purchasedLines=await purchasedReturnLines(env,orderId);
  let selectedItems;
  try {
    const {results:previousCases}=await env.DB.prepare('SELECT status,selected_items_json FROM return_requests WHERE order_id=?').bind(orderId).all();
    const remaining=remainingReturnLines(purchasedLines,previousCases);
    const selection=body.items || remaining.filter(line=>line.remaining_quantity>0).map(line=>({line_id:line.id,quantity:line.remaining_quantity}));
    selectedItems=selectReturnLines(remaining,selection,order.total);
  } catch(error) { return json({error:error.message},400); }
  const policyException=selectedItems.some(line=>purchasedLines.find(item=>item.id===line.line_id)?.returnable_snapshot!==1);
  const ownerPolicyOverride=Boolean(adminInitiated && body.override_return_policy===true && user.is_owner && adminEmails(env,request).includes(user.email.toLowerCase()) && String(body.override_reason||'').trim().length>=10);
  const needsPolicyOverride=selectedItems.some(line=>!purchasedLines.find(item=>item.id===line.line_id)?.eligible_returnable);
  if(needsPolicyOverride && !ownerPolicyOverride) {
    return json({error:"A selected item is not eligible for standard returns. Contact care to request an order-specific return exception for damaged or incorrect items."},409);
  }
  const windowExpired = orderReturnWindow(order);
  const overrideWindow = adminInitiated && body.override_return_window === true;
  const overrideReason = String(body.override_reason || "").trim().slice(0, 500);
  if (overrideWindow && (!user.is_owner || !adminEmails(env, request).includes(String(user.email || "").toLowerCase()))) return json({ error: "Only a whitelisted owner can authorise a return-window exception" }, 403);
  if (overrideWindow && overrideReason.length < 10) return json({ error: "Explain the return-window exception in at least 10 characters" }, 400);
  if (windowExpired && !overrideWindow) {
    return json({ error: `This order is outside the ${RETURN_WINDOW_DAYS}-day return window` }, 409);
  }
  {
    const eligibility = adminReturnPaymentOptions(order);
    if ((type === "refund" && !eligibility.refund_available) || (type === "exchange" && !eligibility.exchange_available)) return json({ error: "This order has no eligible settled payment for that request" }, 409);
    if (type === "refund" && refundDestination === "original" && !eligibility.original_refund_available) return json({ error: "A verified Razorpay or PhonePe payment is required for an original-payment refund" }, 409);
  }
  const existing = await env.DB.prepare("SELECT id FROM return_requests WHERE order_id = ? AND status NOT IN ('rejected', 'cancelled', 'refunded', 'completed') LIMIT 1")
    .bind(orderId).first();
  if (existing) return json({ error: "An after-sales request already exists for this order" }, 409);
  if (type === "exchange") {
    const chosenLine=body.exchange_line_id ? purchasedLines.find(line=>line.id===body.exchange_line_id) : null;
    if(body.exchange_line_id && !chosenLine) return json({error:'Choose a purchased order line'},400);
    exchangeItem = await env.DB.prepare(`
      SELECT product_id AS id, size, quantity, product_name, unit_price, variant, color, image_url
      FROM order_items
      WHERE order_id = ? AND product_id = ? AND (?='' OR id=?)
        AND (? = '' OR LOWER(size) = LOWER(?))
      LIMIT 1
    `).bind(orderId, chosenLine?.product_id || exchangeProductId,chosenLine?.id||'',chosenLine?.id||'', chosenLine?.size || requestedExchangeFromSize, chosenLine?.size || requestedExchangeFromSize).first();
    if (!exchangeItem) return json({ error: "Choose the same product from this order for exchange" }, 400);
    const selection=selectedItems.find(item=>chosenLine ? item.line_id===chosenLine.id : item.product_id===exchangeItem.id && item.size===exchangeItem.size);
    if(!selection || (body.items && selectedItems.length!==1)) return json({error:'Choose one purchased item for exchange'},400);
    exchangeItem.quantity=selection.quantity;
    exchangeFromSize = String(exchangeItem.size || "").trim();
    const { results: sizeRows } = await env.DB.prepare(`
      SELECT ps.size, ps.stock
      FROM product_sizes ps
      JOIN products p ON p.id = ps.product_id
      WHERE ps.product_id = ? AND p.status = 'live'
      ORDER BY ps.size
    `).bind(exchangeItem.id).all();
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
  const requestedPaise=selectedItems.reduce((sum,line)=>sum+line.amount_paise,0);
  const refundAmount = refundDestination === "original" ? requestedPaise/100 : Math.floor(requestedPaise/100);
  // Atomic duplicate guard also covers concurrent customer/admin requests, without a migration.
  const claim = env.DB.prepare(`INSERT INTO return_requests
    (id, order_id, customer_email, type, reason, refund_amount, refund_destination, exchange_product_id, exchange_from_size, exchange_to_size,selected_items_json,requested_amount_paise)
    SELECT ?,o.id,LOWER(o.customer_email),?,?,?,?,?,?,?,?,? FROM orders o WHERE o.id=? AND o.status='delivered'
      AND o.payment_status=? AND o.payment_method=? AND o.total=? AND LOWER(o.customer_email)=?
      AND NOT EXISTS(SELECT 1 FROM return_requests r WHERE r.order_id=o.id AND r.status NOT IN ('rejected','cancelled','refunded','completed'))
      AND (?=1 OR NOT EXISTS(SELECT 1 FROM json_each(?) s JOIN order_items i ON i.id=json_extract(s.value,'$.line_id') AND i.order_id=o.id
        WHERE COALESCE(i.returnable_snapshot,0)!=1 AND NOT EXISTS(SELECT 1 FROM order_return_access a WHERE a.order_item_id=i.id AND a.order_id=o.id AND a.enabled=1)))`)
    .bind(id, type, reason, refundAmount, refundDestination,
      type === "exchange" ? exchangeItem.id : null, type === "exchange" ? exchangeFromSize : null, type === "exchange" ? exchangeToSize : null,JSON.stringify(selectedItems),requestedPaise,
      orderId, order.payment_status, order.payment_method, order.total, String(order.customer_email || "").toLowerCase(),ownerPolicyOverride?1:0,JSON.stringify(selectedItems));
  const auditDetails = { order_id: orderId, type: requestedType, refund_destination: refundDestination,
    exchange_product_id: exchangeProductId || null, exchange_to_size: exchangeToSize || null,
    source: adminInitiated ? "admin" : "customer", customer_email: order.customer_email,
    selected_items:selectedItems,return_policy_exception:policyException,
    support_authorized_lines:selectedItems.filter(line=>purchasedLines.find(item=>item.id===line.line_id)?.support_return_enabled).map(line=>line.line_id),
    return_window_exception: overrideWindow && windowExpired, exception_reason: (overrideWindow||policyException) ? overrideReason : null };
  // Claim, replacement, stock reservation and audit must succeed in one transaction.
  const claimStatements=[claim, env.DB.prepare(`INSERT INTO admin_audit_log
    (id,admin_email,action,entity_type,entity_id,details_json)
    SELECT ?,?,?,'return_request',?,? WHERE EXISTS(SELECT 1 FROM return_requests WHERE id=?)`)
    .bind(crypto.randomUUID(), String(user.email || "").toLowerCase(),adminInitiated?'admin_create_return_request':'create_return_request', id, JSON.stringify(auditDetails), id)];
  let replacement=null;
  if(type==='exchange') {
    try {
      replacement=await createReplacementOrder(env,order,exchangeItem,exchangeToSize,id,{notes:'',actor:user.email,immediate:true,claimStatements});
    } catch(error) {
      if(error.status===409 || /unclaimed eligible exchange|Purchased quantity already requested/i.test(String(error.message))) return json({error:'The replacement is no longer available, or these quantities have already been requested. Refresh the order and stock before trying again.'},409);
      throw error;
    }
  } else {
    let inserted;
    try{inserted=(await env.DB.batch(claimStatements))[0];}catch(error){if(/Purchased quantity already requested/i.test(String(error.message)))return json({error:'These quantities have already been requested. Refresh the order before trying again.'},409);throw error;}
    if(!inserted.meta?.changes)return json({error:'An after-sales request already exists, or this order changed. Refresh before trying again.'},409);
  }
  const createdRequest=await prepareReturnLabel(env,id,user.email);
  await createAdminNotification(env, {
    type: type === "exchange" ? "exchange_request" : "return_request",
    priority: "urgent",
    title: type === "exchange" ? "Arrange exchange return pickup" : "Arrange return pickup",
    message: `${order.customer_name || order.customer_email} · ${order.order_number || order.id}. Arrange collection from the customer to the warehouse and save courier tracking to publish the return label.${replacement ? ` Replacement ${replacement.order_number} is already in the normal packing queue.` : ' Refund approval remains separate.'}`,
    dedupeKey: `after-sales:${id}`,
    orderId
  }).catch(() => null);
  if (type === "refund" && refundDestination === "store_credit") {
    await createAdminNotification(env, { type: "return_request", priority: "urgent", ownerOnly: true,
      title: "Store-credit refund needs your approval", message: `${order.order_number || order.id} · ${formatInr(refundAmount)} · ${order.customer_email}`,
      dedupeKey: `credit-approval:${id}`, orderId }).catch(()=>null);
  }
  await sendReturnEmail(env, createdRequest, createdRequest.status).catch(()=>null);
  return json({ request: adminInitiated ? createdRequest : customerReturnView(createdRequest), replacement_order: replacement }, 201);
}

async function createReplacementOrder(env, originalOrder, exchangeItem, replacementSize, requestId,approval) {
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
  const orderNumber = buildOrderNumber(productNameInitials(item.name), sequence, /^(?:WB|VB)-/.test(String(originalOrder.order_number || "")) ? "wibrawl" : "glamia");
  const trackingToken = crypto.randomUUID().replace(/-/g, "");
  const reservation = { id: crypto.randomUUID(), productId: product.id, size: replacementSize, quantity };
  const replacementDelivery = deliveryPromise(parseSettingObject(originalOrder.shipping_json).state, (await storefrontSettingsObject(env)).customer_experience);
  const statements = [
    ...(approval.claimStatements||[]),
    env.DB.prepare("UPDATE return_requests SET status='approved',notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='requested'").bind(approval.notes,requestId),
    env.DB.prepare(`
      INSERT INTO orders
        (id, order_number, tracking_token, customer_email, customer_name, items_json, subtotal, discount, coupon_code, total, payable_total, credits_used, status, payment_method, payment_status, shipping_json, order_type, replacement_for_order_id, replacement_request_id,replacement_fulfilment_mode,delivery_estimate)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, 0, 0, 0, 'pending', 'replacement', 'not_required', ?, 'replacement', ?, ?, ?, ?)
    `).bind(
      id, orderNumber, trackingToken, originalOrder.customer_email, originalOrder.customer_name,
      JSON.stringify([item]), originalOrder.shipping_json || null,
      originalOrder.id, requestId, approval.immediate ? 'immediate' : 'after_receipt', replacementDelivery
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
      .bind(quantity, product.id, replacementSize, quantity),
    env.DB.prepare("UPDATE return_requests SET replacement_order_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND replacement_order_id IS NULL AND status='approved'").bind(id,requestId),
    env.DB.prepare("INSERT INTO admin_audit_log(id,admin_email,action,entity_type,entity_id,details_json) VALUES(?,?,?,'return_request',?,?)")
      .bind(crypto.randomUUID(),approval.actor,approval.immediate?'auto_create_exchange_replacement':'approve_exchange_replacement',requestId,JSON.stringify({from:'requested',to:'approved',automatic:Boolean(approval.immediate),replacement_fulfilment_mode:approval.immediate?'immediate':'after_receipt',replacement_order_id:id,original_order_id:originalOrder.id,is_replacement:true,order_type:'REPLACEMENT',subtotal:0,tax_total:0,shipping_total:0,total:0}))
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
  // Return email describes the two independent shipments; packing is not dispatch.
  return formatOrder(created);
}

const RETURN_WITH_ORDER_SELECT = `
  SELECT rr.*,
    g.id AS gateway_refund_id, g.state AS gateway_refund_state, g.total_paise AS gateway_refund_total_paise,
    g.gateway_paise AS gateway_refund_gateway_paise, g.credit_amount AS gateway_refund_credit_amount,
    g.provider AS gateway_refund_provider, g.provider_refund_id AS gateway_refund_provider_id,
    g.checked_at AS gateway_refund_checked_at, g.last_error AS gateway_refund_last_error,
    g.created_at AS gateway_refund_created_at, g.create_attempted AS gateway_refund_create_attempted,
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
    (SELECT ro.order_number FROM orders ro WHERE ro.id = rr.replacement_order_id) AS replacement_order_number,
    (SELECT ro.status FROM orders ro WHERE ro.id = rr.replacement_order_id) AS replacement_status,
    (SELECT ro.packing_status FROM orders ro WHERE ro.id = rr.replacement_order_id) AS replacement_packing_status,
    (SELECT ro.tracking_number FROM orders ro WHERE ro.id = rr.replacement_order_id) AS replacement_tracking_number
    ,(SELECT ro.replacement_fulfilment_mode FROM orders ro WHERE ro.id = rr.replacement_order_id) AS replacement_fulfilment_mode
  FROM return_requests rr
  LEFT JOIN orders o ON o.id = rr.order_id
  LEFT JOIN gateway_refunds g ON g.return_request_id = rr.id
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
  const refundState = row.type === "exchange" ? "not_applicable"
    : row.status === "rejected" ? "refund_rejected" : row.status === "cancelled" ? "refund_cancelled"
    : row.credit_approval_status === "credited" ? "store_credit_confirmed"
    : row.refund_destination === "store_credit" ? "awaiting_credit_approval_and_return"
    : row.gateway_refund_state ? `gateway_${row.gateway_refund_state}`
    : ["received", "refunded", "completed"].includes(row.status) ? "awaiting_owner_refund_approval"
    : row.status === "approved" ? "refund_pending" : "refund_requested";
  const result = { ...row, order, label_available: Boolean(row.label_key), refund_state: refundState, gateway_refund: publicGatewayRefund({
    id: row.gateway_refund_id, state: row.gateway_refund_state, total_paise: row.gateway_refund_total_paise,
    gateway_paise: row.gateway_refund_gateway_paise, credit_amount: row.gateway_refund_credit_amount,
    provider: row.gateway_refund_provider, provider_refund_id: row.gateway_refund_provider_id,
    checked_at: row.gateway_refund_checked_at, last_error: row.gateway_refund_last_error,
    created_at: row.gateway_refund_created_at, create_attempted: row.gateway_refund_create_attempted
  }) };
  result.pickup_confirmed_at=row.pickup_confirmed_at||null;
  result.returnStatus=row.pickup_confirmed_at && row.status==='approved' ? 'PICKED_UP_BY_COURIER' : String(row.status).toUpperCase();
  let logistics={};try{logistics=JSON.parse(row.logistics_json||'{}')||{};}catch{ /* Legacy record. */ }
  result.trackingNumber=logistics.tracking_number||'';
  for (const key of Object.keys(result)) {
    if (key.startsWith("joined_") || key.startsWith("gateway_refund_")) delete result[key];
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
    ? `${RETURN_WITH_ORDER_SELECT} ORDER BY rr.created_at DESC, rr.rowid DESC`
    : `${RETURN_WITH_ORDER_SELECT} WHERE rr.customer_email = ? ORDER BY rr.created_at DESC, rr.rowid DESC`;
  const statement = scope === "admin" ? env.DB.prepare(query) : env.DB.prepare(query).bind(user.email.toLowerCase());
  const { results } = await statement.all();
  return json({ requests: results.map(row=>scope === "admin" ? formatReturnWithOrder(row) : customerReturnView(formatReturnWithOrder(row))), ...(scope === "admin" ? {
    gateway_refunds_enabled: String(env.GATEWAY_REFUNDS_ENABLED).toLowerCase() === "true",
    automatic_gateway_refunds_enabled: String(env.AUTOMATIC_GATEWAY_REFUNDS_ENABLED).toLowerCase() === "true"
  } : {}) });
}

async function notifyCancellationRefund(env, refund) {
  const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(refund.order_id).first();
  if(!order)return;
  const review=['reconciliation_required','failed'].includes(refund.state);
  const confirmed=refund.state==='processed';
  if(review)await createAdminNotification(env,{type:'cancelled_order',ownerOnly:true,priority:'urgent',
    title:'Cancellation refund needs review',message:`${order.order_number||order.id} · ${refund.last_error||'Check payment evidence before issuing funds'}`,
    orderId:order.id,deepLink:`/admin/orders?order=${encodeURIComponent(order.id)}`,dedupeKey:`cancellation-review:${refund.id}:${refund.state}`}).catch(()=>null);
  const title=confirmed?'Cancellation refund confirmed':review?'Cancellation refund needs review':'Cancellation refund in progress';
  const message=confirmed
    ? `${refund.gateway_paise>0?`${formatInr(refund.gateway_paise/100)} confirmed by ${refund.provider}. Bank posting may take additional time.`:'No bank transfer was needed.'}${refund.credit_amount?` ${formatInr(refund.credit_amount)} restored to store credits.`:''}`
    : review?'Your order is cancelled. Glamia is checking its refund; do not retry a payment or share an OTP.'
    : 'Your order is cancelled. Its original-payment refund is queued or processing; confirmation will follow.';
  await createCustomerNotification(env,{email:order.customer_email,type:'cancellation_refund',title,message,orderId:order.id,
    deepLink:'/orders',dedupeKey:`cancellation-refund:${refund.id}:${refund.state}`}).catch(()=>null);
  // Durable email deduplication/retries are shared with order and return mail.
  const sent=await deliverBrevoEmail(env,{eventType:'cancellation_refund',dedupeKey:`cancellation-refund-email:${refund.id}:${refund.state}`,
    recipient:order.customer_email,userEmail:order.customer_email,orderId:order.id,payload:{
      sender:{name:env.BREVO_FROM_NAME||'Glamia',email:String(env.BREVO_FROM_EMAIL||'')},
      to:[{email:order.customer_email,name:order.customer_name||order.customer_email}],
      subject:`${title} · ${order.order_number||order.id}`,
      textContent:`${title}\nOrder: ${order.order_number||order.id}\n${message}\nTotal refund: ${formatInr(refund.total_paise/100)}\nTrack it in Your orders. Never share an OTP, PIN or password for a refund.`,
      htmlContent:`<h1>${escapeHtml(title)}</h1><p>Order ${escapeHtml(order.order_number||order.id)}</p><p>${escapeHtml(message)}</p><p>Total refund: ${escapeHtml(formatInr(refund.total_paise/100))}</p><p>Track it in Your orders. Never share an OTP, PIN or password for a refund.</p>`
    }}).catch(()=>false);
  if(confirmed&&sent)await env.DB.prepare('UPDATE cancellation_refunds SET notified_at=CURRENT_TIMESTAMP WHERE id=? AND notified_at IS NULL').bind(refund.id).run();
}

async function processCancellationRefund(env, orderId) {
  let refund=await env.DB.prepare('SELECT * FROM cancellation_refunds WHERE order_id=?').bind(orderId).first();
  if(!refund)return; // Historical cancellations are not silently paid out.
  try {
    const transport=(provider,path,init)=>gatewayRefundTransport(env,provider,path,init);
    if(refund.state==='approved' && String(env.GATEWAY_REFUNDS_ENABLED).toLowerCase()==='true') {
      refund=await executeGatewayRefund(env.DB,refund,transport,'system:order-cancellation');
    } else if(['submitting','pending','reconciliation_required'].includes(refund.state)) {
      refund=await reconcileGatewayRefund(env.DB,refund,transport);
    }
  } catch {
    // Cancellation succeeded even if the refund needs investigation. Keep a durable case.
    await env.DB.prepare(`UPDATE cancellation_refunds SET state='reconciliation_required',last_error='Cancellation payment evidence needs owner review',
      next_check_at=datetime('now','+15 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='approved'`).bind(refund.id).run();
    refund=await env.DB.prepare('SELECT * FROM cancellation_refunds WHERE id=?').bind(refund.id).first();
  }
  await notifyCancellationRefund(env,refund);
}

async function handleCancellationRefund(request,env,actor,orderId,action) {
  requireAdmin(actor);
  const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  if(!order)throw httpError('Order not found',404);
  let refund=await env.DB.prepare('SELECT * FROM cancellation_refunds WHERE order_id=?').bind(orderId).first();
  if(request.method==='GET'&&!action) {
    const events=refund?(await env.DB.prepare('SELECT state,actor,provider_refund_id,evidence_json,created_at FROM cancellation_refund_events WHERE refund_id=? ORDER BY id LIMIT 100').bind(refund.id).all()).results:[];
    return json({refund:cancellationRefundView(refund,order),events});
  }
  if(request.method!=='POST'||!['process','reconcile','recover'].includes(action))throw httpError('Not found',404);
  if(!actor.is_owner||!adminEmails(env,request).includes(String(actor.email||'').toLowerCase()))throw httpError('Only a whitelisted owner can manage cancellation refunds',403);
  if(!refund)throw httpError('This earlier cancellation requires a manual payment investigation; no new automatic payout was created',409);
  if(['process','recover'].includes(action)&&String(env.GATEWAY_REFUNDS_ENABLED).toLowerCase()!=='true')throw httpError('Gateway refund execution is disabled',503);
  const transport=(provider,path,init)=>gatewayRefundTransport(env,provider,path,init);
  if(action==='process'&&cancellationRefundView(refund,order).verification_retry_available) {
    // Only a whitelisted owner may retry pre-submission verification. Never
    // reset a claim after any provider POST might have happened.
    await env.DB.prepare(`UPDATE cancellation_refunds SET state='approved',last_actor=?,last_error='',next_check_at=CURRENT_TIMESTAMP
      WHERE id=? AND state='reconciliation_required' AND create_attempted=0 AND dispatch_eligible=1`).bind(actor.email,refund.id).run();
    refund=await env.DB.prepare('SELECT * FROM cancellation_refunds WHERE id=?').bind(refund.id).first();
  }
  refund=action==='process'?await executeGatewayRefund(env.DB,refund,transport,actor.email)
    :action==='recover'?await recoverRazorpayRefund(env.DB,refund,transport,actor.email)
    :await reconcileGatewayRefund(env.DB,refund,transport,actor.email);
  await notifyCancellationRefund(env,refund);
  const latest=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  return json({refund:cancellationRefundView(refund,latest),order:(await attachCancellationRefunds(env,[formatOrder(latest)]))[0]});
}

async function gatewayRefundTransport(env, provider, path, init = {}) {
  if(!['razorpay','phonepe'].includes(provider))throw httpError('Unsupported refund provider',409);
  let response = await (provider === "razorpay" ? razorpayRequest(env, path, init) : phonePeRequest(env, path, init));
  if (provider === "phonepe" && response.status === 401 && (init.method || "GET").toUpperCase() === "GET") {
    // Refresh revoked/expired credentials once for read-only status checks.
    // Never retry a financial POST, even when the response is an auth error.
    await response.body?.cancel();
    phonePeTokenCache = { token: "", expiresAt: 0, environment: "" };
    response = await phonePeRequest(env, path, init);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const rawCode = body?.code || body?.errorCode || body?.error?.code || "";
    const code = typeof rawCode === "string" && /^[A-Z0-9_]{1,80}$/i.test(rawCode) ? rawCode : "";
    const stage = /\/refund(?:s)?\/[^/]+(?:\/status)?$/.test(path) ? "refund status" : /\/refund$/.test(path) ? "refund creation" : "original payment verification";
    throw Object.assign(httpError("Gateway refund response was not successful", 502), {
      gatewayHttpStatus: response.status, gatewayErrorCode: code, gatewayStage: stage
    });
  }
  try {
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw httpError("Gateway refund response was unreadable", 502); }
}

async function notifyGatewayRefund(env, refund) {
  if (refund.state === "reconciliation_required" || refund.state === "failed") {
    await createAdminNotification(env, { type: "return_request", ownerOnly: true, priority: "urgent",
      title: "Gateway refund needs review", message: `${refund.order_id} · ${refund.provider} · ${refund.last_error || "Provider reported failure"}`,
      orderId: refund.order_id, dedupeKey: `gateway-refund-review:${refund.id}` }).catch(() => null);
    const returned=await getReturnRequest(env,refund.return_request_id);
    if(returned) {
      await createCustomerNotification(env,{email:returned.customer_email,type:"refund_review",title:"Your refund needs review",
        message:"Glamia is checking your refund with the payment provider. Do not submit another refund or share payment passwords.",orderId:refund.order_id,deepLink:"/orders",dedupeKey:`refund-review:${refund.id}:${refund.state}`}).catch(()=>null);
      await sendReturnEmail(env,returned,'review_required').catch(()=>false);
    }
  }
  if (refund.state !== "processed" || refund.notified_at) return;
  const returned = await getReturnRequest(env, refund.return_request_id);
  const sent = await sendReturnEmail(env, returned, "refunded");
  await createCustomerNotification(env, { email: returned.customer_email, type: "refund_confirmed", title: "Refund confirmed by payment provider",
    message: `${formatInr(refund.gateway_paise / 100)} refunded via ${refund.provider}${refund.credit_amount ? `; ${formatInr(refund.credit_amount)} restored to store credits` : ""}. Your bank's posting time may vary.`,
    orderId: refund.order_id, deepLink: "/orders", dedupeKey: `gateway-refund:${refund.id}` }).catch(() => null);
  if (sent) await env.DB.prepare("UPDATE gateway_refunds SET notified_at=CURRENT_TIMESTAMP WHERE id=? AND notified_at IS NULL").bind(refund.id).run();
}

async function handleGatewayRefund(request, env, actor, returnId, action) {
  if (request.method === "GET" && !action) {
    const refund = await env.DB.prepare("SELECT * FROM gateway_refunds WHERE return_request_id=?").bind(returnId).first();
    if (!await getReturnRequest(env, returnId)) throw httpError("Return request not found", 404);
    const events = refund ? (await env.DB.prepare("SELECT state,actor,provider_refund_id,evidence_json,created_at FROM gateway_refund_events WHERE refund_id=? ORDER BY id ASC LIMIT 100").bind(refund.id).all()).results : [];
    return json({ refund: publicGatewayRefund(refund), events });
  }
  if (request.method !== "POST" || !action) throw httpError("Not found", 404);
  if (!actor.is_owner || !adminEmails(env, request).includes(String(actor.email || "").toLowerCase())) throw httpError("Only a whitelisted owner can approve or execute gateway refunds", 403);
  if (["execute", "recover", "process"].includes(action) && String(env.GATEWAY_REFUNDS_ENABLED).toLowerCase() !== "true") throw httpError("Gateway refund execution is disabled until sandbox verification is complete", 503);
  const transport = (provider, path, init) => gatewayRefundTransport(env, provider, path, init);
  let refund;
  if (action === 'process') {
    const returned=await getReturnRequest(env,returnId);
    if(!returned || (!returned.pickup_confirmed_at && returned.status!=='received')) throw httpError('Confirm courier pickup before processing this refund',409);
    refund=await approveGatewayRefund(env.DB,returnId,actor.email);
    refund=await executeGatewayRefund(env.DB,refund,transport,actor.email);
  }
  else if (action === "approve") refund = await approveGatewayRefund(env.DB, returnId, actor.email, (await readJson(request)).amount);
  else {
    refund = await env.DB.prepare("SELECT * FROM gateway_refunds WHERE return_request_id=?").bind(returnId).first();
    if (!refund) throw httpError("Approve the refund first", 409);
    refund = action === "execute" ? await executeGatewayRefund(env.DB, refund, transport, actor.email)
      : action === "recover" ? await recoverRazorpayRefund(env.DB, refund, transport, actor.email)
      : await reconcileGatewayRefund(env.DB, refund, transport, actor.email);
  }
  await notifyGatewayRefund(env, refund);
  return json({ request: await getReturnRequest(env, returnId), refund: publicGatewayRefund(refund) });
}

async function processGatewayRefunds(env) {
  const {results:cancellations}=await env.DB.prepare(`SELECT order_id FROM cancellation_refunds WHERE
    (state IN ('approved','submitting','pending','reconciliation_required') AND next_check_at<=CURRENT_TIMESTAMP)
    OR (state='processed' AND notified_at IS NULL) ORDER BY COALESCE(next_check_at,created_at) LIMIT 10`).all();
  for(const refund of cancellations)await processCancellationRefund(env,refund.order_id);
  if (String(env.AUTOMATIC_GATEWAY_REFUNDS_ENABLED).toLowerCase() === "true" && String(env.GATEWAY_REFUNDS_ENABLED).toLowerCase() === "true") {
    const { results: automatic } = await env.DB.prepare(`SELECT r.id FROM return_requests r
      LEFT JOIN gateway_refunds g ON g.return_request_id=r.id
      WHERE r.status='received' AND r.automatic_refund_requested_at IS NOT NULL
        AND r.automatic_refund_next_attempt_at <= CURRENT_TIMESTAMP AND (g.id IS NULL OR g.state='approved')
      ORDER BY r.automatic_refund_next_attempt_at LIMIT 10`).all();
    for (const returned of automatic) await processAutomaticReturnRefund(env, returned.id);
  }
  const { results } = await env.DB.prepare(`SELECT * FROM gateway_refunds WHERE
    (state IN ('submitting','pending','reconciliation_required') AND next_check_at <= CURRENT_TIMESTAMP)
    OR (state='processed' AND notified_at IS NULL) ORDER BY COALESCE(next_check_at,created_at) LIMIT 10`).all();
  for (const refund of results || []) {
    const current = await reconcileGatewayRefund(env.DB, refund, (provider, path, init) => gatewayRefundTransport(env, provider, path, init));
    await notifyGatewayRefund(env, current);
  }
}

async function processAutomaticReturnRefund(env, returnId) {
  if (String(env.GATEWAY_REFUNDS_ENABLED).toLowerCase() !== "true" || String(env.AUTOMATIC_GATEWAY_REFUNDS_ENABLED).toLowerCase() !== "true") return;
  const returned = await env.DB.prepare("SELECT * FROM return_requests WHERE id=?").bind(returnId).first();
  if (!returned?.automatic_refund_requested_at || returned.status !== "received") return;
  try {
    if (!adminEmails(env).includes(String(returned.automatic_refund_requested_by || "").toLowerCase())) throw httpError("Receipt authorisation requires a current whitelisted owner", 403);
    const amount = (returned.automatic_refund_amount_paise / 100).toFixed(2);
    let refund = await approveGatewayRefund(env.DB, returnId, returned.automatic_refund_requested_by, amount);
    await env.DB.prepare("UPDATE return_requests SET automatic_refund_error='' WHERE id=?").bind(returnId).run();
    refund = await executeGatewayRefund(env.DB, refund, (provider, path, init) => gatewayRefundTransport(env, provider, path, init), returned.automatic_refund_requested_by);
    await env.DB.prepare("UPDATE return_requests SET automatic_refund_next_attempt_at=NULL WHERE id=?").bind(returnId).run();
    await notifyGatewayRefund(env, refund);
  } catch {
    // The immutable intent survives a Worker interruption; the cron only resumes
    // an unclaimed approved case. Never retry an uncertain financial POST here.
    await env.DB.prepare("UPDATE return_requests SET automatic_refund_error=?,automatic_refund_next_attempt_at=NULL WHERE id=?")
      .bind("Automatic refund needs owner review. Check the order/payment and refund log; do not create another refund.", returnId).run();
    await createAdminNotification(env, { type: "return_request", ownerOnly: true, priority: "urgent",
      title: "Automatic refund needs review", message: returnId,
      orderId: returned.order_id, dedupeKey: `automatic-refund-review:${returnId}` }).catch(() => null);
    await createCustomerNotification(env,{email:returned.customer_email,type:'refund_review',title:'Your refund needs review',message:'Glamia is reviewing the payment checks for your refund. No new request is needed.',orderId:returned.order_id,deepLink:'/orders',dedupeKey:`automatic-refund-review:${returnId}`}).catch(()=>null);
    await sendReturnEmail(env,returned,'review_required').catch(()=>false);
  }
}

async function prepareReturnLabel(env,id,actor) {
  const current=await getReturnRequest(env,id);
  try {
    const settings=await storefrontSettingsObject(env,true);
    await saveReturnLogistics(new Request('https://internal/return-label',{method:'PATCH',body:JSON.stringify({prepare_label:true})}),env,current,actor,{
      warehouse_address:settings.fulfillment?.warehouse_address,shipping:current.order?.shipping,customer_name:current.order?.customer_name
    });
  } catch {
    // The request/order is durable even if private label storage or a concurrent update fails.
    // The logistics form offers a safe retry; never repeat a replacement stock debit.
  }
  return getReturnRequest(env,id);
}

async function updateReturnRequest(request, env, user, id, ctx) {
  requireReturnsAdmin(user);
  const body = await readJson(request);
  const requestedStatus = String(body.status || "").trim().toLowerCase();
  const status = requestedStatus === "returned" ? "received" : requestedStatus;
  const returnStatuses = ["requested", "approved", "rejected", "received", "refunded", "completed", "cancelled"];
  if (!returnStatuses.includes(status)) {
    return json({ error: "Invalid after-sales status" }, 400);
  }
  const current = await env.DB.prepare("SELECT * FROM return_requests WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "After-sales request not found" }, 404);
  const gatewayRefund = await env.DB.prepare("SELECT state,total_paise FROM gateway_refunds WHERE return_request_id=?").bind(id).first();
  if (gatewayRefund && (status !== current.status && !(gatewayRefund.state === "processed" && status === "completed")
    || (body.refund_amount != null && Math.round(Number(body.refund_amount)*100) !== gatewayRefund.total_paise))) {
    return json({ error: "An approved gateway refund locks the amount and return status. Use refund reconciliation." }, 409);
  }
  const allowedTransitions = {
    requested: new Set(["approved", "rejected", "cancelled"]),
    approved: new Set(["received", "refunded", "rejected", "cancelled"]),
    received: new Set(["refunded", "rejected", "cancelled", ...(current.type==='exchange' ? ['completed'] : [])]),
    refunded: new Set(["completed"]),
    rejected: new Set(),
    completed: new Set(),
    cancelled: new Set()
  };
  if (status !== current.status && !allowedTransitions[current.status]?.has(status)) {
    return json({ error: `Cannot move an after-sales request from ${current.status} to ${status}` }, 409);
  }
  if (status === current.status) return json({ request: status==='approved' ? await prepareReturnLabel(env,id,user.email) : await getReturnRequest(env, id) });
  if (status === "refunded" || (status === "completed" && current.type !== "exchange" && current.credit_approval_status !== "credited" && gatewayRefund?.state !== "processed")) {
    return json({ error: "Record return receipt as Received; original-payment refunds are marked refunded only after verified provider execution. Use the approved Store credits workflow for credit refunds." }, 409);
  }
  const notes = String(body.notes ?? current.notes ?? "").trim().slice(0, 1000);
  if(status==='rejected' && notes.length<10) return json({error:'Explain the decision to the customer in at least 10 characters'},400);
  if(status==='completed' && current.type==='exchange') {
    const replacement=await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(current.replacement_order_id).first();
    if(replacement?.status!=='delivered') return json({error:'Complete the exchange after the replacement is delivered'},409);
  }
  if(status==='approved' && current.type==='exchange' && !current.replacement_order_id) {
    const original=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(current.order_id).first();
    const selected=JSON.parse(current.selected_items_json||'[]').find(item=>item.product_id===current.exchange_product_id && item.size===current.exchange_from_size);
    const item=await env.DB.prepare('SELECT product_id AS id,product_name,quantity,variant,color,image_url FROM order_items WHERE order_id=? AND id=?')
      .bind(current.order_id,selected?.line_id||'').first();
    if(!original||!item) return json({error:'The purchased exchange item needs review'},409);
    item.quantity=selected?.quantity||item.quantity;
    let replacement;
    try {replacement=await createReplacementOrder(env,original,item,current.exchange_to_size,id,{notes,actor:user.email});}
    catch(error) {
      const latest=await getReturnRequest(env,id);
      if(latest?.status==='approved' && latest.replacement_order_id) return json({request:latest});
      if(error.status===409||/insufficient replacement stock/i.test(error.message)) return json({error:'The replacement size is no longer available. Approval was not saved.'},409);
      throw error;
    }
    const approved=await prepareReturnLabel(env,id,user.email);
    await sendReturnEmail(env,approved,'approved');
    return json({request:approved,replacement_order:replacement});
  }
  const order = current.order_id ? await env.DB.prepare("SELECT total, payment_method, credits_used, payment_status, status FROM orders WHERE id = ?").bind(current.order_id).first() : null;
  const orderTotal = Math.max(0, Math.floor(Number(order?.total) || 0));
  const refundDestination = ["cod", "demo"].includes(order?.payment_method) ? "store_credit" : (current.refund_destination || "original");
  const automatic = status === "received" && current.type === "refund" && refundDestination === "original"
    && String(env.AUTOMATIC_GATEWAY_REFUNDS_ENABLED).toLowerCase() === "true";
  if (automatic && (!user.is_owner || !adminEmails(env, request).includes(String(user.email || "").toLowerCase()))) {
    return json({ error: "A whitelisted owner must mark this original-payment return Received because it automatically sends the refund" }, 403);
  }
  if (automatic && (String(env.GATEWAY_REFUNDS_ENABLED).toLowerCase() !== "true" || order?.payment_status !== "paid" || order?.status !== "delivered" || !["razorpay", "phonepe"].includes(order?.payment_method))) {
    return json({ error: "Automatic refund requires enabled execution and a paid, delivered gateway order" }, 409);
  }
  const automaticPaise = automatic ? (current.requested_amount_paise ?? refundPaise(order.total)) : null;
  const refundAmount = automatic ? automaticPaise / 100 : gatewayRefund ? gatewayRefund.total_paise / 100 : body.refund_amount === "" || body.refund_amount === null || body.refund_amount === undefined
    ? Math.max(0, Number(current.refund_amount) || orderTotal)
    : Number(body.refund_amount);
  if ((refundDestination==='store_credit' && !Number.isSafeInteger(refundAmount)) || !Number.isFinite(refundAmount) || !Number.isSafeInteger(Math.round(refundAmount*100)) || Math.abs(refundAmount*100-Math.round(refundAmount*100))>.000001 || refundAmount < 0 || refundAmount > Number(order?.total||0)) {
    return json({ error: `Refund amount must be between ₹0 and ${formatInr(orderTotal)}` }, 400);
  }
  if (refundAmount !== Number(current.refund_amount) && ["approved", "credited"].includes(current.credit_approval_status)) return json({ error: "An approved credit refund amount cannot be changed" }, 409);
  if(current.requested_amount_paise!==null && Math.round(refundAmount*100)>current.requested_amount_paise) return json({error:"Refund cannot exceed the selected purchased items"},409);
  if(["rejected","cancelled"].includes(status)&&current.type==='exchange') {
    const replacement=await env.DB.prepare("SELECT status FROM orders WHERE id=?").bind(current.replacement_order_id).first();
    if(['shipped','delivered'].includes(replacement?.status)) return json({error:"The replacement was dispatched. Contact an owner to investigate before closing this case."},409);
  }
  if (status === "refunded" && refundDestination === "store_credit") return json({ error: "Mark the order Returned / received, then use Store credits for whitelisted-admin approval. Credits release automatically when both are recorded." }, 409);
  const processedAt = status === "refunded" ? (current.refund_processed_at || new Date().toISOString()) : current.refund_processed_at;
  const statements = [env.DB.prepare(`UPDATE return_requests SET status = ?, notes = ?, refund_amount = ?, refund_processed_at = ?, refund_destination = ?, returned_at = CASE WHEN ? = 'received' THEN COALESCE(returned_at,CURRENT_TIMESTAMP) ELSE returned_at END,
    automatic_refund_requested_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE automatic_refund_requested_at END,
    automatic_refund_requested_by=CASE WHEN ? THEN ? ELSE automatic_refund_requested_by END,
    automatic_refund_amount_paise=CASE WHEN ? THEN ? ELSE automatic_refund_amount_paise END,
    automatic_refund_next_attempt_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE automatic_refund_next_attempt_at END,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`)
    .bind(status, notes, refundAmount, processedAt, refundDestination, status, automatic ? 1 : 0,
      automatic ? 1 : 0, String(user.email || "").toLowerCase(), automatic ? 1 : 0, automaticPaise, automatic ? 1 : 0, id, current.status)];
  if (status === "refunded" && refundDestination === "original" && refundAmount > 0 && Number(order?.credits_used) > 0) {
    const customerEmail = String(current.customer_email || "").trim().toLowerCase();
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO store_credit_ledger (id, user_email, amount, kind, description, order_id, return_request_id, idempotency_key) VALUES (?, ?, ?, 'refund', ?, ?, ?, ?)")
      .bind(`original-credit:${id}`, customerEmail, Math.min(Number(order.credits_used), refundAmount), `Store-credit portion restored for ${current.order_id}`, current.order_id, id, `original-credit:${id}`));
  }
  const updatedResults=await env.DB.batch(statements);
  if(!updatedResults[0]?.meta?.changes) return json({error:'This return changed. Refresh before trying again.'},409);
  invalidateProductEnrichment();
  await writeAuditLog(env, user.email, "update_return_request", "return_request", id, { from: current.status, to: status });
  if (automatic) {
    const processing = processAutomaticReturnRefund(env, id);
    if (ctx?.waitUntil) ctx.waitUntil(processing);
    else await processing;
  }
  const updatedRequest = status==='approved' ? await prepareReturnLabel(env,id,user.email) : await getReturnRequest(env, id);
  if (updatedRequest.credit_approval_status === "credited") await notifyCreditRefund(env, updatedRequest);
  else await sendReturnEmail(env, updatedRequest, updatedRequest.status);
  return json({ request: updatedRequest });
}

async function confirmReturnPickup(request,env,user,id) {
  requireReturnsAdmin(user);
  const current=await getReturnRequest(env,id);
  if(!current) return json({error:'Return request not found'},404);
  if(current.pickup_confirmed_at) return json({request:current,idempotent:true});
  const logistics=JSON.parse(current.logistics_json||'{}');
  if(current.status!=='approved'||!logistics.carrier||!logistics.tracking_number) return json({error:'Approve the request and assign a courier and tracking number first'},409);
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE return_requests SET pickup_confirmed_at=CURRENT_TIMESTAMP,pickup_confirmed_by=?,logistics_json=json_set(logistics_json,'$.pickup_status','collected'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved' AND pickup_confirmed_at IS NULL")
      .bind(user.email,id),
    env.DB.prepare("INSERT OR IGNORE INTO admin_audit_log(id,admin_email,action,entity_type,entity_id,details_json) SELECT ?,?,'return_courier_pickup','return_request',id,? FROM return_requests WHERE id=? AND pickup_confirmed_by=?")
      .bind(`pickup:${id}`,user.email,JSON.stringify({status:'PICKED_UP_BY_COURIER',courier_name:logistics.carrier,tracking_number:logistics.tracking_number}),id,user.email)
  ]);
  if(!results[0].meta?.changes) {
    const latest=await getReturnRequest(env,id);
    return latest?.pickup_confirmed_at ? json({request:latest,idempotent:true}) : json({error:'The return changed before pickup was recorded. Refresh first.'},409);
  }
  await createCustomerNotification(env,{email:current.customer_email,type:'return_update',title:'Your return has been collected',message:'Courier pickup is confirmed. Follow refund or exchange progress in Your orders.',orderId:current.order_id,deepLink:'/orders',dedupeKey:`return-pickup:${id}`}).catch(()=>null);
  return json({request:await getReturnRequest(env,id)});
}

async function completeReturnComplaint(request,env,user,id) {
  requireReturnsAdmin(user);
  const body=await readJson(request);
  const reason=typeof body.reason==='string' ? body.reason.trim() : '';
  if(reason.length<10 || reason.length>1000 || body.acknowledge!==true) return json({error:'Provide a reason (10–1000 characters) and confirm that closing the complaint does not confirm or issue a refund.'},400);
  const current=await getReturnRequest(env,id);
  if(!current) return json({error:'Return request not found'},404);
  if(current.case_completed_at) return json({request:current,idempotent:true});
  // One atomic claim + audit. Never touch refund, order, credit, stock or custody
  // fields; provider reconciliation continues even when the complaint is closed.
  const results=await env.DB.batch([
    env.DB.prepare('UPDATE return_requests SET case_completed_at=CURRENT_TIMESTAMP,case_completed_by=?,case_completion_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND case_completed_at IS NULL').bind(user.email,reason,id),
    env.DB.prepare("INSERT INTO admin_audit_log(id,admin_email,action,entity_type,entity_id,details_json) SELECT ?,?,'complete_return_complaint','return_request',id,? FROM return_requests WHERE id=? AND changes()>0")
      .bind(crypto.randomUUID(),user.email,JSON.stringify({reason,workflow_status:current.status,refund_state:current.gateway_refund?.state||current.refund_state||null,financial_status_preserved:true}),id)
  ]);
  return json({request:await getReturnRequest(env,id),idempotent:!results[0]?.meta?.changes});
}

async function confirmWarehouseReceipt(request,env,user,id,ctx) {
  requireReturnsAdmin(user);
  const current=await getReturnRequest(env,id);
  if(!current) return json({error:'Return request not found'},404);
  if(current.returned_at) return json({request:current,idempotent:true});
  if(!['approved','received','refunded','completed'].includes(current.status)) return json({error:'Approve the return before recording warehouse receipt'},409);
  if(!current.gateway_refund && current.credit_approval_status!=='credited' && current.status==='approved') {
    const change=new Request(request.url,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'received'})});
    return updateReturnRequest(change,env,user,id,ctx);
  }
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE return_requests SET returned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND returned_at IS NULL AND status IN ('approved','received','refunded','completed')").bind(id),
    env.DB.prepare("INSERT INTO admin_audit_log(id,admin_email,action,entity_type,entity_id,details_json) SELECT ?,?,'return_warehouse_receipt','return_request',id,? FROM return_requests WHERE id=? AND changes()>0").bind(crypto.randomUUID(),user.email,JSON.stringify({financial_status_preserved:true}),id)
  ]);
  const latest=await getReturnRequest(env,id);
  if(!results[0]?.meta?.changes && !latest?.returned_at) return json({error:'This return changed. Refresh first.'},409);
  return json({request:latest});
}

async function handleCreditAdmin(request, env, actor, path, url) {
  const authority = creditAuthority(actor, Boolean(actor.is_owner && adminEmails(env, request).includes(String(actor.email || "").toLowerCase())));
  if (!authority.allowed) throw httpError("Store credits permission is required", 403);
  if (request.method === "GET" && path === "/api/admin/credits") return json(await creditAdminData(env, actor, authority, url.searchParams.get("q") || ""));
  if (request.method === "POST" && path === "/api/admin/credits/grants") {
    const result = await grantStoreCredits(env, actor, authority, await readJson(request));
    if (!result.idempotent) await writeAuditLog(env, actor.email, "grant_store_credits", "credit", result.entry.id, { email: result.entry.user_email, amount: result.entry.amount });
    await createCustomerNotification(env, { email: result.entry.user_email, type: "store_credit", title: "Store credits added",
      message: `${formatInr(result.entry.amount)} was added to your Glamia credits. ${result.entry.description}`, deepLink: "/credits", dedupeKey: `credit:${result.entry.id}` }).catch(() => null);
    return json(result, result.idempotent ? 200 : 201);
  }
  if (request.method === "PATCH" && path === "/api/admin/credits/settings") {
    const settings = await saveCreditSettings(env, actor, authority, await readJson(request));
    await writeAuditLog(env, actor.email, "store_credit_settings", "credit_settings", "1", settings);
    return json({ settings });
  }
  const refund = path.match(/^\/api\/admin\/credits\/refunds\/([^/]+)$/);
  if (request.method === "POST" && refund) {
    const body = await readJson(request);
    const result = await decideCreditRefund(env, actor, authority, decodeURIComponent(refund[1]), body.decision);
    await writeAuditLog(env, actor.email, "store_credit_refund_decision", "return_request", result.request.id, { decision: body.decision });
    await notifyCreditRefund(env, result.request);
    return json(result);
  }
  return json({ error: "Not found" }, 404);
}

async function notifyCreditRefund(env, refund) {
  if (refund.credit_approval_status !== "credited") return;
  await createCustomerNotification(env, { email: refund.customer_email, type: "store_credit_refund", title: "Refund added to store credits",
    message: `${formatInr(refund.refund_amount)} is now available in your Glamia credits.`, orderId: refund.order_id, deepLink: "/credits", dedupeKey: `credit-refund:${refund.id}` }).catch(() => null);
  await env.DB.prepare("UPDATE admin_notifications SET read_at = CURRENT_TIMESTAMP, dismissed_at = CURRENT_TIMESTAMP WHERE dedupe_key = ?")
    .bind(`credit-approval:${refund.id}`).run();
  await sendReturnEmail(env, refund, "refunded");
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

function requireSupportStaff(user) {
  requireAdmin(user);
  if(user.employee_id && !user.is_owner && user.employee_permissions?.support!==true)throw httpError('Customer support permission is required',403);
}

async function supportOrderContextData(env,order,{internal=false,referenceLineIds=[]}={}) {
  const [lines,cases]=await Promise.all([purchasedReturnLines(env,order.id),env.DB.prepare('SELECT status,selected_items_json FROM return_requests WHERE order_id=?').bind(order.id).all()]);
  const remaining=remainingReturnLines(lines,cases.results);
  const activeCase=cases.results.some(item=>!['rejected','cancelled','completed','refunded'].includes(item.status));
  const payment=adminReturnPaymentOptions(order);
  const windowOpen=!orderReturnWindow(order);
  const canEnable=order.status==='delivered' && windowOpen && (payment.refund_available||payment.exchange_available) && !activeCase;
  const context={
    order:{id:order.id,order_number:order.order_number,status:order.status,payment_status:order.payment_status,payment_method:order.payment_method,
      total:order.total,created_at:order.created_at,delivered_at:order.delivered_at,return_window_days:RETURN_WINDOW_DAYS,return_window_open:windowOpen},
    referenced_line_ids:referenceLineIds,
    items:remaining.map(line=>({line_id:line.id,product_id:line.product_id,product_name:line.product_name,image_url:line.image_url||'',color:line.color||'',size:line.size||'',
      quantity:line.quantity,remaining_quantity:line.remaining_quantity,unit_price:line.unit_price,
      standard_returnable:line.returnable_snapshot===1,policy_snapshot_known:line.returnable_snapshot!==null,
      returnable:Boolean(line.eligible_returnable),support_return_enabled:Boolean(line.support_return_enabled),
      referenced:referenceLineIds.includes(line.id),can_enable:internal&&canEnable&&line.remaining_quantity>0&&line.returnable_snapshot!==1})),
    eligibility_message:activeCase?'An after-sales request is already in progress.':order.status!=='delivered'?'Returns open after delivery.':!windowOpen?'The return window is closed. An owner must handle any window exception.':!payment.refund_available&&!payment.exchange_available?'This order has no eligible settled payment.':'',
  };
  if(internal)context.access_history=(await env.DB.prepare('SELECT id,order_item_id,enabled,actor,reason,created_at FROM order_return_access_events WHERE order_id=? ORDER BY id DESC LIMIT 50').bind(order.id).all()).results;
  return context;
}

async function supportTicketLinkedOrder(env,user,ticketId) {
  requireSupportStaff(user);
  const ticket=await env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(ticketId).first();
  if(!ticket)throw httpError('Support ticket not found',404);
  const order=ticket.order_id ? await env.DB.prepare('SELECT * FROM orders WHERE (id=? OR order_number=?) AND LOWER(TRIM(customer_email))=?')
    .bind(ticket.order_id,ticket.order_id,String(ticket.customer_email).trim().toLowerCase()).first() : null;
  return {ticket,order};
}

async function supportTicketOrderContext(env,user,ticketId) {
  const {ticket,order}=await supportTicketLinkedOrder(env,user,ticketId);
  if(!order)return json({order:null,items:[],access_history:[],eligibility_message:ticket.order_id?'The linked order could not be verified for this customer.':'This is a general enquiry; no order is linked.'});
  return json(await supportOrderContextData(env,order,{internal:true,referenceLineIds:supportLineReferences(ticket.referenced_line_ids_json)}));
}

async function updateSupportReturnAccess(request,env,user,ticketId) {
  const {ticket,order}=await supportTicketLinkedOrder(env,user,ticketId);
  if(!order)return json({error:'A verified customer order must be linked to this ticket'},409);
  const body=await readJson(request);
  const reason=String(body.reason||'').trim();
  if(typeof body.enabled!=='boolean')return json({error:'Choose whether to enable or disable return access'},400);
  if(reason.length<10||reason.length>500)return json({error:'Explain this manual decision in 10–500 characters. It stays in the staff audit log.'},400);
  if(!Array.isArray(body.line_ids)||!body.line_ids.length||body.line_ids.length>100||body.line_ids.some(id=>typeof id!=='string'))return json({error:'Choose the purchased items for this order'},400);
  const context=await supportOrderContextData(env,order,{internal:true});
  const ids=[...new Set(body.line_ids)];
  if(ids.some(id=>!context.items.some(line=>line.line_id===id)))return json({error:'An item does not belong to this order'},400);
  if(ids.some(id=>context.items.find(line=>line.line_id===id).standard_returnable))return json({error:'Standard returnable items do not need a policy exception'},400);
  if(context.eligibility_message)return json({error:context.eligibility_message},409);
  if(body.enabled && ids.some(id=>context.items.find(line=>line.line_id===id).remaining_quantity<1))return json({error:'These purchased quantities already have return requests'},409);
  const changedIds=ids.filter(id=>context.items.find(line=>line.line_id===id).support_return_enabled!==body.enabled);
  if(!changedIds.length)return supportTicketOrderContext(env,user,ticketId);
  const statements=changedIds.map(id=>env.DB.prepare(`INSERT INTO order_return_access(order_item_id,order_id,ticket_id,enabled,actor,reason)
    VALUES(?,?,?,?,?,?) ON CONFLICT(order_item_id) DO UPDATE SET ticket_id=excluded.ticket_id,enabled=excluded.enabled,actor=excluded.actor,reason=excluded.reason,updated_at=CURRENT_TIMESTAMP
    WHERE order_return_access.enabled!=excluded.enabled`)
    .bind(id,order.id,ticket.id,body.enabled?1:0,String(user.email).trim().toLowerCase(),reason));
  statements.push(env.DB.prepare(`INSERT INTO admin_audit_log(id,admin_email,action,entity_type,entity_id,details_json) VALUES(?,?,'support_return_access','order',?,?)`)
    .bind(crypto.randomUUID(),user.email,order.id,JSON.stringify({ticket_id:ticket.id,line_ids:changedIds,enabled:body.enabled,reason})));
  try { await env.DB.batch(statements); }
  catch(error){if(/return request already uses/i.test(String(error.message)))return json({error:'A return request was created while you were editing. Refresh the order; existing requests are not changed.'},409);throw error;}
  // Enabling access does not submit a return, send chat, approve a refund or alter stock.
  return supportTicketOrderContext(env,user,ticketId);
}

function supportTicketView(row, internal = false) {
  return {
    id: row.id, ticket_number: row.ticket_number, customer_email: row.customer_email,
    customer_name: row.customer_name, order_id: row.order_id || "", subject: row.subject,
    message: row.message, status: row.status, priority: row.priority,
    referenced_line_ids: supportLineReferences(row.referenced_line_ids_json),
    ...(internal ? {admin_note: row.admin_note || ""} : {}), created_at: row.created_at, updated_at: row.updated_at,
    resolved_at: row.resolved_at || null
  };
}

async function createSupportTicket(request, env, user) {
  const body = await readJson(request);
  // Account identity is authoritative; optional contact fields cannot move a ticket
  // (or the linked order) into another customer's support history.
  const email = String(user?.email || body.email || "").trim().toLowerCase();
  const name = String(body.name || user?.name || "").trim().slice(0, 100);
  const subject = String(body.subject || "").trim().slice(0, 140);
  const message = String(body.message || "").trim().slice(0, 2000);
  const orderId = String(body.order_id || "").trim().slice(0, 100);
  if (body.topic === "return_exchange" && !user) return json({ error: "Sign in to choose the order you need help with" }, 401);
  if (body.topic === "return_exchange" && !orderId) return json({ error: "Choose the order you need help with first" }, 400);
  if (!isRealCustomerEmail(email)) return json({ error: "Enter a valid email address" }, 400);
  if (subject.length < 3) return json({ error: "Add a short subject" }, 400);
  if (message.length < 10) return json({ error: "Tell us a little more so we can help" }, 400);
  let referenceLineIds=[];
  if(body.item_line_ids!==undefined && (!Array.isArray(body.item_line_ids)||body.item_line_ids.length>100)) return json({error:'Choose valid purchased items'},400);
  if (orderId) {
    if (!user) return json({ error: "Sign in to link an order to your support request" }, 401);
    const order = await env.DB.prepare("SELECT id, customer_email FROM orders WHERE id = ? OR order_number = ? LIMIT 1").bind(orderId, orderId).first();
    if (!order) return json({ error: "That order could not be found" }, 400);
    if (user && String(order.customer_email).toLowerCase() !== String(user.email).toLowerCase()) return json({ error: "That order does not belong to this account" }, 403);
    const lines=await purchasedReturnLines(env,order.id);
    referenceLineIds=[...new Set(body.item_line_ids||[])];
    if(referenceLineIds.some(id=>typeof id!=='string'||!lines.some(line=>line.id===id)))return json({error:'Choose items purchased on this order'},400);
    if(!referenceLineIds.length && lines.length===1)referenceLineIds=[lines[0].id];
  }
  else if(body.item_line_ids?.length)return json({error:'Choose an order before choosing items'},400);
  const id = crypto.randomUUID();
  const ticketNumber = `GM-SUP-${istDayKey().replace(/-/g, "")}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  await env.DB.prepare("INSERT INTO support_tickets (id, ticket_number, customer_email, customer_name, order_id, subject, message,referenced_line_ids_json) VALUES (?, ?, ?, ?, ?, ?, ?,?)")
    .bind(id, ticketNumber, email, name, orderId, subject, message,JSON.stringify(referenceLineIds)).run();
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
  return json({ tickets: results.map(row=>supportTicketView(row,scope==='admin')) });
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
  return json({ messages: user.role==='admin'?results:results.map(row=>Object.fromEntries(['id','ticket_id','sender_role','message','created_at'].map(key=>[key,row[key]]))) });
}

async function escalateOwnSupportTicket(env,user,ticketId){
  const ticket=await env.DB.prepare('SELECT * FROM support_tickets WHERE id=? AND LOWER(customer_email)=?').bind(ticketId,user.email.toLowerCase()).first();
  if(!ticket)return json({error:'Support ticket not found'},404);
  if(['closed','resolved'].includes(ticket.status))return json({error:'Reply to reopen this conversation first'},409);
  const latest=await env.DB.prepare('SELECT id,sender_role,created_at FROM support_messages WHERE ticket_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(ticketId).first();
  const hours=(await storefrontSettingsObject(env)).customer_experience.support_hours;
  const raw=String(latest?.created_at||ticket.created_at);
  const since=Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)?raw.replace(' ','T')+'Z':raw);
  if(latest?.sender_role==='admin'||!Number.isFinite(since)||Date.now()-since<hours*3600000)return json({error:'The reply target has not passed, or care has already replied'},409);
  // Claim only the same still-unanswered message. A concurrent care reply wins.
  const changed=await env.DB.prepare(`UPDATE support_tickets SET priority='urgent',updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND LOWER(customer_email)=? AND status NOT IN ('closed','resolved') AND priority!='urgent'
      AND COALESCE((SELECT id FROM support_messages WHERE ticket_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1),'')=?`)
    .bind(ticketId,user.email.toLowerCase(),ticketId,latest?.id||'').run();
  if(!changed.meta.changes)return json({error:'This request was already escalated or the conversation has changed. Refresh to see the latest reply.'},409);
  await createAdminNotification(env,{type:'support_ticket',priority:'urgent',title:'Overdue care request',message:`${ticket.ticket_number}: customer requested priority review.`,dedupeKey:`support-escalate:${ticket.id}:${latest?.created_at||ticket.created_at}`,ticketId:ticket.id});
  return json({ok:true});
}

async function createSupportMessage(request, env, user, ticketId) {
  await supportTicketForUser(env, user, ticketId);
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
  return json({ message: senderRole==='admin'?created:Object.fromEntries(['id','ticket_id','sender_role','message','created_at'].map(key=>[key,created[key]])), ticket: supportTicketView(await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(ticketId).first(), senderRole==='admin') }, 201);
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
  return json({ ticket: supportTicketView(await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first(),true) });
}

async function exportBackup(env, adminUser) {
  const tables = [
    "users", "products", "product_sizes", "reviews", "hero_slides", "categories", "subcategories",
    "storefront_settings", "orders", "order_items", "inventory_reservations", "order_stock_releases",
    "coupons", "coupon_email_targets", "coupon_redemptions", "user_addresses", "profile_phones",
    "return_requests", "gateway_refunds", "gateway_refund_events", "cancellation_refunds", "cancellation_refund_events", "store_credit_accounts", "store_credit_ledger", "referral_codes", "referral_rewards",
    "support_tickets", "support_messages", "order_return_access", "order_return_access_events", "product_questions", "restock_subscriptions", "email_delivery_log",
    "admin_notifications", "admin_audit_log", "employee_audit_log", "employees", "employee_sessions", "cart_adds", "wishlist_adds", "upload_usage", "page_views", "counters"
  ];
  const backup = { generated_at: toISTTimestamp(new Date()), tables: {} };
  const tableResults = await env.DB.batch(tables.map(table => env.DB.prepare(`SELECT * FROM ${table}`)));
  tables.forEach((table, index) => { backup.tables[table] = tableResults[index].results || []; });
  await writeAuditLog(env, adminUser?.email, "export_backup", "backup", null, { tables, generated_at: backup.generated_at });
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "Content-Disposition": `attachment; filename="glamia-backup-${istDayKey()}.json"`
    }
  });
}

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["demo", "pending", "authorized", "paid", "failed", "refunded", "not_required"];

async function updateOrderStatus(request, env, id, adminUser = null) {
  const body = await readJson(request);
  if (body.status !== undefined && !ORDER_STATUSES.includes(body.status)) return json({ error: "Invalid order status" }, 400);
  const hasPaymentStatus = Object.prototype.hasOwnProperty.call(body, "payment_status");
  if (hasPaymentStatus && !PAYMENT_STATUSES.includes(String(body.payment_status || "").trim().toLowerCase())) {
    return json({ error: "Invalid payment status" }, 400);
  }
  const hasTracking = Object.prototype.hasOwnProperty.call(body, "tracking_number");
  if (hasTracking && String(body.tracking_number || "").trim().length > 80) {
    return json({ error: "Tracking number must be 80 characters or fewer" }, 400);
  }
  const hasPaymentReference = Object.prototype.hasOwnProperty.call(body, "payment_reference");
  if (hasPaymentReference && String(body.payment_reference || "").trim().length > 160) {
    return json({ error: "Payment reference must be 160 characters or fewer" }, 400);
  }
  const current = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Order not found" }, 404);
  const requestedStatus = body.status === undefined ? current.status : body.status;
  if (current.status === "cancelled" && requestedStatus !== "cancelled") {
    return json({ error: "Cancelled orders cannot be reopened" }, 409);
  }
  const statements = [];
  const trackingNumber = hasTracking ? String(body.tracking_number || "").trim() : String(current.tracking_number || "");
  const assigningTracking = hasTracking && trackingNumber && !String(current.tracking_number || "").trim();
  const nextStatus = requestedStatus === "cancelled"
    ? "cancelled"
    : assigningTracking && current.status !== "cancelled"
      ? "shipped"
      : requestedStatus;
  if(nextStatus==='cancelled'&&current.status!=='cancelled'&&current.payment_status==='paid'
    && (!['pending','confirmed'].includes(current.status)||String(current.tracking_number||'').trim())) {
    return json({error:'A paid dispatched order cannot use an unshipped cancellation refund. Use the return/refund workflow instead.'},409);
  }
  if(current.order_type==='replacement' && ['confirmed','shipped','delivered'].includes(nextStatus) && !await replacementReleased(env,current)) return json({error:"Receive the original return before dispatching the replacement"},409);
  const paymentStatus = hasPaymentStatus
    ? String(body.payment_status || "").trim().toLowerCase()
    : String(current.payment_status || "pending").trim().toLowerCase();
  const paymentReference = hasPaymentReference
    ? String(body.payment_reference || "").trim()
    : String(current.payment_reference || "").trim();
  const paymentChanged = paymentStatus !== String(current.payment_status || "pending").trim().toLowerCase()
    || paymentReference !== String(current.payment_reference || "").trim();
  if (paymentChanged) return json({ error: "Payment state and references are read-only. They must come from verified provider events, not manual edits." }, 403);
  if (["confirmed", "shipped", "delivered"].includes(nextStatus) && nextStatus !== current.status
    && !["paid", "not_required"].includes(current.payment_status)) {
    return json({ error: "Confirm payment with the provider before fulfilling this order." }, 409);
  }
  statements.push(env.DB.prepare(`
    UPDATE orders SET
      status = ?, tracking_number = ?, payment_status = ?, payment_reference = ?,
      payment_updated_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ? AND payment_status = ?
      AND COALESCE(tracking_number, '') = ? AND COALESCE(payment_reference, '') = ?
  `).bind(
    nextStatus, trackingNumber || null, paymentStatus, paymentReference || null,
    paymentChanged ? new Date().toISOString() : (current.payment_updated_at || null), id,
    current.status, current.payment_status, String(current.tracking_number || ""), String(current.payment_reference || "")
  ));
  if (requestedStatus === "cancelled" && current.status !== "cancelled") {
    // changes() refers to the immediately preceding guarded UPDATE, not its
    // triggers. A stale edit must neither restore stock nor erase payment state.
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO order_stock_releases (order_id)
      SELECT id FROM orders WHERE id = ? AND status = 'cancelled' AND changes() = 1`).bind(id));
    statements.push(env.DB.prepare(`DELETE FROM coupon_redemptions WHERE order_id = ?
      AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'cancelled')`).bind(id, id));
  }
  const results = await env.DB.batch(statements);
  if (Number(results[0]?.meta?.changes || 0) < 1) return json({ error: "This order changed while you were editing it. Refresh the order and try again." }, 409);
  invalidateProductEnrichment();
  const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (adminUser) await writeAuditLog(env, adminUser.email, "update_order_status", "order", id, {
    from: current.status, to: nextStatus, tracking_number: trackingNumber || null,
    payment_status: paymentStatus, payment_reference_changed: paymentReference !== String(current.payment_reference || "").trim()
  });
  await qualifyCreditReferral(env, updated);
  if (nextStatus === "cancelled" && current.status !== "cancelled") {
    await createAdminNotification(env, {
      type: "cancelled_order",
      priority: "urgent",
      title: "Order cancelled",
      message: `${updated.customer_name || updated.customer_email} · ${updated.order_number || updated.id}`,
      dedupeKey: `cancelled-order:${id}`,
      orderId: id
    }).catch(() => null);
    await createCustomerNotification(env, {
      email: updated.customer_email,
      type: "order_cancelled",
      title: "Order cancelled",
      message: `${updated.order_number || updated.id} has been cancelled.`,
      orderId: id,
      dedupeKey: `customer-order:${id}:cancelled`
    }).catch(() => null);
    await sendOrderEmail(env, updated, "cancelled");
    await processCancellationRefund(env,id);
  }
  if (nextStatus === "shipped" && current.status !== "shipped") {
    await createCustomerNotification(env, {
      email: updated.customer_email,
      type: "order_shipped",
      title: "Your order is on its way",
      message: updated.tracking_number ? `${updated.order_number || updated.id} has shipped. Tracking number: ${updated.tracking_number}.` : `${updated.order_number || updated.id} has shipped.`,
      orderId: id,
      dedupeKey: `customer-order:${id}:shipped`
    }).catch(() => null);
    await sendOrderEmail(env, updated, "shipped");
  }
  if (nextStatus === "delivered" && current.status !== "delivered" && !current.delivery_email_sent_at) {
    await createCustomerNotification(env, {
      email: updated.customer_email,
      type: "order_delivered",
      title: "Your order was delivered",
      message: `${updated.order_number || updated.id} was marked delivered. We hope you enjoy it.`,
      orderId: id,
      dedupeKey: `customer-order:${id}:delivered`
    }).catch(() => null);
    const deliverySent = await sendOrderEmail(env, updated, "delivery");
    if (deliverySent) {
      await env.DB.prepare("UPDATE orders SET delivery_email_sent_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id).run();
    }
  }
  if (paymentChanged && paymentStatus !== "demo") {
    await sendOrderEmail(env, updated, "payment");
  }
  const latest=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  return json({ order: (await attachCancellationRefunds(env,[formatOrder(latest)]))[0] });
}

async function sendOrderEmail(env, row, type, { ctx = null } = {}) {
  const fromEmail = String(env.BREVO_FROM_EMAIL || "").trim();
  const recipient = String(row?.customer_email || "").trim();
  if (!isRealCustomerEmail(recipient)) return false;

  const emailType = ["confirmation", "shipped", "delivery", "cancelled", "payment"].includes(type) ? type : "confirmation";
  const [order] = await attachCancellationRefunds(env,[formatOrder(row)]);
  const isReplacement = order.order_type === "replacement";
  const isPreorder = order.order_type === "preorder" || order.items.some(item => item.preorder);
  const paymentMethod = formatPaymentMethod(order.payment_method);
  const paymentStatus = String(order.payment_status || "pending").replace(/_/g, " ");
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
    cancelled: `Your Glamia ${orderLabel} ${order.order_number} was cancelled`,
    payment: `Payment update for your Glamia ${order.order_number}`
  }[emailType];
  const eventLabel = {
    confirmation: isReplacement ? "Your replacement product order is ready" : "Thank you for your order",
    shipped: `Your ${orderLabel} is on the way`,
    delivery: `Your ${orderLabel} has been delivered`,
    cancelled: `Your ${orderLabel} has been cancelled`,
    payment: "Your payment status has been updated"
  }[emailType];
  const eventTime = emailType === "confirmation" ? order.created_at : order.updated_at;
  const shipping = order.shipping || {};
  const shippingLine = [shipping.line1, shipping.line2, shipping.city, shipping.state, shipping.pin, shipping.country || "India"]
    .filter(Boolean).join(", ");
  const trackingLine = order.tracking_number ? `Tracking number: ${order.tracking_number}` : "";
  const preorderLine = isPreorder ? "This order includes a pre-order item. We’ll keep you updated as it moves toward dispatch." : "";
  const statusLine = emailType === "cancelled"
    ? order.cancellation_refund
      ? `Your order is cancelled. ${order.cancellation_refund.state==='processed'?'Its refund is confirmed.':order.cancellation_refund.state==='approved'?'Its original-payment refund is queued.':'Follow its refund progress in Your orders; cancellation alone does not confirm a bank refund.'} If you did not request this cancellation, contact Glamia support.`
      : "If you did not request this cancellation, please contact Glamia support."
    : emailType === "shipped" && !trackingLine
      ? "Your tracking details will be shared as soon as they are available."
      : emailType === "payment"
        ? `Payment status: ${paymentStatus}${order.payment_reference ? ` · Reference: ${order.payment_reference}` : ""}.`
      : "";
  const billReady = ["paid", "refunded"].includes(order.payment_status) && ["razorpay", "phonepe", "store_credit"].includes(order.payment_method);
  const documentLabel = billReady ? "Download bill (PDF)" : "View / print invoice preview";
  const invoiceUrl = `${String(env.PUBLIC_SITE_URL || "https://glamiastore.com").replace(/\/$/, "")}/api/orders/${encodeURIComponent(order.id)}/${billReady ? "bill" : "invoice"}?token=${encodeURIComponent(order.tracking_token || "")}`;
  const htmlItems = order.items.map(item => {
    const selection = [item.size, item.variant, item.color].filter(Boolean).join(" · ");
    return `<li><strong>${escapeHtml(item.name)}</strong>${selection ? ` · ${escapeHtml(selection)}` : ""} · Qty ${Number(item.quantity) || 0} · ${formatInr(item.price * item.quantity)}</li>`;
  }).join("");
  const htmlContent = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#241f18;line-height:1.6"><h1 style="letter-spacing:.18em">GLAMIA</h1><p>Hi ${escapeHtml(firstName)},</p><h2>${escapeHtml(eventLabel)}</h2><p>Order <strong>${escapeHtml(order.order_number)}</strong> · ${escapeHtml(formatOrderDate(eventTime))}</p>${statusLine ? `<p>${escapeHtml(statusLine)}</p>` : ""}${trackingLine ? `<p>${escapeHtml(trackingLine)}</p>` : ""}${preorderLine ? `<p>${escapeHtml(preorderLine)}</p>` : ""}<ul>${htmlItems}</ul><p>Subtotal: ${formatInr(order.subtotal)}<br>Discount: ${formatInr(order.discount)}<br><strong>Total: ${formatInr(order.total)}</strong>${order.credits_used ? `<br>Store credits applied: −${formatInr(order.credits_used)}<br>Remaining paid: ${formatInr(order.payable_total)}` : ""}</p><p><strong>Payment method:</strong> ${escapeHtml(order.credits_used && paymentMethod !== "store_credit" ? `STORE CREDITS + ${paymentMethod.toUpperCase()}` : paymentMethod.toUpperCase())}<br><strong>Payment status:</strong> ${escapeHtml(paymentStatus)}</p>${shippingLine ? `<p>Delivery address: ${escapeHtml(shippingLine)}</p>` : ""}${emailType==='confirmation'&&order.delivery_estimate?`<p>${escapeHtml(order.delivery_estimate)}</p>`:''}<p><a href="${escapeHtml(invoiceUrl)}">${documentLabel}</a></p><p>Warmly,<br>Team Glamia</p></body></html>`;
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
    order.credits_used ? `Store credits applied: −${formatInr(order.credits_used)}` : "",
    order.credits_used ? `Remaining paid: ${formatInr(order.payable_total)}` : "",
    `Payment method: ${order.credits_used && paymentMethod !== "store_credit" ? `STORE CREDITS + ${paymentMethod.toUpperCase()}` : paymentMethod.toUpperCase()}`,
    `Payment status: ${paymentStatus}`,
    emailType==='confirmation'?order.delivery_estimate:'',
    `${documentLabel}: ${invoiceUrl}`,
    shippingLine ? `Delivery address: ${shippingLine}` : "",
    "",
    "Warmly,",
    "Team Glamia"
  ].filter(Boolean).join("\n");

  return deliverBrevoEmail(env, {
    eventType: `order-${emailType}`, ctx,
    dedupeKey: emailType === "payment"
      ? `order:${order.id}:payment:${order.payment_status || "pending"}:${order.payment_reference || ""}`
      : `order:${order.id}:${emailType}`,
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
    requested: "We’ve received your request. Care will arrange collection from your address to our warehouse. Your printable return label becomes available in Your orders once courier tracking is saved. Refund approval is separate; this does not send money.",
    approved: returnRequest.type==='exchange' && returnRequest.replacement_fulfilment_mode==='immediate'
      ? `Your zero-value replacement ${returnRequest.replacement_order_number||''} has been placed for normal packing and delivery. No admin approval or return-receipt wait is required. Care will arrange the original item’s pickup separately; print its return label from Your orders once tracking is saved.`
      : "Your request has been approved. Follow the return instructions in Your orders; the printable label becomes available once courier tracking is saved.",
    rejected: "We’re unable to approve this request. Please contact Glamia support if you need help.",
    received: "We’ve received the returned item and will complete the next step shortly.",
    refunded: returnRequest.refund_destination === "store_credit"
      ? `A store credit of ${formatInr(returnRequest.refund_amount)} has been added to your Glamia account.`
      : returnRequest.gateway_refund?.state === "processed"
        ? `Your payment provider confirmed a refund of ${formatInr(returnRequest.gateway_refund.gateway_amount)}${returnRequest.gateway_refund.credit_amount ? `; ${formatInr(returnRequest.gateway_refund.credit_amount)} was restored to your store credits` : ""}. Your bank's posting time may vary.`
        : `Your refund of ${formatInr(returnRequest.refund_amount)} requires payment-provider reconciliation.`,
    completed: "Your after-sales request is now complete.",
    cancelled: "Your after-sales request has been cancelled.",
    review_required: "Your refund needs a payment review. Glamia is checking the existing request; please do not submit another refund. Track the next update in Your orders or contact care using your request reference."
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

async function deliverBrevoEmail(env, { eventType, dedupeKey = null, recipient, userEmail = null, orderId = null, payload, existingId = null, ctx = null }) {
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
  if (!current) return false; // Fail closed: never send without a durable log.
  if (ctx?.waitUntil) {
    // Queue durably before responding. The existing scheduler recovers queued
    // deliveries; the compare-and-set delivery claim prevents duplicate sends.
    if (!current.delivery_claim) ctx.waitUntil(deliverBrevoEmail(env, {
      eventType, dedupeKey, recipient, userEmail, orderId, payload, existingId: id
    }).catch(() => null));
    return false; // Queued is not the same as delivered.
  }
  const attempts = Number(current?.attempts || 0) + 1;
  const apiKey = String(env.BREVO_API_KEY || "").trim();
  const fromEmail = String(env.BREVO_FROM_EMAIL || "").trim();
  if (!apiKey || !fromEmail) {
    await env.DB.prepare("UPDATE email_delivery_log SET status = 'skipped', attempts = ?, last_error = ?, next_attempt_at = NULL WHERE id = ?")
      .bind(attempts, "Brevo is not configured", id).run().catch(() => null);
    return false;
  }
  const deliveryClaim = crypto.randomUUID();
  const claimed = await env.DB.prepare("UPDATE email_delivery_log SET delivery_claim = ? WHERE id = ? AND status != 'sent' AND delivery_claim IS NULL")
    .bind(deliveryClaim, id).run();
  if (Number(claimed.meta?.changes || 0) !== 1) return false;
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const responseText = await response.text();
    if (!response.ok) {
      const retryAt = attempts < 5 ? new Date(Date.now() + Math.min(60 * 60_000, 2 ** attempts * 60_000)).toISOString() : null;
      // Only an explicit client rejection is safe to retry. A 5xx/timeout can
      // occur after acceptance; keep its claim for operator reconciliation.
      const rejected = response.status >= 400 && response.status < 500;
      await env.DB.prepare("UPDATE email_delivery_log SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = ?, delivery_claim = ? WHERE id = ? AND delivery_claim = ?")
        .bind(attempts, `Brevo ${response.status}: ${responseText.slice(0, 500)}`, rejected ? retryAt : null, rejected ? null : deliveryClaim, id, deliveryClaim).run().catch(() => null);
      return false;
    }
    let providerId = "";
    try { providerId = JSON.parse(responseText)?.messageId || ""; } catch {}
    await env.DB.prepare("UPDATE email_delivery_log SET status = 'sent', attempts = ?, provider_id = ?, last_error = NULL, next_attempt_at = NULL, sent_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(attempts, providerId, id).run().catch(() => null);
    if (eventType === "order-confirmation" && orderId) {
      await env.DB.prepare("UPDATE orders SET confirmation_email_sent_at = COALESCE(confirmation_email_sent_at, CURRENT_TIMESTAMP) WHERE id = ?")
        .bind(orderId).run();
    }
    return true;
  } catch (error) {
    await env.DB.prepare("UPDATE email_delivery_log SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?")
      .bind(attempts, `Delivery uncertain; reconcile before retry: ${String(error?.message || error).slice(0, 400)}`, null, id).run().catch(() => null);
    return false;
  }
}

async function processDueEmailEvents(env) {
  const { results } = await env.DB.prepare(`
    SELECT e.*
    FROM email_delivery_log e
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.status IN ('pending', 'failed')
      AND e.delivery_claim IS NULL
      AND e.attempts < 5
      AND (e.next_attempt_at IS NULL OR datetime(e.next_attempt_at) <= CURRENT_TIMESTAMP)
      AND NOT (
        o.id IS NOT NULL
        AND ${paymentIncompleteOrderPredicate("o", false)}
      )
    ORDER BY e.created_at ASC
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
    if (text.startsWith("/api/assets/") || /^https?:\/\//i.test(text)) {
      try {
        const url = new URL(text, CANONICAL_ORIGIN);
        if (url.pathname.startsWith("/api/assets/") && (PRODUCTION_HOSTNAMES.has(url.hostname) || ["localhost", "127.0.0.1"].includes(url.hostname))) references.add(decodeURIComponent(url.pathname.slice("/api/assets/".length)));
      } catch {}
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
  // Historical orders and issued bills also reference images. A failed read
  // must abort cleanup: an unavailable table is not evidence of unused media.
  for (const table of ["products", "reviews", "product_questions", "hero_slides", "storefront_settings", "events", "orders", "order_items", "order_bills"]) {
    const result = await env.DB.prepare(`SELECT * FROM ${table}`).all();
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
  if (row.delivery_claim) return json({ error: "Delivery is in progress or uncertain. Reconcile with Brevo before retrying; this claim is not automatically released." }, 409);
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
  const date = parseStoredTimestamp(value);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

async function listEmployees(env, actor) {
  const { results } = await env.DB.prepare(`
    SELECT id, employee_code, name, employee_email, position, permissions_json, active, failed_login_count, locked_until,
      last_login_at, created_at, updated_at, created_by_email, created_by_employee_id, created_by_owner, owner_approved
    FROM employees
    ORDER BY active DESC, name COLLATE NOCASE ASC
  `).all();
  return json({ management: { can_create_admin: actor?.is_owner === true, positions: EMPLOYEE_POSITION_OPTIONS.filter(({ id }) => canManageEmployee(actor, null, {}, id)), permissions: actor?.employee_permissions || Object.fromEntries(EMPLOYEE_PERMISSION_OPTIONS.map(({ id }) => [id, true])) }, employees: results.map((row) => employeePublicProfile(row, env)).map((employee, index) => ({
    ...employee,
    can_manage: canManageEmployee(actor, employee),
    ...(results[index] ? {
      failed_login_count: Number(results[index].failed_login_count || 0),
      locked_until: results[index].locked_until || null,
      last_login_at: results[index].last_login_at || null,
      created_at: results[index].created_at,
      updated_at: results[index].updated_at
    } : {})
  })) });
}

// Prevent employee managers from taking over or granting access beyond their own scope.
function assertEmployeeManagementScope(actor, target, permissions, position) {
  if (!canManageEmployee(actor, target, permissions, position)) {
    throw httpError("Only owners can manage admins. Employees can manage only equal or lower positions within their own permissions", 403);
  }
}

async function createEmployee(request, env, adminUser) {
  const body = await readJson(request);
  const employeeCode = String(body.employee_id || body.employee_code || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const employeeEmail = String(body.employee_email || body.email || "").trim().toLowerCase();
  const position = normalizeEmployeePosition(body.position);
  const password = String(body.password || "");
  if (!/^[A-Z0-9][A-Z0-9_-]{2,30}$/.test(employeeCode)) {
    return json({ error: "Employee ID must be 3–31 characters using letters, numbers, hyphens, or underscores" }, 400);
  }
  if (name.length < 2 || name.length > 80) return json({ error: "Enter an employee name from 2 to 80 characters" }, 400);
  if (employeeEmail && !isRealCustomerEmail(employeeEmail)) return json({ error: "Enter a valid employee email address" }, 400);
  if (employeeEmail && adminEmails(env).includes(employeeEmail) && !adminUser.is_owner) return json({ error: "Only owners can assign an owner email address" }, 403);
  if (password.length < 8 || password.length > 200) return json({ error: "Employee password must be 8–200 characters" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM employees WHERE employee_code = ?").bind(employeeCode).first();
  if (existing) return json({ error: "That employee ID is already in use" }, 409);
  if (employeeEmail) {
    const existingEmail = await env.DB.prepare("SELECT id FROM employees WHERE LOWER(employee_email) = ?").bind(employeeEmail).first();
    if (existingEmail) return json({ error: "That employee email is already assigned" }, 409);
  }
  const permissions = normalizeEmployeePermissions(body.permissions, position);
  assertEmployeeManagementScope(adminUser, null, permissions, position);
  const passwordRecord = await generateEmployeePasswordRecord(password);
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO employees (id, employee_code, name, employee_email, position, permissions_json, password_hash, password_salt, password_iterations, created_by_email, created_by_employee_id, created_by_owner, owner_approved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, employeeCode, name, employeeEmail || null, position, JSON.stringify(permissions), passwordRecord.password_hash, passwordRecord.password_salt, passwordRecord.password_iterations, adminUser.email, adminUser.employee_id || null, adminUser.is_owner ? 1 : 0, adminUser.is_owner && adminEmails(env).includes(employeeEmail) ? 1 : 0).run();
  await writeAuditLog(env, adminUser.email, "create_employee", "employee", id, { employee_code: employeeCode, name, employee_email: employeeEmail, position, permissions });
  const profile = employeePublicProfile({ id, employee_code: employeeCode, name, employee_email: employeeEmail, position, permissions, active: 1, created_by_email: adminUser.email, created_by_employee_id: adminUser.employee_id, created_by_owner: adminUser.is_owner, owner_approved: adminUser.is_owner && adminEmails(env).includes(employeeEmail) ? 1 : 0 }, env);
  return json({ employee: { ...profile, can_manage: canManageEmployee(adminUser, profile) } }, 201);
}

async function updateEmployee(request, env, id, adminUser) {
  const current = await env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Employee not found" }, 404);
  const body = await readJson(request);
  const nextPosition = body.position === undefined ? current.position : normalizeEmployeePosition(body.position);
  const promotedToAdmin = nextPosition === "admin" && current.position !== "admin";
  assertEmployeeManagementScope(adminUser, employeePublicProfile(current, env), body.permissions === undefined
    ? promotedToAdmin ? normalizeEmployeePermissions(undefined, "admin") : employeePermissionsObject(current.permissions_json, nextPosition)
    : normalizeEmployeePermissions(body.permissions, nextPosition), nextPosition);
  const updates = [];
  const bindings = [];
  const audit = {};
  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (name.length < 2 || name.length > 80) return json({ error: "Enter an employee name from 2 to 80 characters" }, 400);
    updates.push("name = ?"); bindings.push(name); audit.name_changed = name !== current.name;
  }
  if (body.employee_email !== undefined || body.email !== undefined) {
    const employeeEmail = String(body.employee_email ?? body.email ?? "").trim().toLowerCase();
    if (employeeEmail && !isRealCustomerEmail(employeeEmail)) return json({ error: "Enter a valid employee email address" }, 400);
    if (employeeEmail && adminEmails(env).includes(employeeEmail) && !adminUser.is_owner) return json({ error: "Only owners can assign an owner email address" }, 403);
    if (employeeEmail) {
      const existingEmail = await env.DB.prepare("SELECT id FROM employees WHERE LOWER(employee_email) = ? AND id != ?").bind(employeeEmail, id).first();
      if (existingEmail) return json({ error: "That employee email is already assigned" }, 409);
    }
    updates.push("employee_email = ?"); bindings.push(employeeEmail || null); audit.employee_email_changed = employeeEmail !== String(current.employee_email || "");
    if (adminUser.is_owner) { updates.push("owner_approved = ?"); bindings.push(adminEmails(env).includes(employeeEmail) ? 1 : 0); }
  }
  if (body.position !== undefined) {
    const position = normalizeEmployeePosition(body.position);
    updates.push("position = ?"); bindings.push(position); audit.position = position;
  }
  if (body.permissions !== undefined || promotedToAdmin) {
    const position = normalizeEmployeePosition(body.position === undefined ? current.position : body.position);
    const permissions = normalizeEmployeePermissions(body.permissions, position);
    updates.push("permissions_json = ?"); bindings.push(JSON.stringify(permissions)); audit.permissions = permissions;
  }
  if (body.active !== undefined) {
    const active = body.active === true || body.active === 1 || body.active === "true" ? 1 : 0;
    updates.push("active = ?"); bindings.push(active); audit.active = Boolean(active);
    if (!active) await env.DB.prepare("UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL").bind(id).run();
  }
  if (body.password !== undefined && String(body.password || "")) {
    const password = String(body.password);
    if (password.length < 8 || password.length > 200) return json({ error: "Employee password must be 8–200 characters" }, 400);
    const record = await generateEmployeePasswordRecord(password);
    updates.push("password_hash = ?", "password_salt = ?", "password_iterations = ?", "failed_login_count = 0", "locked_until = NULL");
    bindings.push(record.password_hash, record.password_salt, record.password_iterations);
    audit.password_reset = true;
    await env.DB.prepare("UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL").bind(id).run();
  }
  if (!updates.length) return json({ error: "No employee changes supplied" }, 400);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  await env.DB.prepare(`UPDATE employees SET ${updates.join(", ")} WHERE id = ?`).bind(...bindings, id).run();
  const updated = await env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first();
  await writeAuditLog(env, adminUser.email, "update_employee", "employee", id, audit);
  const profile = employeePublicProfile(updated, env);
  return json({ employee: { ...profile, can_manage: canManageEmployee(adminUser, profile) } });
}

async function deleteEmployee(env, id, adminUser) {
  const current = await env.DB.prepare("SELECT id, employee_code, name, employee_email, position, permissions_json, owner_approved FROM employees WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Employee not found" }, 404);
  assertEmployeeManagementScope(adminUser, employeePublicProfile(current, env));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM employee_sessions WHERE employee_id = ?").bind(id),
    env.DB.prepare("DELETE FROM employee_audit_log WHERE employee_id = ?").bind(id),
    env.DB.prepare("DELETE FROM employee_notification_states WHERE employee_id = ?").bind(id),
    env.DB.prepare("DELETE FROM employees WHERE id = ?").bind(id)
  ]);
  await writeAuditLog(env, adminUser.email, "delete_employee", "employee", id, { employee_code: current.employee_code, name: current.name, employee_email: current.employee_email || "" });
  return json({ ok: true, id });
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

// Fetch one customer's history only on demand; never expose shipping or tracking credentials.
async function listAdminCustomerOrders(env, actor, email, searchParams = new URLSearchParams()) {
  requireAdmin(actor);
  if (actor.employee_id && !actor.is_owner &&
      (actor.employee_permissions?.customers !== true || actor.employee_permissions?.orders !== true)) {
    throw httpError("Customers and Orders access are required to view purchase history", 403);
  }
  const customerEmail = String(email || "").trim().toLowerCase();
  if (!isRealCustomerEmail(customerEmail)) throw httpError("Invalid customer email", 400);
  const customer = await env.DB.prepare("SELECT email, name, phone FROM users WHERE email = ? LIMIT 1").bind(customerEmail).first();
  if (!customer) throw httpError("Customer not found", 404);
  const page = Number(searchParams.get("page") || 1);
  const requestedLimit = Number(searchParams.get("limit") || 25);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw httpError("Invalid order history page", 400);
  }
  const limit = Math.min(requestedLimit, 50);
  const offset = (page - 1) * limit;
  const query = String(searchParams.get("q") || "").trim().slice(0, 100);
  const filters = ["o.customer_email = ?", `NOT ${paymentIncompleteOrderPredicate("o", true)}`];
  const args = [customerEmail];
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push("(o.order_number LIKE ? ESCAPE '\\' OR o.id LIKE ? ESCAPE '\\' OR o.items_json LIKE ? ESCAPE '\\')");
    args.push(pattern, pattern, pattern);
  }
  const where = filters.join(" AND ");
  const { results } = await env.DB.prepare(`SELECT o.id, o.order_number, o.items_json, o.total, o.status,
    o.payment_method, o.payment_status, o.packing_status, o.created_at, o.credits_used, o.payable_total, o.payment_gateway FROM orders o
    WHERE ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset).all();
  const total = Number((await env.DB.prepare(`SELECT COUNT(*) AS count FROM orders o WHERE ${where}`).bind(...args).first())?.count || 0);
  const enriched=await attachCancellationRefunds(env,results.map(formatOrder));
  const orders = enriched.map(order => {
    return {
      id: order.id, order_number: order.order_number, created_at: order.created_at,
      total: order.total, status: order.status, payment_method: order.payment_method,
      payment_status: order.payment_status, packing_status: order.packing_status,
      cancellation_refund: order.cancellation_refund || null,
      items: (Array.isArray(order.items) ? order.items : []).filter(item => item && typeof item === "object").map(item => ({ name: item.name || item.product_name || "Product", size: item.size || "", color: item.color || item.variant || "", quantity: item.quantity || 0 }))
    };
  });
  return json({ customer, orders, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), has_more: offset + orders.length < total } }, 200, { "Cache-Control": "private, no-store" });
}

async function listCouponRecipients(env) {
  const { results } = await env.DB.prepare(`
    SELECT u.email, u.name, u.phone, u.created_at,
      CASE WHEN e.id IS NULL THEN 0 ELSE 1 END AS is_employee,
      e.employee_code, e.position, e.active AS employee_active
    FROM users u
    LEFT JOIN employees e ON LOWER(TRIM(e.employee_email)) = LOWER(TRIM(u.email))
    WHERE u.role != 'admin'
    UNION ALL
    SELECT e.employee_email AS email, e.name, NULL AS phone, e.created_at,
      1 AS is_employee, e.employee_code, e.position, e.active AS employee_active
    FROM employees e
    WHERE TRIM(COALESCE(e.employee_email, '')) != ''
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(e.employee_email))
      )
    ORDER BY email COLLATE NOCASE ASC
  `).all();
  return json({ recipients: (results || []).map(row => ({
    ...row,
    is_employee: Boolean(row.is_employee),
    employee_active: row.employee_active === null || row.employee_active === undefined ? null : Boolean(row.employee_active)
  })) });
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

function isWhitelistedCouponAdmin(env, user) {
  // Only the authenticated account and the server whitelist confer this benefit.
  // A client-supplied email, admin role or employee permission is not sufficient.
  const email = normalizeCouponEmail(user?.email);
  return Boolean(email && adminEmails(env).includes(email));
}

function couponForCustomer(coupon, env, user) {
  if (!isWhitelistedCouponAdmin(env, user)) return { ...coupon, admin_exempt: false };
  return { ...coupon, admin_exempt: true, active: 1, employee_only: 0,
    starts_at: null, ends_at: null, usage_limit: null, per_user_limit: null,
    min_cart_value: null, max_discount: null, scope: 'all', scope_value: '', target_rules: '[]', allow_store_credits: 1 };
}

async function couponAvailability(coupon, env, user) {
  if (isWhitelistedCouponAdmin(env, user)) return null;
  const now = Date.now();
  const startsAt = coupon.starts_at ? new Date(coupon.starts_at).getTime() : null;
  const endsAt = coupon.ends_at ? new Date(coupon.ends_at).getTime() : null;
  if (startsAt && now < startsAt) return "This coupon is not active yet";
  if (endsAt && now > endsAt) return "This coupon has expired";

  const email = normalizeCouponEmail(user?.email);
  if (Number(coupon.employee_only || 0)) {
    if (!email) return "Sign in with an employee email to use this coupon";
    const employee = await env.DB.prepare(`
      SELECT 1 AS allowed FROM employees
      WHERE LOWER(TRIM(employee_email)) = ?
      LIMIT 1
    `).bind(email).first();
    if (!employee) return "This coupon is reserved for Glamia employees";
  } else {
    const emailTargetCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM coupon_email_targets WHERE coupon_code = ?"
    ).bind(coupon.code).first();
    if (Number(emailTargetCount?.count || 0) > 0) {
      if (!email) return "This coupon is reserved for selected customer accounts";
      const allowed = await env.DB.prepare(
        "SELECT 1 AS allowed FROM coupon_email_targets WHERE coupon_code = ? AND email = ? LIMIT 1"
      ).bind(coupon.code, email).first();
      if (!allowed) return "This coupon is not available for this account";
    }
  }

  if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
    const usage = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_instance_id = ? AND admin_exempt = 0"
    ).bind(coupon.instance_id).first();
    if (Number(usage?.count || 0) >= Number(coupon.usage_limit)) return "This coupon has reached its usage limit";
  }

  if (user?.email && coupon.per_user_limit !== null && coupon.per_user_limit !== undefined) {
    const personalUsage = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_instance_id = ? AND admin_exempt = 0 AND LOWER(TRIM(customer_email)) = ?"
    ).bind(coupon.instance_id, normalizeCouponEmail(user.email)).first();
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
  const storedCoupon = await env.DB.prepare("SELECT * FROM coupons WHERE code = ? AND (active = 1 OR ? = 1)").bind(code, isWhitelistedCouponAdmin(env,user) ? 1 : 0).first();
  if (!storedCoupon) return json({ error: "That coupon code is not valid" }, 400);
  const coupon = couponForCustomer(storedCoupon, env, user);
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
    per_user_limit: coupon.admin_exempt ? null : coupon.per_user_limit ?? 1,
    max_discount: coupon.max_discount ?? null,
    min_cart_value: coupon.min_cart_value ?? null,
    allow_store_credits: Boolean(coupon.allow_store_credits),
    admin_exempt: coupon.admin_exempt,
    coupon_instance_id: coupon.instance_id,
    discount
  });
}

async function listAvailableCoupons(request, env, user) {
  const body = await readJson(request);
  const requested = normalizeOrderItems(body.items);
  if (!requested.length) return json({ coupons: [] });

  const { results } = await env.DB.prepare(
    "SELECT * FROM coupons WHERE active = 1 OR ? = 1 ORDER BY created_at DESC LIMIT 25"
  ).bind(isWhitelistedCouponAdmin(env,user) ? 1 : 0).all();
  const catalog = await loadLiveProductsById(env, requested);
  const cartSubtotal = requested.reduce((sum, entry) => {
    const row = catalog.get(entry.id);
    return sum + (row ? effectivePrice(row) * Math.max(1, Math.floor(Number(entry.quantity) || 1)) : 0);
  }, 0);
  const coupons = [];

  for (const storedCoupon of results || []) {
    const coupon = couponForCustomer(storedCoupon, env, user);
    if (await couponAvailability(coupon, env, user)) continue;
    if (couponMinimumCartError(coupon, cartSubtotal)) continue;
    const eligibleSubtotal = couponEligibleSubtotal(coupon, requested, catalog);
    if (eligibleSubtotal <= 0) continue;
    coupons.push({
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value || 0),
      discount: couponDiscount(coupon, eligibleSubtotal),
      min_cart_value: coupon.min_cart_value ?? null,
      starts_at: coupon.starts_at || null,
      ends_at: coupon.ends_at || null,
      scope: coupon.scope || "all",
      scope_value: coupon.scope_value || "",
      targets: couponTargetRules(coupon),
      allow_store_credits: Boolean(coupon.allow_store_credits),
      admin_exempt: coupon.admin_exempt,
      coupon_instance_id: coupon.instance_id
    });
  }

  return json({ coupons });
}

async function listCoupons(env) {
  const [couponRows, emailTargetRows] = await env.DB.batch([
    env.DB.prepare(`
      SELECT c.*, COUNT(CASE WHEN r.admin_exempt=0 THEN r.id END) AS usage_count,
        COUNT(CASE WHEN r.admin_exempt=1 THEN r.id END) AS admin_usage_count
      FROM coupons c
      LEFT JOIN coupon_redemptions r ON r.coupon_instance_id = c.instance_id
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
    employee_only: Boolean(row.employee_only),
    allow_store_credits: Boolean(row.allow_store_credits),
    targets: couponTargetRules(row),
    email_targets: emailsByCoupon.get(row.code) || [],
    usage_count: Number(row.usage_count || 0)
  })) });
}

async function createCoupon(request, env) {
  return saveCoupon(request, env);
}

async function updateCoupon(request, env, code) {
  return saveCoupon(request, env, String(code || "").trim().toUpperCase());
}

async function saveCoupon(request, env, existingCode = "") {
  const input = await readJson(request);
  let current = null;
  let currentEmails = [];
  if (existingCode) {
    const [couponRows, emailRows] = await env.DB.batch([
      env.DB.prepare(`SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_instance_id = c.instance_id AND r.admin_exempt=0) AS usage_count
        FROM coupons c WHERE c.code = ?`).bind(existingCode),
      env.DB.prepare("SELECT email FROM coupon_email_targets WHERE coupon_code = ? ORDER BY email").bind(existingCode)
    ]);
    current = couponRows.results?.[0];
    if (!current) return json({ error: "Coupon not found" }, 404);
    currentEmails = (emailRows.results || []).map(row => row.email);
    if (input.code !== undefined && String(input.code).trim().toUpperCase() !== existingCode) {
      return json({ error: "Coupon codes cannot be renamed. Create a new code to preserve redemption history." }, 400);
    }
  }
  const body = current ? { ...current, targets: couponTargetRules(current), email_targets: currentEmails, ...input, code: existingCode } : input;
  const code = String(body.code || "").trim().toUpperCase();
  const active = body.active === undefined ? true : body.active === true || body.active === 1 || body.active === "true";
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
  const employeeOnly = body.employee_only === true || body.employee_only === 1 || body.employee_only === "true";
  const allowStoreCredits = body.allow_store_credits === true || body.allow_store_credits === 1 || body.allow_store_credits === "true";
  if (employeeOnly && rawEmailTargets.length) return json({ error: "Choose Employee only or selected email addresses, not both" }, 400);
  if (rawEmailTargets.length > 500) return json({ error: "Select no more than 500 eligible email addresses" }, 400);
  const emailTargets = [...new Set(rawEmailTargets.map(normalizeCouponEmail).filter(Boolean))];
  if (emailTargets.some(email => !isValidCouponEmail(email))) {
    return json({ error: "Every eligible email address must be valid" }, 400);
  }
  const startsAt = body.starts_at ? parseISTInput(body.starts_at) : null;
  const endsAt = body.ends_at ? parseISTInput(body.ends_at) : null;
  const usageLimit = body.usage_limit === "" || body.usage_limit === null || body.usage_limit === undefined
    ? null
    : Math.floor(Number(body.usage_limit));
  const perUserLimit = body.per_user_limit === "" || body.per_user_limit === null || body.per_user_limit === undefined
    ? current && body.per_user_limit !== undefined ? null : 1
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
  if (perUserLimit !== null && (!Number.isSafeInteger(perUserLimit) || perUserLimit < 1)) throw httpError("Per-account limit must be a positive whole number", 400);
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
        if (!existingCategories.has(target.value.toLowerCase())) return json({ error: `Category "${target.value}" does not exist` }, 400);
      } else if (target.type === "subcategory") {
        if (!existingSubcategories.has(target.value.toLowerCase())) return json({ error: `Subcategory "${target.value}" does not exist` }, 400);
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
  const fields = [
      type,
      value,
      active ? 1 : 0,
      scope,
      scope === "all" ? "" : scopeValue,
      JSON.stringify(scope === "targeted" ? targets : []),
      startsAt ? startsAt.toISOString() : null,
      endsAt ? endsAt.toISOString() : null,
      usageLimit,
      perUserLimit,
      maxDiscount,
      minCartValue,
      employeeOnly ? 1 : 0,
      allowStoreCredits ? 1 : 0
  ];
  const instanceId = current?.instance_id || `gmc_${crypto.randomUUID().replaceAll('-', '')}`;
  const statements = [current ? env.DB.prepare(`
    UPDATE coupons SET type = ?, value = ?, active = ?, scope = ?, scope_value = ?, target_rules = ?,
      starts_at = ?, ends_at = ?, usage_limit = ?, per_user_limit = ?, max_discount = ?, min_cart_value = ?, employee_only = ?, allow_store_credits = ?
    WHERE code = ? AND instance_id = ?
  `).bind(...fields, code, current.instance_id) : env.DB.prepare(`
    INSERT INTO coupons (code, type, value, active, scope, scope_value, target_rules, starts_at, ends_at, usage_limit, per_user_limit, max_discount, min_cart_value, employee_only, allow_store_credits,instance_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
  `).bind(code, ...fields,instanceId)];
  if (current) statements.push(env.DB.prepare("DELETE FROM coupon_email_targets WHERE coupon_code = ? AND EXISTS(SELECT 1 FROM coupons WHERE code=? AND instance_id=?)").bind(code,code,instanceId));
  try {
    if (emailTargets.length) {
      statements.push(env.DB.prepare(`
        INSERT INTO coupon_email_targets (coupon_code, email)
        SELECT ?, CAST(value AS TEXT) FROM json_each(?)
        WHERE EXISTS(SELECT 1 FROM coupons WHERE code=? AND instance_id=?)
      `).bind(code, JSON.stringify(emailTargets),code,instanceId));
    }
    const saved = await env.DB.batch(statements);
    if (current && !Number(saved[0]?.meta?.changes)) return json({error:'This coupon was deleted or recreated while you were editing. Reload before saving.'},409);
  } catch (error) {
    if (current) throw error;
    throw httpError("A coupon with that code already exists", 400);
  }
  return json({ coupon: {
    code, instance_id: instanceId, type, value, scope, scope_value: scope === "all" ? "" : scopeValue,
    targets: scope === "targeted" ? targets : [],
    starts_at: startsAt ? startsAt.toISOString() : null,
    ends_at: endsAt ? endsAt.toISOString() : null,
    usage_limit: usageLimit,
    per_user_limit: perUserLimit,
    max_discount: maxDiscount,
    min_cart_value: minCartValue,
    employee_only: employeeOnly,
    allow_store_credits: allowStoreCredits,
    email_targets: emailTargets,
    active,
    usage_count: Number(current?.usage_count || 0),
    ...(current ? { created_at: current.created_at } : {})
  } }, current ? 200 : 201);
}

async function deleteCoupon(env, code) {
  code = String(code || '').trim().toUpperCase();
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
  if (!Number.isSafeInteger(number * 100)) throw httpError(`${label} exceeds the supported amount`, 400);
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
  const required = ["name", "category", "brand", "price", "mrp", "stock", "color", "material", "description", "what_in_box"];
  for (const key of required) {
    if (product[key] === undefined || product[key] === "") throw httpError(`Missing ${key}`, 400);
  }
  for (const key of ["name", "category", "brand", "color", "material", "description", "what_in_box"]) {
    if (String(product[key]).trim().length === 0 || String(product[key]).length > 500) throw httpError(`${key} is invalid`, 400);
  }
  const price = validateMoney(product.price, "Price");
  const mrp = validateMoney(product.mrp, "MRP");
  validateColorHex(product.color_hex);
  validateStock(product.stock);
  if (price > mrp) throw httpError("MRP should be higher than price", 400);
  validateSizeList(product.sizes);
  validateSizeStockObject(product.size_stock);
  if (!Array.isArray(product.images) || !product.images.length || (requireImages && (product.images.length < MIN_PRODUCT_IMAGES || product.images.length > MAX_PRODUCT_IMAGES))) {
    throw httpError(`Add between ${MIN_PRODUCT_IMAGES} and ${MAX_PRODUCT_IMAGES} images (first is the thumbnail)`, 400);
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
      validateColorHex(variant.color_hex, "Variant colour swatch");
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

function productPublicationIssues(product) {
  const issues = [];
  const required = ["name", "category", "brand", "color", "material", "description", "what_in_box"];
  for (const key of required) {
    if (String(product?.[key] || "").trim().length === 0) issues.push(key === "what_in_box" ? "Add what's in the box" : `Add ${key.replace("color", "colour")}`);
  }
  if (!Number.isSafeInteger(Number(product?.price)) || Number(product.price) <= 0) issues.push("Add a valid selling price");
  if (!Number.isSafeInteger(Number(product?.mrp)) || Number(product.mrp) <= 0) issues.push("Add a valid MRP");
  let images = [];
  let thumbnails = [];
  let sizes = [];
  try { images = JSON.parse(product?.images_json || "[]"); } catch {}
  try { thumbnails = JSON.parse(product?.thumbnail_images_json || "[]"); } catch {}
  try { sizes = JSON.parse(product?.sizes_json || "[]"); } catch {}
  if (!images.length && product?.image_url) images = [product.image_url];
  if (!thumbnails.length && product?.thumbnail_url) thumbnails = [product.thumbnail_url];
  if (images.length < MIN_PRODUCT_IMAGES || images.length > MAX_PRODUCT_IMAGES) issues.push(`Add between ${MIN_PRODUCT_IMAGES} and ${MAX_PRODUCT_IMAGES} product images`);
  if (!thumbnails.length || !images.includes(product?.thumbnail_source_url || thumbnails[0])) issues.push("Choose a thumbnail from the product images");
  if (!sizes.length) issues.push("Add at least one size");
  if (product?.preorder_enabled && product?.preorder_limit !== null && product?.preorder_limit !== undefined && Number(product.preorder_sold || 0) >= Number(product.preorder_limit)) {
    issues.push("Increase the pre-order limit or turn pre-order off");
  }
  return [...new Set(issues)];
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
    product_code: row.product_code || null,
    seller_email: row.seller_email,
    name: row.name,
    category: row.category,
    brand: row.brand,
    price: row.price,
    mrp: row.mrp,
    stock: row.stock,
    rating: reviewCount ? Math.round(Number(row.review_avg) * 10) / 10 : 0,
    review_count: reviewCount,
    status: row.status,
    storefront_visibility: row.storefront_visibility || "glamia",
    featured: Boolean(row.featured),
    color: row.color,
    color_hex: row.color_hex || "",
    returnable: row.returnable === undefined || row.returnable === null ? true : Boolean(row.returnable),
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
    what_in_box: row.what_in_box || "",
    sizes: jsonArray(row.sizes_json),
    video_url: row.video_url || "",
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
    product_code: row.product_code || null,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory || "",
    brand: row.brand,
    price: row.price,
    mrp: row.mrp,
    stock: row.stock,
    rating: reviewCount ? Math.round(Number(row.review_avg) * 10) / 10 : 0,
    review_count: reviewCount,
    status: row.status,
    storefront_visibility: row.storefront_visibility || "glamia",
    featured: Boolean(row.featured),
    color: row.color,
    color_hex: row.color_hex || "",
    returnable: row.returnable === undefined || row.returnable === null ? true : Boolean(row.returnable),
    material: row.material || "",
    what_in_box: row.what_in_box || "",
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
  const session = mobileBearerToken(request) || (sharedSessionHost(request) && cookies[SHARED_SESSION_COOKIE]) || cookies[HOST_SESSION_COOKIE] || cookies[SESSION_COOKIE];
  if (!session) return null;
  try {
    return await resolveWebsiteWorkspaceIdentity(await verifySession(session, env, request), env, request);
  } catch {
    return null;
  }
}

// Employee-admin access is resolved live; it never changes the configured owner whitelist.
async function resolveWebsiteWorkspaceIdentity(user, env, request) {
  if (adminEmails(env, request).includes(String(user.email || "").toLowerCase())) return { ...user, is_owner: true, access_level: "owner" };
  const employee = await env.DB.prepare("SELECT id, employee_code, name, employee_email, position, permissions_json, owner_approved FROM employees WHERE LOWER(employee_email) = ? AND active = 1 AND position = 'admin' LIMIT 1")
    .bind(String(user.email || "").toLowerCase()).first();
  if (!employee) return { ...user, role: "seller", is_owner: false };
  return { ...user, ...employeeAdminActor(employee, env), access_level: "top_employee" };
}

// Fail closed for new admin endpoints until an explicit employee capability is assigned.
async function authorizeEmployeeWebsiteRequest(request, url, actor) {
  const path = url.pathname;
  const read = request.method === "GET";
  const access = actor.employee_permissions || {};
  const required = (ids) => { if (!ids.some((id) => access[id] === true)) throw httpError("Your employee permissions do not allow this action", 403); };
  if (path.startsWith("/api/admin/")) {
    const area = path.slice("/api/admin/".length).split("/")[0];
    const areas = { dashboard: ["dashboard"], notifications: ["notifications"], employees: ["employees"], hero: ["hero"], events: ["events"], "cinematic-reel": ["cinematic_reel"], "storefront-settings": ["storefront"], about: ["storefront"], categories: ["categories"], subcategories: ["categories"], coupons: ["coupons"], "coupon-recipients": ["coupons"], credits: ["credits"], customers: ["customers"], reviews: ["reviews"], questions: ["questions"], orders: ["orders"], returns: ["returns"], support: ["support"], "tax-settings": ["tax"], "tax-compliance": ["tax"], "google-analytics": ["google_analytics"], "google-merchant": ["system"], "email-events": ["system"], "audit-log": ["system"], backup: ["system"], products: ["products", "inventory", "deals", "tax"], search: ["products"] };
    if (!areas[area]) throw httpError("This action is reserved for an owner", 403);
    required(areas[area]);
    if (area === "products" && !read) {
      const body = await readJson(request.clone());
      const allowed = allowedEmployeeProductFields({ permissions: access });
      if (Object.keys(body).some((field) => !allowed.has(field))) throw httpError("This account cannot change those listing fields", 403);
    }
    if (area === "storefront-settings" && !read && access.cinematic_reel !== true) {
      const body = await readJson(request.clone());
      if (Object.prototype.hasOwnProperty.call(body, "cinematic_reel")) throw httpError("Cinematic reel permission is required", 403);
    }
  }
  if (path === "/api/products" && url.searchParams.get("scope") === "admin") required(["products", "add_product", "inventory", "deals", "tax", "coupons", "bulk_listing", "hero"]);
  if (path === "/api/products" && url.searchParams.get("scope") === "seller") required(["products", "add_product", "inventory", "deals", "tax", "coupons", "bulk_listing", "hero"]);
  if (/^\/api\/products\/[^/]+$/.test(path) && read) required(["products", "add_product", "inventory", "deals", "tax", "coupons", "bulk_listing", "hero"]);
  if (path === "/api/orders" && url.searchParams.get("scope") === "admin") required(["orders", "labels", "dashboard"]);
  if (/^\/api\/orders\/[^/]+\/(invoice|bill)$/.test(path)) required(["orders", "labels", "packing"]);
  if (path === "/api/returns" && url.searchParams.get("scope") === "admin") required(["returns"]);
  if (/^\/api\/support\/tickets\/[^/]+\/messages$/.test(path)) required(["support"]);
  if (path === "/api/products" && !read) required(["add_product", "bulk_listing"]);
  if (/^\/api\/products\/[^/]+$/.test(path) && !read) required(["products"]);
  if (path === "/api/uploads/video" && !read) required(["products", "add_product"]);
  else if (path.startsWith("/api/uploads/") && !read) required(["products", "add_product", "hero", "storefront"]);
}

function mobileBearerToken(request) {
  if (request.headers.get("X-Glamia-Mobile") !== "1") return "";
  const header = String(request.headers.get("Authorization") || "").trim();
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
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
  if (session.length > 8192 || session.split(".").length !== 2) throw new Error("Invalid session format");
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
  if (!validSessionClaims(payload, SESSION_MAX_AGE, isLocalDemoRequest(request, env))) {
    throw new Error("Invalid session claims");
  }
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
  // Only cookieless native requests may use the mobile marker instead of browser CSRF checks.
  if (request.headers.get("X-Glamia-Mobile") === "1" && !request.headers.get("Cookie") && !request.headers.get("Origin") && !request.headers.get("Referer") && !request.headers.get("Sec-Fetch-Site")) return;
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
    if (now >= rateLimitCleanupAt && ctx?.waitUntil) {
      // Use the existing timestamp index and throttle housekeeping independently of visitor count.
      rateLimitCleanupAt = now + RATE_LIMIT_WINDOW_MS;
      ctx.waitUntil(env.DB.prepare("DELETE FROM request_rate_limits WHERE updated_at < datetime('now', '-2 minutes')")
        .run().catch(() => {}));
    }
    return;
  } catch (error) {
    if (error?.status === 429) throw error;
    // Production must not silently weaken shared limits when its database is unavailable.
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw httpError("Please try again shortly", 503);
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
    const body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 1024 * 1024)));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch (error) {
    if (error.status === 413) throw error;
    throw httpError("Request body must be valid JSON", 400);
  }
}

async function readFormData(request) {
  try {
    const bytes = await readBoundedBody(request, 6 * 1024 * 1024);
    return await new Response(bytes, { headers: { "Content-Type": request.headers.get("Content-Type") || "" } }).formData();
  } catch (error) {
    if (error.status === 413) throw error;
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
  return new Response(JSON.stringify(data, istTimestampReplacer), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      "X-Application-Time-Zone": APP_TIME_ZONE
    }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-Frame-Options", "DENY");
  // Native clients use bearer sessions rather than browser cookies. The
  // wildcard is safe here because the app never sends credentials as cookies;
  // it also keeps the Expo web preview able to call the same API.
  if (!headers.has("Access-Control-Allow-Origin")) headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Accept, Content-Type, Authorization, X-Glamia-Mobile, X-Requested-With");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'sha256-QDL1JU0g6O+naM0GHg1SrXz5jfV62Pk3CmUPnu1n1kY=' 'sha256-On1TqejLHzYPtlgCG4EQtHKn2f1u8Plk+C210XpYbec=' https://accounts.google.com https://www.googletagmanager.com https://checkout.razorpay.com https://static.cloudflareinsights.com; style-src 'self' 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https://glamiastore.com https://www.glamiastore.com https://wibrawl.glamiastore.com https://accounts.google.com https://www.googleapis.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://api.razorpay.com https://cloudflareinsights.com; frame-src 'self' https://accounts.google.com https://api.razorpay.com https://*.razorpay.com; form-action 'self'");
  headers.set("Content-Security-Policy", headers.get("Content-Security-Policy").replace("style-src 'self'", `style-src 'self' 'sha256-${storefrontStyleHash}'`));
  headers.set("Content-Security-Policy", headers.get("Content-Security-Policy").replace("style-src 'self'", `style-src 'self' 'sha256-${wibrawlStorefrontStyleHash}'`));
  for (const hash of storefrontScriptHashes) headers.set('Content-Security-Policy', headers.get('Content-Security-Policy').replace("script-src 'self'", `script-src 'self' 'sha256-${hash}'`));
  headers.set('Content-Security-Policy', headers.get('Content-Security-Policy').replace("style-src 'self'", "style-src 'self' https://accounts.google.com/gsi/style"));
  headers.set("Content-Security-Policy", headers.get("Content-Security-Policy").replace("font-src 'self'", "font-src 'self' data:"));
  for (const style of Object.values(storefrontRouteCriticalStyles)) headers.set('Content-Security-Policy', headers.get('Content-Security-Policy').replace("style-src 'self'", `style-src 'self' 'sha256-${style.hash}'`));
  headers.set("Strict-Transport-Security", "max-age=31536000");
  if (headers.get("Content-Type")?.includes("application/json")) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Only the three owned HTTPS storefronts share a browser session. Workers.dev,
// previews and native bearer clients retain their existing isolated behavior.
function sharedSessionHost(request) {
  return STOREFRONT_ORIGINS.includes(new URL(request.url).origin);
}

function promoteStorefrontSession(request, user, response) {
  if (!user || !sharedSessionHost(request) || mobileBearerToken(request)) return;
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  if (cookies[SHARED_SESSION_COOKIE]) return;
  const token = cookies[HOST_SESSION_COOKIE] || cookies[SESSION_COOKIE];
  if (token) response.headers.append("Set-Cookie", makeSessionCookie(request, token, Math.max(0, user.exp - Math.floor(Date.now() / 1000))));
}

function bridgeStorefrontSession(request, user) {
  const origin = request.headers.get("Origin");
  if (!sharedSessionHost(request) || !STOREFRONT_ORIGINS.includes(origin)) {
    return json({ error: "Storefront origin is not allowed" }, 403);
  }
  const response = json({ shared: Boolean(user) }, 200, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  });
  promoteStorefrontSession(request, user, response);
  return response;
}

function sessionCookieName(request) {
  return sharedSessionHost(request) ? SHARED_SESSION_COOKIE : new URL(request.url).protocol === "https:" ? HOST_SESSION_COOKIE : SESSION_COOKIE;
}

function makeSessionCookie(request, token, maxAge = SESSION_MAX_AGE) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(request)}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}${sharedSessionHost(request) ? "; Domain=glamiastore.com" : ""}`;
}

function clearSessionCookie(request, name) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}${name === SHARED_SESSION_COOKIE && sharedSessionHost(request) ? "; Domain=glamiastore.com" : ""}`;
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
