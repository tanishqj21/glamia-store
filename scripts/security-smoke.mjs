// Exercise current authorization and upload contracts against an isolated local Worker only.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8788";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Security fixtures must never run against production.");
const secret = process.env.SMOKE_SESSION_SECRET || "isolated-local-audit-not-a-production-secret";
let checks = 0;
const employeeIds = [];
const eventIds = [];
const admin = await fetch(`${base}/api/auth/demo-admin`, { redirect: "manual" });
assert.equal(admin.status, 302, "Enable demo admin only on the isolated local Worker");
const cookie = admin.headers.get("set-cookie").split(";")[0];
const suffix = randomUUID().slice(0, 8).toUpperCase();
const password = "Audit-only-" + randomUUID();
const auditIp = `198.18.${Number.parseInt(suffix.slice(0, 2), 16)}.${Number.parseInt(suffix.slice(2, 4), 16)}`;

async function call(path, { method = "GET", body, token, admin = false, headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: {
    "CF-Connecting-IP": auditIp,
    ...(admin ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(method !== "GET" ? { Origin: base, "Content-Type": "application/json", "X-Requested-With": "Glamia" } : {}), ...headers
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); checks++; console.log(`ok ${name}`); }
async function employee(label, permissions, extra = {}) {
  const result = await call("/api/admin/employees", { method: "POST", admin: true, body: { employee_id: `QA_${label}_${suffix}`, name: `Local audit ${label}`, position: "manager", ...(permissions === undefined ? {} : { permissions }), password, ...extra } });
  check(`Create ${label} employee: ${JSON.stringify(result.data.error || "")}`, result.status, 201);
  employeeIds.push(result.data.employee.id);
  return result.data.employee;
}
async function login(profile) {
  const result = await call("/api/employee/auth/login", { method: "POST", body: { employee_id: profile.employee_code, password } });
  check(`Sign in ${profile.name}`, result.status, 200);
  return result.data.token;
}

// Local-only signed sessions exercise the portal independently of Google's live login service.
function portalSession(email) {
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ email, name: "Local portal fixture", iat: now, exp: now + 3600 })).toString("base64url");
  return `mm_session=${claims}.${createHmac("sha256", secret).update(claims).digest("base64url")}`;
}

try {
  const topAdmin = await employee("TOPADMIN", undefined, { position: "admin", employee_email: `top-admin-${suffix.toLowerCase()}@example.com` });
  const topToken = await login(topAdmin);
  check("Owner-created admin defaults to every current capability", Object.values(topAdmin.permissions).every(Boolean) && Object.keys(topAdmin.permissions).length, 27);
  check("Non-whitelisted admin is a top employee, not an owner", topAdmin.access_level, "top_employee");
  const portalHeaders = { Cookie: portalSession(topAdmin.employee_email) };
  const portalUser = (await call("/api/session", { headers: portalHeaders })).data.user;
  check("Linked non-whitelisted Admin can access the website portal", portalUser.role, "admin");
  check("Website portal does not turn an Admin into an Owner", portalUser.is_owner, false);
  check("Website identity is tied to the employee account", portalUser.employee_id, topAdmin.id);
  check("Non-whitelisted Admin can open permitted Employees area", (await call("/api/admin/employees", { headers: portalHeaders })).status, 200);
  check("Website Admin cannot create another Admin", (await call("/api/admin/employees", { method: "POST", headers: portalHeaders, body: { employee_code: `QA_PORTALADMIN_${suffix}`, name: "Blocked portal admin", position: "admin", password } })).status, 403);
  check("Owner-only destructive reset is blocked from the portal", (await call("/api/admin/reset", { method: "POST", headers: portalHeaders, body: {} })).status, 403);
  check("Admin with Employees permission cannot create another admin", (await call("/api/employee/admin/employees", { method: "POST", token: topToken, body: { employee_code: `QA_BLOCKADMIN_${suffix}`, name: "Blocked admin", position: "admin", password } })).status, 403);
  check("Employee cannot claim an owner email", (await call("/api/employee/admin/employees", { method: "POST", token: topToken, body: { employee_code: `QA_BLOCKOWNER_${suffix}`, name: "Blocked owner", employee_email: "admin@example.com", position: "manager", permissions: {}, password } })).status, 403);
  const delegated = await call("/api/employee/admin/employees", { method: "POST", token: topToken, body: { employee_code: `QA_DELEGATED_${suffix}`, name: "Delegated staff", position: "packing_staff", password } });
  check("Top employee can create a lower-ranked staff account", delegated.status, 201);
  employeeIds.push(delegated.data.employee.id);
  check("Delegated accounts carry an employee-origin marker", delegated.data.employee.creation_origin, "employee");
  check("Creator employee is retained", delegated.data.employee.created_by_employee_id, topAdmin.id);
  check("Employee cannot demote an admin to take it over", (await call(`/api/employee/admin/employees/${topAdmin.id}`, { method: "PATCH", token: topToken, body: { position: "packing_staff", permissions: {} } })).status, 403);
  const owner = await employee("OWNER", undefined, { position: "admin", employee_email: "admin@example.com" });
  const ownerToken = await login(owner);
  check("Owner-approved whitelisted employee is recognized as an Owner", owner.is_owner, true);
  check("Top employee cannot reset an Owner's password", (await call(`/api/employee/admin/employees/${owner.id}`, { method: "PATCH", token: topToken, body: { password: "blocked-password" } })).status, 403);
  check("Owner app lists Admin among assignable positions", (await call("/api/employee/admin/employees", { token: ownerToken })).data.management.can_create_admin, true);
  const promoted = await call(`/api/employee/admin/employees/${delegated.data.employee.id}`, { method: "PATCH", token: ownerToken, body: { position: "admin" } });
  check("Owner can promote a staff account to Admin", promoted.status, 200);
  check("Admin promotion defaults to full permissions when no override is supplied", Object.values(promoted.data.employee.permissions).every(Boolean), true);
  check("Promotion preserves the original employee-created sign", promoted.data.employee.creation_origin, "employee");
  const manager = await employee("MANAGER", { employees: true, inventory: true, bulk_listing: true });
  const packer = await employee("PACKER", { packing: true });
  const packerToken = await login(packer);
  check("Packer can load packing queue", (await call("/api/employee/orders", { token: packerToken })).status, 200);
  check("Packer cannot load admin orders", (await call("/api/employee/admin/orders", { token: packerToken })).status, 403);
  const orderManager = await employee("ORDERADMIN", { orders: true });
  const orderManagerToken = await login(orderManager);
  check("Order manager can load admin orders", (await call("/api/employee/admin/orders", { token: orderManagerToken })).status, 200);
  check("Orders access alone cannot use packing", (await call("/api/employee/orders", { token: orderManagerToken })).status, 403);
  const privileged = await employee("PRIVILEGED", { employees: true, inventory: true, bulk_listing: true, products: true });
  const managerToken = await login(manager);
  const managerPath = `/api/employee/admin/employees/${privileged.id}`;
  check("Employee cannot reset a more privileged colleague's password", (await call(managerPath, { method: "PATCH", token: managerToken, body: { password: "forbidden-password" } })).status, 403);
  check("Employee cannot delete a more privileged colleague", (await call(managerPath, { method: "DELETE", token: managerToken })).status, 403);
  check("Employee cannot grant new privileges to self", (await call(`/api/employee/admin/employees/${manager.id}`, { method: "PATCH", token: managerToken, body: { permissions: { products: true } } })).status, 403);
  check("Employee cannot create a privileged account", (await call("/api/employee/admin/employees", { method: "POST", token: managerToken, body: { employee_id: `QA_DENIED_${suffix}`, name: "Must not be created", position: "store_manager", password, permissions: { products: true } } })).status, 403);
  check("Granted inventory reads succeed", (await call("/api/employee/admin/products", { token: managerToken })).status, 200);
  check("Inventory permission cannot modify product prices", (await call("/api/employee/admin/products/seed-ivory-linen-shirt", { method: "PATCH", token: managerToken, body: { price: 1 } })).status, 403);
  const listingEditor = await employee("LISTING", { products: true });
  const listingToken = await login(listingEditor);
  check("Listing access without inventory cannot change stock", (await call("/api/employee/admin/products/seed-ivory-linen-shirt", { method: "PATCH", token: listingToken, body: { stock: 1 } })).status, 403);
  check("Legacy mobile listing route also blocks stock changes", (await call("/api/employee/products/seed-ivory-linen-shirt", { method: "PATCH", token: listingToken, body: { stock: 1 } })).status, 403);
  check("Listing access without deals cannot change deal price", (await call("/api/employee/admin/products/seed-ivory-linen-shirt", { method: "PATCH", token: listingToken, body: { deal_price: 1 } })).status, 403);
  check("Listing access without tax cannot change GST", (await call("/api/employee/admin/products/seed-ivory-linen-shirt", { method: "PATCH", token: listingToken, body: { gst_rate: 1 } })).status, 403);
  const storefrontEditor = await employee("STOREFRONT", { storefront: true });
  const storefrontToken = await login(storefrontEditor);
  const beforeStorefront = await call("/api/employee/admin/storefront-settings", { token: storefrontToken });
  check("Storefront access can load its settings", beforeStorefront.status, 200);
  check("Storefront save succeeds without reel permission", (await call("/api/employee/admin/storefront-settings", { method: "PUT", token: storefrontToken, body: { cinematic_reel: { enabled: !beforeStorefront.data.cinematic_reel?.enabled } } })).status, 200);
  const afterStorefront = await call("/api/employee/admin/storefront-settings", { token: storefrontToken });
  check("Storefront permission cannot change the cinematic reel", afterStorefront.data.cinematic_reel, beforeStorefront.data.cinematic_reel);
  const eventEditor = await employee("EVENTS", { events: true });
  const eventToken = await login(eventEditor);
  const createdEvent = await call("/api/employee/admin/events", { method: "POST", token: eventToken, body: { name: `Local audit ${suffix}`, type: "sale", status: "draft", theme: "spotlight", headline: "Local audit offer", message: "Temporary campaign used for employee API checks.", cta_href: "/offers" } });
  check("Employee can create a multicolour event", createdEvent.status, 201);
  eventIds.push(createdEvent.data.event.id);
  const eventPath = `/api/employee/admin/events/${createdEvent.data.event.id}`;
  check("Employee can publish an event", (await call(eventPath, { method: "PATCH", token: eventToken, body: { status: "published" } })).status, 200);
  check("Published employee event appears in the editor", (await call("/api/employee/admin/events", { token: eventToken })).data.events.some((event) => event.id === createdEvent.data.event.id && event.status === "published"), true);
  check("Event access does not grant storefront settings", (await call("/api/employee/admin/storefront-settings", { token: eventToken })).status, 403);
  check("Website admin can revoke bulk listing and inventory", (await call(`/api/admin/employees/${manager.id}`, { method: "PATCH", admin: true, body: { permissions: { employees: true } } })).status, 200);
  const refreshed = await call("/api/employee/session", { token: managerToken });
  check("Existing session immediately sees revoked inventory permission", refreshed.data.employee.permissions.inventory, false);
  check("Revoked inventory is blocked without logging out", (await call("/api/employee/admin/products", { token: managerToken })).status, 403);
  check("Revoked bulk listing is blocked without logging out", (await call("/api/employee/admin/bulk-products", { method: "POST", token: managerToken, body: { products: [] } })).status, 403);
  check("Deactivating employee succeeds", (await call(`/api/admin/employees/${manager.id}`, { method: "PATCH", admin: true, body: { active: false } })).status, 200);
  check("Deactivation invalidates existing session", (await call("/api/employee/session", { token: managerToken })).status, 401);

  const guessed = await employee("LOCK", {});
  const attempts = await Promise.all(Array.from({ length: 5 }, () => call("/api/employee/auth/login", { method: "POST", body: { employee_id: guessed.employee_code, password: "incorrect-password" } })));
  check("Concurrent bad passwords are rejected", attempts.every(result => [401, 429].includes(result.status)), true);
  check("Concurrent failures lock the employee account", (await call("/api/employee/auth/login", { method: "POST", body: { employee_id: guessed.employee_code, password } })).status, 429);

  const products = await call("/api/products?scope=public&limit=3");
  check("Public catalog is available", products.status, 200);
  check("Public catalog hides internal fields", products.data.products.every(product => !["seller_email", "cost_price", "reorder_point", "image_keys", "thumbnail_keys"].some(key => key in product)), true);
  const product = products.data.products[0];
  assert.ok(product);
  const detail = await call(`/api/products/${product.id}`);
  check("Public product details hide cost price", "cost_price" in detail.data.product, false);
  check("Admin product details retain cost price", "cost_price" in (await call(`/api/products/${product.id}`, { admin: true })).data.product, true);
  const ids = [product.id, ...Array.from({ length: 99 }, (_, index) => `nonexistent-${index}`)].join(",");
  check("100 product IDs plus filters stay inside D1 query limits", (await call(`/api/products?ids=${encodeURIComponent(ids)}&category=${encodeURIComponent(product.category)}&min_price=0&limit=10`)).status, 200);

  check("Mobile marker does not authorize cross-origin browser mutations", (await call("/api/profile", { method: "PUT", admin: true, body: {}, headers: { Origin: "https://evil.example", "X-Glamia-Mobile": "1" } })).status, 403);
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ email: "admin@example.com", iat: now })).toString("base64url");
  const malformed = `${claims}.${createHmac("sha256", secret).update(claims).digest("base64url")}`;
  check("Signed session missing expiry is rejected", (await call("/api/admin/employees", { headers: { Cookie: `mm_session=${malformed}` } })).status, 401);
  check("Oversized JSON is rejected before parsing", (await call("/api/profile", { method: "PUT", admin: true, body: { name: "x".repeat(1024 * 1024 + 1) } })).status, 413);
  const form = new FormData();
  form.set("file", new Blob(["not an actual PNG"], { type: "image/png" }), "fake.png");
  const upload = await fetch(`${base}/api/uploads/image`, { method: "POST", headers: { Cookie: cookie, Origin: base }, body: form });
  check("A declared image MIME type cannot bypass file signature validation", upload.status, 400);
  check("Fake Razorpay confirmation cannot create a paid order", (await call("/api/payments/razorpay/verify", { method: "POST", admin: true, body: { order_id: "nonexistent", razorpay_signature: "forged" } })).status, 404);
  check("Owner can revoke portal capabilities", (await call(`/api/admin/employees/${topAdmin.id}`, { method: "PATCH", admin: true, body: { permissions: { employees: true } } })).status, 200);
  check("Existing portal session immediately loses inventory reads", (await call("/api/products?scope=admin", { headers: portalHeaders })).status, 403);
  check("Existing portal session immediately loses notifications", (await call("/api/admin/notifications", { headers: portalHeaders })).status, 403);
  check("Allowed Employees area still works after other permissions are revoked", (await call("/api/admin/employees", { headers: portalHeaders })).status, 200);
  check("Owner can deactivate a portal Admin", (await call(`/api/admin/employees/${topAdmin.id}`, { method: "PATCH", admin: true, body: { active: false } })).status, 200);
  check("Deactivated Admin loses website portal access with the same cookie", (await call("/api/admin/employees", { headers: portalHeaders })).status, 403);
  console.log(`\n${checks} security integration checks passed.`);
} finally {
  // Remove only the exact fixture IDs created by this run, preserving all other local data.
  for (const id of eventIds) assert.equal((await call(`/api/admin/events/${id}`, { method: "DELETE", admin: true })).status, 200);
  for (const id of employeeIds) assert.equal((await call(`/api/admin/employees/${id}`, { method: "DELETE", admin: true })).status, 200);
}
