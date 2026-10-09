const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_CACHE = new Map();
const IN_FLIGHT_READS = new Map();
let cacheGeneration = 0;

function requestKey(input) {
  return typeof input === "string" ? input : input?.url || String(input);
}

function clearReadCache() {
  READ_CACHE.clear();
  IN_FLIGHT_READS.clear();
  cacheGeneration += 1;
}

function isAdminRequest(input) {
  const raw = typeof input === "string" ? input : input?.url || "";
  try {
    const url = new URL(raw, window.location.origin);
    return url.pathname.startsWith("/api/admin") || url.searchParams.get("scope") === "admin";
  } catch {
    return false;
  }
}

function notifyAdminAuthFailure(input, response) {
  if (response.status === 401 || response.status === 403) clearReadCache();
  if (isAdminRequest(input) && (response.status === 401 || response.status === 403)) {
    window.dispatchEvent(new CustomEvent("glamia-admin-auth-failed"));
  }
  return response;
}

function adminMutationMessage(input, method) {
  const raw = typeof input === "string" ? input : input?.url || "";
  let pathname = raw;
  try { pathname = new URL(raw, window.location.origin).pathname; } catch { /* keep the raw path */ }
  if (method === "DELETE") return "Deleted successfully.";
  if (pathname.includes("/uploads/")) return "Upload saved successfully.";
  if (pathname === "/api/products" && method === "POST") return "Listing saved successfully.";
  if (pathname.includes("/orders")) return "Order changes saved.";
  return "Changes saved successfully.";
}

function notifyAdminMutationSuccess(input, method, response) {
  if (!MUTATING_METHODS.has(method) || !response.ok) return response;
  // Drop reads that raced with a write so the next screen sees the committed state.
  clearReadCache();
  if (!window.location.pathname.startsWith("/admin")) return response;
  window.dispatchEvent(new CustomEvent("glamia-admin-save-success", {
    detail: { message: adminMutationMessage(input, method) }
  }));
  const pathname = new URL(requestKey(input), window.location.origin).pathname;
  if (/^\/api\/admin\/(storefront-settings|cinematic-reel|hero(?:\/|$)|events(?:\/|$))/.test(pathname)) {
    window.dispatchEvent(new CustomEvent("glamia-storefront-updated", {
      detail: { hero: /^\/api\/admin\/hero(?:\/|$)/.test(pathname) }
    }));
  }
  return response;
}

/**
 * Shared client request helper for the React surface.
 * Keeping credentials and the Worker mutation marker in one place prevents
 * individual screens from drifting into subtly different request behavior.
 */
export function apiFetch(input, init = {}) {
  const { cacheTtl = 0, dedupe = false, ...requestInit } = init;
  const headers = new Headers(init.headers || {});
  const method = String(requestInit.method || "GET").toUpperCase();

  headers.set("Accept", "application/json");
  if (MUTATING_METHODS.has(method)) {
    headers.set("X-Requested-With", "Glamia");
    clearReadCache();
  }
  const isFormData = typeof FormData !== "undefined" && requestInit.body instanceof FormData;
  if (requestInit.body && !isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const url = new URL(requestKey(input), window.location.origin);
  // Public catalog requests omit cookies so signed-in shoppers can share edge-cached data.
  const publicRead = method === "GET" && url.origin === window.location.origin
    && (["/api/hero", "/api/categories", "/api/storefront-settings", "/api/search"].includes(url.pathname)
      || (url.pathname === "/api/products" && [null, "public"].includes(url.searchParams.get("scope"))));
  const credentials = requestInit.credentials || (publicRead ? "omit" : "same-origin");
  const key = JSON.stringify([url.href, credentials, [...headers.entries()]]);
  // Abortable requests remain independent so cancelling one caller cannot cancel another.
  const shouldTrackRead = method === "GET" && !requestInit.signal && (Number(cacheTtl) > 0 || dedupe);
  if (shouldTrackRead) {
    const cached = READ_CACHE.get(key);
    if (Number(cacheTtl) > 0 && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.response.clone());
    const active = IN_FLIGHT_READS.get(key);
    if (active) return active.then((response) => response.clone());
  }

  const request = fetch(input, {
    ...requestInit,
    credentials,
    headers,
  });

  if (shouldTrackRead) {
    const generation = cacheGeneration;
    const tracked = request.then((response) => {
      if (IN_FLIGHT_READS.get(key) === tracked) IN_FLIGHT_READS.delete(key);
      notifyAdminAuthFailure(input, response);
      if (Number(cacheTtl) > 0 && response.ok && generation === cacheGeneration) {
        if (READ_CACHE.size >= 100) READ_CACHE.delete(READ_CACHE.keys().next().value);
        READ_CACHE.set(key, { expiresAt: Date.now() + Number(cacheTtl), response: response.clone() });
      }
      return response;
    }).catch((error) => {
      if (IN_FLIGHT_READS.get(key) === tracked) IN_FLIGHT_READS.delete(key);
      throw error;
    });
    IN_FLIGHT_READS.set(key, tracked);
    // Every caller needs its own Response body. Returning the shared original
    // lets one consumer's response.json() make another consumer's clone fail.
    return tracked.then((response) => response.clone());
  }
  return request.then((response) => {
    notifyAdminAuthFailure(input, response);
    return notifyAdminMutationSuccess(input, method, response);
  });
}
