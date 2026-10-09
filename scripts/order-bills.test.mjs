import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName } from 'pdf-lib';
import { canReadOrderBill, createOrderBillPdf } from '../src/order-bills.js';

test('bill access requires the account owner, an admin, or the order tracking token', () => {
  const order = { customer_email: 'buyer@example.com', tracking_token: 'private-order-token' };
  assert.equal(canReadOrderBill(order, null), false);
  assert.equal(canReadOrderBill(order, { email: 'other@example.com' }), false);
  assert.equal(canReadOrderBill(order, null, 'wrong-token'), false);
  assert.equal(canReadOrderBill(order, { email: 'BUYER@example.com' }), true);
  assert.equal(canReadOrderBill(order, { role: 'admin' }), true);
  assert.equal(canReadOrderBill(order, null, 'private-order-token'), true);
});

test('downloadable bills are valid PDFs with readable purchase metadata and pagination', async () => {
  const bytes = await createOrderBillPdf({
    order: { id:'test-order', order_number:'GM-TEST-001', customer_name:'Zoë Test', customer_email:'buyer@example.com',
      subtotal:30000, discount:300, total:29700, credits_used:100, payable_total:29600, payment_method:'razorpay',
      payment_reference:'pay_test_reference', created_at:'2026-10-01 09:00:00', shipping:{city:'New Delhi',state:'Delhi',pin:'110001'} },
    issuedAt:'2026-10-01 09:01:00', fontBytes:readFileSync(new URL('../public/fonts/NotoSans-Regular.ttf',import.meta.url)),
    lines:Array.from({length:30},(_,i)=>({name:`Item ${i+1}: Night suit`,selection:'Sage green · Size M',quantity:1,gross:1000,ready:true,code:'6108',codeType:'HSN',rate:5,taxable:950,tax:50}))
  });
  assert.equal(Buffer.from(bytes).subarray(0,4).toString(),'%PDF');
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount()>1);
  assert.equal(doc.getTitle(),'Glamia bill GM-TEST-001');
  assert.equal(doc.getAuthor(),'Glamia');
});

const fontBytes = readFileSync(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url));
const logoBytes = readFileSync(new URL('../public/glamia-g-favicon.png', import.meta.url));
const previewOrder = {
  id: 'layout-order', order_number: 'GM-20261001-000001', customer_name: 'Aarav Sharma',
  customer_email: 'preview@example.com', subtotal: 1898, discount: 98, total: 1800,
  credits_used: 100, payable_total: 1700, payment_method: 'razorpay', payment_reference: 'pay_preview_reference',
  created_at: '2026-10-01 09:00:00', shipping: {
    line1: '24 Example Lane', line2: 'Apartment 302', city: 'New Delhi', state: 'Delhi', pin: '110001', country: 'India',
  },
};
const previewLine = { name: 'Night suit', selection: 'Size M | Sage green', quantity: 2,
  gross: 1898, ready: true, code: '6108', codeType: 'HSN', rate: 5, taxable: 1714.29, tax: 85.71 };
const bill = (order, lines, seller = {}) => createOrderBillPdf({
  order, lines, seller, fontBytes, logoBytes, issuedAt: '2026-10-01 09:01:00',
});

test('normal one-item bill including discount and split payment stays on one A4 page', async () => {
  const doc = await PDFDocument.load(await bill(previewOrder, [previewLine], { business_state: 'Delhi' }));
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 595.28, height: 841.89 });
  const objects = doc.getPage(0).node.Resources().lookup(PDFName.of('XObject'));
  assert.ok(objects?.keys().length > 0, 'The actual Glamia logo must be embedded, not replaced with text.');
});

test('long persisted names, references and addresses paginate without failing generation', async () => {
  const doc = await PDFDocument.load(await bill({
    ...previewOrder, customer_name: 'Zoë '.repeat(150), customer_email: 'long-unbroken-email'.repeat(15) + '@example.com',
    payment_reference: 'long_gateway_reference_'.repeat(100),
    shipping: { ...previewOrder.shipping, line1: 'Long apartment address '.repeat(200) },
  }, [{ ...previewLine, name: 'Long product name '.repeat(250), selection: 'Size M | Sage green '.repeat(50) }]));
  assert.ok(doc.getPageCount() > 2);
});

test('wallet-only and zero-value completed bills retain valid one-page PDFs', async () => {
  for (const total of [0, 1898]) {
    const order = { ...previewOrder, total, subtotal: total, discount: 0, credits_used: total,
      payable_total: 0, payment_method: 'store_credit', payment_reference: null };
    const doc = await PDFDocument.load(await bill(order, [{ ...previewLine, gross: total, ready: false }]));
    assert.equal(doc.getPageCount(), 1);
  }
});
