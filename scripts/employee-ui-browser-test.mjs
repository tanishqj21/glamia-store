// Test the actual employee app with intercepted fixtures; no request reaches production.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const base = process.env.EMPLOYEE_PREVIEW_URL || "http://127.0.0.1:8082";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = new URL("../glamia-packer-app/.expo/ui-checks/", import.meta.url);
await mkdir(output, { recursive: true });
const permissions = Object.fromEntries(["packing", "dashboard", "products", "add_product", "bulk_listing", "inventory", "categories", "hero", "storefront", "cinematic_reel", "events", "tax", "coupons", "labels", "employees", "orders", "customers", "reviews", "questions", "deals", "returns", "support", "notifications", "system", "google_analytics", "manage_store"].map(id => [id, true]));
let profile = { id: "fixture-admin", employee_code: "QA_ADMIN", name: "Navigation tester", employee_email: "admin-fixture@example.com", position: "admin", is_owner: false, active: true, permissions };
const errors = [];
const browser = await chromium.launch({ headless: true });

async function touchSwipe(page, from, to) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from[0], y: from[1] }] });
  for (let step = 1; step <= 12; step++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from[0] + (to[0] - from[0]) * step / 12, y: from[1] + (to[1] - from[1]) * step / 12 }] });
    // Pace the swipe at display frames instead of generating an unrealistically fast fling.
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

async function sampleMotion(page, id, action) {
  const sampling = page.evaluate(id => new Promise(resolve => {
    const samples = [];
    const start = performance.now();
    function frame() {
      const node = document.querySelector(`[data-testid="${id}"]`);
      if (node) samples.push({ x: node.getBoundingClientRect().x, opacity: Number(getComputedStyle(node).opacity) });
      if (performance.now() - start < 600) requestAnimationFrame(frame);
      else resolve(samples);
    }
    requestAnimationFrame(frame);
  }), id);
  await action();
  return sampling;
}

async function settleDrawer(page) {
  await expect.poll(() => page.getByTestId("employee-drawer-panel").evaluate(node => Math.round(node.getBoundingClientRect().x))).toBe(0);
  await expect.poll(() => page.getByTestId("employee-drawer-panel").evaluate(node => {
    let opacity = 1;
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) opacity *= Number(getComputedStyle(ancestor).opacity);
    return opacity;
  })).toBe(1);
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://glamiastore.com/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/auth/login") ? { token: "intercepted-fixture-token", employee: profile }
      : path.endsWith("/session") ? { employee: profile }
        : path.endsWith("/dashboard") ? {
          totals: { revenue: 125000, orders: 72, units: 94, profit: 28000, adds: 143, wishlists: 65 },
          byProduct: Array.from({ length: 8 }, (_, index) => ({ id: `dashboard-product-${index}`, name: `Dashboard product ${index + 1}`, category: "Clothing", units: 12, revenue: 15625 }))
        }
        : path.endsWith("/employees") ? { management: { can_create_admin: false, positions: [{ id: "manager", label: "Manager" }, { id: "packing_staff", label: "Packing staff" }], permissions }, employees: [
          { ...profile, can_manage: false, creation_origin: "owner" },
          { id: "fixture-created-staff", name: "Delegated staff", employee_code: "QA_STAFF", position: "packing_staff", active: true, permissions: { packing: true }, can_manage: true, creation_origin: "employee", created_by_email: "creator@example.com" }
        ] }
          : { stats: {}, orders: [], products: [], categories: [], subcategories: [], notifications: [], customers: [], reviews: [], questions: [], events: [], returns: [], tickets: [], slides: [], coupons: [], employees: [], insights: {}, health: { ok: true } };
    await route.fulfill({ json: data });
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Employee ID" }).fill("QA_ADMIN");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("Welcome to Glamia, Navigation tester")).toBeVisible();
  await expect(page.getByText("top_employee", { exact: true })).toHaveCount(0);

  // Populated dashboards must stay bounded and scroll on small phones.
  await page.setViewportSize({ width: 320, height: 568 });
  const dashboardScroll = page.getByTestId("employee-dashboard-scroll");
  await expect(page.getByText("Dashboard product 8", { exact: true })).toBeAttached();
  assert.ok(await dashboardScroll.evaluate(node => node.scrollHeight > node.clientHeight));
  await page.getByText("Dashboard product 8", { exact: true }).scrollIntoViewIfNeeded();
  const lastProduct = await page.getByText("Dashboard product 8", { exact: true }).boundingBox();
  const nav = await page.getByTestId("employee-bottom-nav").boundingBox();
  assert.ok(lastProduct.y + lastProduct.height < nav.y);
  await page.screenshot({ path: fileURLToPath(new URL("overview-small.png", output)) });

  const drawer = page.getByTestId("employee-workspaces-drawer");
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByTestId("employee-menu-open").tap();
    await expect(drawer).toBeVisible();
    await settleDrawer(page);
    const panel = await page.getByTestId("employee-drawer-panel").boundingBox();
    assert.ok(panel.height >= 560, "Drawer cannot collapse into a header strip");
    const drawerScroll = page.getByTestId("employee-drawer-scroll");
    const scrollBounds = await drawerScroll.boundingBox();
    assert.ok(scrollBounds.height > 200, "Workspace links have a usable scroll area");
    await expect(drawer.getByTestId("employee-workspace-overview")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Your profile", exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "All workspaces", exact: true })).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL("drawer-small.png", output)) });
    await page.getByRole("button", { name: "Close menu", exact: true }).tap();
    await expect(drawer).toHaveCount(0);
  }

  // More must be a screen, not another invocation of the hamburger drawer.
  await page.getByTestId("employee-more-open").tap();
  const directory = page.getByTestId("employee-more-screen");
  await expect(directory).toBeVisible();
  await expect(drawer).toHaveCount(0);
  const destinations = ["overview", "packing", "admin-orders", "notifications", "labels", "listings", "admin-products", "bulk-listing", "inventory", "categories", "hero", "storefront", "cinematic-reel", "events", "deals", "coupons", "customers", "reviews", "questions", "returns", "support", "employees", "tax", "system", "google-analytics", "manage-store"];
  for (const id of destinations) await expect(directory.getByTestId(`employee-workspace-${id}`)).toBeAttached();
  await page.screenshot({ path: fileURLToPath(new URL("more-small.png", output)) });

  // Profile must contain account details and working settings, not workspace links.
  await page.getByTestId("employee-profile-open").tap();
  const account = page.getByTestId("employee-profile-screen");
  await expect(account).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await expect(directory).toHaveCount(0);
  await expect(account.getByText(profile.employee_code, { exact: true })).toBeVisible();
  await expect(account.getByText(profile.employee_email, { exact: true })).toBeVisible();
  await account.getByRole("button", { name: "Switch to dark mode", exact: true }).tap();
  await expect(account.getByRole("button", { name: "Switch to light mode", exact: true })).toBeVisible();
  await page.getByTestId("employee-profile-scroll").evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: fileURLToPath(new URL("profile-dark.png", output)) });
  await account.getByRole("button", { name: "Refresh account and access", exact: true }).scrollIntoViewIfNeeded();
  await account.getByRole("button", { name: "Refresh account and access", exact: true }).tap();
  await expect(account.getByText("Your account and access are up to date.", { exact: true })).toBeAttached();

  await page.setViewportSize({ width: 390, height: 844 });
  const moving = await sampleMotion(page, "employee-nav-indicator", () => page.getByRole("tab", { name: "Inventory", exact: true }).tap());
  assert.ok(new Set(moving.map(frame => Math.round(frame.x))).size > 3, "Selection slides between destinations");
  await expect(page.getByRole("tab", { name: "Inventory", exact: true })).toHaveAttribute("aria-selected", "true");

  // Visit every permitted workspace and verify its actual screen renders without runtime errors.
  for (const id of destinations) {
    await page.getByTestId("employee-more-open").tap();
    const link = directory.getByTestId(`employee-workspace-${id}`);
    await link.scrollIntoViewIfNeeded();
    await link.tap();
    const activeScreen = page.getByTestId(`employee-active-${id}`);
    await expect(activeScreen).toBeVisible();
    await expect(directory).toHaveCount(0);
    await expect(drawer).toHaveCount(0);
    assert.ok((await activeScreen.innerText()).trim().length > 0, `${id} has real content`);
    const bounds = await activeScreen.boundingBox();
    assert.ok(bounds.height > 200, `${id} has a usable content frame`);
  }
  console.log(`Opened all ${destinations.length} permitted workspace screens without a runtime error.`);

  await page.getByTestId("employee-more-open").tap();
  await directory.getByTestId("employee-workspace-employees").scrollIntoViewIfNeeded();
  await directory.getByTestId("employee-workspace-employees").tap();
  await expect(page.getByText(/Created by employee/)).toBeAttached();
  await expect(page.getByText(/creator@example.com/)).toBeAttached();

  // Drawer entries must navigate, scroll and close; edge gestures still work.
  await page.getByTestId("employee-menu-open").tap();
  await settleDrawer(page);
  await drawer.getByTestId("employee-workspace-system").scrollIntoViewIfNeeded();
  await drawer.getByTestId("employee-workspace-system").tap();
  await expect(page.getByTestId("employee-active-system")).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await touchSwipe(page, [8, 260], [170, 260]);
  await expect(drawer).toBeVisible();
  await settleDrawer(page);
  await page.screenshot({ path: fileURLToPath(new URL("drawer-dark.png", output)) });
  await touchSwipe(page, [230, 230], [50, 230]);
  await expect(drawer).toHaveCount(0);
  // Chromium omits the click after a synthetic pan; use a mouse-backed press for this handoff.
  await page.getByTestId("employee-menu-open").click();
  await expect(drawer).toBeVisible();
  await settleDrawer(page);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await page.getByTestId("employee-menu-open").tap();
  await settleDrawer(page);
  await page.getByRole("button", { name: "Close workspaces menu", exact: true }).tap({ position: { x: 380, y: 260 } });
  await expect(drawer).toHaveCount(0);

  // Revocation must remove a destination from BOTH surfaces, even for an Admin.
  profile = { ...profile, permissions: { packing: true } };
  await page.getByTestId("employee-more-open").tap();
  await directory.getByRole("button", { name: "Refresh access", exact: true }).tap();
  await expect(page.getByRole("tab", { name: "Inventory", exact: true })).toHaveCount(0);
  await expect(directory.getByTestId("employee-workspace-inventory")).toHaveCount(0);
  await expect(directory.getByTestId("employee-workspace-packing")).toBeVisible();
  await page.getByTestId("employee-menu-open").tap();
  await expect(drawer.getByTestId("employee-workspace-packing")).toBeVisible();
  await expect(drawer.getByTestId("employee-workspace-employees")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Your profile", exact: true }).tap();
  await expect(account).toBeVisible();
  await expect(drawer).toHaveCount(0);

  // No business access must still leave Profile, More, refresh, and sign-out usable.
  profile = { ...profile, permissions: {} };
  await account.getByRole("button", { name: "Refresh account and access", exact: true }).scrollIntoViewIfNeeded();
  await account.getByRole("button", { name: "Refresh account and access", exact: true }).tap();
  await page.getByTestId("employee-more-open").tap();
  await expect(directory.getByText("No workspaces assigned", { exact: true })).toBeVisible();
  await expect(directory.locator('[data-testid^="employee-workspace-"]')).toHaveCount(0);
  await page.getByTestId("employee-profile-open").tap();
  await account.getByRole("button", { name: "Sign out", exact: true }).scrollIntoViewIfNeeded();
  await account.getByRole("button", { name: "Sign out", exact: true }).tap();
  await page.getByRole("button", { name: "Stay", exact: true }).tap();
  await expect(account).toBeVisible();
  await account.getByRole("button", { name: "Sign out", exact: true }).tap();
  await page.getByRole("button", { name: "Sign out now", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  assert.deepEqual(errors, [], "No browser runtime errors while opening all Admin destinations");
  await context.close();
  console.log(`Employee UI checks passed: real Profile, separate More directory, full-height drawer, all ${destinations.length} destinations, small-screen layout, theme, gestures, revocation on both surfaces, empty access, refresh, and sign-out.`);
} finally { await browser.close(); }
