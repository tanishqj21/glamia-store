// Synthetic QA documents only: never read a real customer's bill or identifiers.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createOrderBillPdf } from '../src/order-bills.js';

const fontBytes = await readFile(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url));
const logoBytes = await readFile(new URL('../public/glamia-g-favicon.png', import.meta.url));
const order = {
  id: 'synthetic-preview-order', order_number: 'GM-20261001-000001',
  customer_name: 'Aarav Sharma', customer_email: 'preview@example.com',
  subtotal: 1898, discount: 98, total: 1800, credits_used: 100, payable_total: 1700,
  payment_method: 'razorpay', payment_reference: 'pay_preview_not_a_real_payment',
  created_at: '2026-10-01 09:00:00', shipping: {
    line1: '24 Example Lane', line2: 'Apartment 302', city: 'New Delhi',
    state: 'Delhi', pin: '110001', country: 'India',
  },
};
const item = {
  name: 'Night suit', selection: 'Size M | Sage green', quantity: 2, gross: 1898,
  ready: true, code: '6108', codeType: 'HSN', rate: 5, taxable: 1714.29, tax: 85.71,
};
await mkdir('output/pdf', { recursive: true });
await mkdir('tmp/pdfs', { recursive: true });
const create = (purchase, lines, seller = { business_state: 'Delhi' }) => createOrderBillPdf({
  order: purchase, seller, lines, issuedAt: '2026-10-01 09:01:00', fontBytes, logoBytes,
});
await writeFile('output/pdf/glamia-bill-preview.pdf', await create(order, [item]));
await writeFile('tmp/pdfs/glamia-bill-multipage.pdf', await create({
  ...order, subtotal: 28470, discount: 0, total: 28470, credits_used: 0, payable_total: 28470,
}, Array.from({ length: 30 }, (_, i) => ({ ...item, name: `Night suit ${i + 1}`, quantity: 1, gross: 949, taxable: 903.81, tax: 45.19 }))));
await writeFile('tmp/pdfs/glamia-bill-long-fields.pdf', await create({
  ...order, customer_name: 'Aarav '.repeat(25),
  customer_email: 'very-long-preview-address-'.repeat(5) + '@example.com',
  payment_reference: 'preview_reference_'.repeat(30),
  shipping: { ...order.shipping, line1: 'Extended apartment and delivery address '.repeat(20) },
  subtotal: 3796, discount: 0, total: 3796, credits_used: 100, payable_total: 3696,
}, [{ ...item, name: 'Long product label '.repeat(55), selection: 'Size M | '.repeat(25) }, item]));
console.log('Generated synthetic single-page, multi-page and long-field bill QA PDFs.');
