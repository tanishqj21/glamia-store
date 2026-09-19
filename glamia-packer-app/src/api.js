import * as SecureStore from "expo-secure-store";

const API_BASE_URL = String(process.env.EXPO_PUBLIC_API_URL || "https://glamiastore.com").replace(/\/$/, "");
const SESSION_KEY = "glamia_employee_token";
const PROFILE_KEY = "glamia_employee_profile";

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

export async function employeeLogin(employeeId, password) {
  const response = await fetch(`${API_BASE_URL}/api/employee/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, password })
  });
  const data = await readResponse(response);
  await SecureStore.setItemAsync(SESSION_KEY, data.token);
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(data.employee));
  return data;
}

export async function employeeLogout() {
  const token = await SecureStore.getItemAsync(SESSION_KEY);
  if (token) {
    await fetch(`${API_BASE_URL}/api/employee/auth/logout`, { method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(PROFILE_KEY);
}

export async function storedEmployee() {
  const [token, profile] = await Promise.all([SecureStore.getItemAsync(SESSION_KEY), SecureStore.getItemAsync(PROFILE_KEY)]);
  if (!token) return null;
  let employee = null;
  try { employee = profile ? JSON.parse(profile) : null; } catch { employee = null; }
  return { token, employee };
}

async function employeeFetch(path, options = {}) {
  const session = await storedEmployee();
  if (!session?.token) {
    const error = new Error("Employee sign-in required");
    error.status = 401;
    throw error;
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}), Authorization: `Bearer ${session.token}` }
  });
  if (response.status === 401) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await SecureStore.deleteItemAsync(PROFILE_KEY);
  }
  return readResponse(response);
}

export async function employeeSession() {
  return employeeFetch("/api/employee/session");
}

export async function employeeOrders(status = "unpacked") {
  return employeeFetch(`/api/employee/orders?status=${encodeURIComponent(status)}`);
}

export async function employeeOrder(id) {
  return employeeFetch(`/api/employee/orders/${encodeURIComponent(id)}`);
}

export async function markOrderPacked(id) {
  return employeeFetch(`/api/employee/orders/${encodeURIComponent(id)}/packed`, { method: "POST" });
}
