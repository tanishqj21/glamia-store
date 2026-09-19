import * as SecureStore from "expo-secure-store";

export const API_BASE_URL = String(process.env.EXPO_PUBLIC_API_URL || "https://glamiastore.com").replace(/\/$/, "");
const SESSION_KEY = "glamia_store_session";
const USER_KEY = "glamia_store_user";

async function readResponse(response) {
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data.error || "The request could not be completed");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function storedSession() {
  const [token, savedUser] = await Promise.all([
    SecureStore.getItemAsync(SESSION_KEY),
    SecureStore.getItemAsync(USER_KEY)
  ]);
  let user = null;
  try { user = savedUser ? JSON.parse(savedUser) : null; } catch { user = null; }
  return token ? { token, user } : null;
}

export async function saveSession(data) {
  if (!data?.session_token) throw new Error("The mobile session was not returned by Glamia");
  await Promise.all([
    SecureStore.setItemAsync(SESSION_KEY, data.session_token),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user || null))
  ]);
  return data;
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_KEY),
    SecureStore.deleteItemAsync(USER_KEY)
  ]);
}

export async function mobileFetch(path, options = {}) {
  const session = await storedSession();
  const headers = {
    Accept: "application/json",
    "X-Glamia-Mobile": "1",
    ...(options.headers || {})
  };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 401) await clearSession();
  return readResponse(response);
}

export async function googleLogin(credential) {
  const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Glamia-Mobile": "1" },
    body: JSON.stringify({ credential, platform: "mobile" })
  });
  return saveSession(await readResponse(response));
}

export async function appleLogin(identityToken, email = "", name = "") {
  const response = await fetch(`${API_BASE_URL}/api/auth/apple`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Glamia-Mobile": "1" },
    body: JSON.stringify({ identity_token: identityToken, email, name, platform: "ios" })
  });
  return saveSession(await readResponse(response));
}

export async function signOut() {
  try { await mobileFetch("/api/logout", { method: "POST", body: JSON.stringify({}) }); } catch { /* local sign-out still wins */ }
  await clearSession();
}

export async function deleteAccount() {
  const data = await mobileFetch("/api/account", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) });
  await clearSession();
  return data;
}

export async function getSession() { return mobileFetch("/api/session"); }
export async function getProfile() { return mobileFetch("/api/profile"); }
export async function updateProfile(profile) { return mobileFetch("/api/profile", { method: "PUT", body: JSON.stringify(profile) }); }
export async function getAddresses() { return mobileFetch("/api/addresses"); }
export async function createAddress(address) { return mobileFetch("/api/addresses", { method: "POST", body: JSON.stringify(address) }); }
export async function updateAddress(id, address) { return mobileFetch(`/api/addresses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(address) }); }
export async function deleteAddress(id) { return mobileFetch(`/api/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }); }

export async function getStorefront() {
  const [hero, products, categories, settings] = await Promise.all([
    mobileFetch("/api/hero?cache=1"),
    mobileFetch("/api/products?scope=public&view=cards&limit=60&cache=1"),
    mobileFetch("/api/categories?cache=1"),
    mobileFetch("/api/storefront-settings?cache=1")
  ]);
  return { hero: hero.slides || [], products: products.products || [], pagination: products.pagination || null, categories: categories.categories || [], settings };
}

export async function searchProducts(query, filters = {}) {
  const params = new URLSearchParams({ q: query, limit: "60", ...filters });
  const data = await mobileFetch(`/api/search?${params.toString()}`);
  return data.products || [];
}

export async function getProduct(id) { return mobileFetch(`/api/products/${encodeURIComponent(id)}`); }
export async function getProductReviews(id) { return mobileFetch(`/api/products/${encodeURIComponent(id)}/reviews`); }
export async function getOrders() { return mobileFetch("/api/orders?scope=own"); }
export async function cancelOrder(id) { return mobileFetch(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({}) }); }
export async function requestReturn(id, body) { return mobileFetch(`/api/orders/${encodeURIComponent(id)}/returns`, { method: "POST", body: JSON.stringify(body) }); }
export async function getReturns() { return mobileFetch("/api/returns?scope=own"); }
export async function getNotifications() { return mobileFetch("/api/notifications"); }
export async function markNotificationsRead(id = "") { return mobileFetch("/api/notifications/read", { method: "POST", body: JSON.stringify({ id }) }); }
export async function registerPushToken(token, platform) { return mobileFetch("/api/push-tokens", { method: "POST", body: JSON.stringify({ token, platform }) }); }

export async function validateCoupon(code, items) {
  return mobileFetch("/api/coupons/validate", { method: "POST", body: JSON.stringify({ code, items }) });
}

export async function listAvailableCoupons(items) {
  return mobileFetch("/api/coupons/available", { method: "POST", body: JSON.stringify({ items }) });
}

export async function createPayment(payload) {
  return mobileFetch("/api/payments/create", { method: "POST", body: JSON.stringify(payload) });
}

export async function verifyRazorpay(payload) {
  return mobileFetch("/api/payments/razorpay/verify", { method: "POST", body: JSON.stringify(payload) });
}

export async function phonePeStatus(orderId, checkoutToken = "") {
  const query = new URLSearchParams({ order_id: orderId });
  if (checkoutToken) query.set("checkout_token", checkoutToken);
  return mobileFetch(`/api/payments/phonepe/status?${query.toString()}`);
}

export async function createSupportTicket(subject, message) {
  return mobileFetch("/api/support/tickets", { method: "POST", body: JSON.stringify({ subject, message }) });
}
