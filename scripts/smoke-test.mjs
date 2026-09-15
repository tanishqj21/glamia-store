// End-to-end API smoke test against `wrangler dev`.
// Usage: npm run smoke  (server must be running on BASE_URL, default http://127.0.0.1:8787)
//
// Real Google Sign-In cannot be exercised from a script, so authenticated calls use
// session cookies minted with the same HMAC scheme as src/index.js and the local
// SESSION_SECRET from .dev.vars — this exercises the exact verify path the Worker uses.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(BASE).hostname)) throw new Error("Smoke tests reset fixtures and must run against a local server.");
const SECRET = readDevVar("SESSION_SECRET");
const ADMIN_EMAIL = readFirstAdminEmail() || "admin@example.com";
const SELLER_EMAIL = "seller@example.com";

let googleConfigured = false;
let failures = 0;
let checks = 0;

const filler = [
  "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=82"
];

function canonicalProductPath(product) {
  const slug = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const id = String(product?.id || "").trim();
  return `/${slug(product?.category) || "collection"}/${slug(product?.subcategory) || "collection"}/${slug(product?.name) || id || "item"}-${id.toLowerCase()}`;
}

function readDevVar(name) {
  try {
    const line = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
      .split("\n").find(l => l.trim().startsWith(`${name}=`));
    return line?.split("=").slice(1).join("=").trim();
  } catch {
    return undefined;
  }
}

function readFirstAdminEmail() {
  const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  return text.match(/"ADMIN_EMAILS"\s*:\s*\[\s*"([^"]+)"/)?.[1];
}

function mintSession(email, role) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: `test-${Buffer.from(email).toString("hex").slice(0, 16)}`,
    email,
    name: email.split("@")[0],
    picture: "",
    role,
    iat: now,
    nbf: now,
    exp: now + 3600
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `mm_session=${encoded}.${signature}`;
}

async function call(method, path, { cookie, body, form, raw } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    headers.origin = BASE;
    headers["x-requested-with"] = "Glamia";
  }
  const options = {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined)
  };
  let response = await fetch(`${BASE}${path}`, options);
  for (let retry = 0; response.status === 429 && retry < 3; retry++) {
    await response.arrayBuffer();
    console.log("  Waiting for local request limit to reset…");
    await new Promise(resolve => setTimeout(resolve, 25000));
    response = await fetch(`${BASE}${path}`, options);
  }
  if (raw) return response;
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function check(label, condition, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

console.log(`Smoke testing ${BASE}\n`);

console.log("React migration wiring:");
{
  const app = readFileSync(new URL("../react-app/src/main.jsx", import.meta.url), "utf8");
  const account = readFileSync(new URL("../react-app/src/components/AccountPages.jsx", import.meta.url), "utf8");
  const checkout = readFileSync(new URL("../react-app/src/components/CheckoutPage.jsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../react-app/src/components/AdminWorkspace.jsx", import.meta.url), "utf8");
  const adminOperations = readFileSync(new URL("../react-app/src/components/AdminOperations.jsx", import.meta.url), "utf8");
  const adminMerchandising = readFileSync(new URL("../react-app/src/components/AdminMerchandising.jsx", import.meta.url), "utf8");
  const adminSystem = readFileSync(new URL("../react-app/src/components/AdminSystemViews.jsx", import.meta.url), "utf8");
  const taxPicker = readFileSync(new URL("../react-app/src/components/TaxCodePicker.jsx", import.meta.url), "utf8");
  const bulkListing = readFileSync(new URL("../react-app/src/components/BulkListingView.jsx", import.meta.url), "utf8");
  const support = readFileSync(new URL("../react-app/src/components/CustomerCare.jsx", import.meta.url), "utf8");
  const publicPages = readFileSync(new URL("../react-app/src/components/PublicPages.jsx", import.meta.url), "utf8");
  const googleAnalytics = readFileSync(new URL("../react-app/src/components/GoogleAnalyticsView.jsx", import.meta.url), "utf8");
  const imageManager = readFileSync(new URL("../react-app/src/components/ImageManager.jsx", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const reactHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  check("React frontend is the primary entry point", reactHtml.includes("/assets/index-") && reactHtml.includes("<div id=\"root\"></div>"));
  check("All storefront, account, checkout, support, and admin routes render through React",
    app.includes("const reactRoutes = new Set") && app.includes("function NotFoundPage") &&
    app.includes("route === \"/checkout\" ? <ReactCheckoutPage") && app.includes("route === \"/support\" ? <CustomerSupportPage") &&
    app.includes("Boolean(categoryRoute)") && admin.includes("function AdminWorkspace") &&
    account.includes("function AccountPage") && checkout.includes("function CheckoutPage") && support.includes("function CustomerSupportPage"));
  check("Former legacy URLs cannot invoke a legacy fallback",
    !app.includes("LegacySurface") && !app.includes("legacy-index.html") &&
    !admin.includes("legacy-index.html") && !admin.includes("Open full console"));
  check("Unknown routes remain in the React shell", app.includes("This page has moved") && app.includes("Browse best sellers"));
  check("Catalog and product details include React filters and gallery controls",
    app.includes("function CatalogPage") && app.includes("function ProductDetailPage") &&
    app.includes("colorOptions") && app.includes("sizeOptions") && app.includes("gallery-control"));
  check("React admin includes the store map and all major control views",
    admin.includes("function OrdersView") && adminOperations.includes("export function CouponsView") &&
    adminMerchandising.includes("export function HeroStudioView") && adminSystem.includes("export function ManageStoreView"));
  check("Policies are published in React and linked as five separate footer pages",
    publicPages.includes("Terms & Conditions") && publicPages.includes("Privacy Policy") &&
    publicPages.includes("Refund & Cancellation") && publicPages.includes("Return Policy") &&
    publicPages.includes("Shipping Policy") && app.includes("/terms-and-conditions") &&
    app.includes("/privacy-policy") && app.includes("/refund-cancellation-policy") &&
    app.includes("/return-policy") && app.includes("/shipping-policy"));
  check("Listing forms include smart HSN/SAC suggestions",
    admin.includes("<TaxCodePicker") && taxPicker.includes("/data/tax/hsn.json") &&
    taxPicker.includes("/data/tax/sac.json") && taxPicker.includes("Suggested matches") &&
    taxPicker.includes("taxRuleFor") && taxPicker.includes("gst_rate: rule.rate"));
  check("Bulk listing template imports HSN and GST fields",
    bulkListing.includes('"HSN Code"') && bulkListing.includes('"GST Rate (%)"') &&
    bulkListing.includes("hsn_sac_code: hsnSacCode") && bulkListing.includes("gst_rate: gstRate") &&
    bulkListing.includes("taxRuleFor"));
  check("Admin dashboard includes a server-side Google Analytics 4 view",
    admin.includes("GoogleAnalyticsView") && googleAnalytics.includes("/api/admin/google-analytics") &&
    googleAnalytics.includes("Connect GA4") && googleAnalytics.includes("Top pages"));
  check("React storefront wires the public Google Analytics 4 measurement ID",
    app.includes("ensureGoogleAnalytics") && app.includes("googleAnalyticsMeasurementId") &&
    app.includes('"page_view"') && app.includes("googletagmanager.com/gtag/js"));
  check("Listing image manager previews, reorders, and selects thumbnails",
    admin.includes("<ImageManager") && imageManager.includes("First") && imageManager.includes("Last") &&
    imageManager.includes("Use as thumbnail") && imageManager.includes("preview"));
  check("Weekly R2 cleanup is scheduled and reference-aware",
    worker.includes("runWeeklyR2Cleanup") && worker.includes("PRODUCT_IMAGES.list") &&
    worker.includes("maintenance_tasks") && worker.includes("R2_CLEANUP_GRACE_MS") &&
    worker.includes('"products/", "reviews/"'));
}

console.log("Public endpoints:");
{
  const sitemapResponse = await call("GET", "/sitemap.xml", { raw: true });
  const sitemapText = await sitemapResponse.text();
  check("GET /sitemap.xml returns a Google-compatible XML sitemap", sitemapResponse.status === 200 &&
    sitemapResponse.headers.get("content-type")?.includes("application/xml") &&
    sitemapText.includes("<urlset") && sitemapText.includes(`${BASE}/`));
  const robotsResponse = await call("GET", "/robots.txt", { raw: true });
  const robotsText = await robotsResponse.text();
  check("GET /robots.txt points crawlers to the sitemap", robotsResponse.status === 200 &&
    robotsResponse.headers.get("content-type")?.includes("text/plain") &&
    robotsText.includes("Disallow: /admin") && robotsText.includes("Allow: /api/products") &&
    robotsText.includes("Allow: /api/assets/") && robotsText.includes(`Sitemap: ${BASE}/sitemap.xml`));
  const { status, data } = await call("GET", "/api/config");
  check("GET /api/config returns googleClientId", status === 200 && typeof data.googleClientId === "string");
  check("GET /api/config returns a valid Google Analytics measurement ID",
    status === 200 && typeof data.googleAnalyticsMeasurementId === "string" &&
    /^G-[A-Z0-9]+$/i.test(data.googleAnalyticsMeasurementId));
  googleConfigured = Boolean(data.googleClientId) && !data.googleClientId.includes("REPLACE_WITH");
  const session = await call("GET", "/api/session");
  check("GET /api/session is anonymous", session.status === 200 && session.data.user === null);
  const products = await call("GET", "/api/products");
  check("GET /api/products lists only live products", products.status === 200 &&
    products.data.products.length >= 5 && products.data.products.every(p => p.status === "live"),
    `got ${products.data.products?.length}`);
  const apiCrawlerResponse = await fetch(`${BASE}/api/products?view=cards`);
  check("Public rendering APIs are crawlable but cannot be indexed as standalone pages",
    apiCrawlerResponse.status === 200 && apiCrawlerResponse.headers.get("x-robots-tag") === "noindex, nofollow");
  const expectedProductPath = products?.data?.products?.[0] ? canonicalProductPath(products.data.products[0]) : "";
  check("Sitemap exposes canonical hierarchical product paths and no legacy product namespace", expectedProductPath &&
    sitemapText.includes(`${BASE}${expectedProductPath}`) && !sitemapText.includes("/product/"));
  const seoProductResponse = await fetch(`${BASE}${expectedProductPath}`, { headers: { "user-agent": "Google-InspectionTool/1.0" } });
  const seoProductHtml = await seoProductResponse.text();
  check("Google inspection receives a self-contained product page instead of an API-dependent shell", seoProductResponse.status === 200 &&
    seoProductHtml.includes(`<h1>${products.data.products[0].name}</h1>`) &&
    seoProductHtml.includes("Product details") && seoProductHtml.includes("Availability") &&
    seoProductHtml.includes("application/ld+json") && !seoProductHtml.includes('type="module"'));
  const seoCategoryResponse = await fetch(`${BASE}/category/Women`, { headers: { "user-agent": "Google-InspectionTool/1.0" } });
  const seoCategoryHtml = await seoCategoryResponse.text();
  check("Google inspection receives server-rendered category content instead of a soft 404", seoCategoryResponse.status === 200 &&
    seoCategoryHtml.includes("<title>Women collection | Glamia</title>") &&
    seoCategoryHtml.includes("Midnight Satin Wrap Dress") &&
    seoCategoryHtml.includes("rel=\"canonical\"") && !seoCategoryHtml.includes('type="module"'));
  const compactProducts = await call("GET", "/api/products?view=cards&limit=2&page=1");
  check("Compact catalogue is paginated and omits detail-only fields", compactProducts.status === 200 &&
    compactProducts.data.products?.length === 2 && compactProducts.data.products.every(product => product.compact === true && !("description" in product) && !("variants" in product)) &&
    compactProducts.data.pagination?.page === 1 && compactProducts.data.pagination?.has_more === true);
  const searchedProducts = await call("GET", "/api/products?view=cards&q=satin&category=Women");
  check("FTS catalogue search combines with category filtering", searchedProducts.status === 200 &&
    searchedProducts.data.products?.some(product => product.id === "seed-midnight-satin-dress") &&
    searchedProducts.data.products.every(product => product.category === "Women"));
  const productDetail = await call("GET", "/api/products/seed-midnight-satin-dress");
  check("Product detail endpoint returns the full record on demand", productDetail.status === 200 &&
    productDetail.data.product?.id === "seed-midnight-satin-dress" &&
    typeof productDetail.data.product?.description === "string" && Array.isArray(productDetail.data.product?.images));
  const hero = await call("GET", "/api/hero");
  check("GET /api/hero returns active managed slides", hero.status === 200 && hero.data.slides?.length >= 3 &&
    hero.data.slides.every(slide => slide.active && slide.frames?.length), `got ${hero.data.slides?.length}`);
  const storefrontSettings = await call("GET", "/api/storefront-settings");
  check("GET /api/storefront-settings returns storefront chrome", storefrontSettings.status === 200 &&
    storefrontSettings.data.announcement && storefrontSettings.data.trust_strip?.items?.length === 3);
  const hsnReference = await fetch(`${BASE}/data/tax/hsn.json`);
  const hsnReferenceData = await hsnReference.json().catch(() => []);
  const sacReference = await fetch(`${BASE}/data/tax/sac.json`);
  const sacReferenceData = await sacReference.json().catch(() => []);
  const stateReference = await fetch(`${BASE}/data/tax/states.json`);
  const stateReferenceData = await stateReference.json().catch(() => []);
  check("Workbook tax references are available to the admin UI", hsnReference.status === 200 &&
    sacReference.status === 200 && stateReference.status === 200 &&
    Array.isArray(hsnReferenceData) && hsnReferenceData.length > 20000 &&
    Array.isArray(sacReferenceData) && sacReferenceData.length > 600 &&
    Array.isArray(stateReferenceData) && stateReferenceData.length >= 30);
  const invalidPostal = await call("GET", "/api/postal-lookup?pin=123");
  check("Postal lookup rejects incomplete PIN codes", invalidPostal.status === 400);
  const validPostal = await call("GET", "/api/postal-lookup?pin=110052");
  check("Postal lookup returns Indian country, state, and city", validPostal.status === 200 &&
    validPostal.data.country === "India" && validPostal.data.state && validPostal.data.city);
  const notFound = await call("GET", "/api/does-not-exist");
  check("Unknown API route returns 404 JSON", notFound.status === 404);
  const health = await call("GET", "/api/health");
  check("Health endpoint reports D1 availability", health.status === 200 && health.data.ok === true && health.data.database === "ok");
  const protectedHeaders = await fetch(`${BASE}/api/health`, { method: "POST", headers: { origin: "https://evil.example" } });
  check("Mutating cross-origin requests are blocked", protectedHeaders.status === 403);
  const rateProbeIp = `rate-probe-${Date.now()}`;
  const rateProbeStatuses = [];
  for (let index = 0; index < 21; index++) {
    const response = await fetch(`${BASE}/api/order-tracking?order=not-found&email=rate-probe@example.com`, {
      headers: { "CF-Connecting-IP": rateProbeIp }
    });
    rateProbeStatuses.push(response.status);
  }
  check("Shared rate limit rejects requests beyond the window allowance",
    rateProbeStatuses.slice(0, 20).every(status => status === 400) && rateProbeStatuses[20] === 429);
}

console.log("Auth guards:");
{
  const create = await call("POST", "/api/products", { body: { name: "x" } });
  check("POST /api/products requires sign-in (401)", create.status === 401);
  const sellerScope = await call("GET", "/api/products?scope=seller");
  check("Seller scope requires sign-in (401)", sellerScope.status === 401);
  const adminScope = await call("GET", "/api/products?scope=admin");
  check("Admin scope requires sign-in (401)", adminScope.status === 401);
  const patch = await call("PATCH", "/api/admin/products/seed-ivory-linen-shirt", { body: { status: "live" } });
  check("Admin PATCH requires sign-in (401)", patch.status === 401);
  const reset = await call("POST", "/api/admin/reset");
  check("Admin reset requires sign-in (401)", reset.status === 401);
  const upload = await call("POST", "/api/uploads/image", { form: new FormData() });
  check("Upload requires sign-in (401)", upload.status === 401);
  const googleAnalytics = await call("GET", "/api/admin/google-analytics");
  check("Google Analytics endpoint requires admin sign-in (401)", googleAnalytics.status === 401);
}

console.log("Google credential verification:");
{
  const missing = await call("POST", "/api/auth/google", { body: {} });
  check("Missing credential rejected (400)", missing.status === 400);
  const garbage = await call("POST", "/api/auth/google", { body: { credential: "not-a-jwt" } });
  if (googleConfigured) {
    check("Malformed credential rejected (401)", garbage.status === 401);
    const fakeJwt = `${Buffer.from(JSON.stringify({ alg: "RS256", kid: "unknown", typ: "JWT" })).toString("base64url")}.${Buffer.from("{}").toString("base64url")}.sig`;
    const fakeKid = await call("POST", "/api/auth/google", { body: { credential: fakeJwt } });
    check("Unknown Google key rejected (401)", fakeKid.status === 401, JSON.stringify(fakeKid.data));
  } else {
    check("Unconfigured client id blocks login with setup error (500)",
      garbage.status === 500 && /Configure GOOGLE_CLIENT_ID/.test(garbage.data.error || ""),
      JSON.stringify(garbage.data));
  }
  const passwordSignup = await call("POST", "/api/auth/signup", { body: { email: "password@example.com", password: "not-used" } });
  const passwordLogin = await call("POST", "/api/auth/login", { body: { email: "password@example.com", password: "not-used" } });
  check("Password authentication is disabled in demo mode", passwordSignup.status === 410 && passwordLogin.status === 410);
}

console.log("Seller session (non-whitelisted email):");
const sellerCookie = mintSession(SELLER_EMAIL, "seller");
let createdProductId;
let baselineCredits = 0;
{
  const session = await call("GET", "/api/session", { cookie: sellerCookie });
  check("Minted session resolves as seller", session.data.user?.email === SELLER_EMAIL && session.data.user?.role === "seller");
  const loyalty = await call("GET", "/api/loyalty", { cookie: sellerCookie });
  check("Customer rewards account returns a server-side balance and referral code", loyalty.status === 200 &&
    Number.isInteger(loyalty.data.balance) && /^GLAMIA-/.test(loyalty.data.referral_code || ""));
  baselineCredits = Number(loyalty.data.balance || 0);

  const emptyAddresses = await call("GET", "/api/addresses", { cookie: sellerCookie });
  check("Account address book is available", emptyAddresses.status === 200 && Array.isArray(emptyAddresses.data.addresses));
  const addressPayload = {
    addresses: [
      {
        id: "smoke-home",
        name: "Smoke Test Buyer",
        phone: "+91 98765 43210",
        line1: "12 Test Street",
        line2: "Near the market",
        city: "Mumbai",
        state: "Maharashtra",
        pin: "400001",
        isDefault: true
      },
      {
        id: "smoke-office",
        name: "Smoke Test Buyer",
        phone: "+91 98765 43210",
        line1: "44 Work Avenue",
        line2: "",
        city: "Pune",
        state: "Maharashtra",
        pin: "411001",
        isDefault: false
      }
    ]
  };
  const savedAddresses = await call("PUT", "/api/addresses", { cookie: sellerCookie, body: addressPayload });
  check("Account addresses save to D1", savedAddresses.status === 200 && savedAddresses.data.addresses?.length === 2 &&
    savedAddresses.data.addresses[0]?.isDefault === true);
  const reloadedAddresses = await call("GET", "/api/addresses", { cookie: sellerCookie });
  check("Account addresses reload from D1", reloadedAddresses.status === 200 &&
    reloadedAddresses.data.addresses?.some(address => address.id === "smoke-office"));
  const clearedAddresses = await call("PUT", "/api/addresses", { cookie: sellerCookie, body: { addresses: [] } });
  check("Account address cleanup succeeds", clearedAddresses.status === 200 && clearedAddresses.data.addresses?.length === 0);

  const createdAddress = await call("POST", "/api/addresses", {
    cookie: sellerCookie,
    body: {
      name: "Checkout Buyer",
      phone: "+44 20 7946 0958",
      line1: "10 Test Street",
      line2: "",
      city: "London",
      state: "",
      pin: "SW1A 2AA",
      country: "United Kingdom",
      isDefault: true
    }
  });
  const createdAddressId = createdAddress.data.addresses?.[0]?.id;
  check("Address Book accepts international addresses", createdAddress.status === 200 &&
    Boolean(createdAddressId) && createdAddress.data.addresses[0].isDefault === true &&
    createdAddress.data.addresses[0].country === "United Kingdom" && createdAddress.data.addresses[0].pin === "SW1A 2AA");
  const duplicateAddress = await call("POST", "/api/addresses", {
    cookie: sellerCookie,
    body: {
      name: "Another Recipient",
      phone: "+44 20 7946 0958",
      line1: "10 Test Street",
      line2: "",
      city: "London",
      state: "",
      pin: "SW1A 2AA",
      country: "United Kingdom"
    }
  });
  check("Exact duplicate address with the same phone is rejected", duplicateAddress.status === 409 &&
    /already saved/i.test(duplicateAddress.data.error));
  const alternatePhoneAddress = await call("POST", "/api/addresses", {
    cookie: sellerCookie,
    body: {
      name: "Another Recipient",
      phone: "+44 20 7946 0959",
      line1: "10 Test Street",
      line2: "",
      city: "London",
      state: "",
      pin: "SW1A 2AA",
      country: "United Kingdom"
    }
  });
  const alternatePhoneAddressId = alternatePhoneAddress.data.addresses?.find(address => address.phone.endsWith("0959"))?.id;
  check("Same address with a different phone number is allowed", alternatePhoneAddress.status === 200 &&
    Boolean(alternatePhoneAddressId));
  const updatedAddress = await call("PATCH", `/api/addresses/${createdAddressId}`, {
    cookie: sellerCookie,
    body: { ...createdAddress.data.addresses[0], line2: "Opposite Test Park", isDefault: true }
  });
  check("Account address can be edited", updatedAddress.status === 200 &&
    updatedAddress.data.addresses?.[0]?.line2 === "Opposite Test Park");
  const deletedAddress = await call("DELETE", `/api/addresses/${createdAddressId}`, { cookie: sellerCookie });
  if (alternatePhoneAddressId) await call("DELETE", `/api/addresses/${alternatePhoneAddressId}`, { cookie: sellerCookie });
  check("Account address can be deleted", deletedAddress.status === 200 && deletedAddress.data.addresses?.length === 1);

  const noPostalAddress = await call("POST", "/api/addresses", {
    cookie: sellerCookie,
    body: {
      name: "No Postal Test",
      phone: "+971 4 123 4567",
      line1: "Building 7, Test District",
      line2: "",
      city: "Dubai",
      state: "",
      pin: "",
      country: "United Arab Emirates",
      isDefault: true
    }
  });
  const noPostalAddressId = noPostalAddress.data.addresses?.[0]?.id;
  check("Address Book supports countries without state or postal codes", noPostalAddress.status === 200 &&
    Boolean(noPostalAddressId) && noPostalAddress.data.addresses[0].country === "United Arab Emirates");
  if (noPostalAddressId) await call("DELETE", `/api/addresses/${noPostalAddressId}`, { cookie: sellerCookie });

  const goodImages = [
    "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=900&q=82",
    "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=82",
    "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=900&q=82",
    "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=82"
  ];
  const base = {
    name: "Smoke Test Cardigan",
    category: "Women",
    brand: "Test Atelier",
    price: 1299,
    mrp: 1999,
    stock: 10,
    color: "Oat",
    material: "Brushed Cotton",
    sizes: ["S", "M"],
    size_stock: { S: 5, M: 5 },
    description: "Created by the smoke test."
  };
  const created = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: { ...base, images: goodImages, thumbnail_source_url: goodImages[2], thumbnail_urls: [goodImages[2]] }
  });
  check("Seller creates listing (201, on hold, selected image is thumbnail)",
    created.status === 201 && created.data.product?.status === "hold" &&
    created.data.product?.images?.length === 4 && created.data.product?.images[0] === goodImages[0] &&
    created.data.product?.thumbnail_source_url === goodImages[2] &&
    created.data.product?.thumbnail_url === goodImages[2] && created.data.product?.material === "Brushed Cotton");
  createdProductId = created.data.product?.id;

  const publicAfterCreate = await call("GET", "/api/products");
  check("On-hold listing hidden from storefront", !publicAfterCreate.data.products.some(p => p.id === createdProductId));

  const goLive = await call("PATCH", `/api/admin/products/${createdProductId}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"), body: { status: "live" }
  });
  check("Admin can take a held listing live", goLive.status === 200 && goLive.data.product?.status === "live");
  const publicAfterLive = await call("GET", "/api/products");
  check("Live listing visible in storefront", publicAfterLive.data.products.some(p => p.id === createdProductId));

  const archive = await call("PATCH", `/api/admin/products/${createdProductId}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"), body: { status: "archived" }
  });
  check("Admin can archive a listing", archive.status === 200 && archive.data.product?.status === "archived");
  const publicAfterArchive = await call("GET", "/api/products");
  check("Archived listing hidden from storefront", !publicAfterArchive.data.products.some(p => p.id === createdProductId));

  const restore = await call("PATCH", `/api/admin/products/${createdProductId}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"), body: { status: "live" }
  });
  check("Archived listing can be restored to live", restore.status === 200 && restore.data.product?.status === "live");

  const badStatusCreate = await call("PATCH", `/api/admin/products/${createdProductId}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"), body: { status: "teleporting" }
  });
  check("Invalid status rejected (400)", badStatusCreate.status === 400);

  const tooFewImages = await call("POST", "/api/products", { cookie: sellerCookie, body: { ...base, images: goodImages.slice(0, 3) } });
  check("Fewer than 4 images rejected (400)", tooFewImages.status === 400);

  const tooManyImages = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: { ...base, images: [...goodImages, "https://x.test/5.jpg", "https://x.test/6.jpg", "https://x.test/7.jpg"] }
  });
  check("More than 6 images rejected (400)", tooManyImages.status === 400);

  const badVariant = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: { ...base, images: goodImages, variants: [{ color: "Black", sizes: [], stock: 3, images: goodImages }] }
  });
  check("Variant without sizes rejected (400)", badVariant.status === 400);

  const variantTooFewImages = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: { ...base, images: goodImages, variants: [{ color: "Black", sizes: ["M"], stock: 3, images: goodImages.slice(0, 2) }] }
  });
  check("Variant with fewer than 4 images rejected (400)", variantTooFewImages.status === 400);

  const variantTooManyImages = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: {
      ...base,
      images: [
        "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=82"
      ],
      variants: [{ color: "Black", sizes: ["M"], stock: 3, images: [...goodImages, "https://x.test/5.jpg", "https://x.test/6.jpg", "https://x.test/7.jpg", "https://x.test/8.jpg", "https://x.test/9.jpg"] }]
    }
  });
  check("Variant with more than 8 images rejected (400)", variantTooManyImages.status === 400);

  const withVariants = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: {
      ...base,
      images: [
        "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=82"
      ],
      variants: [
        { color: "Black", sizes: ["S", "M"], stock: 6, images: goodImages },
        { color: "Ivory", sizes: ["M"], stock: 4, images: goodImages }
      ]
    }
  });
  check("Listing with colourways exploded (main + 2 linked)", withVariants.status === 201 &&
    withVariants.data.product?.variant_group && withVariants.data.variants?.length === 2);
  const variantProductId = withVariants.data.product?.id;
  const variantGroupId = withVariants.data.product?.variant_group;

  const adminGroupScope = await call("GET", "/api/products?scope=admin", { cookie: mintSession(ADMIN_EMAIL, "admin") });
  const group = adminGroupScope.data.products.filter(p => p.variant_group === variantGroupId);
  check("Colourways are standalone linked listings", group.length === 3 &&
    group.every(p => p.name === base.name) &&
    new Set(group.map(p => p.color)).size === 3 &&
    group.every(p => p.sizes.length >= 1) &&
    group.every(p => p.status === "hold"));

  const goLiveGroup = await call("PATCH", `/api/admin/products/${variantProductId}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"), body: { status: "live" }
  });
  const publicAfterGroup = await call("GET", "/api/products");
  const liveGroup = publicAfterGroup.data.products.filter(p => p.variant_group === variantGroupId);
  check("Status change applies to linked colourways", goLiveGroup.status === 200 && liveGroup.length === 3 &&
    liveGroup.every(p => p.status === "live"));

  const edit = await call("PATCH", `/api/admin/products/${variantProductId}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"),
    body: { name: "Smoke Test Cardigan Edited", price: 1199, stock: 9 }
  });
  check("Admin full edit updates product", edit.status === 200 &&
    edit.data.product?.name === "Smoke Test Cardigan Edited" &&
    edit.data.product?.price === 1199 &&
    edit.data.product?.variant_group === variantGroupId);

  const revertEdit = await call("PATCH", `/api/admin/products/${variantProductId}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"),
    body: { name: base.name, price: base.price }
  });

  const noMaterial = await call("POST", "/api/products", { cookie: sellerCookie, body: { ...base, images: goodImages, material: "" } });
  check("Missing material rejected (400)", noMaterial.status === 400);

  const invalid = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: { ...base, images: goodImages, price: 50, mrp: 10 }
  });
  check("Price above MRP rejected (400)", invalid.status === 400);

  const mine = await call("GET", "/api/products?scope=seller", { cookie: sellerCookie });
  check("Seller scope lists own products", mine.status === 200 && mine.data.products.some(p => p.id === createdProductId));

  const patch = await call("PATCH", `/api/admin/products/${createdProductId}`, { cookie: sellerCookie, body: { status: "live" } });
  check("Seller cannot moderate products (403)", patch.status === 403);

  const others = await call("GET", "/api/products?scope=seller", { cookie: mintSession("other-seller@example.com", "seller") });
  check("Other seller does not see this product", !others.data.products.some(p => p.id === createdProductId));

  const adminScope = await call("GET", "/api/products?scope=admin", { cookie: sellerCookie });
  check("Seller denied admin scope (403)", adminScope.status === 403);
}

console.log("Profile identity, birthday limit + mobile:");
{
  const anon = await call("GET", "/api/profile");
  check("GET /api/profile requires sign-in (401)", anon.status === 401);

  const beforeProfile = await call("GET", "/api/profile", { cookie: sellerCookie });
  const baselineDob = beforeProfile.data.dob || "1999-04-12";
  const saved = await call("PUT", "/api/profile", {
    cookie: sellerCookie,
    body: {
      first_name: "Mira",
      middle_name: "Anaya",
      last_name: "Sen",
      dob: baselineDob,
      phone: "+91 98765 43210"
    }
  });
  check("Seller saves structured name, DOB and mobile", saved.status === 200 && saved.data.name === "Mira Anaya Sen" &&
    saved.data.first_name === "Mira" && saved.data.middle_name === "Anaya" && saved.data.last_name === "Sen" &&
    saved.data.dob === baselineDob && saved.data.phone === "+91 98765 43210");

  const loaded = await call("GET", "/api/profile", { cookie: sellerCookie });
  check("Structured profile details persist", loaded.data.name === "Mira Anaya Sen" && loaded.data.dob === baselineDob &&
    loaded.data.phone === "+91 98765 43210");

  let lockedProfile = saved.data;
  if (lockedProfile.can_change_dob) {
    const permittedDob = lockedProfile.dob === "1998-03-11" ? "1997-02-10" : "1998-03-11";
    const firstChange = await call("PUT", "/api/profile", {
      cookie: sellerCookie,
      body: { first_name: "Mira", middle_name: "Anaya", last_name: "Sen", dob: permittedDob, phone: "+91 98765 43210" }
    });
    check("First eligible birthday change starts the annual lock", firstChange.status === 200 &&
      firstChange.data.dob === permittedDob && firstChange.data.can_change_dob === false && Boolean(firstChange.data.dob_change_available_at));
    lockedProfile = firstChange.data;
  }
  const blockedDob = lockedProfile.dob === "1996-01-09" ? "1995-01-08" : "1996-01-09";
  const tooSoon = await call("PUT", "/api/profile", {
    cookie: sellerCookie,
    body: { first_name: "Mira", middle_name: "Anaya", last_name: "Sen", dob: blockedDob, phone: "+91 98765 43210" }
  });
  check("Birthday cannot be changed twice within 12 months", tooSoon.status === 409 && /once every 12 months/i.test(tooSoon.data.error));

  const renamed = await call("PUT", "/api/profile", {
    cookie: sellerCookie,
    body: { first_name: "Mira", middle_name: "", last_name: "Rao", dob: lockedProfile.dob, phone: "+91 98765 43210" }
  });
  check("Name and phone remain editable while birthday is locked", renamed.status === 200 &&
    renamed.data.name === "Mira Rao" && renamed.data.dob === lockedProfile.dob && renamed.data.can_change_dob === false);

  const missingLastName = await call("PUT", "/api/profile", {
    cookie: sellerCookie,
    body: { first_name: "Mira", middle_name: "", last_name: "", dob: lockedProfile.dob, phone: "+91 98765 43210" }
  });
  check("Structured name requires first and last names", missingLastName.status === 400 && /last name is required/i.test(missingLastName.data.error));

  const badDob = await call("PUT", "/api/profile", { cookie: sellerCookie, body: { dob: "12/04/1999" } });
  check("Invalid DOB format rejected (400)", badDob.status === 400);

  const badPhone = await call("PUT", "/api/profile", { cookie: sellerCookie, body: { phone: "call me" } });
  check("Invalid mobile number rejected (400)", badPhone.status === 400);
}

console.log("R2 image upload:");
{
  const form = new FormData();
  form.append("file", new Blob([PNG_1PX], { type: "image/png" }), "test.png");
  const upload = await call("POST", "/api/uploads/image", { cookie: sellerCookie, form });
  check("Upload returns R2 image URL", upload.status === 200 && typeof upload.data.imageUrl === "string" && upload.data.imageUrl.startsWith("/api/assets/products/"));

  const asset = await fetch(`${BASE}${upload.data.imageUrl}`);
  check("Uploaded image served from R2", asset.status === 200 && asset.headers.get("content-type") === "image/png" &&
    Buffer.compare(Buffer.from(await asset.arrayBuffer()), PNG_1PX) === 0);
  const assetHead = await fetch(`${BASE}${upload.data.imageUrl}`, { method: "HEAD" });
  check("Product images support crawler HEAD requests", assetHead.status === 200 &&
    assetHead.headers.get("content-type") === "image/png" && Number(assetHead.headers.get("content-length")) === PNG_1PX.length);

  const missing = await fetch(`${BASE}/api/assets/products/nobody/missing.png`);
  check("Missing asset returns 404", missing.status === 404);

  const tooBig = new FormData();
  tooBig.append("file", new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: "image/png" }), "big.png");
  const rejected = await call("POST", "/api/uploads/image", { cookie: sellerCookie, form: tooBig });
  check("Oversized upload rejected (400)", rejected.status === 400);

  // Regression: editing a listing must not delete images it kept. The edit form
  // sends image_keys: [] (keys are derived server-side from the asset URLs).
  const editSafeListing = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: {
      name: "R2 Regression Sweater", category: "Women", brand: "Test Atelier",
      price: 1299, mrp: 1999, stock: 10, color: "Oat", material: "Brushed Cotton",
      sizes: ["S", "M"], description: "Created by the smoke test.",
      images: [upload.data.imageUrl, ...filler.slice(0, 3)]
    }
  });
  const editKeep = await call("PATCH", `/api/admin/products/${editSafeListing.data.product.id}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"),
    body: { price: 1249, images: [upload.data.imageUrl, ...filler.slice(0, 3)], image_keys: [] }
  });
  const kept = await fetch(`${BASE}${upload.data.imageUrl}`);
  check("Editing a listing keeps its uploaded images", editKeep.status === 200 && kept.status === 200);
  const editRemove = await call("PATCH", `/api/admin/products/${editSafeListing.data.product.id}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"),
    body: { images: filler.slice(0, 4), image_keys: [] }
  });
  const gone = await fetch(`${BASE}${upload.data.imageUrl}`);
  check("Removing an uploaded image deletes the file", editRemove.status === 200 && gone.status === 404);
}

console.log("Orders, coupons, customers, reviews:");
{
  const couponRun = Date.now().toString(36).toUpperCase();
  const categoryCouponCode = `SMOKE-CAT-${couponRun}`;
  const productCouponCode = `SMOKE-PROD-${couponRun}`;
  const mixedCouponCode = `SMOKE-MIXED-${couponRun}`;
  const futureCouponCode = `SMOKE-FUTURE-${couponRun}`;
  const emailCouponCode = `SMOKE-EMAIL-${couponRun}`;
  const cappedCouponCode = `SMOKE-CAP-${couponRun}`;
  const oneUseCouponCode = `SMOKE-ONE-${couponRun}`;
  const testAddress = {
    name: "Test Buyer",
    phone: "+44 20 7946 0958",
    line1: "10 Test Street",
    line2: "",
    city: "London",
    state: "",
    pin: "SW1A 2AA",
    country: "United Kingdom"
  };
  const missingGuestEmail = await call("POST", "/api/orders", {
    body: { items: [{ id: "seed-midnight-satin-dress", quantity: 1, size: "M" }], payment_method: "cod", address: testAddress }
  });
  check("Guest checkout requires a valid email", missingGuestEmail.status === 400 && /valid email/i.test(missingGuestEmail.data.error));
  const guestCod = await call("POST", "/api/orders", {
    body: { items: [{ id: "seed-midnight-satin-dress", quantity: 1, size: "M" }], payment_method: "cod", email: SELLER_EMAIL, address: testAddress }
  });
  const guestOrderId = guestCod.data.order?.id;
  check("Guest can place a worldwide demo payment order", guestCod.status === 201 &&
    guestCod.data.order?.payment_method === "demo" && guestCod.data.order?.payment_status === "demo" &&
    Boolean(guestCod.data.order?.tracking_token) && guestCod.data.order?.customer_email === SELLER_EMAIL &&
    guestCod.data.order?.shipping?.country === "United Kingdom" && !("email" in (guestCod.data.order?.shipping || {})));
  const guestCard = await call("POST", "/api/orders", {
    body: { items: [{ id: "seed-midnight-satin-dress", quantity: 1, size: "M" }], payment_method: "card", email: SELLER_EMAIL, address: testAddress }
  });
  check("Real card payment methods are rejected in demo mode", guestCard.status === 400 && /demo payments/i.test(guestCard.data.error));

  const noAddress = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: { items: [{ id: createdProductId, quantity: 1 }], payment_method: "demo" }
  });
  check("Order without address rejected (400)", noAddress.status === 400);

  const couponCheck = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: "GLAMIA10", items: [{ id: createdProductId, quantity: 2 }] }
  });
  check("Coupon validate returns percent discount", couponCheck.status === 200 && couponCheck.data.discount === 260);

  const badCoupon = await call("POST", "/api/coupons/validate", { cookie: sellerCookie, body: { code: "NOPE", items: [{ id: createdProductId, quantity: 1 }] } });
  check("Unknown coupon rejected (400)", badCoupon.status === 400);

  const order = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: {
      items: [{ id: createdProductId, quantity: 2, size: "S" }],
      coupon: "GLAMIA10",
      payment_method: "demo",
      address: testAddress
    }
  });
  check("Demo order created with coupon discount and demo payment status", order.status === 201 &&
    order.data.order?.subtotal === 2598 && order.data.order?.discount === 260 && order.data.order?.total === 2338 &&
    order.data.order?.payment_method === "demo" && order.data.order?.payment_status === "demo" &&
    Boolean(order.data.order?.tracking_token) &&
    order.data.order?.shipping?.city === "London" && order.data.order?.shipping?.country === "United Kingdom");
  const orderId = order.data.order?.id;

  const codOrder = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: {
      items: [{ id: createdProductId, quantity: 1, size: "M", variant: "Charcoal" }],
      payment_method: "cod",
      address: testAddress
    }
  });
  check("Legacy COD requests are stored as demo payments", codOrder.status === 201 && codOrder.data.order?.payment_method === "demo" &&
    codOrder.data.order?.payment_status === "demo");
  check("Order items keep size and colour", codOrder.data.order?.items?.[0]?.size === "M" &&
    codOrder.data.order?.items?.[0]?.variant === "Charcoal");

  const afterStock = (await call("GET", "/api/products?scope=admin", { cookie: mintSession(ADMIN_EMAIL, "admin") }))
    .data.products.find(p => p.id === createdProductId);
  check("Orders decremented product stock (10 -> 7)", afterStock?.stock === 7, `got ${afterStock?.stock}`);

  const myOrders = await call("GET", "/api/orders", { cookie: sellerCookie });
  check("Customer sees signed-in and earlier guest orders for the same email",
    myOrders.data.orders.some(o => o.id === orderId) && myOrders.data.orders.some(o => o.id === guestOrderId));

  const adminCookie = mintSession(ADMIN_EMAIL, "admin");
  const adminOrders = await call("GET", "/api/orders?scope=admin", { cookie: adminCookie });
  check("Admin sees all orders", adminOrders.status === 200 && adminOrders.data.orders.some(o => o.id === orderId));

  const preorderListing = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: {
      name: "Smoke Test Pre-order",
      category: "Women",
      brand: "Test Atelier",
      price: 1299,
      mrp: 1999,
      color: "Oat",
      material: "Brushed Cotton",
      sizes: ["S", "M"],
      description: "Created by the smoke test.",
      stock: 0,
      size_stock: { S: 0, M: 0 },
      images: [
        "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=900&q=82",
        "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=82"
      ],
      preorder_enabled: true,
      preorder_limit: 1,
      preorder_release_at: new Date(Date.now() + 86400000).toISOString()
    }
  });
  const preorderProductId = preorderListing.data.product?.id;
  const preorderLive = await call("PATCH", `/api/admin/products/${preorderProductId}`, {
    cookie: adminCookie, body: { status: "live", preorder_enabled: true, preorder_limit: 1 }
  });
  const preorderOrder = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: { items: [{ id: preorderProductId, quantity: 1, size: "S" }], payment_method: "cod", address: testAddress }
  });
  const preorderOrderId = preorderOrder.data.order?.id;
  check("Admin can enable a zero-stock pre-order listing", preorderListing.status === 201 && preorderLive.status === 200 &&
    preorderLive.data.product?.preorder_enabled === true && preorderLive.data.product?.preorder_limit === 1);
  check("Pre-order checkout accepts a sold-out size and tracks its commitment", preorderOrder.status === 201 &&
    preorderOrder.data.order?.order_type === "preorder" && preorderOrder.data.order?.items?.[0]?.preorder === true);
  const preorderLimit = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: { items: [{ id: preorderProductId, quantity: 1, size: "M" }], payment_method: "cod", address: testAddress }
  });
  check("Pre-order capacity is enforced atomically", preorderLimit.status === 409 && /pre-order limit/i.test(preorderLimit.data.error));
  const preorderAdminProduct = (await call("GET", "/api/products?scope=admin", { cookie: adminCookie }))
    .data.products.find(product => product.id === preorderProductId);
  check("Pre-order commitment count is persisted server-side", preorderAdminProduct?.preorder_sold === 1);
  const preorderCancelled = await call("POST", `/api/orders/${preorderOrderId}/cancel`, { cookie: sellerCookie, body: {} });
  const preorderReleasedProduct = (await call("GET", "/api/products?scope=admin", { cookie: adminCookie }))
    .data.products.find(product => product.id === preorderProductId);
  check("Cancelling a pre-order releases its commitment", preorderCancelled.status === 200 && preorderReleasedProduct?.preorder_sold === 0);
  const orderNumber = order.data.order?.order_number;
  check("Orders receive unique courier order numbers", /^GM-\d{8}-[A-Z0-9]{1,3}-\d{5}$/.test(orderNumber) &&
    orderNumber !== codOrder.data.order?.order_number);
  const publicTrackWithoutEmail = await call("GET", `/api/order-tracking?order_id=${encodeURIComponent(orderNumber)}`);
  const publicTrackWrongEmail = await call("GET", `/api/order-tracking?order_id=${encodeURIComponent(orderNumber)}&email=wrong@example.com`);
  const publicTrackWithEmail = await call("GET", `/api/order-tracking?order_id=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(SELLER_EMAIL)}`);
  const publicTrackWithToken = await call("GET", `/api/order-tracking?order_id=${encodeURIComponent(order.data.order?.tracking_token)}`);
  check("Public order tracking requires ownership proof", publicTrackWithoutEmail.status === 404 && publicTrackWrongEmail.status === 404 &&
    publicTrackWithEmail.status === 200 && publicTrackWithEmail.data.order?.order_number === orderNumber &&
    publicTrackWithToken.status === 200 && publicTrackWithToken.data.order?.order_number === orderNumber);
  const notifications = await call("GET", "/api/admin/notifications", { cookie: adminCookie });
  check("Admin notification center receives new-order alert", notifications.status === 200 &&
    notifications.data.notifications.some(n => n.type === "new_order" && n.order_id === orderId && n.message.includes(orderNumber)));
  const readNotifications = await call("POST", "/api/admin/notifications/read-all", { cookie: adminCookie, body: {} });
  check("Admin can mark notifications read", readNotifications.status === 200 && readNotifications.data.unread_count === 0);

  const productQuestion = await call("POST", `/api/products/${encodeURIComponent(createdProductId)}/questions`, {
    cookie: sellerCookie, body: { question: "Does this demo listing have a lining?" }
  });
  const questionNotifications = await call("GET", "/api/admin/notifications", { cookie: adminCookie });
  check("Product questions create admin notifications", productQuestion.status === 201 && questionNotifications.status === 200 &&
    questionNotifications.data.notifications.some(n => n.type === "product_question" && n.product_id === createdProductId));

  const sellerAdminScope = await call("GET", "/api/orders?scope=admin", { cookie: sellerCookie });
  check("Seller denied admin order scope (403)", sellerAdminScope.status === 403);

  const shipped = await call("PATCH", `/api/admin/orders/${orderId}`, { cookie: adminCookie, body: { status: "shipped" } });
  check("Admin updates order status", shipped.status === 200 && shipped.data.order?.status === "shipped");

  const trackingAssigned = await call("PATCH", `/api/admin/orders/${orderId}`, {
    cookie: adminCookie, body: { status: "confirmed", tracking_number: "TRK-SMOKE-123" }
  });
  check("Assigning tracking automatically marks an order shipped", trackingAssigned.status === 200 &&
    trackingAssigned.data.order?.tracking_number === "TRK-SMOKE-123" && trackingAssigned.data.order?.status === "shipped");
  const trackingCleared = await call("PATCH", `/api/admin/orders/${orderId}`, {
    cookie: adminCookie, body: { status: "confirmed", tracking_number: "" }
  });
  check("Admin can clear an optional tracking number", trackingCleared.status === 200 &&
    !trackingCleared.data.order?.tracking_number && trackingCleared.data.order?.status === "confirmed");

  const badStatus = await call("PATCH", `/api/admin/orders/${orderId}`, { cookie: adminCookie, body: { status: "teleported" } });
  check("Invalid order status rejected (400)", badStatus.status === 400);

  const cancelledGuest = await call("POST", `/api/orders/${guestOrderId}/cancel`, { cookie: sellerCookie, body: {} });
  check("Customer can cancel an unfulfilled order", cancelledGuest.status === 200 && cancelledGuest.data.order?.status === "cancelled");
  const restockAdd = await call("POST", "/api/restock-subscriptions", {
    cookie: sellerCookie, body: { product_id: createdProductId, size: "S" }
  });
  const restockList = await call("GET", "/api/restock-subscriptions", { cookie: sellerCookie });
  check("Customer can subscribe to a size restock alert", restockAdd.status === 200 && restockList.data.subscriptions?.some(entry => entry.product_id === createdProductId && entry.size === "S"));
  const restockRemove = await call("DELETE", "/api/restock-subscriptions", {
    cookie: sellerCookie, body: { product_id: createdProductId, size: "S" }
  });
  check("Customer can remove a restock alert", restockRemove.status === 200 &&
    !(await call("GET", "/api/restock-subscriptions", { cookie: sellerCookie })).data.subscriptions?.some(entry => entry.product_id === createdProductId && entry.size === "S"));

  const delivered = await call("PATCH", `/api/admin/orders/${orderId}`, { cookie: adminCookie, body: { status: "delivered" } });
  const codDelivered = await call("PATCH", `/api/admin/orders/${codOrder.data.order?.id}`, { cookie: adminCookie, body: { status: "delivered" } });
  const codOriginalRefund = await call("POST", `/api/orders/${codOrder.data.order?.id}/returns`, {
    cookie: sellerCookie, body: { type: "refund", reason: "COD refund policy test", refund_destination: "original" }
  });
  check("COD refunds reject the original payment method", codDelivered.status === 200 && codOriginalRefund.status === 400);
  const returnRequest = await call("POST", `/api/orders/${orderId}/returns`, {
    cookie: sellerCookie, body: { type: "exchange", reason: "Need a different size", exchange_product_id: createdProductId, exchange_from_size: "S", exchange_to_size: "M" }
  });
  check("Customer can request an exchange in another available size", delivered.status === 200 && returnRequest.status === 201 && returnRequest.data.request?.status === "requested" && returnRequest.data.request?.type === "exchange" && returnRequest.data.request?.exchange_to_size === "M" && returnRequest.data.request?.refund_destination === "store_credit" && returnRequest.data.replacement_order?.order_type === "replacement" && returnRequest.data.replacement_order?.replacement_for_order_id === orderId, JSON.stringify(returnRequest));
  const adminReturns = await call("GET", "/api/returns?scope=admin", { cookie: adminCookie });
  const returnId = returnRequest.data.request?.id;
  const approvedReturn = await call("PATCH", `/api/admin/returns/${returnId}`, { cookie: adminCookie, body: { status: "approved", notes: "Approved for exchange" } });
  check("Admin can manage an after-sales request", adminReturns.status === 200 && adminReturns.data.requests?.some(entry => entry.id === returnId) && approvedReturn.status === 200 && approvedReturn.data.request?.status === "approved", JSON.stringify({ adminReturns, approvedReturn }));
  const refundedReturn = await call("PATCH", `/api/admin/returns/${returnId}`, { cookie: adminCookie, body: { status: "refunded", refund_amount: 1000, notes: "Refund recorded for smoke test" } });
  const repeatRefund = await call("PATCH", `/api/admin/returns/${returnId}`, { cookie: adminCookie, body: { status: "refunded", refund_amount: 1000, notes: "Refund recorded for smoke test" } });
  const refundReopen = await call("PATCH", `/api/admin/returns/${returnId}`, { cookie: adminCookie, body: { status: "approved" } });
  const credited = await call("GET", "/api/loyalty", { cookie: sellerCookie });
  check("Refund processing records an amount and timestamp", refundedReturn.status === 200 &&
    refundedReturn.data.request?.refund_amount === 1000 && Boolean(refundedReturn.data.request?.refund_processed_at) &&
    repeatRefund.status === 200 && refundReopen.status === 409 && credited.data.balance === baselineCredits + 1000, JSON.stringify({ refundedReturn, repeatRefund, refundReopen, credited }));

  const customers = await call("GET", "/api/admin/customers", { cookie: adminCookie });
  const sellerRow = customers.data.customers.find(c => c.email === SELLER_EMAIL);
  check("Customer list includes buyer with spend aggregate", customers.status === 200 &&
    Boolean(sellerRow) && sellerRow.order_count >= 1 && sellerRow.total_spent >= 2338);
  const customersAsSeller = await call("GET", "/api/admin/customers", { cookie: sellerCookie });
  check("Seller denied customer list (403)", customersAsSeller.status === 403);

  const newCoupon = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie,
    body: { code: "SMOKE-FLAT", type: "flat", value: 150 }
  });
  check("Admin creates flat coupon", newCoupon.status === 201 && newCoupon.data.coupon?.code === "SMOKE-FLAT");

  const dupe = await call("POST", "/api/admin/coupons", { cookie: adminCookie, body: { code: "SMOKE-FLAT", type: "percent", value: 5 } });
  check("Duplicate coupon rejected (400)", dupe.status === 400);

  const coupons = await call("GET", "/api/admin/coupons", { cookie: adminCookie });
  check("Admin coupon list includes new coupon", coupons.data.coupons.some(c => c.code === "SMOKE-FLAT"));

  const removed = await call("DELETE", "/api/admin/coupons/SMOKE-FLAT", { cookie: adminCookie });
  check("Admin deletes coupon", removed.status === 200);

  const cappedCoupon = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie,
    body: { code: cappedCouponCode, type: "percent", value: 50, max_discount: 500, min_cart_value: 10000 }
  });
  const cappedApply = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: cappedCouponCode, items: [{ id: createdProductId, quantity: 8 }] }
  });
  check("Coupon maximum discount caps percentage savings", cappedCoupon.status === 201 &&
    cappedCoupon.data.coupon?.max_discount === 500 && cappedCoupon.data.coupon?.min_cart_value === 10000 &&
    cappedApply.status === 200 && cappedApply.data.discount === 500 && cappedApply.data.min_cart_value === 10000);
  const minimumBlocked = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: cappedCouponCode, items: [{ id: createdProductId, quantity: 1 }] }
  });
  check("Coupon minimum cart value is enforced", minimumBlocked.status === 400 && /minimum cart value/i.test(minimumBlocked.data.error));
  await call("DELETE", `/api/admin/coupons/${encodeURIComponent(cappedCouponCode)}`, { cookie: adminCookie });

  const emailCoupon = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie,
    body: {
      code: emailCouponCode,
      type: "percent",
      value: 20,
      scope: "all",
      email_targets: [SELLER_EMAIL],
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
      usage_limit: 3,
      per_user_limit: 1
    }
  });
  check("Admin creates a timed email-targeted coupon", emailCoupon.status === 201 &&
    emailCoupon.data.coupon?.email_targets?.length === 1 &&
    emailCoupon.data.coupon.email_targets[0] === SELLER_EMAIL &&
    emailCoupon.data.coupon.usage_limit === 3);
  const emailCouponApply = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: emailCouponCode, items: [{ id: createdProductId, quantity: 1 }] }
  });
  check("Selected email account can use its coupon", emailCouponApply.status === 200 && emailCouponApply.data.discount > 0);
  const unselectedEmailApply = await call("POST", "/api/coupons/validate", {
    cookie: mintSession("unselected@example.com", "customer"),
    body: { code: emailCouponCode, items: [{ id: createdProductId, quantity: 1 }] }
  });
  check("Unselected email account is blocked from the coupon", unselectedEmailApply.status === 400 &&
    /not available|selected customer/i.test(unselectedEmailApply.data.error));
  const emailCouponList = await call("GET", "/api/admin/coupons", { cookie: adminCookie });
  const storedEmailCoupon = emailCouponList.data.coupons?.find(coupon => coupon.code === emailCouponCode);
  check("Email allowlist is returned from the backend database", emailCouponList.status === 200 &&
    storedEmailCoupon?.email_targets?.includes(SELLER_EMAIL));

  // Scoped coupons: category + product.
  const scopedCategory = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie, body: { code: categoryCouponCode, type: "percent", value: 20, scope: "category", scope_value: "Women" }
  });
  check("Admin creates category-scoped coupon", scopedCategory.status === 201 && scopedCategory.data.coupon?.scope === "category");
  const scopedProduct = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie, body: { code: productCouponCode, type: "flat", value: 500, scope: "product", scope_value: createdProductId }
  });
  check("Admin creates product-scoped coupon", scopedProduct.status === 201 && scopedProduct.data.coupon?.scope === "product");
  const scopedBadTarget = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie, body: { code: `SMOKE-BAD-${couponRun}`, type: "percent", value: 5, scope: "product", scope_value: "missing-id" }
  });
  check("Product-scoped coupon with unknown product rejected (400)", scopedBadTarget.status === 400);

  const createdPrice = 1299;
  const catApply = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: categoryCouponCode, items: [{ id: createdProductId, quantity: 1, size: "S" }, { id: "seed-ivory-linen-shirt", quantity: 1, size: "M" }] }
  });
  check("Category coupon discounts only matching items", catApply.status === 200 && catApply.data.discount === Math.round(createdPrice * 0.2));
  const catScope = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: {
      items: [{ id: createdProductId, quantity: 1, size: "S" }, { id: "seed-ivory-linen-shirt", quantity: 1, size: "M" }],
      coupon: categoryCouponCode,
      payment_method: "cod",
      address: testAddress
    }
  });
  const expectedDiscount = Math.round(createdPrice * 0.2);
  check("Scoped order discount computed server-side", catScope.status === 201 &&
    catScope.data.order?.discount === expectedDiscount);
  const prodApply = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: productCouponCode, items: [{ id: "seed-midnight-satin-dress", quantity: 1 }] }
  });
  check("Product coupon rejected when product not in cart (400)", prodApply.status === 400 && /does not apply/.test(prodApply.data.error));

  const mixedTimed = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie,
    body: {
      code: mixedCouponCode,
      type: "percent",
      value: 15,
      scope: "targeted",
      targets: [
        { type: "category", value: "Women" },
        { type: "product", value: "seed-ivory-linen-shirt" }
      ],
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
      usage_limit: 5,
      per_user_limit: 1
    }
  });
  check("Admin creates mixed, timed, limited coupon", mixedTimed.status === 201 &&
    mixedTimed.data.coupon?.scope === "targeted" && mixedTimed.data.coupon?.targets?.length === 2 &&
    mixedTimed.data.coupon?.usage_limit === 5 && mixedTimed.data.coupon?.per_user_limit === 1);
  const mixedApply = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: mixedCouponCode, items: [{ id: createdProductId, quantity: 1, size: "S" }, { id: "seed-ivory-linen-shirt", quantity: 1, size: "M" }] }
  });
  check("Mixed coupon matches category plus individual product", mixedApply.status === 200 && mixedApply.data.discount > 0);
  const mixedOrder = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: {
      items: [{ id: createdProductId, quantity: 1, size: "S" }],
      coupon: mixedCouponCode,
      payment_method: "cod",
      address: testAddress
    }
  });
  check("Timed mixed coupon applies at checkout", mixedOrder.status === 201 && mixedOrder.data.order?.coupon_code === mixedCouponCode);
  const mixedReuse = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: mixedCouponCode, items: [{ id: createdProductId, quantity: 1, size: "S" }] }
  });
  check("Coupon cannot be reused by the same account", mixedReuse.status === 400 && /already used|maximum/i.test(mixedReuse.data.error));
  const mixedCancellation = await call("POST", `/api/orders/${mixedOrder.data.order?.id}/cancel`, { cookie: sellerCookie, body: {} });
  const mixedAfterCancellation = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: mixedCouponCode, items: [{ id: createdProductId, quantity: 1, size: "S" }] }
  });
  check("Cancelling an order releases its coupon redemption", mixedCancellation.status === 200 &&
    mixedAfterCancellation.status === 200);

  const oneUseCoupon = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie,
    body: { code: oneUseCouponCode, type: "flat", value: 25, usage_limit: 1, per_user_limit: 1 }
  });
  const raceCookies = [mintSession("coupon-race-a@example.com", "seller"), mintSession("coupon-race-b@example.com", "seller")];
  const couponRaceResults = await Promise.all(raceCookies.map(cookie => call("POST", "/api/orders", {
    cookie,
    body: {
      items: [{ id: createdProductId, quantity: 1, size: "M" }],
      coupon: oneUseCouponCode,
      payment_method: "cod",
      address: testAddress
    }
  })));
  const couponRaceStatuses = couponRaceResults.map(result => result.status).sort((a, b) => a - b);
  check("Concurrent checkout enforces a global coupon limit atomically", oneUseCoupon.status === 201 &&
    couponRaceStatuses[0] === 201 && [400, 409].includes(couponRaceStatuses[1]),
    `got ${couponRaceStatuses.join(", ")}`);
  const successfulCouponRace = couponRaceResults.find(result => result.status === 201);
  const successfulCouponRaceIndex = couponRaceResults.findIndex(result => result.status === 201);
  if (successfulCouponRace?.data.order?.id && successfulCouponRaceIndex >= 0) {
    await call("POST", `/api/orders/${successfulCouponRace.data.order.id}/cancel`, {
      cookie: raceCookies[successfulCouponRaceIndex], body: {}
    });
  }
  const futureCoupon = await call("POST", "/api/admin/coupons", {
    cookie: adminCookie,
    body: {
      code: futureCouponCode,
      type: "flat",
      value: 50,
      starts_at: new Date(Date.now() + 3600000).toISOString(),
      ends_at: new Date(Date.now() + 7200000).toISOString(),
      per_user_limit: 1
    }
  });
  const futureApply = await call("POST", "/api/coupons/validate", {
    cookie: sellerCookie,
    body: { code: futureCouponCode, items: [{ id: createdProductId, quantity: 1, size: "S" }] }
  });
  check("Future coupon is blocked before its start time", futureCoupon.status === 201 && futureApply.status === 400 && /not active yet/i.test(futureApply.data.error));
  await call("DELETE", `/api/admin/coupons/${mixedCouponCode}`, { cookie: adminCookie });
  await call("DELETE", `/api/admin/coupons/${futureCouponCode}`, { cookie: adminCookie });
  await call("DELETE", `/api/admin/coupons/${oneUseCouponCode}`, { cookie: adminCookie });
  await call("DELETE", `/api/admin/coupons/${categoryCouponCode}`, { cookie: adminCookie });
  await call("DELETE", `/api/admin/coupons/${productCouponCode}`, { cookie: adminCookie });
  await call("DELETE", `/api/admin/coupons/${emailCouponCode}`, { cookie: adminCookie });

  // Deal start time + manual deal price.
  const dealListing = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: {
      name: "Deal Price Kurta", category: "Women", brand: "Test Atelier",
      price: 2000, mrp: 3000, stock: 10, color: "Oat", material: "Cotton",
      sizes: ["S", "M"], description: "Created by the smoke test.", images: filler
    }
  });
  const dealListingId = dealListing.data.product?.id;
  const dealPriced = await call("PATCH", `/api/admin/products/${dealListingId}`, {
    cookie: adminCookie,
    body: {
      status: "live",
      deal_starts_at: null,
      deal_ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      deal_price: 999
    }
  });
  check("Deal price + window stored on product", dealPriced.status === 200 &&
    dealPriced.data.product?.deal_price === 999 && Boolean(dealPriced.data.product?.deal_ends_at));
  const dealOrder = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: {
      items: [{ id: dealListingId, quantity: 1, size: "S" }],
      payment_method: "cod",
      address: testAddress
    }
  });
  check("Orders charge the deal price during the window", dealOrder.status === 201 &&
    dealOrder.data.order?.items?.[0]?.price === 999 && dealOrder.data.order?.total === 999);
  // Shopping-behaviour events + dashboard aggregates.
  const recoveryEmail = "cart-recovery@example.com";
  const recoveryCookie = mintSession(recoveryEmail, "seller");
  await call("POST", "/api/cart-events", { cookie: recoveryCookie, body: { id: dealListingId, quantity: 2 } });
  await call("POST", "/api/wishlist-events", { cookie: sellerCookie, body: { id: dealListingId } });
  const dashboard = await call("GET", "/api/admin/dashboard", { cookie: adminCookie });
  const dashProduct = dashboard.data.byProduct?.find(p => p.id === dealListingId);
  check("Dashboard aggregates sales, carts and wishlists", dashboard.status === 200 &&
    Boolean(dashboard.data.byCategory) && Boolean(dashboard.data.bySubcategory) &&
    Array.isArray(dashboard.data.orders_by_state) && Array.isArray(dashboard.data.orders_by_hour) &&
    dashboard.data.orders_by_hour.length === 24 &&
    dashProduct && dashProduct.image && dashProduct.image === dashProduct.thumbnail &&
    dashProduct.adds === 2 && dashProduct.wishlists === 1);
  const visitors = dashboard.data.visitors || {};
  const dailyVisitTotal = (visitors.by_day || []).reduce((sum, entry) => sum + Number(entry.views || 0), 0);
  check("Dashboard exposes reconciled daily and hourly visitor analytics", dashboard.status === 200 &&
    Array.isArray(visitors.by_day) && visitors.by_day.length === 30 &&
    Array.isArray(visitors.by_hour) && visitors.by_hour.length === 24 &&
    Array.isArray(visitors.by_day_hour) && visitors.total_30d === dailyVisitTotal);
  const dealRecovery = dashboard.data.cart_recovery?.find(item => item.customer_email === recoveryEmail);
  check("Cart recovery estimates active deal pricing", dealRecovery?.estimated_value === 1998,
    JSON.stringify({ expected: 1998, recovery: dealRecovery, dashboardStatus: dashboard.status }));
  const dashboardAsSeller = await call("GET", "/api/admin/dashboard", { cookie: sellerCookie });
  check("Seller denied dashboard (403)", dashboardAsSeller.status === 403);
  const googleAnalytics = await call("GET", "/api/admin/google-analytics", { cookie: adminCookie });
  check("Admin Google Analytics endpoint returns setup or report data safely",
    (googleAnalytics.status === 200 && typeof googleAnalytics.data.configured === "boolean") ||
    (googleAnalytics.status === 502 && googleAnalytics.data.configured === true && googleAnalytics.data.error),
    JSON.stringify(googleAnalytics.data));
  const dealPriceRemove = await call("PATCH", `/api/admin/products/${dealListingId}`, {
    cookie: adminCookie, body: { deal_price: null, deal_ends_at: null }
  });
  check("Deal price removable on edit", dealPriceRemove.status === 200 && !dealPriceRemove.data.product?.deal_price);

  const dealSet = await call("PATCH", `/api/admin/products/${createdProductId}`, {
    cookie: adminCookie,
    body: { deal_ends_at: new Date(Date.now() + 3600000).toISOString() }
  });
  check("Admin schedules a deal", dealSet.status === 200 && Boolean(dealSet.data.product?.deal_ends_at));
  const dealBad = await call("PATCH", `/api/admin/products/${createdProductId}`, {
    cookie: adminCookie,
    body: { deal_ends_at: "not-a-date" }
  });
  check("Invalid deal date rejected (400)", dealBad.status === 400);
  const publicWithDeal = await call("GET", "/api/products");
  check("Deal end time exposed publicly", publicWithDeal.data.products.some(p => p.id === createdProductId && p.deal_ends_at));
  const dealRemove = await call("PATCH", `/api/admin/products/${createdProductId}`, {
    cookie: adminCookie,
    body: { deal_ends_at: null }
  });
  check("Admin removes a deal", dealRemove.status === 200 && !dealRemove.data.product?.deal_ends_at);

  const categoryCreate = await call("POST", "/api/admin/categories", { cookie: adminCookie, body: { name: "Smoke Cat" } });
  check("Admin creates category", categoryCreate.status === 201);
  const categoryDuplicate = await call("POST", "/api/admin/categories", { cookie: adminCookie, body: { name: "Smoke Cat" } });
  check("Duplicate category rejected (409)", categoryDuplicate.status === 409);
  const categoryList = await call("GET", "/api/categories");
  check("Public category list includes new category", categoryList.status === 200 &&
    categoryList.data.categories.includes("Smoke Cat"));
  const categoryCreateForbidden = await call("POST", "/api/admin/categories", { cookie: sellerCookie, body: { name: "Nope Cat" } });
  check("Seller cannot create category (403)", categoryCreateForbidden.status === 403);
  const categoryDeleteUsed = await call("DELETE", `/api/admin/categories/${encodeURIComponent("Women")}`, { cookie: adminCookie });
  check("Deleting in-use category blocked (409)", categoryDeleteUsed.status === 409);
  const categoryDelete = await call("DELETE", `/api/admin/categories/${encodeURIComponent("Smoke Cat")}`, { cookie: adminCookie });
  check("Admin deletes unused category", categoryDelete.status === 200);

  const subcategoryCreate = await call("POST", "/api/admin/subcategories", {
    cookie: adminCookie, body: { category: "Women", name: "Smoke Tops" }
  });
  check("Admin creates subcategory", subcategoryCreate.status === 201);
  const subcategoryDuplicate = await call("POST", "/api/admin/subcategories", {
    cookie: adminCookie, body: { category: "Women", name: "Smoke Tops" }
  });
  check("Duplicate subcategory rejected (409)", subcategoryDuplicate.status === 409);
  const subcategoryUnknownCategory = await call("POST", "/api/admin/subcategories", {
    cookie: adminCookie, body: { category: "Missing Category", name: "Smoke Tops" }
  });
  check("Subcategory for unknown category rejected (400)", subcategoryUnknownCategory.status === 400);
  const categoryListAfter = await call("GET", "/api/categories");
  check("Subcategory list exposed publicly", categoryListAfter.data.subcategories?.some(s => s.category === "Women" && s.name === "Smoke Tops"));
  const listingBase = {
    name: "Subcategory Test Blouse", category: "Women", brand: "Test Atelier",
    price: 1299, mrp: 1999, stock: 10, color: "Oat", material: "Brushed Cotton",
    sizes: ["S", "M"], description: "Created by the smoke test.",
    images: [
      "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=82",
      "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=82",
      "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=900&q=82",
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=82"
    ]
  };
  const listingWithSubcategory = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: { ...listingBase, subcategory: "Smoke Tops" }
  });
  check("Listing stores its subcategory", listingWithSubcategory.status === 201 &&
    listingWithSubcategory.data.product?.subcategory === "Smoke Tops");
  const listingBadSubcategory = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: { ...listingBase, subcategory: "Not A Sub" }
  });
  check("Unknown subcategory rejected (400)", listingBadSubcategory.status === 400);
  const subcategoryDeleteUsed = await call("DELETE", `/api/admin/subcategories/${encodeURIComponent("Women")}/${encodeURIComponent("Smoke Tops")}`, { cookie: adminCookie });
  check("Deleting in-use subcategory blocked (409)", subcategoryDeleteUsed.status === 409);
  const subcategoryDelete = await call("DELETE", `/api/admin/subcategories/${encodeURIComponent("Accessories")}/${encodeURIComponent("Smoke Sub")}`, { cookie: adminCookie });
  check("Deleting missing subcategory returns 404", subcategoryDelete.status === 404);

  const perSizeListing = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: {
      name: "Per-Size Stock Dress", category: "Women", brand: "Test Atelier",
      price: 1299, mrp: 1999, stock: 3, color: "Oat", material: "Brushed Cotton",
      sizes: ["S", "M", "L"], description: "Created by the smoke test.",
      images: filler,
      size_stock: { S: 2, M: 1, L: 0 }
    }
  });
  check("Per-size stock stored on create", perSizeListing.status === 201 &&
    perSizeListing.data.product?.size_stock?.S === 2 &&
    perSizeListing.data.product?.size_stock?.M === 1 &&
    perSizeListing.data.product?.size_stock?.L === 0 &&
    perSizeListing.data.product?.stock === 3);
  const perSizeId = perSizeListing.data.product?.id;
  const goLivePerSize = await call("PATCH", `/api/admin/products/${perSizeId}`, {
    cookie: mintSession(ADMIN_EMAIL, "admin"), body: { status: "live" }
  });
  check("Per-size listing goes live", goLivePerSize.status === 200 && goLivePerSize.data.product?.status === "live");
  const sizeSoldOutOrder = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: {
      items: [{ id: perSizeId, quantity: 1, size: "L" }],
      payment_method: "cod",
      address: testAddress
    }
  });
  check("Ordering a sold-out size rejected (400)", sizeSoldOutOrder.status === 400 && /sold out/i.test(sizeSoldOutOrder.data.error));
  const sizeOrder = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: {
      items: [{ id: perSizeId, quantity: 1, size: "S" }],
      payment_method: "cod",
      address: testAddress
    }
  });
  check("Order decrements the chosen size", sizeOrder.status === 201);
  const perSizeAfter = (await call("GET", "/api/products?scope=admin", { cookie: adminCookie }))
    .data.products.find(p => p.id === perSizeId);
  check("Size stock decremented (S 2 -> 1, total 3 -> 2)", perSizeAfter?.size_stock?.S === 1 && perSizeAfter?.stock === 2);
  const seedStockBefore = (await call("GET", "/api/products?scope=admin", { cookie: adminCookie })).data.products
    .find(p => p.id === "seed-ivory-linen-shirt")?.stock;
  const stockPatch = await call("PATCH", "/api/admin/products/seed-ivory-linen-shirt", {
    cookie: adminCookie, body: { stock: 7 }
  });
  const stockRestore = await call("PATCH", "/api/admin/products/seed-ivory-linen-shirt", {
    cookie: adminCookie, body: { stock: seedStockBefore }
  });
  check("Admin stock-only patch updates total stock", stockPatch.status === 200 && stockPatch.data.product?.stock === 7 &&
    stockRestore.status === 200 && stockRestore.data.product?.stock === seedStockBefore);
  const cancelledSizeOrder = await call("PATCH", `/api/admin/orders/${sizeOrder.data.order.id}`, {
    cookie: adminCookie, body: { status: "cancelled" }
  });
  const restoredSizeProduct = (await call("GET", "/api/products?scope=admin", { cookie: adminCookie }))
    .data.products.find(p => p.id === perSizeId);
  check("Cancelling an order restores stock", cancelledSizeOrder.status === 200 &&
    restoredSizeProduct?.stock === 3 && restoredSizeProduct?.size_stock?.S === 2);
  const repeatedCancellation = await call("PATCH", `/api/admin/orders/${sizeOrder.data.order.id}`, {
    cookie: adminCookie, body: { status: "cancelled" }
  });
  const stockAfterRepeatedCancellation = (await call("GET", "/api/products?scope=admin", { cookie: adminCookie }))
    .data.products.find(p => p.id === perSizeId);
  check("Repeated cancellation cannot restore stock twice", repeatedCancellation.status === 200 &&
    stockAfterRepeatedCancellation?.stock === 3 && stockAfterRepeatedCancellation?.size_stock?.S === 2);

  const raceListing = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: {
      name: "Final Unit Race Test", category: "Women", brand: "Test Atelier",
      price: 999, mrp: 1499, stock: 1, color: "Ink", material: "Cotton",
      sizes: ["S"], description: "Concurrency regression product.", images: filler,
      size_stock: { S: 1 }
    }
  });
  const raceProductId = raceListing.data.product?.id;
  await call("PATCH", `/api/admin/products/${raceProductId}`, { cookie: adminCookie, body: { status: "live" } });
  const inventoryRaceResults = await Promise.all([
    call("POST", "/api/orders", { cookie: mintSession("stock-race-a@example.com", "seller"), body: { items: [{ id: raceProductId, quantity: 1, size: "S" }], payment_method: "cod", address: testAddress } }),
    call("POST", "/api/orders", { cookie: mintSession("stock-race-b@example.com", "seller"), body: { items: [{ id: raceProductId, quantity: 1, size: "S" }], payment_method: "cod", address: testAddress } })
  ]);
  const inventoryRaceStatuses = inventoryRaceResults.map(result => result.status).sort((a, b) => a - b);
  const raceProductAfter = (await call("GET", "/api/products?scope=admin", { cookie: adminCookie }))
    .data.products.find(product => product.id === raceProductId);
  check("Concurrent checkout cannot oversell the final size unit", raceListing.status === 201 &&
    inventoryRaceStatuses[0] === 201 && [400, 409].includes(inventoryRaceStatuses[1]) &&
    raceProductAfter?.stock === 0 && raceProductAfter?.size_stock?.S === 0,
    `statuses ${inventoryRaceStatuses.join(", ")}, stock ${raceProductAfter?.stock}/${raceProductAfter?.size_stock?.S}`);

  const reviewsAnon = await call("GET", `/api/products/${createdProductId}/reviews`);
  check("Anyone can read reviews", reviewsAnon.status === 200 && Array.isArray(reviewsAnon.data.reviews));

  const reviewAnon = await call("POST", `/api/products/${createdProductId}/reviews`, { body: { rating: 5, comment: "Great" } });
  check("Writing a review requires sign-in (401)", reviewAnon.status === 401);

  const adminCookie0 = mintSession(ADMIN_EMAIL, "admin");
  const notPurchased = await call("POST", `/api/products/${createdProductId}/reviews`, {
    cookie: adminCookie0, body: { rating: 1, comment: "Never bought this" }
  });
  check("Non-purchaser can review (marked unverified)", notPurchased.status === 200 &&
    notPurchased.data.count === 1 && !notPurchased.data.my_review?.verified);

  const notPurchasedCheck = await call("GET", `/api/products/${createdProductId}/reviews`, { cookie: adminCookie0 });
  check("Purchase eligibility flag exposed", notPurchasedCheck.data.has_purchased === false);

  const badRating = await call("POST", `/api/products/${createdProductId}/reviews`, {
    cookie: sellerCookie, body: { rating: 9, comment: "Amazing fit and fabric" }
  });
  check("Rating above 5 rejected (400)", badRating.status === 400);

  const review = await call("POST", `/api/products/${createdProductId}/reviews`, {
    cookie: sellerCookie, body: { rating: 5, comment: "Amazing fit and fabric" }
  });
  check("Purchaser review created with verified flag", review.status === 200 && review.data.count === 2 &&
    review.data.average === 3 && review.data.my_review?.rating === 5 && review.data.my_review?.verified === 1);

  const reviewMediaForm = new FormData();
  reviewMediaForm.append("file", new Blob([PNG_1PX], { type: "image/png" }), "review.png");
  reviewMediaForm.append("kind", "review");
  const reviewMediaUpload = await call("POST", "/api/uploads/image", { cookie: sellerCookie, form: reviewMediaForm });
  check("Review media uploads are disabled", reviewMediaUpload.status === 400 && reviewMediaUpload.data.error === "Review media uploads are disabled");
  const updatedWithoutMedia = await call("POST", `/api/products/${createdProductId}/reviews`, {
    cookie: sellerCookie,
    body: { rating: 4, comment: "Updated after a week of wear" }
  });
  const reviewWithMediaField = await call("POST", `/api/products/${createdProductId}/reviews`, {
    cookie: sellerCookie,
    body: { rating: 4, comment: "Updated after a week of wear", media: [] }
  });
  check("Review API rejects media attachments", reviewWithMediaField.status === 400 && reviewWithMediaField.data.error === "Review media uploads are disabled");

  const sorted = await call("GET", `/api/products/${createdProductId}/reviews`, { cookie: sellerCookie });
  check("Verified reviews sort before unverified", sorted.data.reviews.length === 2 &&
    sorted.data.reviews[0].verified === 1 && sorted.data.reviews[1].verified === 0);

  const updated = updatedWithoutMedia;
  check("Second review updates the same one", updated.status === 200 && updated.data.count === 2 && updated.data.average === 2.5);

  const myReviews = await call("GET", "/api/my/reviews", { cookie: sellerCookie });
  const myReview = myReviews.data.reviews.find(r => r.product_id === createdProductId);
  check("My reviews lists it with product info", myReviews.status === 200 &&
    Boolean(myReview) && myReview.product_name === "Smoke Test Cardigan" && myReview.status === "visible");

  const adminReviews = await call("GET", "/api/admin/reviews", { cookie: adminCookie });
  const moderatedReview = adminReviews.data.reviews.find(r => r.product_id === createdProductId && r.user_email === SELLER_EMAIL);
  check("Admin review list includes it", adminReviews.status === 200 && Boolean(moderatedReview));
  const adminReviewsAsSeller = await call("GET", "/api/admin/reviews", { cookie: sellerCookie });
  check("Seller denied admin review list (403)", adminReviewsAsSeller.status === 403);

  const hidden = await call("PATCH", `/api/admin/reviews/${moderatedReview.id}`, { cookie: adminCookie, body: { status: "hidden" } });
  check("Admin can hide a review", hidden.status === 200 && hidden.data.status === "hidden");

  const afterHide = await call("GET", `/api/products/${createdProductId}/reviews`);
  check("Hidden review excluded from public list", afterHide.data.count === 1 &&
    afterHide.data.reviews.every(r => r.id !== moderatedReview.id));
  const ratedProductAfterHide = (await call("GET", "/api/products")).data.products.find(p => p.id === createdProductId);
  check("Hidden review excluded from rating aggregate", ratedProductAfterHide.review_count === 1);
  const myAfterHide = (await call("GET", "/api/my/reviews", { cookie: sellerCookie })).data.reviews.find(r => r.product_id === createdProductId);
  check("Owner still sees hidden status on own review", myAfterHide?.status === "hidden");

  const restored = await call("PATCH", `/api/admin/reviews/${moderatedReview.id}`, { cookie: adminCookie, body: { status: "visible" } });
  check("Admin can unhide a review", restored.status === 200 && restored.data.status === "visible");

  const badModeration = await call("PATCH", `/api/admin/reviews/${moderatedReview.id}`, { cookie: adminCookie, body: { status: "yelled-at" } });
  check("Invalid moderation status rejected (400)", badModeration.status === 400);

  const deletedReview = await call("DELETE", `/api/admin/reviews/${moderatedReview.id}`, { cookie: adminCookie });
  check("Admin can delete a review", deletedReview.status === 200);
  const unverifiedReview = adminReviews.data.reviews.find(r => r.product_id === createdProductId && r.user_email !== SELLER_EMAIL);
  await call("DELETE", `/api/admin/reviews/${unverifiedReview.id}`, { cookie: adminCookie });
  const afterDelete = await call("GET", `/api/products/${createdProductId}/reviews`);
  check("Deleted reviews gone from public list", afterDelete.data.count === 0);

  const ratedProduct = (await call("GET", "/api/products")).data.products.find(p => p.id === createdProductId);
  check("No reviews means seed rating shown", typeof ratedProduct.rating === "number" && ratedProduct.review_count === 0);

  const sizeChartListing = await call("POST", "/api/products", {
    cookie: sellerCookie,
    body: { ...listingBase, size_chart_url: "https://images.unsplash.com/photo-1584466977773-e625c37cdd50?auto=format&fit=crop&w=900&q=82" }
  });
  check("Size chart URL stored and exposed", sizeChartListing.status === 201 &&
    sizeChartListing.data.product?.size_chart_url?.includes("photo-1584466977773"));
  const sizeChartEditKept = await call("PATCH", `/api/admin/products/${sizeChartListing.data.product.id}`, {
    cookie: adminCookie, body: { name: listingBase.name, price: 1249, size_chart_url: "" }
  });
  check("Size chart can be removed on edit", sizeChartEditKept.status === 200 && !sizeChartEditKept.data.product?.size_chart_url);
}

console.log("Admin session (whitelisted email):");
{
  const adminCookie = mintSession(ADMIN_EMAIL, "admin");
  const session = await call("GET", "/api/session", { cookie: adminCookie });
  check("Whitelisted email resolves as admin", session.data.user?.role === "admin");

  const nonWhitelist = mintSession("not-whitelisted@example.com", "admin");
  const rejected = await call("GET", "/api/session", { cookie: nonWhitelist });
  check("Non-whitelisted email downgraded to seller", rejected.data.user?.role === "seller");

  const scope = await call("GET", "/api/products?scope=admin", { cookie: adminCookie });
  check("Admin scope lists all products", scope.status === 200 && scope.data.products.some(p => p.id === createdProductId));

  const taxSettings = await call("GET", "/api/admin/tax-settings", { cookie: adminCookie });
  const taxReport = await call("GET", "/api/admin/tax-compliance", { cookie: adminCookie });
  check("Admin GST & HSN workspace returns protected settings and sales data", taxSettings.status === 200 &&
    taxSettings.data.settings && taxReport.status === 200 && taxReport.data.settings &&
    Array.isArray(taxReport.data.products) && Array.isArray(taxReport.data.sales) &&
    taxReport.data.summary && typeof taxReport.data.summary.tax_amount === "number");

  const sendReview = await call("PATCH", `/api/admin/products/${createdProductId}`, { cookie: adminCookie, body: { status: "review" } });
  check("Admin sends live listing to review", sendReview.status === 200 && sendReview.data.product?.status === "review");

  const approve = await call("PATCH", `/api/admin/products/${createdProductId}`, { cookie: adminCookie, body: { status: "live" } });
  check("Admin approves listing back to live", approve.status === 200 && approve.data.product?.status === "live");

  const feature = await call("PATCH", `/api/admin/products/${createdProductId}`, { cookie: adminCookie, body: { featured: true } });
  check("Admin features product", feature.status === 200 && feature.data.product?.featured === true);

  const heroAdmin = await call("GET", "/api/admin/hero", { cookie: adminCookie });
  check("Admin lists hero slides", heroAdmin.status === 200 && heroAdmin.data.slides?.length >= 3);
  const heroInsights = await call("GET", "/api/admin/hero/insights", { cookie: adminCookie });
  check("Admin receives hero merchandising insights", heroInsights.status === 200 &&
    heroInsights.data.recommendations?.best_selling && heroInsights.data.recommendations?.new_arrivals &&
    heroInsights.data.recommendations?.top_rated && heroInsights.data.recommendations?.top_reviewed &&
    heroInsights.data.recommendations?.low_return_rate);
  const insightOrders = await call("GET", "/api/orders?scope=admin", { cookie: adminCookie });
  const insightLines = (insightOrders.data.orders || []).flatMap(order =>
    (order.items || []).filter(item => item.id === createdProductId).map(item => ({ order, item })));
  const expectedInsight = insightLines.reduce((summary, { order, item }) => {
    const quantity = Number(item.quantity || 0);
    const lineGross = Number(item.price || 0) * quantity;
    if (order.status !== "cancelled") {
      const allocatedDiscount = Number(order.subtotal) > 0
        ? Math.round(Number(order.discount || 0) * lineGross / Number(order.subtotal))
        : 0;
      summary.revenue += Math.max(0, lineGross - allocatedDiscount);
      summary.units += quantity;
      summary.activeOrders.add(order.id);
    }
    summary.orders.add(order.id);
    if (order.status === "cancelled") summary.cancelled.add(order.id);
    return summary;
  }, { revenue: 0, units: 0, activeOrders: new Set(), orders: new Set(), cancelled: new Set() });
  const createdInsight = heroInsights.data.products?.find(product => product.id === createdProductId);
  const expectedCancellationRate = expectedInsight.orders.size
    ? Math.round((expectedInsight.cancelled.size / expectedInsight.orders.size) * 1000) / 10
    : null;
  check("Hero insights allocate discounts and cancellation rates correctly",
    insightOrders.status === 200 && createdInsight?.revenue === expectedInsight.revenue &&
    createdInsight?.units === expectedInsight.units && createdInsight?.orders === expectedInsight.activeOrders.size &&
    createdInsight?.cancellation_rate === expectedCancellationRate,
    JSON.stringify({ expected: { revenue: expectedInsight.revenue, units: expectedInsight.units, orders: expectedInsight.activeOrders.size, cancellation_rate: expectedCancellationRate }, actual: createdInsight }));
  const createdHero = await call("POST", "/api/admin/hero", {
    cookie: adminCookie,
    body: {
      eyebrow: "Smoke test",
      title: "The test edit",
      tagline: "A temporary hero slide for the admin flow.",
      cta_label: "Shop Men",
      cta_category: "Men",
      product_ids: [createdProductId, "seed-ivory-linen-shirt"],
      words: ["TEST", "EDIT"],
      active: false
    }
  });
  check("Admin creates a draft hero slide", createdHero.status === 201 && createdHero.data.id);
  const createdHeroId = createdHero.data.id;
  const editedHero = await call("PATCH", `/api/admin/hero/${createdHeroId}`, {
    cookie: adminCookie,
    body: { title: "The edited test edit", active: true }
  });
  check("Admin edits and publishes a hero slide", editedHero.status === 200);
  const removedHero = await call("DELETE", `/api/admin/hero/${createdHeroId}`, { cookie: adminCookie });
  check("Admin deletes a hero slide", removedHero.status === 200);

  const originalStorefrontSettings = (await call("GET", "/api/admin/storefront-settings", { cookie: adminCookie })).data;
  const activeAnnouncementStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const futureAnnouncementStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const futureAnnouncementEnd = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const storefrontUpdate = await call("PUT", "/api/admin/storefront-settings", {
    cookie: adminCookie,
    body: {
      announcement: { visible: false, text: "Smoke test announcement", items: [
        { id: "smoke-active", text: "Active smoke announcement", starts_at: activeAnnouncementStart, ends_at: futureAnnouncementEnd },
        { id: "smoke-future", text: "Future smoke announcement", starts_at: futureAnnouncementStart, ends_at: futureAnnouncementEnd }
      ] },
      fulfillment: { warehouse_address: "Glamia Fulfilment Hub\n12 Smoke Lane\nMumbai 400001" },
      trust_strip: {
        visible: true,
        items: originalStorefrontSettings.trust_strip.items.map(item => ({
          ...item,
          visible: item.id !== "cod"
        }))
      }
    }
  });
  check("Admin updates announcement and hides one trust item", storefrontUpdate.status === 200 &&
    storefrontUpdate.data.announcement.visible === false &&
    storefrontUpdate.data.announcement.items?.length === 2 &&
    storefrontUpdate.data.trust_strip.items.find(item => item.id === "cod")?.visible === false &&
    storefrontUpdate.data.fulfillment.warehouse_address.includes("Glamia Fulfilment Hub"));
  const publicStorefrontUpdate = await call("GET", "/api/storefront-settings");
  check("Storefront settings update is public", publicStorefrontUpdate.data.announcement.visible === false &&
    publicStorefrontUpdate.data.announcement.items?.length === 1 &&
    publicStorefrontUpdate.data.announcement.items[0]?.text === "Active smoke announcement" &&
    publicStorefrontUpdate.data.trust_strip.items.filter(item => item.visible).length === 2 &&
    !publicStorefrontUpdate.data.fulfillment);
  const emptyVisibleAnnouncement = await call("PUT", "/api/admin/storefront-settings", {
    cookie: adminCookie,
    body: { announcement: { visible: true, text: "" } }
  });
  check("Announcement bar cannot be enabled without permanent text", emptyVisibleAnnouncement.status === 400);
  const codDisabled = await call("PUT", "/api/admin/storefront-settings", {
    cookie: adminCookie,
    body: { payments: { cod_enabled: false } }
  });
  const codBlockedGuest = await call("POST", "/api/orders", {
    body: { items: [{ id: "seed-midnight-satin-dress", quantity: 1, size: "M" }], payment_method: "cod", email: "cod-toggle-guest@example.com", address: {
      name: "COD Toggle Guest", phone: "+44 20 7946 0958", line1: "10 Test Street", city: "London", state: "", pin: "SW1A 2AA", country: "United Kingdom"
    } }
  });
  const codBlockedMember = await call("POST", "/api/orders", {
    cookie: sellerCookie,
    body: { items: [{ id: "seed-midnight-satin-dress", quantity: 1, size: "M" }], payment_method: "cod", address: {
      name: "COD Toggle Member", phone: "+44 20 7946 0958", line1: "10 Test Street", city: "London", state: "", pin: "SW1A 2AA", country: "United Kingdom"
    } }
  });
  check("Admin demo-checkout toggle blocks new guest and member demo orders", codDisabled.status === 200 &&
    codDisabled.data.payments?.cod_enabled === false && codBlockedGuest.status === 409 && codBlockedMember.status === 409);
  const codRestored = await call("PUT", "/api/admin/storefront-settings", {
    cookie: adminCookie,
    body: { payments: { cod_enabled: originalStorefrontSettings.payments?.cod_enabled !== false } }
  });
  check("Admin can restore COD availability", codRestored.status === 200 && codRestored.data.payments?.cod_enabled === (originalStorefrontSettings.payments?.cod_enabled !== false));
  await call("PUT", "/api/admin/storefront-settings", { cookie: adminCookie, body: originalStorefrontSettings });

  const emailEvents = await call("GET", "/api/admin/email-events", { cookie: adminCookie });
  check("Admin can inspect email delivery events", emailEvents.status === 200 && Array.isArray(emailEvents.data.events));
  const auditLog = await call("GET", "/api/admin/audit-log", { cookie: adminCookie });
  check("Admin actions are written to an audit log", auditLog.status === 200 && auditLog.data.entries?.some(entry => entry.action === "update_order_status"));
  const backup = await fetch(`${BASE}/api/admin/backup`, { headers: { cookie: adminCookie } });
  const backupBody = await backup.json().catch(() => ({}));
  check("Admin can download a JSON data backup", backup.status === 200 && /attachment/.test(backup.headers.get("content-disposition") || "") &&
    backupBody.tables?.orders && backupBody.tables?.order_items && backupBody.tables?.product_sizes && backupBody.tables?.reviews &&
    backupBody.tables?.storefront_settings && backupBody.tables?.admin_notifications && backupBody.tables?.page_views);
}

console.log("Cleanup:");
{
  const adminCookie = mintSession(ADMIN_EMAIL, "admin");
  const removed = await call("DELETE", `/api/products/${createdProductId}`, { cookie: adminCookie });
  check("Admin deletes test product", removed.status === 200);

  const sellerDelete = await call("DELETE", "/api/products/seed-ivory-linen-shirt", { cookie: sellerCookie });
  check("Seller cannot delete others' product (403)", sellerDelete.status === 403);

  const reset = await call("POST", "/api/admin/reset", { cookie: adminCookie });
  check("Admin resets demo catalog", reset.status === 200);
  const subcategoryCleanup = await call("DELETE", `/api/admin/subcategories/${encodeURIComponent("Women")}/${encodeURIComponent("Smoke Tops")}`, { cookie: adminCookie });
  check("Cleanup removes test subcategory", subcategoryCleanup.status === 200);
  const after = await call("GET", "/api/products");
  const adminAfter = await call("GET", "/api/products?scope=admin", { cookie: adminCookie });
  check("Catalog restored (6 seeds, 5 live)", after.data.products.length === 5 && adminAfter.data.products.length === 6,
    `public ${after.data.products?.length}, admin ${adminAfter.data.products?.length}`);

  const logout = await fetch(`${BASE}/api/logout`, { method: "POST", headers: { origin: BASE, "x-requested-with": "Glamia" } });
  const cookieHeader = logout.headers.get("set-cookie") || "";
  check("Logout clears session cookie", logout.status === 200 && /Max-Age=0/.test(cookieHeader));

  const tampered = await call("GET", "/api/session", {
    cookie: mintSession(ADMIN_EMAIL, "admin").slice(0, -4) + "AAAA"
  });
  check("Tampered session signature rejected", tampered.data.user === null);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILURES`);
  process.exitCode = 1;
}
