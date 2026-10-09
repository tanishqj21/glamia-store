import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { chromium, expect } from "@playwright/test";
import { savedItemChanges, savedItemSnapshot } from "../react-app/src/lib/savedItems.js";
import { savedItemChanges as nativeChanges } from "../glamia-shoppers-app/src/savedItems.js";
import { savedForLaterKey } from "../react-app/src/lib/savedForLater.js";

const base = process.env.UI_TEST_URL || "http://127.0.0.1:8788";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Never run account fixtures on the live store.");
const login = await fetch(`${base}/api/auth/demo-admin`, { redirect: "manual" });
assert.equal(login.status, 302);
const cookie = login.headers.get("set-cookie").split(";", 1)[0];
const [cookieName, token] = cookie.split("=");
const json = (value, status = 200) => { assert.equal(value.status, status); return value.json(); };
const call = (body, headers = {}, method = "PATCH") => fetch(`${base}/api/saved-items`, {
  method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Glamia-Mobile": "1", ...headers }, body: JSON.stringify(body)
});

// Exercise the real Android API client with local secure storage, not a reimplementation of its requests.
const context = createContext({ URL, URLSearchParams, Headers, FormData, AbortController, setTimeout, clearTimeout, fetch, console, Map, Set, Date, __DEV__: true, process: { env: { EXPO_PUBLIC_API_URL: base } } });
const storage = { getItemAsync: async key => key === "glamia_store_session" ? token : JSON.stringify({ email: "demo-admin@glamia.local" }), setItemAsync: async () => {}, deleteItemAsync: async () => {} };
const api = new SourceTextModule(await readFile(new URL("../glamia-shoppers-app/src/api.js", import.meta.url), "utf8"), { context });
await api.link(async specifier => {
  if (specifier === "./network.js") return new SourceTextModule(await readFile(new URL("../glamia-shoppers-app/src/network.js", import.meta.url), "utf8"), { context });
  const exports = specifier === "expo-secure-store" ? storage : specifier === "react-native" ? { Platform: { OS: "android" } } : null;
  assert.ok(exports, `Unexpected native API dependency ${specifier}`);
  return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
});
await api.evaluate();
const mobile = api.namespace;
const initial = savedItemSnapshot(await mobile.getSavedItems());
const medium = { id: "seed-midnight-satin-dress", size: "M", variant: "Midnight", quantity: 2 };
const large = { ...medium, size: "L", quantity: 1 };
let browser;
const errors = [];
try {
  await mobile.patchSavedItems(savedItemChanges(initial, { cart: [medium, large], wishlist: [medium.id], saved_for_later: [] }).cart,
    savedItemChanges(initial, { cart: [medium, large], wishlist: [medium.id], saved_for_later: [] }).wishlist,
    savedItemChanges(initial, { cart: [medium, large], wishlist: [medium.id], saved_for_later: [] }).saved_for_later);
  browser = await chromium.launch();
  const web = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await web.addCookies([{ name: cookieName, value: token, url: base }]);
  const page = await web.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/cart`);
  await expect(page.locator(".cart-list .cart-line")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("glamia-saved-baseline")))).toBe(true);
  const line = size => page.locator(".cart-list .cart-line").filter({ hasText: `Size ${size}` });
  await line("M").getByRole("button", { name: "Save for later", exact: true }).click();
  await expect.poll(async () => JSON.parse(JSON.stringify((await mobile.getSavedItems()).saved_for_later))).toEqual([medium]);
  let account = await mobile.getSavedItems();
  assert.deepEqual(JSON.parse(JSON.stringify(account.cart)), [large]);
  assert.deepEqual(JSON.parse(JSON.stringify(account.wishlist)), [medium.id]);
  console.log("Website save is visible through the real Android client, with size/variant/quantity preserved and no Wishlist change.");

  // App and website changes use the same atomic bag/later delta protocol.
  const restored = { cart: [large, medium], wishlist: [medium.id], saved_for_later: [] };
  const delta = nativeChanges(account, restored);
  assert.deepEqual(delta, savedItemChanges(account, restored));
  await mobile.patchSavedItems(delta.cart, delta.wishlist, delta.saved_for_later);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".cart-list .cart-line")).toHaveCount(2);
  await expect(page.locator(".cart-saved-section .cart-line")).toHaveCount(0);
  console.log("An Android move-to-bag refreshes the already-open website and removes the saved selection in one account revision.");

  account = await mobile.getSavedItems();
  const savedAgain = { cart: [medium], wishlist: [medium.id], saved_for_later: [large] };
  const appDelta = nativeChanges(account, savedAgain);
  await mobile.patchSavedItems(appDelta.cart, appDelta.wishlist, appDelta.saved_for_later);
  await page.reload();
  await expect(page.locator(".cart-saved-section")).toContainText("Size L");
  await expect(page.locator(".cart-list .cart-line")).toHaveCount(1);
  console.log("An Android save-for-later is displayed by the signed-in website on reload.");

  await page.route("**/api/saved-items", route => route.request().method() === "PATCH" ? route.abort("failed") : route.continue());
  await line("M").getByRole("button", { name: "Save for later", exact: true }).click();
  await expect(page.locator(".cart-saved-section .cart-line")).toHaveCount(2);
  await expect(page.locator(".cart-saved-section")).toContainText("Reconnect to sync");
  assert.deepEqual(JSON.parse(JSON.stringify((await mobile.getSavedItems()).cart)), [medium]);
  await page.reload();
  await expect(page.locator(".cart-saved-section .cart-line")).toHaveCount(2);
  assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), savedForLaterKey("demo-admin@glamia.local"))).length, 2);
  await page.unroute("**/api/saved-items");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await mobile.getSavedItems()).cart.length).toBe(0);
  await expect.poll(async () => (await mobile.getSavedItems()).saved_for_later.length).toBe(2);
  console.log("A failed save request survives website restart and uploads both bag removal and saved selection after reconnection.");

  const guestItem = { id: "seed-ivory-linen-shirt", size: "M", variant: "Ivory", quantity: 1 };
  await page.evaluate(({ key, item }) => localStorage.setItem(key, JSON.stringify([item])), { key: savedForLaterKey(), item: guestItem });
  await page.reload();
  await expect.poll(async () => (await mobile.getSavedItems()).saved_for_later.some(line => line.id === guestItem.id)).toBe(true);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), savedForLaterKey()), null);
  console.log("Website guest selections merge into the signed-in account on login without changing Wishlist or checkout totals.");

  const concurrent = ["sync-extra-one", "sync-extra-two"].map(id => ({ ...medium, id }));
  const writes = await Promise.all(concurrent.map(item => call({ cart: [], wishlist: [], saved_for_later: [item] })));
  for (const result of writes) await json(result);
  account = await mobile.getSavedItems();
  for (const item of concurrent) assert.ok(account.saved_for_later.some(line => line.id === item.id));
  const noOp = await call({ cart: [], wishlist: [] }).then(result => json(result));
  assert.equal(noOp.revision, account.revision, "Older clients leave Saved for later untouched and do not create a write for no changes.");
  assert.equal(noOp.saved_for_later.length, account.saved_for_later.length);
  for (const value of [null, {}, [{ ...medium, quantity: 11 }], [{ ...medium, id: "../invalid" }], Array.from({ length: 101 }, () => medium)]) {
    await json(await call({ cart: [], wishlist: [], saved_for_later: value }), 400);
  }
  assert.equal((await fetch(`${base}/api/saved-items`)).status, 401);
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ email: "other-local-account@example.com", name: "Other local account", iat: now, exp: now + 3600 })).toString("base64url");
  const otherToken = `${claims}.${createHmac("sha256", "isolated-local-audit-not-a-production-secret").update(claims).digest("base64url")}`;
  const other = await fetch(`${base}/api/saved-items`, { headers: { Authorization: `Bearer ${otherToken}`, "X-Glamia-Mobile": "1" } }).then(result => json(result));
  assert.equal(other.saved_for_later.length, 0, "Another account cannot read these selections.");
  console.log("Concurrent edits, old-client compatibility, no-op write avoidance, input bounds, guest denial and account isolation passed.");
  assert.deepEqual(errors, []);
  await web.close();
} finally {
  if (browser) await browser.close();
  const current = await mobile.getSavedItems();
  const delta = savedItemChanges(current, initial);
  await mobile.patchSavedItems(delta.cart, delta.wishlist, delta.saved_for_later);
}
