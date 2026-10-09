import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Checkout audit is local-only.');
const item = { id: 'seed-ivory-linen-shirt', size: 'M', quantity: 1 };
const methods = [{ id: 'razorpay', label: 'Razorpay', description: 'Cards and UPI' }];
const browser = await chromium.launch();
const errors = [];
let unexpectedPayments = 0;

async function checkoutPage({ paymentMethods = null, productSoldOut = false, paymentResponse = null, settingsFailure = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(cart => localStorage.setItem('glamia-react-cart', JSON.stringify(cart)), [item]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/api/storefront-settings*', async route => {
    if (settingsFailure) return route.fulfill({ status: 503, json: { error: 'Local settings outage' } });
    const response = await route.fetch();
    const data = await response.json();
    if (paymentMethods) data.payments.methods = paymentMethods;
    await route.fulfill({ json: data });
  });
  if (productSoldOut) await context.route('**/api/products/seed-ivory-linen-shirt', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.product.stock = 0;
    await route.fulfill({ json: data });
  });
  await context.route('**/api/payments/create', route => {
    if (!paymentResponse) { unexpectedPayments++; return route.fulfill({ status: 409, json: { error: 'Unexpected payment request' } }); }
    return route.fulfill(paymentResponse);
  });
  await page.goto(`${base}/checkout`);
  await page.getByRole('heading', { name: 'Delivery details' }).waitFor();
  await expect(page.getByText('Checking stock and payment availability…')).toHaveCount(0);
  return { context, page };
}

try {
  const actual = await fetch(`${base}/api/storefront-settings`).then(response => response.json());
  assert.deepEqual(actual.payments.methods, [], 'Isolated Worker must have no real provider credentials.');
  const disabled = await checkoutPage();
  await expect(disabled.page.getByText('Live payment is not configured yet. Please contact support for help.')).toBeVisible();
  await expect(disabled.page.getByRole('button', { name: /Pay securely/ })).toBeDisabled();
  await disabled.context.close();

  const outage = await checkoutPage({ settingsFailure: true });
  await expect(outage.page.getByText('Payment availability could not be checked. Please refresh to retry.')).toBeVisible();
  await expect(outage.page.getByRole('button', { name: /Pay securely/ })).toBeDisabled();
  await outage.context.close();

  const soldOut = await checkoutPage({ paymentMethods: methods, productSoldOut: true });
  await expect(soldOut.page.getByText('Some items are no longer available in the requested quantity.')).toBeVisible();
  await expect(soldOut.page.getByRole('button', { name: /Pay securely/ })).toBeDisabled();
  await soldOut.context.close();

  const providerError = await checkoutPage({ paymentMethods: methods, paymentResponse: { status: 503, json: { error: 'Local provider unavailable' } } });
  const page = providerError.page;
  await page.getByLabel('Email for order updates').fill('checkout-local@example.com');
  await page.getByLabel('Full name').fill('Local Shopper');
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('9990116600');
  await page.getByLabel('Address line').fill('Local test lane');
  await page.getByLabel('City / town').fill('New Delhi');
  await page.getByLabel('State / region').fill('Delhi');
  await page.getByLabel('Postal / ZIP code').fill('110001');
  await page.getByRole('button', { name: /Pay securely/ }).click();
  await expect(page.getByText('Local provider unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay securely/ })).toBeEnabled();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('glamia-react-cart'))), [item]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await providerError.context.close();

  const rejected = await fetch(`${base}/api/payments/create`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-Requested-With': 'Glamia' }, body: JSON.stringify({ items: [item], payment_method: 'razorpay', checkout_token: 'LOCALCHECKOUTTOKEN12345', email: 'local@example.com', address: { name: 'Local Shopper', phone: '+919990116600', line1: 'Local test lane', city: 'Delhi', country: 'India' } }) });
  assert.equal(rejected.status, 409, 'Server must reject payment creation when the provider is not configured.');
  assert.equal(unexpectedPayments, 0);
  assert.deepEqual(errors, []);
  console.log('Checkout local UI/server checks passed: no-gateway, settings outage, sold-out stock, provider error recovery, cart retention, narrow layout, and server gateway guard. No charge attempted.');
} finally {
  await browser.close();
}
