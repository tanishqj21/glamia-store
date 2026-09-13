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

/**
 * Shared client request helper for the React surface.
 * Keeping credentials and the Worker mutation marker in one place prevents
 * individual screens from drifting into subtly different request behavior.
 */
export function apiFetch(input, init = {}) {
  const { cacheTtl = 0, ...requestInit } = init;
  const headers = new Headers(init.headers || {});
  const method = String(requestInit.method || "GET").toUpperCase();

  headers.set("Accept", "application/json");
  if (MUTATING_METHODS.has(method)) {
    headers.set("X-Requested-With", "Glamia");
    clearReadCache();
  }
  const isFormData = typeof FormData !== "undefined" && requestInit.body instanceof FormData;
  if (requestInit.body && !isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const key = requestKey(input);
  if (method === "GET" && Number(cacheTtl) > 0) {
    const cached = READ_CACHE.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.response.clone());
    const active = IN_FLIGHT_READS.get(key);
    if (active) return active.then((response) => response.clone());
  }

  const request = fetch(input, {
    ...requestInit,
    credentials: "same-origin",
    headers,
  });

  if (method === "GET" && Number(cacheTtl) > 0) {
    const generation = cacheGeneration;
    const tracked = request.then((response) => {
      if (IN_FLIGHT_READS.get(key) === tracked) IN_FLIGHT_READS.delete(key);
      if (response.ok && generation === cacheGeneration) {
        if (READ_CACHE.size >= 100) READ_CACHE.delete(READ_CACHE.keys().next().value);
        READ_CACHE.set(key, { expiresAt: Date.now() + Number(cacheTtl), response: response.clone() });
      }
      return response;
    }).catch((error) => {
      if (IN_FLIGHT_READS.get(key) === tracked) IN_FLIGHT_READS.delete(key);
      throw error;
    });
    IN_FLIGHT_READS.set(key, tracked);
    return tracked;
  }
  return request;
}
