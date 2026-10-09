// Exercise website hierarchy controls against the isolated local Worker and exact temporary accounts.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8788";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Fixtures must never reach production");
const secret = process.env.SMOKE_SESSION_SECRET || "isolated-local-audit-not-a-production-secret";
const admin = await fetch(`${base}/api/auth/demo-admin`, { redirect: "manual" });
assert.equal(admin.status, 302);
const ownerCookie = admin.headers.get("set-cookie").split(";")[0];
const suffix = randomUUID().slice(0, 8).toUpperCase();
const ids = [];
const output = new URL("../glamia-packer-app/.expo/ui-checks/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

async function call(path, { cookie = ownerCookie, method = "GET", body } = {}) {
  const result = await fetch(base + path, { method, headers: { Cookie: cookie, Origin: base, "X-Requested-With": "Glamia", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await result.json();
  assert.ok(result.ok, JSON.stringify(data));
  return data;
}

function portalCookie(email) {
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ email, iat: now, exp: now + 3600 })).toString("base64url");
  return `mm_session=${claims}.${createHmac("sha256", secret).update(claims).digest("base64url")}`;
}

async function contextFor(cookie) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const separator = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: base, httpOnly: true, sameSite: "Lax" }]);
  return context;
}

try {
  const result = await call("/api/admin/employees", { method: "POST", body: { employee_code: `QA_WEB_${suffix}`, name: "Portal admin fixture", employee_email: `portal-${suffix.toLowerCase()}@example.com`, position: "admin", permissions: { employees: true, inventory: true, manage_store: true }, password: `Local-fixture-${randomUUID()}` } });
  const employee = result.employee;
  ids.push(employee.id);
  const cookie = portalCookie(employee.employee_email);
  const delegated = await call("/api/admin/employees", { cookie, method: "POST", body: { employee_code: `QA_WEBSTAFF_${suffix}`, name: "Employee-created fixture", position: "packing_staff", permissions: {}, password: `Local-fixture-${randomUUID()}` } });
  ids.push(delegated.employee.id);
  const context = await contextFor(cookie);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin/employees`, { waitUntil: "domcontentloaded" });
  const nav = page.getByRole("navigation", { name: "Admin workspace", exact: true });
  await expect(nav.getByRole("button", { name: "Employees", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Inventory", exact: true })).toBeAttached();
  await expect(nav.getByRole("button", { name: "Dashboard", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Bulk listing", exact: true })).toHaveCount(0);
  const position = page.locator('form select[name="position"]').first();
  await expect(position.locator('option[value="admin"]')).toHaveCount(0);
  await expect(page.getByText(`◇ Created by employee · ${employee.employee_email}`, { exact: true })).toBeVisible();
  const protectedRow = page.locator("article.employee-row").filter({ hasText: employee.employee_code });
  await expect(protectedRow.getByText("Protected account · outside your management scope")).toBeVisible();
  await expect(protectedRow.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await page.screenshot({ path: fileURLToPath(new URL("website-top-employee.png", output)), fullPage: true });

  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${base}/admin/employees`);
  await page.goto(`${base}/admin/manage-store`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Inventory Manage total/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bulk listing Import/ })).toHaveCount(0);

  await call(`/api/admin/employees/${employee.id}`, { method: "PATCH", body: { permissions: { employees: true } } });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page).toHaveURL(`${base}/admin/employees`);
  await expect(nav.getByRole("button", { name: "Inventory", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Manage store", exact: true })).toHaveCount(0);
  await context.close();

  const ownerContext = await contextFor(ownerCookie);
  const ownerPage = await ownerContext.newPage();
  ownerPage.on("pageerror", error => errors.push(error.message));
  await ownerPage.goto(`${base}/admin/employees`, { waitUntil: "domcontentloaded" });
  await expect(ownerPage.locator('form select[name="position"] option[value="admin"]').first()).toBeAttached();
  await expect(ownerPage.getByText("Owner: you can assign Admin", { exact: true })).toBeVisible();
  await ownerContext.close();
  assert.deepEqual(errors, []);
  console.log("Website hierarchy UI checks passed: scoped navigation, permitted landing, no Admin creation by employees, protected Admin controls, creator sign, filtered store map, live revocation, and Owner controls.");
} finally {
  await browser.close();
  for (const id of ids) await call(`/api/admin/employees/${id}`, { method: "DELETE" });
}
