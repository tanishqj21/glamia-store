import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { savedForLaterKey } from "../react-app/src/lib/savedForLater.js";

const base = process.env.UI_TEST_URL || "http://127.0.0.1:5174";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Use a local preview, never the live store.");
const output = new URL("../test-results/website-saved-for-later/", import.meta.url);
mkdirSync(output, { recursive: true });
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200"><rect width="160" height="200" fill="#e5e1e9"/><path d="M48 32L20 58l16 26 16-8v98h56V76l16 8 16-26-28-26-20 8H68z" fill="#806f94"/></svg>')}`;
const shirt = { id: "test-shirt", name: "Everyday cotton shirt", price: 1000, status: "live", sizes: ["M", "L"], stock: 20, size_stock: { M: 12, L: 8 }, image_url: image, category: "Shirts" };
const extra = { ...shirt, id: "second-shirt", name: "A saved piece outside page one" };
const sold = { ...shirt, id: "sold-shirt", name: "Sold out shirt", stock: 0, size_stock: { M: 0, L: 0 } };
const small = { id: shirt.id, size: "M", variant: "Plum", quantity: 2 };
const large = { ...small, size: "L", quantity: 1 };
const errors = [], results = [];
const browser = await chromium.launch();

async function fixture(viewport, { cart = [small, large], saved = {}, user = null, failSavedWrite = false, failCartWrite = false } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const requests = [];
  const session = { user, failStockLookup: false };
  await context.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    requests.push({ path, query: url.search, method: request.method(), data: request.postDataJSON() });
    let body = {};
    if (path === "/api/session") body = { user: session.user };
    else if (path === "/api/products") {
      const ids = url.searchParams.get("ids");
      if (ids && session.failStockLookup) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary catalogue failure" }) });
      const { size_stock: _stock, ...card } = shirt;
      const products = ids ? [shirt, extra, sold].filter(product => ids.split(",").includes(product.id)) : [card];
      body = { products, pagination: { page: 1, has_more: false, total: products.length } };
    } else if (path === "/api/hero") body = { slides: [] };
    else if (path === "/api/categories") body = { categories: [] };
    else if (path === "/api/saved-items" || path === "/api/saved-items/merge") body = { cart, wishlist: [shirt.id], saved_for_later: saved[savedForLaterKey(session.user?.email)] || [] };
    else if (path === "/api/coupons/available") body = { coupons: [] };
    else if (path === "/api/coupons/validate") body = { code: "TEST", discount: 200 };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await context.addInitScript(({ cart, saved, failSavedWrite, failCartWrite }) => {
    if (!sessionStorage.getItem("saved-later-test-seeded")) {
      localStorage.setItem("glamia-react-cart", JSON.stringify(cart));
      localStorage.setItem("glamia-react-wishlist", JSON.stringify(["test-shirt"]));
      for (const [key, items] of Object.entries(saved)) localStorage.setItem(key, JSON.stringify(items));
      sessionStorage.setItem("saved-later-test-seeded", "1");
    }
    if (failSavedWrite || failCartWrite) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if ((failSavedWrite && key.startsWith("glamia-react-saved-for-later:")) || (failCartWrite && key === "glamia-react-cart")) throw new DOMException("Test quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    }
  }, { cart, saved, failSavedWrite, failCartWrite });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/cart`);
  await expect(page.getByRole("heading", { name: "Shopping bag", exact: true })).toBeVisible();
  await expect(page.getByText("Loading saved items…", { exact: true })).toHaveCount(0);
  if (cart.length) await expect(page.locator(".cart-list .cart-line").first().getByRole("button", { name: "Save for later", exact: true })).toBeEnabled();
  return { context, page, requests, session };
}
async function read(page, key) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), key); }
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, "No horizontal overflow"); }
async function accessibility(page, selector) {
  const report = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  assert.deepEqual(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `Accessibility: ${selector}`);
}
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["narrow", { width: 320, height: 740 }]]) {
    const { context, page, requests } = await fixture(viewport);
    const bag = page.locator(".cart-list"), saved = page.locator(".cart-saved-section");
    const first = bag.locator(".cart-line").first();
    await first.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await accessibility(page, ".cart-removal-dialog");
    await page.getByRole("dialog").getByRole("button", { name: "Keep in bag", exact: true }).click();
    await expect(bag.locator(".cart-line")).toHaveCount(2);
    await expect(first.getByRole("button", { name: "Remove", exact: true })).toBeFocused();
    await first.getByRole("button", { name: "Remove", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await bag.locator(".cart-line").last().getByRole("button", { name: /Decrease quantity/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Keep in bag", exact: true }).click();
    await page.getByLabel("Coupon code", { exact: true }).fill("TEST");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator(".coupon-applied")).toBeVisible();
    await first.getByRole("button", { name: "Remove", exact: true }).click();
    await page.screenshot({ path: fileURLToPath(new URL(`${label}-dialog.png`, output)) });
    await page.getByRole("dialog").getByRole("button", { name: "Save for later", exact: true }).click();
    await expect(bag.locator(".cart-line")).toHaveCount(1);
    await expect(saved.locator(".cart-line")).toHaveCount(1);
    await expect(page.locator(".cart-subtotal strong")).toHaveText("₹1,000");
    await expect(page.locator(".coupon-applied")).toHaveCount(0);
    assert.deepEqual(await read(page, savedForLaterKey()), [small]);
    assert.deepEqual(await read(page, "glamia-react-wishlist"), [shirt.id]);
    await expect.poll(() => requests.filter(r => r.path === "/api/coupons/available").at(-1)?.data.items).toEqual([{ id: large.id, quantity: large.quantity, size: large.size }]);
    await page.reload();
    await expect(saved.locator(".cart-line")).toHaveCount(1);
    await expect(saved.getByRole("button", { name: "Move to bag", exact: true })).toBeEnabled();
    await noOverflow(page);
    await accessibility(page, ".cart-page");
    await page.screenshot({ path: fileURLToPath(new URL(`${label}-saved.png`, output)), fullPage: true });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    await accessibility(page, ".cart-page");
    await page.screenshot({ path: fileURLToPath(new URL(`${label}-dark.png`, output)), fullPage: true });
    await saved.getByRole("button", { name: "Move to bag", exact: true }).click();
    await expect(bag.locator(".cart-line")).toHaveCount(2);
    assert.deepEqual((await read(page, "glamia-react-cart")).find(item => item.size === "M"), small);
    assert.deepEqual(await read(page, savedForLaterKey()), []);
    await bag.locator(".cart-line").filter({ hasText: "Size M" }).getByRole("button", { name: "Save for later", exact: true }).click();
    await bag.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove item", exact: true }).click();
    await expect(bag).toHaveCount(0);
    await expect(saved.getByRole("button", { name: "Move to bag", exact: true })).toBeVisible();
    await saved.getByRole("button", { name: "Remove saved item", exact: true }).click();
    assert.deepEqual(await read(page, savedForLaterKey()), []);
    assert.equal(requests.filter(r => r.path === "/api/saved-items" && r.method !== "GET").length, 0, "Guest saved selections must not write to the account database");
    results.push(`${label}: removal dialog, cancel/Escape, save/restore/reload, coupons, Wishlist isolation, empty bag, light/dark accessibility and layout passed`);
    console.log(results.at(-1));
    await context.close();
  }
  {
    const { context, page } = await fixture({ width: 390, height: 844 }, { failSavedWrite: true });
    await page.locator(".cart-list .cart-line").first().getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save for later", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("could not be stored");
    assert.deepEqual(await read(page, "glamia-react-cart"), [small, large]);
    assert.deepEqual(await read(page, savedForLaterKey()), []);
    results.push("Storage quota failure: item remains in bag and dialog stays open");
    await context.close();
  }
  {
    const savedItems = [ { ...small, id: extra.id }, { ...small, id: sold.id }, { ...small, id: "missing-shirt" } ];
    const { context, page, requests } = await fixture({ width: 390, height: 844 }, { cart: [], saved: { [savedForLaterKey()]: savedItems } });
    const section = page.locator(".cart-saved-section");
    await expect(section.getByText(extra.name, { exact: true })).toBeVisible();
    await expect(section.locator(".cart-line").filter({ hasText: sold.name }).getByRole("button", { name: "Move to bag" })).toBeDisabled();
    await expect(section.locator(".cart-line").filter({ hasText: "Unavailable item" }).getByRole("button", { name: "Move to bag" })).toBeDisabled();
    assert.equal(requests.filter(r => r.path === "/api/products" && r.query.includes("ids=")).length, 1, "Missing saved products use one batch request");
    await section.locator(".cart-line").filter({ hasText: extra.name }).getByRole("button", { name: "Move to bag" }).click();
    await expect(page.locator(".cart-list").getByText(extra.name, { exact: true })).toBeVisible();
    const other = await context.newPage();
    await other.goto(`${base}/cart`);
    await other.evaluate(key => localStorage.setItem(key, "[]"), savedForLaterKey());
    await expect(section.locator(".cart-line")).toHaveCount(0);
    results.push("Missing catalogue products: batched lookup, sold-out/unavailable guards, restored product details and cross-tab updates passed");
    await context.close();
  }
  {
    const { context, page } = await fixture({ width: 390, height: 844 }, { cart: [], saved: { [savedForLaterKey()]: [small] }, failCartWrite: true });
    await expect(page.locator(".cart-saved-section").getByRole("button", { name: "Move to bag" })).toBeEnabled();
    await page.locator(".cart-saved-section").getByRole("button", { name: "Move to bag" }).click();
    await expect(page.locator(".cart-notice")).toContainText("still saved for later");
    assert.deepEqual(await read(page, savedForLaterKey()), [small]);
    assert.deepEqual(await read(page, "glamia-react-cart"), []);
    results.push("Restore storage failure: saved selection is retained and the empty bag is unchanged");
    await context.close();
  }
  {
    const { context, page, session, requests } = await fixture({ width: 390, height: 844 }, { cart: [] });
    session.failStockLookup = true;
    await page.evaluate(({ key, item }) => {
      localStorage.setItem(key, JSON.stringify([item]));
      window.dispatchEvent(new StorageEvent("storage", { key }));
    }, { key: savedForLaterKey(), item: small });
    const section = page.locator(".cart-saved-section");
    await expect(section.getByRole("alert")).toContainText("could not be checked");
    await expect(section.getByRole("button", { name: "Move to bag" })).toBeDisabled();
    assert.equal(requests.filter(r => r.path === "/api/products" && r.query.includes("ids=")).length, 1);
    session.failStockLookup = false;
    await section.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(section.getByRole("button", { name: "Move to bag" })).toBeEnabled();
    await expect(section.getByRole("alert")).toHaveCount(0);
    assert.equal(requests.filter(r => r.path === "/api/products" && r.query.includes("ids=")).length, 2);
    results.push("Catalogue failure: restoration stays disabled until a successful explicit retry, with no automatic request loop");
    await context.close();
  }
  {
    const one = "first@example.com", two = "second@example.com";
    const { context, page, session } = await fixture({ width: 1440, height: 1000 }, { cart: [], user: { email: one, name: "First" }, saved: { [savedForLaterKey(one)]: [small], [savedForLaterKey(two)]: [large], [savedForLaterKey()]: [{ ...small, quantity: 3 }] } });
    await expect(page.locator(".cart-saved-section")).toContainText("Size M");
    await expect(page.locator(".cart-saved-section")).not.toContainText("Size L");
    session.user = { email: two, name: "Second" };
    await page.reload();
    await expect(page.locator(".cart-saved-section")).toContainText("Size L");
    await expect(page.locator(".cart-saved-section")).not.toContainText("Size M");
    results.push("Account isolation: each signed-in account sees only its own browser-local saved selections");
    await context.close();
  }
  assert.deepEqual(errors, [], "No uncaught browser errors");
} finally {
  writeFileSync(new URL("report.json", output), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(`Passed ${results.length} browser scenarios with no runtime errors.`);
