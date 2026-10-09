// Exercise the consumer UI against local fixtures; never mutate the live Glamia backend.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const base = process.env.CONSUMER_PREVIEW_URL || "http://127.0.0.1:8081";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = new URL("../glamia-shoppers-app/.expo/ui-checks/", import.meta.url);
await mkdir(output, { recursive: true });
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2kAAAAASUVORK5CYII=";
const product = { id: "test-shirt", name: "Everyday cotton shirt", brand: "Glamia", category: "Clothing", price: 1000, stock: 10, sizes: ["M", "L"], size_stock: { M: 6, L: 4 }, thumbnail_url: pixel, images: [pixel] };
const medium = { id: product.id, size: "M", variant: "Plum", quantity: 2 };
const large = { ...medium, size: "L", quantity: 1 };
const errors = [];
const mutations = [];
const browser = await chromium.launch({ headless: true });

async function preparePage(context, cart = [medium, large]) {
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://glamiastore.com/api/**", async route => {
    const request = route.request();
    if (request.method() !== "GET") mutations.push(request.method() + " " + request.url());
    const path = new URL(request.url()).pathname;
    const data = path === "/api/hero" ? { slides: [] }
      : path === "/api/categories" ? { categories: [{ name: "Clothing" }, { name: "Accessories" }] }
        : path === "/api/products" ? { products: [product], pagination: { has_more: false, page: 1 } }
          : path.endsWith("/reviews") ? { reviews: [] }
            : path === "/api/products/test-shirt" ? { product }
              : path === "/api/storefront-settings" ? { announcement: { visible: false }, active_event: null }
                : {};
    await route.fulfill({ json: data });
  });
  await page.addInitScript(({ cart, id }) => {
    if (!sessionStorage.getItem("ui-fixtures-seeded")) {
      localStorage.setItem("glamia_store_cart", JSON.stringify(cart));
      localStorage.setItem("glamia_store_wishlist", JSON.stringify([id]));
      sessionStorage.setItem("ui-fixtures-seeded", "1");
    }
  }, { cart, id: product.id });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Explore as guest", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Home", exact: true })).toBeVisible();
  return page;
}

async function touchSwipe(page, from, to) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from[0], y: from[1] }] });
  for (let step = 1; step <= 12; step++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from[0] + (to[0] - from[0]) * step / 12, y: from[1] + (to[1] - from[1]) * step / 12 }] });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

async function sampleAnimation(page, testId, action) {
  const frames = page.evaluate(testId => new Promise(resolve => {
    const frames = [];
    const start = performance.now();
    function frame() {
      const node = document.querySelector(`[data-testid="${testId}"]`);
      if (node) frames.push({ opacity: Number(getComputedStyle(node).opacity), x: node.getBoundingClientRect().x });
      if (performance.now() - start < 650) requestAnimationFrame(frame);
      else resolve(frames);
    }
    requestAnimationFrame(frame);
  }), testId);
  await action();
  return frames;
}

async function settle(page, testId) {
  await expect.poll(() => page.getByTestId(testId).evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1);
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await preparePage(context);
  const menuButton = page.getByRole("button", { name: "Open categories menu" });
  assert.deepEqual(await menuButton.evaluate(node => { const s = getComputedStyle(node); return [s.borderTopWidth, s.borderRadius, s.backgroundColor]; }), ["0px", "0px", "rgba(0, 0, 0, 0)"]);
  await touchSwipe(page, [10, 320], [180, 325]);
  await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wishlist", exact: true })).toBeVisible();
  await expect(page.getByText("Saved pieces", { exact: true })).toHaveCount(0);
  await touchSwipe(page, [170, 550], [172, 360]);
  await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL("menu-light.png", output)) });
  await touchSwipe(page, [260, 330], [60, 333]);
  await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeHidden();
  const navFrames = await sampleAnimation(page, "bottom-nav-indicator", () => page.getByRole("tab", { name: "Bag", exact: true }).click());
  assert.ok(new Set(navFrames.map(frame => Math.round(frame.x))).size > 4, "Navigation bubble should travel through intermediate positions");
  await expect(page.getByRole("button", { name: "Continue to payment · ₹3,000", exact: true })).toBeVisible();
  const themeFrames = await sampleAnimation(page, "theme-transition", () => page.getByRole("button", { name: "Switch to dark mode" }).click());
  assert.ok(themeFrames.some(frame => frame.opacity < 0.7), "Theme should crossfade rather than change in one frame");
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).first().click();
  await expect(page.getByText("Remove from bag?", { exact: true })).toBeVisible();
  await settle(page, "cart-removal-dialog");
  await page.screenshot({ path: fileURLToPath(new URL("removal-dark.png", output)) });
  await page.getByRole("button", { name: "Keep in bag", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue to payment · ₹3,000", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Decrease quantity of ${product.name}` }).first().click();
  await expect(page.getByRole("button", { name: "Continue to payment · ₹2,000", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Decrease quantity of ${product.name}` }).first().click();
  await expect(page.getByText("Remove from bag?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel removal", exact: true }).click();
  await page.getByRole("button", { name: `Increase quantity of ${product.name}` }).first().click();
  await page.getByRole("button", { name: "Remove", exact: true }).first().click();
  await page.getByRole("button", { name: "Save for later", exact: true }).click();
  await expect(page.getByTestId("saved-later-test-shirt-M")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to payment · ₹1,000", exact: true })).toBeVisible();
  const stored = await page.evaluate(() => ({ cart: JSON.parse(localStorage.getItem("glamia_store_cart")), saved: JSON.parse(localStorage.getItem("glamia_store_saved_for_later:guest")), wishlist: JSON.parse(localStorage.getItem("glamia_store_wishlist")) }));
  assert.deepEqual(stored, { cart: [large], saved: [medium], wishlist: [product.id] });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Explore as guest", exact: true }).click();
  await page.getByRole("tab", { name: "Bag", exact: true }).click();
  await expect(page.getByTestId("saved-later-test-shirt-M")).toBeVisible();
  await settle(page, "tab-content");
  await page.screenshot({ path: fileURLToPath(new URL("saved-later-dark.png", output)) });
  await page.getByRole("button", { name: `Move ${product.name} to bag`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue to payment · ₹3,000", exact: true })).toBeVisible();
  await expect(page.getByTestId("saved-later-test-shirt-M")).toHaveCount(0);
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await page.getByRole("button", { name: "Remove item", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue to payment · ₹1,000", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Save ${product.name} for later`, exact: true }).click();
  await expect(page.getByText("Your bag is waiting.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("saved-later-test-shirt-L")).toBeVisible();
  await page.getByRole("tab", { name: "Explore", exact: true }).click();
  await page.getByRole("button", { name: "Open categories menu" }).click();
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await expect(page.getByText("Wishlist", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove ${product.name} from wishlist`, exact: true })).toBeVisible();
  await context.close();

  const failureContext = await browser.newContext({ viewport: { width: 320, height: 740 } });
  const failurePage = await preparePage(failureContext, [medium]);
  await failurePage.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("glamia_store_saved_for_later:")) throw new Error("Storage quota test");
      return setItem.call(this, key, value);
    };
  });
  await failurePage.getByRole("tab", { name: "Bag", exact: true }).click();
  await failurePage.getByRole("button", { name: "Remove", exact: true }).click();
  await failurePage.getByRole("button", { name: "Save for later", exact: true }).click();
  await expect(failurePage.getByText(/It is still in your bag/)).toBeVisible();
  assert.deepEqual(await failurePage.evaluate(() => JSON.parse(localStorage.getItem("glamia_store_cart"))), [medium]);
  await failurePage.getByRole("button", { name: "Keep in bag", exact: true }).click();
  await settle(failurePage, "tab-content");
  await failurePage.screenshot({ path: fileURLToPath(new URL("bag-narrow.png", output)) });
  assert.equal(await failurePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Narrow phone layout should not overflow");
  await failureContext.close();

  const reduceContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const reducePage = await preparePage(reduceContext, []);
  await reducePage.getByRole("tab", { name: "Bag", exact: true }).click();
  const reducedFrames = await sampleAnimation(reducePage, "theme-transition", () => reducePage.getByRole("button", { name: "Switch to dark mode" }).click());
  assert.ok(reducedFrames.every(frame => frame.opacity === 1), "Reduced motion must skip the theme animation");
  await reduceContext.close();
  assert.deepEqual(errors, [], `Unexpected runtime errors: ${errors.join("; ")}`);
  assert.deepEqual(mutations, [], "Guest UI checks should never write to the backend");
  console.log("Consumer UI checks passed: wishlist, touch drawer, sliding navigation, theme/reduced motion, cart confirmation, saved selections/persistence, failed storage and narrow layout.");
} finally {
  await browser.close();
}
