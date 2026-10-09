// Run security and request-cache regressions without network access or production data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";
import { publicProductView, canDelegatePermissions, canManageEmployee, validSessionClaims, readBoundedBody } from "../src/security.js";

const response = (data = {}, status = 200) => new Response(JSON.stringify(data), { status });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("only owners can create or manage admins, even when employees have every permission", () => {
  const actor = { employee_id: "manager", employee_position: "admin", employee_permissions: { employees: true, products: true } };
  assert.equal(canManageEmployee(actor, null, { products: true }, "admin"), false);
  assert.equal(canManageEmployee(actor, { position: "admin", permissions: {} }, {}, "packing_staff"), false);
  assert.equal(canManageEmployee(actor, { position: "manager", is_owner: true, permissions: {} }), false);
  assert.equal(canManageEmployee({ is_owner: true }, null, {}, "admin"), true);
  assert.equal(canManageEmployee(actor, null, { products: true }, "manager"), true);
  assert.equal(canManageEmployee(actor, null, { inventory: true }, "manager"), false);
  assert.equal(canManageEmployee({ ...actor, employee_position: "packing_staff" }, null, {}, "manager"), false);
  assert.equal(canManageEmployee({ role: "admin" }, null, {}, "admin"), false, "A role label alone is not owner authority");
});

// Load the real client modules with minimal native/browser adapters, not copies of their logic.
async function loadModule(path, overrides = {}, extraExports = "") {
  const context = createContext({ URL, URLSearchParams, Request, Response, Headers, FormData, AbortController, TextEncoder, TextDecoder, Uint8Array, Set, Map, Date, console, atob, btoa, crypto: globalThis.crypto, setTimeout, clearTimeout, process: { env: {} }, __DEV__: false, ...overrides });
  const modules = new Map();
  async function moduleAt(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const source = await readFile(url, "utf8");
    const module = new SourceTextModule(source + (url.href.endsWith(path) ? extraExports : ""), { context, identifier: url.href });
    modules.set(url.href, module);
    await module.link(async (specifier) => {
      const adapter = specifier === "expo-secure-store" ? overrides.storage : specifier === "react-native" ? { Platform: { OS: overrides.platform || "android" } } : !specifier.startsWith(".") ? await import(specifier) : null;
      if (adapter) return new SyntheticModule(Object.keys(adapter), function () { for (const [key, value] of Object.entries(adapter)) this.setExport(key, value); }, { context });
      return moduleAt(new URL(specifier, url));
    });
    return module;
  }
  const module = await moduleAt(new URL(`../${path}`, import.meta.url));
  await module.evaluate();
  return module.namespace;
}

function nativeStorage(entries = {}) {
  const saved = new Map(Object.entries(entries));
  let reads = 0;
  return { saved, get reads() { return reads; }, adapter: {
    getItemAsync: async key => { reads++; return saved.get(key) ?? null; },
    setItemAsync: async (key, value) => { saved.set(key, value); },
    deleteItemAsync: async key => { saved.delete(key); }
  } };
}

test("employee browser preview never persists credentials outside page memory", async () => {
  const storage = nativeStorage();
  const preview = await loadModule("glamia-packer-app/src/secureStorage.js", { storage: storage.adapter, platform: "web" });
  await preview.setItemAsync("token", "preview-token");
  assert.equal(await preview.getItemAsync("token"), "preview-token");
  assert.equal(storage.saved.size, 0);
  await preview.deleteItemAsync("token");
  assert.equal(await preview.getItemAsync("token"), null);
  const freshPage = await loadModule("glamia-packer-app/src/secureStorage.js", { storage: storage.adapter, platform: "web" });
  assert.equal(await freshPage.getItemAsync("token"), null);
});

test("employee website navigation denies unknown areas and honors revoked capabilities", async () => {
  const { canUseAdminArea, adminLandingPath } = await loadModule("react-app/src/lib/workspaceAccess.js");
  const employee = { role: "admin", employee_id: "staff", is_owner: false, employee_permissions: { employees: true } };
  assert.equal(canUseAdminArea(employee, "/admin/employees"), true);
  assert.equal(canUseAdminArea(employee, "/admin/events"), false);
  assert.equal(canUseAdminArea(employee, "/admin/unknown"), false);
  assert.equal(canUseAdminArea({ ...employee, employee_permissions: {} }, "/admin/employees"), false);
  assert.equal(canUseAdminArea({ role: "admin", is_owner: true }, "/admin/employees"), true);
  assert.equal(canUseAdminArea({ role: "seller" }, "/admin/employees"), false);
  assert.equal(adminLandingPath(employee), "/admin/employees");
  assert.equal(adminLandingPath({ role: "seller" }), "/");
});

test("employee contact email cannot confer Owner authority without owner approval", async () => {
  const { employeeIsOwner } = await loadModule("src/index.js", {}, "\nexport { employeeIsOwner };\n");
  const env = { ADMIN_EMAILS: ["owner@example.com"] };
  assert.equal(employeeIsOwner({ position: "admin", employee_email: "owner@example.com", owner_approved: 0 }, env), false);
  assert.equal(employeeIsOwner({ position: "admin", employee_email: "owner@example.com", owner_approved: 1 }, env), true);
  assert.equal(employeeIsOwner({ position: "admin", employee_email: "staff@example.com", owner_approved: 1 }, env), false);
  assert.equal(employeeIsOwner({ position: "packing_staff", employee_email: "owner@example.com", owner_approved: 1 }, env), false);
});

test("public products omit internal commercial and storage fields without mutating admin data", () => {
  const original = { id: "p1", name: "Dress", price: 500, stock: 2, seller_email: "private@example.com", cost_price: 100, reorder_point: 10, image_key: "private", image_keys: [], thumbnail_key: "private", thumbnail_keys: [] };
  assert.deepEqual(publicProductView(original), { id: "p1", name: "Dress", price: 500, stock: 2 });
  assert.equal(original.cost_price, 100);
  assert.deepEqual(publicProductView({ variants: [{ name: "Blue", image_keys: ["private"], cost_price: 12 }] }), { variants: [{ name: "Blue" }] });
});

test("delegation cannot create privileges absent from the managing employee", () => {
  assert.equal(canDelegatePermissions({ inventory: true }, { inventory: true, products: false }), true);
  assert.equal(canDelegatePermissions({ inventory: true }, { employees: true }), false);
  assert.equal(canDelegatePermissions({ employees: true }, { inventory: true }), false);
});

test("production sessions require bounded expiry and a revocable session version", () => {
  const valid = { email: "user@example.com", iat: 1000, exp: 2000, sv: 0 };
  assert.equal(validSessionClaims(valid, 3600, false, 1500), true);
  for (const patch of [{ exp: undefined }, { sv: undefined }, { sv: "0" }, { exp: 9999 }, { iat: 9999 }, { exp: 1500 }, { nbf: 9999 }, { email: null }]) assert.equal(validSessionClaims({ ...valid, ...patch }, 3600, false, 1500), false);
  assert.equal(validSessionClaims({ ...valid, sv: undefined }, 3600, true, 1500), true);
});

test("body limits cover declared sizes and chunked bodies with no length header", async () => {
  assert.equal(new TextDecoder().decode(await readBoundedBody(new Request("https://test", { method: "POST", body: "1234" }), 4)), "1234");
  await assert.rejects(readBoundedBody(new Request("https://test", { method: "POST", body: "12345" }), 4), { status: 413 });
  await assert.rejects(readBoundedBody(new Request("https://test", { method: "POST", headers: { "Content-Length": "999" }, body: "a" }), 4), { status: 413 });
});

const browser = { location: { origin: "https://glamiastore.com", pathname: "/" }, dispatchEvent() {} };
test("website concurrent readers each receive an independently readable body", async () => {
  let calls = 0;
  const api = await loadModule("react-app/src/lib/api.js", { window: browser, fetch: async () => { calls++; return response({ products: [1] }); } });
  const results = await Promise.all(Array.from({ length: 5 }, () => api.apiFetch("/api/products?cache=1", { cacheTtl: 1000, dedupe: true }).then(value => value.json())));
  assert.equal(calls, 1);
  assert.equal(results.length, 5);
  assert.deepEqual(await (await api.apiFetch("/api/products?cache=1", { cacheTtl: 1000 })).json(), { products: [1] });
  assert.equal(calls, 1);
});

test("website cache separates authorization headers and abortable calls", async () => {
  const requests = [];
  const api = await loadModule("react-app/src/lib/api.js", { window: browser, fetch: async (_url, options) => { requests.push(options); return response(); } });
  await Promise.all(["one", "two"].map(token => api.apiFetch("/api/session", { dedupe: true, headers: { Authorization: token } })));
  await Promise.all([1, 2].map(() => api.apiFetch("/api/session", { dedupe: true, signal: new AbortController().signal })));
  await api.apiFetch("/api/products?scope=public");
  await api.apiFetch("/api/products?scope=admin");
  assert.equal(requests.length, 6);
  assert.equal(requests[4].credentials, "omit");
  assert.equal(requests[5].credentials, "same-origin");
});

test("website reads begun before a mutation cannot repopulate its cache", async () => {
  const first = deferred();
  let reads = 0;
  const api = await loadModule("react-app/src/lib/api.js", { window: browser, fetch: (_url, options) => options.method === "POST" ? Promise.resolve(response()) : ++reads === 1 ? first.promise : Promise.resolve(response({ fresh: true })) });
  const pending = api.apiFetch("/api/products", { cacheTtl: 1000 });
  await api.apiFetch("/api/products", { method: "POST", body: "{}" });
  first.resolve(response({ stale: true }));
  await pending;
  assert.deepEqual(await (await api.apiFetch("/api/products", { cacheTtl: 1000 })).json(), { fresh: true });
  assert.equal(reads, 2);
});

test("consumer public reads omit credentials, deduplicate, and reuse only public results", async () => {
  const storage = nativeStorage({ glamia_store_session: "token" });
  const requests = [];
  const api = await loadModule("glamia-shoppers-app/src/api.js", { storage: storage.adapter, fetch: async (_url, options) => { requests.push(options); return response({ ok: true }); } });
  await Promise.all([api.mobileFetch("/api/products?scope=public"), api.mobileFetch("/api/products?scope=public")]);
  await api.mobileFetch("/api/products?scope=public");
  assert.equal(requests.length, 1);
  assert.equal(storage.reads, 0);
  assert.equal(requests[0].headers.Authorization, undefined);
  await Promise.all([api.getOrders(), api.getOrders()]);
  await api.getOrders();
  assert.equal(requests.length, 3);
  assert.equal(storage.reads, 2);
  assert.equal(requests[1].headers.Authorization, "Bearer token");
});

test("consumer stale unauthorized response cannot clear a newly signed-in account", async () => {
  const storage = nativeStorage({ glamia_store_session: "old" });
  const pending = deferred();
  const api = await loadModule("glamia-shoppers-app/src/api.js", { storage: storage.adapter, fetch: () => pending.promise });
  const oldRequest = api.getOrders();
  await new Promise(resolve => setTimeout(resolve, 0));
  await api.saveSession({ session_token: "new", user: { email: "new@example.com" } });
  pending.resolve(response({ error: "Expired" }, 401));
  await assert.rejects(oldRequest, { status: 401 });
  assert.equal((await api.storedSession()).token, "new");
});

test("both mobile clients reject insecure production API endpoints", async () => {
  for (const path of ["glamia-shoppers-app/src/api.js", "glamia-packer-app/src/api.js"]) {
    const api = await loadModule(path, { storage: nativeStorage().adapter, process: { env: { EXPO_PUBLIC_API_URL: "http://glamiastore.com" } }, fetch: () => assert.fail("network must not be reached") });
    await assert.rejects(path.includes("shoppers") ? api.getOrders() : api.employeeSession(), /secure HTTPS/);
  }
});

test("employee session deduplicates concurrent reads but rechecks permissions on subsequent reads", async () => {
  const storage = nativeStorage({ glamia_employee_token: "token", glamia_employee_profile: "{}" });
  let calls = 0;
  const api = await loadModule("glamia-packer-app/src/api.js", { storage: storage.adapter, fetch: async () => { calls++; return response({ employee: { permissions: { inventory: calls === 1 } } }); } });
  await Promise.all([api.employeeSession(), api.employeeSession(), api.employeeSession()]);
  assert.equal(calls, 1);
  assert.equal((await api.employeeSession()).employee.permissions.inventory, false);
  assert.equal(calls, 2);
  assert.equal(storage.reads, 2);
});

for (const app of ["glamia-shoppers-app", "glamia-packer-app"]) {
  test(`${app} bounds stalled requests and JSON bodies without retrying writes`, async () => {
    let calls = 0;
    const neverRespond = (_url, { signal }) => new Promise((_, reject) => {
      calls++;
      signal.addEventListener("abort", () => reject(new Error("Aborted transport")), { once: true });
    });
    const network = await loadModule(`${app}/src/network.js`, { fetch: neverRespond });
    await assert.rejects(network.requestWithDeadline("https://glamiastore.com/api/local-fixture", { method: "POST" }, undefined, 10), { code: "NETWORK_TIMEOUT" });
    assert.equal(calls, 1, "No automatic retry of an ambiguous write");
    const slowBody = await loadModule(`${app}/src/network.js`, { fetch: async (_url, { signal }) => ({ json: () => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("Body aborted")), { once: true })) }) });
    await assert.rejects(slowBody.requestWithDeadline("https://glamiastore.com/api/local-fixture", {}, value => value.json(), 10), { code: "NETWORK_TIMEOUT" });
  });

  test(`${app} preserves caller cancellation and removes completed deadlines`, async () => {
    let cleared = 0;
    const controller = new AbortController();
    const network = await loadModule(`${app}/src/network.js`, {
      clearTimeout: id => { cleared++; clearTimeout(id); },
      fetch: (_url, { signal }) => new Promise((resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })
    });
    const cancelled = network.requestWithDeadline("https://glamiastore.com/api/local-fixture", { signal: controller.signal });
    const error = new Error("Caller closed screen"); controller.abort(error);
    await assert.rejects(cancelled, /Caller closed screen/);
    assert.equal(cleared, 1);
    await assert.rejects(network.requestWithDeadline("https://glamiastore.com/api/local-fixture", { signal: controller.signal }), /Caller closed screen/);
    assert.equal(cleared, 2);
  });

  test(`${app} logout erases local credentials before stalled remote revocation`, async () => {
    const shopper = app.includes("shoppers");
    const tokenKey = shopper ? "glamia_store_session" : "glamia_employee_token";
    const profileKey = shopper ? "glamia_store_user" : "glamia_employee_profile";
    const storage = nativeStorage({ [tokenKey]: "old-token", [profileKey]: "{}", ...(shopper ? {} : { glamia_employee_push_token: "old-push" }) });
    const remote = deferred();
    const api = await loadModule(`${app}/src/api.js`, { storage: storage.adapter, fetch: () => {
      assert.equal(storage.saved.has(tokenKey), false);
      assert.equal(storage.saved.has(profileKey), false);
      return remote.promise;
    } });
    const logout = shopper ? api.signOut() : api.employeeLogout();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(storage.saved.has(tokenKey), false);
    assert.equal(await (shopper ? api.storedSession() : api.storedEmployee()), null);
    remote.resolve(response({ error: "Already expired" }, 401));
    await logout;
  });

  test(`${app} rejects malformed successful responses instead of reporting empty success`, async () => {
    const shopper = app.includes("shoppers");
    const storage = nativeStorage({ [shopper ? "glamia_store_session" : "glamia_employee_token"]: "token" });
    const api = await loadModule(`${app}/src/api.js`, { storage: storage.adapter, fetch: async () => new Response("<html>Gateway error</html>", { status: 200 }) });
    await assert.rejects(shopper ? api.getOrders() : api.employeeSession(), /unreadable response/);
  });
}

const worker = await loadModule("src/index.js", {}, "\nexport { assertSameOrigin, employeePermissionsObject, withSizeStock, invalidateProductEnrichment, scheduleProductVectorUpdate, listHeroSlides, enforceRateLimit, reserveUploadQuota, uploadImage };\n");
test("mobile marker cannot bypass browser cookie CSRF checks", () => {
  const url = new URL("https://glamiastore.com/api/profile");
  assert.throws(() => worker.assertSameOrigin(new Request(url, { method: "PUT", headers: { "X-Glamia-Mobile": "1", Cookie: "mm_session=test", Origin: "https://evil.example" } }), url), { status: 403 });
  assert.doesNotThrow(() => worker.assertSameOrigin(new Request(url, { method: "PUT", headers: { "X-Glamia-Mobile": "1", Authorization: "Bearer token" } }), url));
});

test("explicit partial employee permissions never inherit position defaults", () => {
  const result = worker.employeePermissionsObject({ inventory: true }, "store_manager");
  assert.equal(result.inventory, true);
  assert.equal(result.products, false);
  assert.equal(result.employees, false);
});

test("large product enrichment stays below D1 binding limits and reuses its warm cache", async () => {
  worker.invalidateProductEnrichment();
  const bindings = [];
  let batches = 0;
  const env = { DB: { prepare: () => ({ bind: (...values) => { bindings.push(values.length); return {}; } }), batch: async () => { batches++; return [{ results: [] }, { results: [] }]; } } };
  const rows = Array.from({ length: 205 }, (_, index) => ({ id: `p${index}` }));
  const result = await worker.withSizeStock(env, rows, row => row);
  assert.equal(result.length, 205);
  assert.equal(batches, 3);
  assert.ok(bindings.every(count => count <= 80));
  await worker.withSizeStock(env, rows, row => row);
  assert.equal(batches, 3);
});

test("enrichment remains valid when a stock write invalidates cache during its query", async () => {
  worker.invalidateProductEnrichment();
  const env = { DB: { prepare: () => ({ bind: () => ({}) }), batch: async () => { worker.invalidateProductEnrichment(); return [{ results: [{ product_id: "p", size: "M", stock: 3 }] }, { results: [] }]; } } };
  assert.equal((await worker.withSizeStock(env, [{ id: "p" }], row => row))[0].size_stock.M, 3);
});

test("incremental search indexing upserts live variants and removes unpublished IDs", async () => {
  const deleted = [], indexed = [], ids = [], work = [];
  const env = { DB: { prepare: () => ({ bind: (...values) => { ids.push(values); return { all: async () => ({ results: [{ id: "one", status: "live", name: "Dress" }, { id: "two", status: "hold" }] }) }; } }) }, AI: { run: async (_model, { text }) => ({ data: text.map(() => [0.1]) }) }, VEC: { deleteByIds: async values => deleted.push(...values), upsert: async values => indexed.push(...values) } };
  worker.scheduleProductVectorUpdate(env, { waitUntil: promise => work.push(promise) }, "one", "group");
  await Promise.all(work);
  assert.equal(ids[0][0], "one");
  assert.deepEqual(deleted, ["two"]);
  assert.deepEqual(indexed.map(value => value.id), ["one"]);
});

test("hero loads only linked live products and never scans the entire catalog", async () => {
  const queries = [], bindings = [];
  const env = { DB: { prepare: sql => {
    queries.push(sql);
    return { bind: (...ids) => { bindings.push(...ids); return { all: async () => ({ results: sql.includes('FROM hero_slides') ? [{ id: "slide", product_ids_json: '["p1", "p2"]', active: 1 }] : [{ id: "p1", name: "Dress", image_url: "/image.png", color: "Blue" }] }) }; } };
  } } };
  const data = await (await worker.listHeroSlides(env)).json();
  assert.equal(queries.length, 2);
  assert.match(queries[1], /status = 'live' AND id IN/);
  assert.deepEqual(bindings, ["glamia", "p1", "p2", "glamia"]);
  assert.equal(data.slides[0].frames[0].image, "/image.png");
});

test("production rate limiting fails closed when shared storage is unavailable", async () => {
  const url = new URL("https://glamiastore.com/api/search");
  const env = { DB: { prepare() { throw new Error("Database unavailable"); } } };
  await assert.rejects(worker.enforceRateLimit(new Request(url), url, env, {}), { status: 503 });
});

test("exhausted upload quotas refuse a write", async () => {
  const env = { DB: { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 0 } }) }) }) } };
  await assert.rejects(worker.reserveUploadQuota(env, "user@example.com", 1024), { status: 429 });
});

test("ordinary image uploads cannot bypass the quota with a caller-controlled kind", async () => {
  let reserved = 0;
  const env = {
    DB: { prepare: () => ({ bind: () => ({ run: async () => { reserved++; return { meta: { changes: 0 } }; } }) }) },
    PRODUCT_IMAGES: { put: () => assert.fail("An exhausted quota must never reach R2") }
  };
  for (const kind of ["", "product", "product-thumbnail", "hero"]) {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "image.png");
    await assert.rejects(worker.uploadImage(new Request("https://glamiastore.com/api/uploads/image", { method: "POST", body }), env, { email: "user@example.com" }), { status: 429 });
  }
  assert.equal(reserved, 4);
});
