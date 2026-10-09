// Screenshots of actual local release UI. All API traffic is mocked; no live writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const base = 'http://127.0.0.1:5193';
const output = 'test-results/return-ui-showcase';
await mkdir(output, { recursive: true });
const order = { id: 'demo-order', order_number: 'GM-DEMO-RETURN-001', customer_email: 'buyer@example.com', customer_name: 'Meera Shah', status: 'delivered', payment_status: 'paid', payment_method: 'phonepe', total: 949.5, created_at: '2026-10-01T10:00:00Z', bill_available: true, items: [{ id: 'demo-product', name: 'Night suit — Sage green', size: 'M', quantity: 1 }] };
const request = { id: 'demo-return', order_id: order.id, order, customer_email: order.customer_email, customer_name: order.customer_name, type: 'refund', status: 'received', reason: 'The fit was not right for me.', refund_destination: 'original', refund_amount: 949.5, created_at: '2026-10-02T08:00:00Z', returned_at: '2026-10-03T08:00:00Z', label_available: true, selected_items_json: JSON.stringify([{ line_id: 'demo-line', product_name: 'Night suit — Sage green', size: 'M', quantity: 1 }]), logistics_json: JSON.stringify({ carrier: 'Demo courier', tracking_number: 'DEMO-RETURN-001', pickup_status: 'delivered', pickup_at: '2026-10-03T04:30:00Z', instructions: 'Pack the item securely and attach the return label. Keep the courier handover receipt.', inspection_note: 'Returned item received and inspection completed.' }), gateway_refund: { state: 'pending', total: 949.5, gateway_amount: 849.5, credit_amount: 100, provider: 'phonepe', provider_refund_id: 'DEMO-REFUND-001', checked_at: '2026-10-03T08:15:00Z' }, automatic_refund_requested_at: '2026-10-03T08:00:00Z' };
const browser = await chromium.launch();
const errors = [];
try {
  for (const [role, width, state] of [['buyer',1440,'pending'],['buyer',1440,'processed'],['buyer',390,'pending'],['admin',1440,'pending']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('glamia-theme', 'light'));
    const fixture = structuredClone(request);
    fixture.gateway_refund.state = state;
    if (state === 'processed') { fixture.status = 'refunded'; fixture.order.payment_status = 'refunded'; }
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/session') return route.fulfill({ json: { user: { id: 'demo-user', email: role==='admin'?'owner@example.com':'buyer@example.com', name: role==='admin'?'Demo owner':'Meera Shah', role: role==='admin'?'admin':'buyer', is_owner: role==='admin' }, needs_profile_completion: false } });
      if (url.pathname === '/api/orders') return route.fulfill({ json: { orders: [fixture.order] } });
      if (url.pathname === '/api/returns') return route.fulfill({ json: { requests: [fixture], gateway_refunds_enabled: true, automatic_gateway_refunds_enabled: true } });
      return route.fulfill({ json: { stats: {}, products: [], categories: [], notifications: [], requests: [], orders: [], unread: 0, balance: 0, settings: {} } });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base+(role==='admin'?'/admin/returns':'/orders'));
    let target;
    if (role==='admin') {
      target = page.locator('.admin-panel').filter({ has: page.getByRole('heading',{name:'Returns and exchanges',exact:true}) });
      await expect(target).toBeVisible();
      await page.getByText('Pickup, label and customer instructions',{exact:true}).click();
      await expect(page.getByRole('button',{name:'Save return instructions',exact:true})).toBeVisible();
    } else {
      target = page.locator('.refund-tracker');
      await expect(target.getByRole('heading',{name: state==='processed'?'Refund confirmed':'Provider processing',exact:true})).toBeVisible();
      await expect(target.getByText('Download return label',{exact:true})).toBeVisible();
      if (state==='processed') await expect(target.getByText('Download refund receipt',{exact:true})).toBeVisible();
    }
    await expect(page.locator('#initial-loader')).toHaveCount(0);
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    await target.screenshot({path:`${output}/${role}-${width}-${state}.png`,animations:'disabled'});
    console.log(`Captured ${role}-${width}-${state}`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
