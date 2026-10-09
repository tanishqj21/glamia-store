// Render the real website against in-memory D1 fixtures; no production calls or writes.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { localDatabase, workerFunctions } from "./lib/worker-fixture.mjs";

const base = process.env.CUSTOMER_HISTORY_PREVIEW || "http://127.0.0.1:5189";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const { db, env } = localDatabase();
for (const [email, name] of [["mira-history@example.com", "Mira Sen"], ["arun-history@example.com", "Arun Nair"]]) {
  db.prepare("INSERT INTO users(email,google_sub,name) VALUES (?,?,?)").run(email, `local-${email}`, name);
}
for (let index = 0; index < 27; index++) {
  const id = `history-${String(index).padStart(2, "0")}`;
  db.prepare("INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,created_at) VALUES (?,?,?, ?,1999,1999,?,'razorpay','paid','2026-10-01 12:00:00')")
    .run(id, `GM-LOCAL-${String(index).padStart(2, "0")}`, "mira-history@example.com", JSON.stringify([{ name: index === 0 ? "Night suit" : "Linen shirt", color: "Teal", size: "M", quantity: 1 }]), index === 26 ? "cancelled" : "delivered");
}
const { listCustomers, listAdminCustomerOrders } = await workerFunctions(["listCustomers", "listAdminCustomerOrders"]);
const owner = { role: "admin", is_owner: true, name: "Local owner", email: "local-owner@example.com" };
const output = new URL("../output/customer-history/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    let historyCalls = 0;
    let failHistory = false;
    let actor = owner;
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return url.origin === new URL(base).origin ? route.continue() : route.abort();
      if (url.pathname === "/api/session") return route.fulfill({ json: { user: actor, needs_profile_completion: false } });
      if (url.pathname === "/api/admin/customers") return route.fulfill({ json: await (await listCustomers(env)).json() });
      const history = url.pathname.match(/^\/api\/admin\/customers\/([^/]+)\/orders$/);
      if (history) {
        historyCalls++;
        if (failHistory) { failHistory = false; return route.fulfill({ status: 500, json: { error: "Local history failure" } }); }
        try { return route.fulfill({ json: await (await listAdminCustomerOrders(env, actor, decodeURIComponent(history[1]), url.searchParams)).json() }); }
        catch (error) { return route.fulfill({ status: error.status || 500, json: { error: error.message } }); }
      }
      return route.fulfill({ json: { stats: {}, products: [], slides: [], categories: [], notifications: [], orders: [], unread: 0 } });
    });
    await page.goto(`${base}/admin/customers`);
    const openMira = () => page.getByRole("button", { name: "View orders for Mira Sen", exact: true });
    await expect(openMira()).toBeVisible();
    assert.equal(historyCalls, 0, "The customer list does not preload order histories");
    await page.getByLabel("Search customers", { exact: true }).fill("Mira");
    await expect(page.getByRole("button", { name: "View orders for Arun Nair", exact: true })).toHaveCount(0);
    await openMira().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("27 orders", { exact: true })).toBeVisible();
    await expect(page.locator(".customer-history-order")).toHaveCount(25);
    await expect(page.getByText("Packing not required", { exact: true })).toBeVisible();
    await expect(page.getByText("Payment method: razorpay").first()).toBeVisible();
    await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
    await expect(page.locator(".customer-history-order")).toHaveCount(2);
    const search = page.getByLabel("Search customer orders", { exact: true });
    await search.fill("Night suit");
    await expect(page.getByText("1 matching order", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GM-LOCAL-00", exact: true })).toBeVisible();
    await expect(page.locator(".customer-history-order")).toHaveCount(1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: fileURLToPath(new URL(`history-${width}.png`, output)), fullPage: true });
    await search.fill("no-such-product");
    await expect(page.getByText("No orders match this search.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(page.getByText("27 orders", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to customers", exact: true }).click();
    await expect(page.getByLabel("Search customers", { exact: true })).toHaveValue("Mira");
    await page.getByLabel("Search customers", { exact: true }).fill("");
    await page.getByRole("button", { name: "View orders for Arun Nair", exact: true }).click();
    await expect(page.getByText("This customer has not placed any orders yet.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to customers", exact: true }).click();
    failHistory = true;
    await openMira().click();
    await expect(page.getByText("Local history failure", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText("27 orders", { exact: true })).toBeVisible();
    // A customer-only staff member can view records but cannot open order histories.
    actor = { ...owner, is_owner: false, employee_id: "customer-only", employee_permissions: { customers: true } };
    await page.goto(`${base}/admin/customers`);
    await expect(page.getByRole("heading", { name: "Customers", exact: true, level: 2 })).toBeVisible();
    await expect(page.getByRole("button", { name: /^View orders for/ })).toHaveCount(0);
    await context.close();
    console.log(`PASS history navigation, on-demand reads, pagination/search, empty/error/retry, access, layout width=${width}`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); db.close(); }
