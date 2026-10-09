// Run: node --test scripts/checkout-regression.test.mjs
// Start the isolated Worker separately with scripts/audit/wrangler.jsonc on 8788.
// UI cases bundle the real source in memory; provider responses are intercepted.
// The final case exercises real local API rejection paths without gateway secrets.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

const base = process.env.CHECKOUT_TEST_URL || "http://127.0.0.1:8788";
const target = new URL(base);
assert.equal(target.origin, "http://127.0.0.1:8788", "Checkout regressions require the isolated audit Worker at 127.0.0.1:8788.");
const product = { id: "audit-product", name: "Audit dress", status: "live", price: 500, stock: 8, sizes: ["M", "L"], size_stock: { M: 5, L: 3 } };
const address = { id: "home", name: "Audit Shopper", phone: "+91 9876543210", line1: "10 Audit Road", line2: "", city: "Pune", state: "Maharashtra", pin: "411001", country: "India", isDefault: true };
const methods = [{ id: "razorpay" }, { id: "phonepe" }];
const cart = [{ id: product.id, size: "M", quantity: 1 }];
const razorResponse = { razorpay_order_id: "gateway-order", razorpay_payment_id: "test-payment", razorpay_signature: "test-signature" };
const razorStub = `window.Razorpay = class {
  constructor(options) { window.__razorOptions = options; }
  on(name, handler) { if (name === 'payment.failed') window.__razorFailed = handler; }
  open() { if (window.__throwOpen) throw new Error('Checkout could not open'); window.__razorOpened = (window.__razorOpened || 0) + 1; }
};`;
let browser;
let html;

before(async () => {
  const response = await fetch(`${base}/api/storefront-settings`);
  assert.equal(response.status, 200, "Start the local isolated Worker first.");
  assert.deepEqual((await response.json()).payments.methods, [], "The audit Worker must have no live payment credentials.");
  const bundle = await build({
    absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
    stdin: { loader: "jsx", resolveDir: fileURLToPath(new URL("../", import.meta.url)), contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {CheckoutPage} from './react-app/src/components/CheckoutPage.jsx';
      function Harness() {
        const [config, setConfig] = useState(window.__fixture);
        const [coupon, setCoupon] = useState(config.appliedCoupon || null);
        window.__updateCheckout = patch => setConfig(current => ({...current, ...patch}));
        window.__checkoutState = {cart: config.cart, coupon};
        return <CheckoutPage {...config}
          appliedCoupon={coupon} onCouponApplied={setCoupon} onCouponRemoved={() => setCoupon(null)}
          onNavigate={path => {window.__navigation = path;}}
          onOrderPlaced={() => {window.__placed = (window.__placed || 0) + 1; setConfig(current => ({...current, cart: []})); setCoupon(null);}} />;
      }
      createRoot(document.getElementById('root')).render(<Harness />);
    ` },
    bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  });
  html = `<!doctype html><html><head><meta charset="utf-8"><title>Local checkout regression</title></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body></html>`;
  browser = await chromium.launch();
});

after(async () => { await browser?.close(); });

async function mount(t, scenario = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  const outbound = [];
  const fixture = { cart, products: [product], user: null, addresses: [], ...scenario.props };
  await context.addInitScript(({ fixture, storage }) => {
    window.__fixture = fixture;
    for (const [key, value] of Object.entries(storage || {})) sessionStorage.setItem(key, JSON.stringify(value));
  }, { fixture, storage: scenario.storage });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== target.origin) { outbound.push(url.href); await route.abort(); return; }
    if (url.pathname === "/__checkout-audit") { await route.fulfill({ contentType: "text/html", body: html }); return; }
    if (url.pathname === "/__razorpay.js") {
      const result = await scenario.script?.();
      await route.fulfill({ status: result?.status || 200, contentType: "text/javascript", body: result?.body ?? razorStub });
      return;
    }
    if (!url.pathname.startsWith("/api/")) { await route.fulfill({ status: 404, body: "Local test route not found" }); return; }
    const body = request.postDataJSON();
    requests.push({ path: url.pathname, search: url.search, body });
    let result;
    if (url.pathname === "/api/storefront-settings") result = scenario.settings || { body: { payments: { methods } } };
    else if (url.pathname.startsWith("/api/products/")) result = scenario.catalog || { body: { product: scenario.product || product } };
    else if (url.pathname === "/api/coupons/available") result = { body: { coupons: [] } };
    else if (url.pathname === "/api/loyalty") result = { body: { balance: 0, referral_reward: 50, referred_reward: 100 } };
    else if (url.pathname === "/api/coupons/validate") result = await scenario.coupon?.(body) || { status: 400, body: { error: "That coupon code is not valid" } };
    else if (url.pathname === "/api/payments/create") result = await scenario.create?.(body) || { status: 503, body: { error: "Local provider unavailable" } };
    else if (url.pathname === "/api/payments/razorpay/verify") result = await scenario.verify?.(body) || { status: 202, body: { payment_status: "authorized", order: { id: "audit-order", payment_status: "authorized" } } };
    else if (url.pathname === "/api/payments/phonepe/status") result = await scenario.status?.(url) || { status: 202, body: { payment_status: "pending" } };
    else throw new Error(`Unexpected local request: ${url.pathname}`);
    await route.fulfill({ status: result.status || 200, contentType: "application/json", body: JSON.stringify(result.body || {}) });
  });
  t.after(async () => {
    await context.close();
    // Deliberately failed script loads generate a browser console message.
    assert.deepEqual(errors.filter((error) => !error.startsWith("Failed to load resource:")), [], "No React errors or unhandled browser exceptions.");
    assert.deepEqual(outbound, [], "No requests may reach external services.");
  });
  await page.goto(`${base}/__checkout-audit${scenario.query || ""}`);
  await page.getByRole("heading", { name: "Delivery details" }).waitFor();
  await expect(page.getByText("Checking stock and payment availability…")).toHaveCount(0);
  return { page, requests, pay: page.locator('button[form="checkout-delivery-form"]') };
}

async function fillDelivery(page) {
  await page.getByLabel("Email for order updates").fill("audit@example.com");
  await page.getByLabel("Full name", { exact: true }).fill("  Audit Shopper  ");
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill("9876543210");
  await page.getByLabel("Address line", { exact: true }).fill("  10 Audit Road  ");
  await page.getByLabel("City / town").fill("Pune");
}

const created = (payment = {}) => ({ status: 201, body: { order: { id: "audit-order", order_number: "AUD-1" }, payment: { provider: "razorpay", key_id: "local-key", order_id: "gateway-order", amount: 50000, currency: "INR", checkout_script: `${base}/__razorpay.js`, ...payment } } });
const pendingPhonePe = { provider: "phonepe", orderId: "audit-order", checkoutToken: "local-checkout-token-123456" };

test("paid confirmation offers the bill immediately, including guest token access; missing bills stay explicit", async t => {
  for (const billAvailable of [true, false]) {
    const { page, pay } = await mount(t, {
      create: () => ({ body: { payment_status: "paid", order: { id: "audit-order", order_number: "GM-AUDIT-001", payment_status: "paid", status: "confirmed", bill_available: billAvailable, tracking_token: "guest-token&private" } } }),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await fillDelivery(page);
    await pay.click();
    await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
    const download = page.getByRole("link", { name: "Download bill", exact: true });
    if (billAvailable) {
      await expect(download).toBeVisible();
      assert.equal(await download.getAttribute("href"), "/api/orders/audit-order/bill?token=guest-token%26private");
      assert.notEqual(await download.getAttribute("download"), null);
    } else {
      await expect(download).toHaveCount(0);
      await expect(page.getByText(/Your bill is being prepared/)).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Continue shopping" })).toBeVisible();
  }
});

test("coupon and delivery forms are independent; remove keeps the bag; Pay validates delivery", async (t) => {
  const { page, requests, pay } = await mount(t, { coupon: () => ({ body: { code: "SAVE50", discount: 50 } }) });
  assert.equal(await page.locator("form form").count(), 0);
  assert.equal(await page.locator("form").count(), 2);
  await page.getByLabel("Coupon code", { exact: true }).fill("save50");
  await page.getByLabel("Coupon code", { exact: true }).press("Enter");
  await expect(page.locator(".coupon-applied")).toContainText("SAVE50");
  await expect(pay).toContainText("450");
  assert.equal(requests.filter((request) => request.path === "/api/payments/create").length, 0);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  assert.equal((await page.evaluate(() => window.__checkoutState.cart)).length, 1);
  await pay.click();
  assert.equal(requests.filter((request) => request.path === "/api/payments/create").length, 0);
  assert.equal(await page.locator('input[name="email"]').evaluate((input) => input.validity.valueMissing), true);
  await fillDelivery(page);
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("Local provider unavailable");
  const payload = requests.find((request) => request.path === "/api/payments/create").body;
  assert.equal(payload.email, "audit@example.com");
  assert.equal(payload.address.name, "Audit Shopper");
  assert.equal(payload.address.line1, "10 Audit Road");
  assert.match(payload.checkout_token, /^[A-Za-z0-9_-]{16,120}$/);
  await expect(pay).toBeEnabled();
});

test("whitelisted coupon exemption is shown clearly and retains the applied discount", async t => {
  const { page, pay, requests } = await mount(t, { coupon: () => ({ body: {
    code: 'TEST', discount: 50, admin_exempt: true, allow_store_credits: true
  } }) });
  await page.getByLabel('Coupon code', { exact: true }).fill('TEST');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Whitelisted admin: coupon restrictions waived.');
  await expect(pay).toContainText('450');
  assert.equal(requests.some(request => request.path === '/api/payments/create'), false);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test("invalid coupons and signed-out coupon failures remain visible without creating payments", async (t) => {
  const { page, requests } = await mount(t, { coupon: () => ({ status: 401, body: { error: "Sign in to use a coupon" } }) });
  await page.getByLabel("Coupon code", { exact: true }).fill("BAD");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Sign in to use a coupon");
  assert.equal(requests.some((request) => request.path === "/api/payments/create"), false);
});

test("whitespace address, invalid phone and invalid guest email never start payment", async (t) => {
  const { page, requests, pay } = await mount(t);
  await fillDelivery(page);
  await page.getByLabel("Full name", { exact: true }).fill("   ");
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("Fill every required address field");
  await page.getByLabel("Full name", { exact: true }).fill("Audit Shopper");
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill("abcdefg");
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("Enter a valid mobile number");
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill("9876543210");
  await page.getByLabel("Email for order updates").fill("shopper@glamia.local");
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("Enter a valid email");
  assert.equal(requests.some((request) => request.path === "/api/payments/create"), false);
});

test("saved addresses support numeric IDs and preserve a typed new address on account refresh", async (t) => {
  const saved = { ...address, id: 42 };
  const { page, pay, requests } = await mount(t, { props: { user: { email: "member@example.com" }, addresses: [saved, { ...address, id: 43, name: "Office Shopper", isDefault: false }] } });
  await expect(page.locator(".selected-address-note")).toContainText("Audit Shopper");
  await page.locator('#saved-checkout-address').selectOption("43");
  await expect(page.locator(".selected-address-note")).toContainText("Office Shopper");
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("Local provider unavailable");
  assert.equal(requests.find((request) => request.path === "/api/payments/create").body.address.name, "Office Shopper");
  await page.getByRole("button", { name: "Use new", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("New address draft");
  await page.evaluate((saved) => window.__updateCheckout({ addresses: [{ ...saved }] }), saved);
  await expect(page.locator('#saved-checkout-address')).toHaveValue("new");
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("New address draft");
});

test("address omission does not reset user input or cause a render loop", async (t) => {
  const { page } = await mount(t, { props: { addresses: undefined } });
  await fillDelivery(page);
  await page.getByLabel("City / town").fill("Mumbai");
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("  Audit Shopper  ");
});

for (const [name, props, nextProduct, catalog] of [
  ["empty cart", { cart: [] }],
  ["deleted product", {}, null, { status: 404 }],
  ["unpublished product", {}, { ...product, status: "draft" }],
  ["missing required size", { cart: [{ id: product.id, quantity: 1 }] }],
  ["invalid size", { cart: [{ id: product.id, size: "XXL", quantity: 1 }] }],
  ["fractional quantity", { cart: [{ ...cart[0], quantity: 1.5 }] }],
  ["quantity above server limit", { cart: [{ ...cart[0], quantity: 1001 }] }],
  ["sold-out size", {}, { ...product, size_stock: { M: 0, L: 3 } }],
  ["duplicate lines exceed size stock", { cart: [{ ...cart[0], quantity: 3 }, { ...cart[0], quantity: 3 }] }],
  ["different sizes exceed shared product stock", { cart: [{ ...cart[0], quantity: 3 }, { ...cart[0], size: "L", quantity: 3 }] }, { ...product, stock: 5 }],
  ["different sizes exceed preorder capacity", { cart: [{ ...cart[0], quantity: 2 }, { ...cart[0], size: "L", quantity: 2 }] }, { ...product, preorder_enabled: true, preorder_limit: 3, preorder_sold: 0 }],
]) {
  test(`${name} disables payment`, async (t) => {
    const { pay, requests } = await mount(t, { props, product: nextProduct, catalog });
    await expect(pay).toBeDisabled();
    assert.equal(requests.some((request) => request.path === "/api/payments/create"), false);
  });
}

test("unlimited preorder can be purchased with zero on-hand stock", async (t) => {
  const { page, pay } = await mount(t, { product: { ...product, stock: 0, size_stock: { M: 0 }, preorder_enabled: true, preorder_limit: null } });
  await expect(pay).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "pre-order" })).toContainText("Payment is collected now");
});

for (const [name, scenario] of [
  ["no configured payment provider", { settings: { body: { payments: { methods: [] } } } }],
  ["unknown payment provider", { settings: { body: { payments: { methods: [{ id: "cash" }] } } } }],
  ["catalog check failure", { catalog: { status: 500 } }],
  ["payment availability failure", { settings: { status: 500 } }],
]) {
  test(`${name} disables checkout`, async (t) => {
    const { pay } = await mount(t, scenario);
    await expect(pay).toBeDisabled();
  });
}

test("unchanged Razorpay retries reuse the token; address, coupon and provider changes rotate it", async (t) => {
  const { page, pay, requests } = await mount(t, { create: () => created(), coupon: () => ({ body: { code: "SAVE50", discount: 50 } }) });
  await fillDelivery(page);
  await pay.click();
  await page.waitForFunction(() => !!window.__razorOptions);
  await page.evaluate(() => window.__razorOptions.modal.ondismiss());
  await expect(pay).toBeEnabled();
  await pay.click();
  await page.waitForFunction(() => window.__razorOpened === 2);
  await page.evaluate(() => window.__razorOptions.modal.ondismiss());
  let creates = requests.filter((request) => request.path === "/api/payments/create");
  assert.equal(creates[0].body.checkout_token, creates[1].body.checkout_token);
  await page.getByLabel("City / town").fill("Mumbai");
  await pay.click();
  await page.waitForFunction(() => window.__razorOpened === 3);
  await page.evaluate(() => window.__razorOptions.modal.ondismiss());
  await page.getByLabel("Coupon code", { exact: true }).fill("SAVE50");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".coupon-applied")).toContainText("SAVE50");
  await pay.click();
  await page.waitForFunction(() => window.__razorOpened === 4);
  await page.evaluate(() => window.__razorOptions.modal.ondismiss());
  await page.getByRole("radio", { name: /PhonePe/ }).check();
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("Payment could not be started");
  creates = requests.filter((request) => request.path === "/api/payments/create");
  assert.notEqual(creates[1].body.checkout_token, creates[2].body.checkout_token);
  assert.notEqual(creates[2].body.checkout_token, creates[3].body.checkout_token);
  assert.notEqual(creates[3].body.checkout_token, creates[4].body.checkout_token);
  assert.equal(creates[3].body.coupon, "SAVE50");
  assert.equal(creates[4].body.payment_method, "phonepe");
});

test("failed Razorpay SDK loads are removable and retry successfully", async (t) => {
  let loads = 0;
  const { page, pay } = await mount(t, { create: () => created(), script: () => ++loads === 1 ? { status: 503, body: "Unavailable" } : { body: razorStub } });
  await fillDelivery(page);
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("Razorpay checkout could not be loaded");
  await expect(pay).toBeEnabled();
  assert.equal(await page.locator("script[data-glamia-razorpay]").count(), 0);
  await pay.click();
  await page.waitForFunction(() => window.__razorOpened === 1);
  assert.equal(loads, 2);
});

test("Razorpay constructor/open failure releases busy state; unverified payment.failed reuses the attempt", async (t) => {
  const { page, pay, requests } = await mount(t, { create: () => created() });
  await fillDelivery(page);
  await page.evaluate((source) => { eval(source); window.__throwOpen = true; }, razorStub);
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("Checkout could not open");
  await expect(pay).toBeEnabled();
  await page.evaluate(() => { window.__throwOpen = false; });
  await pay.click();
  await page.waitForFunction(() => !!window.__razorOpened);
  await page.evaluate(() => window.__razorFailed());
  await expect(pay).toBeEnabled();
  await pay.click();
  await page.waitForFunction(() => window.__razorOpened === 2);
  const creates = requests.filter((request) => request.path === "/api/payments/create");
  assert.equal(creates[1].body.checkout_token, creates[2].body.checkout_token, "Only a verified terminal failure may create a new attempt");
});

test("Razorpay authorized status survives refresh and retries verification without a second order", async (t) => {
  let verifications = 0;
  const { page, pay, requests } = await mount(t, {
    create: () => created(),
    verify: () => ++verifications < 3 ? { status: 202, body: { payment_status: "authorized" } } : { body: { payment_status: "paid", order: { id: "audit-order", payment_status: "paid", status: "confirmed" } } },
  });
  await fillDelivery(page);
  await pay.click();
  await page.waitForFunction(() => !!window.__razorOptions);
  await page.evaluate((response) => window.__razorOptions.handler(response), razorResponse);
  await expect(pay).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check payment status" })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("still being confirmed");
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  assert.equal(requests.filter((request) => request.path === "/api/payments/create").length, 1);
  assert.equal(await page.evaluate(() => window.__placed), 1);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("glamia-checkout-pending")), null);
});

test("claimed paid status without a paid order never clears the bag", async (t) => {
  const { page, pay } = await mount(t, { create: () => created(), verify: () => ({ body: { payment_status: "paid", order: null } }) });
  await fillDelivery(page);
  await pay.click();
  await page.waitForFunction(() => !!window.__razorOptions);
  await page.evaluate((response) => window.__razorOptions.handler(response), razorResponse);
  await expect(page.getByRole("alert")).toContainText("not been confirmed");
  assert.equal(await page.getByRole("heading", { name: "Order placed" }).count(), 0);
  assert.equal((await page.evaluate(() => window.__checkoutState.cart)).length, 1);
  await expect(pay).toBeDisabled();
});

test("PhonePe pending/error status keeps its token across refresh and confirms even with an empty cart", async (t) => {
  let checks = 0;
  const { page, pay, requests } = await mount(t, {
    props: { cart: [] }, storage: { "glamia-phonepe-pending": { orderId: pendingPhonePe.orderId, checkoutToken: pendingPhonePe.checkoutToken } },
    query: "?phonepe_return=audit-order",
    status: () => ++checks === 1 ? { status: 502, body: { error: "PhonePe status unavailable" } } : checks < 4 ? { status: 202, body: { payment_status: "pending" } } : { body: { payment_status: "paid", order: { id: "audit-order", status: "confirmed", payment_status: "paid" } } },
  });
  await expect(page.getByRole("alert")).toContainText("PhonePe status unavailable");
  assert.notEqual(await page.evaluate(() => sessionStorage.getItem("glamia-phonepe-pending")), null);
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(page.getByRole("alert")).toContainText("still being confirmed");
  await expect(pay).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("still being confirmed");
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  assert.equal(await page.evaluate(() => sessionStorage.getItem("glamia-phonepe-pending")), null);
  assert.equal(requests.filter((request) => request.path === "/api/payments/create").length, 0);
  assert.ok(requests.filter((request) => request.path === "/api/payments/phonepe/status").every((request) => new URLSearchParams(request.search).get("checkout_token") === pendingPhonePe.checkoutToken));
});

test("PhonePe terminal failure clears pending state and enables retry", async (t) => {
  const { page, pay } = await mount(t, { storage: { "glamia-checkout-pending": pendingPhonePe }, status: () => ({ body: { payment_status: "failed", order: { id: "audit-order", status: "cancelled", payment_status: "failed" } } }) });
  await expect(page.getByRole("alert")).toContainText("did not complete");
  await expect(pay).toBeEnabled();
  assert.equal(await page.evaluate(() => sessionStorage.getItem("glamia-checkout-pending")), null);
});

test("PhonePe return automatically retries transient failure and pending, then confirms without another charge", async (t) => {
  let checks = 0;
  const {page, requests} = await mount(t, {
    storage: {"glamia-checkout-pending": pendingPhonePe},
    query: "?phonepe_return=audit-order&checkout_token=local-checkout-token-123456",
    status: () => ++checks === 1 ? {status:502,body:{error:'Temporary status outage'}} : checks === 2 ? {status:202,body:{payment_status:'pending'}} : {body:{payment_status:'paid',order:{id:'audit-order',payment_status:'paid',status:'confirmed',bill_available:true,tracking_token:'local-bill-token'}}}
  });
  await expect(page.getByRole('region',{name:'Payment confirmation'})).toBeVisible();
  assert.equal(await page.getByRole('heading',{name:'Order placed'}).count(),0);
  assert.equal((await page.evaluate(()=>window.__checkoutState.cart)).length,1);
  await expect(page.getByRole('heading',{name:'Order placed'})).toBeVisible({timeout:12000});
  assert.equal(checks,3); assert.equal(await page.evaluate(()=>window.__placed),1);
  assert.equal(requests.filter(r=>r.path==='/api/payments/create').length,0);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('glamia-checkout-pending')),null);
  await expect(page.getByRole('link',{name:'Download bill'})).toHaveAttribute('href',/token=local-bill-token/);
});

test("Razorpay authorization updates automatically without a second checkout; rerenders do not restart polling", async (t) => {
  let checks = 0;
  const {page,pay,requests} = await mount(t, {create:()=>created(), verify:()=> ++checks < 3 ? {status:202,body:{payment_status:'authorized'}} : {body:{payment_status:'paid',order:{id:'audit-order',payment_status:'paid',status:'confirmed'}}}});
  await fillDelivery(page); await pay.click(); await page.waitForFunction(()=>!!window.__razorOptions);
  await page.evaluate(response=>window.__razorOptions.handler(response),razorResponse);
  await expect(page.getByRole('alert')).toContainText('still being confirmed');
  await page.evaluate(()=>window.__updateCheckout({products:[...window.__fixture.products]}));
  await expect(pay).toBeDisabled(); assert.equal(checks,1);
  await expect(page.getByRole('heading',{name:'Order placed'})).toBeVisible({timeout:12000});
  assert.equal(checks,3); assert.equal(requests.filter(r=>r.path==='/api/payments/create').length,1);
  assert.equal(await page.evaluate(()=>window.__placed),1);
});

test("invalid PhonePe redirect URL remains local and releases busy state", async (t) => {
  const { page, pay } = await mount(t, { create: () => created({ provider: "phonepe", checkout_url: "javascript:alert('invalid')" }) });
  await fillDelivery(page);
  await page.getByRole("radio", { name: /PhonePe/ }).check();
  await pay.click();
  await expect(page.getByRole("alert")).toContainText("invalid checkout URL");
  await expect(pay).toBeEnabled();
  assert.equal(new URL(page.url()).origin, target.origin);
});

test("real isolated Worker rejects malformed checkout, disabled gateways and unauthorized coupons", async () => {
  const settings = await fetch(`${base}/api/storefront-settings`).then((response) => response.json());
  assert.deepEqual(settings.payments.methods, [], "Never exercise create with configured live providers.");
  const catalog = await fetch(`${base}/api/products`).then((response) => response.json());
  assert.ok(catalog.products.length);
  const localProduct = catalog.products[0];
  const payload = { items: [{ id: localProduct.id, quantity: 1, size: localProduct.sizes?.[0] || "" }], address, email: "audit@example.com", checkout_token: "local-regression-token-123456", payment_method: "razorpay" };
  async function post(path, body) {
    const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "Glamia", Origin: base }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  for (const [patch, pattern] of [
    [{ items: [] }, /cart is empty/i],
    [{ items: [{ id: localProduct.id, quantity: 1.5 }] }, /whole number/i],
    [{ address: { ...address, name: " " } }, /required address/i],
    [{ address: { ...address, phone: "letters" } }, /valid mobile/i],
    [{ payment_method: "cash" }, /Choose a valid payment method/i],
  ]) {
    const result = await post("/api/payments/create", { ...payload, ...patch });
    assert.equal(result.status, 400);
    assert.match(result.body.error, pattern);
  }
  for (const payment_method of ["razorpay", "phonepe"]) {
    const result = await post("/api/payments/create", { ...payload, payment_method });
    assert.equal(result.status, 409);
    assert.match(result.body.error, /not configured/i);
  }
  const coupon = await post("/api/coupons/validate", { code: "INVALID-AUDIT", items: payload.items });
  assert.equal(coupon.status, 401);
  const verify = await post("/api/payments/razorpay/verify", { order_id: "nonexistent-local-order", checkout_token: payload.checkout_token });
  assert.equal(verify.status, 404);
  const status = await fetch(`${base}/api/payments/phonepe/status?order_id=nonexistent-local-order&checkout_token=${payload.checkout_token}`);
  assert.equal(status.status, 404);
  const unchanged = await fetch(`${base}/api/products/${encodeURIComponent(localProduct.id)}`).then((response) => response.json());
  assert.equal(unchanged.product.stock, localProduct.stock, "Rejected checkouts must not consume stock.");
});
