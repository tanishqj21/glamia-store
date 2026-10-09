// Built production dialog, intercepted local fixtures only. Never submits refunds.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = 'https://glamia-return-dialog.test', root = resolve('public');
const output = 'test-results/admin-return-dialog';
mkdirSync(output, { recursive: true });
const owner = { id: 'fixture-owner', name: 'Local owner', email: 'owner@example.test', role: 'admin', is_owner: true };
const order = { id: 'local-order', order_number: 'GM-LOCAL-00004', total: 949, customer_name: 'Meera Shah' };
const selected = [{ line_id: 'local-line', product_name: 'Night suit — Sage green', size: 'M', quantity: 1 }];
const errors = [], writes = [];
const browser = await chromium.launch();
try {
  for (const [width, theme] of [[1440, 'dark'], [1440, 'light'], [390, 'dark'], [320, 'light']]) {
    let record = { id: 'local-return', order_id: order.id, order, customer_name: 'Meera Shah', customer_email: 'buyer@example.test', type: 'refund', status: 'requested', reason: 'The fit was not right for me. Please arrange a return pickup.', refund_destination: 'original', refund_amount: 949, selected_items_json: JSON.stringify(selected), logistics_json: '{}', created_at: '2026-10-06T09:00:00Z', label_available: false };
    let failSave = false, failComplete = false, completionGate;
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    context.setDefaultTimeout(12000);
    await context.addInitScript(theme => localStorage.setItem('glamia-theme', theme), theme);
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        let data = { stats: {}, totals: {}, notifications: [], unread_count: 0, balance: 0, orders: [], requests: [], products: [], categories: [], slides: [], events: [] };
        if (url.pathname === '/api/session') data = { user: owner, needs_profile_completion: false };
        if (url.pathname === '/api/returns') data = { requests: [record], gateway_refunds_enabled: true };
        if (!['GET', 'HEAD'].includes(req.method())) {
          if (url.pathname === '/api/analytics/track') return route.fulfill({ json: { ok: true } });
          writes.push(url.pathname);
          assert.ok(!url.pathname.includes('/refund/'), 'No refund execution permitted');
          if (url.pathname.endsWith('/complete')) {
            if(failComplete) return route.fulfill({status:500,json:{error:'Local completion failed. Try again.'}});
            if(completionGate) await completionGate;
            const body=req.postDataJSON();assert.equal(body.acknowledge,true);assert.ok(body.reason.trim().length>=10);
            record={...record,case_completed_at:'2026-10-07T12:30:00Z',case_completed_by:owner.email,case_completion_reason:body.reason};
            return route.fulfill({json:{request:record}});
          }
          if (url.pathname.endsWith('/logistics')) {
            if (failSave) return route.fulfill({ status: 500, json: { error: 'Local save failed. Try again.' } });
            const body = req.postDataJSON();
            record = { ...record, logistics_json: JSON.stringify(body), label_available: Boolean(body.carrier && body.tracking_number) };
            return route.fulfill({ json: { request: record } });
          }
          if (url.pathname === '/api/admin/returns/local-return') {
            record = { ...record, status: req.postDataJSON().status };
            return route.fulfill({ json: { request: record } });
          }
          return route.fulfill({ status: 409, json: { error: 'Fixture action blocked.' } });
        }
        return route.fulfill({ json: data });
      }
      let file = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (relative(root, file).startsWith('..')) return route.abort();
      if (!existsSync(file) || !extname(file)) file = resolve(root, 'index.html');
      const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' }[extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/admin/returns');
    const opener = page.getByRole('button', { name: 'Manage request / approval', exact: true });
    await opener.click();
    const modal = page.getByRole('dialog', { name: 'Manage return', exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Pickup, label and customer instructions', exact: true })).toBeVisible();
    await expect(modal.getByLabel('Courier', { exact: true })).toBeVisible();
    await expect(modal.getByLabel('Return shipping progress')).toBeVisible();
    assert.equal(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'No modal overflow');
    const close = modal.getByRole('button', { name: 'Close', exact: true });
    const closeBox = await close.boundingBox();
    assert.ok(closeBox.height >= 42 && closeBox.height <= 50, 'Close button must stay compact rather than stretch');
    const body = modal.locator('.return-manage-body');
    assert.equal(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'No horizontal clipping in the scrollable form');
    await body.evaluate(el => { el.scrollTop = 0; });
    await modal.screenshot({ path: `${output}/request-${width}-${theme}.png` });
    const axe = await new AxeBuilder({ page }).include('.admin-return-modal').withTags(['wcag2a', 'wcag2aa']).analyze();
    assert.deepEqual(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], 'Dialog accessibility');
    const instructions = modal.getByRole('textbox', { name: 'Return instructions', exact: true });
    await instructions.fill('Pack securely and attach the return label.');
    await modal.getByLabel('Courier', { exact: true }).fill('Local courier');
    await modal.getByLabel('Return tracking number', { exact: true }).fill('RETURN-LOCAL-0001');
    await modal.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('Not a PDF') });
    await expect(modal.getByRole('alert').filter({ hasText: 'Choose a PDF label up to 2 MB' })).toBeVisible();
    failSave = true;
    await modal.getByRole('button', { name: 'Save return instructions', exact: true }).click();
    await expect(modal.getByRole('alert').filter({ hasText: 'Local save failed' })).toBeVisible();
    await expect(instructions).toHaveValue('Pack securely and attach the return label.');
    failSave = false;
    await modal.getByRole('button', { name: 'Save return instructions', exact: true }).click();
    await expect(modal.getByText('Return instructions saved', { exact: true })).toBeVisible();
    await expect(modal.getByRole('link', { name: 'Download return label (PDF)' })).toBeVisible();
    assert.equal(record.status, 'requested', 'Saving logistics must not approve the return');
    await modal.getByRole('button', { name: 'Approve request', exact: true }).click();
    await expect(modal.locator('.return-manage-status')).toHaveText('approved');
    await expect(modal.getByRole('button', { name: 'Approve request', exact: true })).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Mark picked up by courier', exact: true })).toBeEnabled();
    await body.evaluate(el => { el.scrollTop = 0; });
    await modal.screenshot({ path: `${output}/approved-${width}-${theme}.png` });
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(opener).toBeFocused();
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
    // Immediate exchanges have no approval action; closed requests have no pickup action.
    record = { ...record, type: 'exchange', status: 'approved', replacement_fulfilment_mode: 'immediate', replacement_order_number: 'GM-LOCAL-REPLACEMENT' };
    await page.reload();
    await opener.click();
    const exchange = page.getByRole('dialog', { name: 'Manage exchange', exact: true });
    await expect(exchange.getByText('₹0 replacement', { exact: true })).toBeVisible();
    await expect(exchange.getByRole('button', { name: 'Approve request', exact: true })).toHaveCount(0);
    await exchange.getByRole('button', { name: 'Close', exact: true }).click();
    record = { ...record, status: 'completed', pickup_confirmed_at: '2026-10-06T10:00:00Z', returned_at: '2026-10-07T10:00:00Z' };
    await page.reload();
    await opener.click();
    await expect(exchange.locator('.return-manage-status')).toHaveText('completed');
    await expect(exchange.locator('.return-manage-progress .is-done')).toHaveCount(4);
    await expect(exchange.getByRole('button', { name: 'Mark picked up by courier', exact: true })).toHaveCount(0);
    await exchange.getByRole('button', { name: 'Close', exact: true }).click();
    // Complaint closure remains available even while a provider refund locks the
    // lifecycle dropdown. Failed saves retain the reason; closure never pays.
    record={...record,type:'refund',status:'received',gateway_refund:{state:'reconciliation_required',provider:'phonepe',total:949,gateway_amount:949,credit_amount:0,last_error:'REFUND_TRANSACTION_NOT_FOUND'}};
    await page.reload();
    await expect(page.getByLabel('Update request local-return')).toBeDisabled();
    const completionOpener=page.getByRole('button',{name:'Mark complaint completed',exact:true});
    await completionOpener.click();
    const completionPanel=page.locator('#complaint-completion-local-return');
    await expect(completionPanel).toBeVisible();
    await expect(modal).toHaveCount(0);
    const completionReason=completionPanel.getByRole('textbox',{name:'Internal completion reason',exact:true});
    await expect(completionReason).toBeFocused();
    const writesBeforeCancel=writes.length;
    await completionPanel.getByRole('button',{name:'Cancel completion',exact:true}).click();
    await expect(completionPanel).toBeHidden();
    assert.equal(writes.length,writesBeforeCancel,'Opening and cancelling must not mutate the request');
    await completionOpener.focus();await page.keyboard.press('Enter');
    await expect(completionPanel).toBeVisible();
    await expect(completionReason).toBeFocused();
    const confirmation=completionPanel.getByRole('checkbox');
    const complete=completionPanel.getByRole('button',{name:'Confirm complaint completed',exact:true});
    await expect(complete).toBeDisabled();
    await completionReason.fill('Resolved with customer after reviewing the provider refund.');
    await expect(complete).toBeDisabled();
    await confirmation.check();
    await completionPanel.screenshot({path:`${output}/complaint-form-${width}-${theme}.png`});
    assert.equal(await completionPanel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'No inline form overflow');
    const formAxe=await new AxeBuilder({page}).include('#complaint-completion-local-return').withTags(['wcag2a','wcag2aa']).analyze();
    assert.deepEqual(formAxe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
    failComplete=true;await complete.click();
    await expect(completionPanel.getByRole('alert').filter({hasText:'Local completion failed'})).toBeVisible();
    await expect(completionReason).toHaveValue('Resolved with customer after reviewing the provider refund.');
    failComplete=false;let releaseCompletion;
    completionGate=new Promise(resolve=>{releaseCompletion=resolve;});
    const writesBeforeComplete=writes.length;
    await complete.click();
    await expect(completionPanel.getByRole('button',{name:'Completing complaint…',exact:true})).toBeDisabled();
    await expect(completionPanel.getByRole('button',{name:'Cancel completion',exact:true})).toBeDisabled();
    await completionOpener.click();
    await expect(completionPanel).toBeVisible();
    assert.equal(writes.length,writesBeforeComplete+1,'In-flight completion stays mounted and is submitted only once');
    releaseCompletion();
    await expect(page.locator('.operation-actions .status-pill')).toHaveText('Complaint completed');
    await expect(completionPanel.getByRole('heading',{name:'Complaint completed',exact:true})).toBeVisible();
    assert.equal(record.status,'received');assert.equal(record.gateway_refund.state,'reconciliation_required');
    assert.equal(await completionPanel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await completionPanel.screenshot({path:`${output}/complaint-completed-${width}-${theme}.png`});
    const completedAxe=await new AxeBuilder({page}).include('#complaint-completion-local-return').withTags(['wcag2a','wcag2aa']).analyze();
    assert.deepEqual(completedAxe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
    await expect(page.getByRole('button',{name:'Mark complaint completed',exact:true})).toHaveCount(0);
    await page.getByRole('combobox',{name:/^Show/}).selectOption('completed');
    await expect(opener).toBeVisible();
    await page.getByRole('combobox',{name:/^Show/}).selectOption('received');
    await expect(opener).toHaveCount(0);
    console.log(`PASS return dialog ${width}/${theme}: modal management, inline completion by click/keyboard, cancellation, accessibility, failed-save preservation and financial state unchanged`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
