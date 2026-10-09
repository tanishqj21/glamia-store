// Built production UI with intercepted fixtures; never reads/writes live accounts.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = 'https://glamia-layout.test', publicRoot = resolve('public');
const manifest = JSON.parse(readFileSync('public/.vite/manifest.json', 'utf8'));
const entry = Object.values(manifest).find(item => item.isEntry);
const user = { id: 'fixture-owner', email: 'owner@example.test', name: 'Sachin Jain', role: 'admin', is_owner: true };
const profile = { ...user, first_name: 'Sachin', last_name: 'Jain', phones: [{ id: 'primary', country_code: '+91', phone_number: '9310220004', is_primary: true }] };
const errors = [], results = [];
mkdirSync('test-results/header-address-layout', { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1884, 980, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    context.setDefaultTimeout(12000);
    await context.addInitScript(() => localStorage.setItem('glamia-theme', 'dark'));
    let submitted = null;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        const path = url.pathname;
        let data = { stats: {}, totals: {}, recommendations: {}, products: [], categories: [], slides: [], orders: [], notifications: [], unread_count: 0, balance: 0 };
        if (path === '/api/session') data = { user, needs_profile_completion: false };
        if (path === '/api/profile') data = profile;
        if (path === '/api/addresses') {
          if (request.method() === 'POST') submitted = request.postDataJSON();
          data = { addresses: [] };
        }
        if (path === '/api/storefront-settings') data = { announcement: { visible: false }, seo: { title: 'Glamia' } };
        return route.fulfill({ json: data });
      }
      let file = resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
      if (relative(publicRoot, file).startsWith('..')) return route.abort();
      if (!existsSync(file) || !extname(file)) file = resolve(publicRoot, 'index.html');
      const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' }[extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/admin');
    await expect(page.locator('.admin-react-page')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View store', exact: true })).toHaveCount(0);
    // Public styles can finish late after navigating from the storefront.
    // Enforce the same layout in either stylesheet arrival order.
    await page.addStyleTag({ url: base + '/' + entry.css[0] });
    const tools = await page.locator('.admin-site-header .header-tools').boundingBox();
    const header = await page.locator('.admin-site-header').boundingBox();
    assert.ok(header.x + header.width - tools.x - tools.width <= 75, 'Admin profile tools must be at the right edge, not the middle');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const account = page.getByLabel('Open account menu', { exact: true });
    const more = page.getByLabel('Browse more admin sections', { exact: true });
    await account.click();
    await expect(page.locator('.account-menu')).toHaveAttribute('open', '');
    const panel = await page.locator('.account-menu-panel').boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= width);
    const frontmost = await page.locator('.account-menu-panel [href="/address"]').evaluate(node => {
      const box = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    assert.ok(frontmost, 'Profile links must not be covered by More sections');
    await page.keyboard.press('Escape');
    await expect(page.locator('.account-menu')).not.toHaveAttribute('open', '');
    await more.click();
    await expect(page.locator('.admin-nav-more')).toHaveAttribute('open', '');
    await account.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.account-menu')).toHaveAttribute('open', '');
    await expect(page.locator('.admin-nav-more')).not.toHaveAttribute('open', '');
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.admin-nav-more')).toHaveAttribute('open', '');
    await expect(page.locator('.account-menu')).not.toHaveAttribute('open', '');
    await account.click();
    await page.screenshot({ path: `test-results/header-address-layout/admin-header-${width}.png`, clip: { x: 0, y: 0, width, height: 420 } });
    await page.mouse.click(5, 450);
    await expect(page.locator('.account-menu')).not.toHaveAttribute('open', '');
    await account.click();
    await page.getByRole('menuitem', { name: 'Saved addresses', exact: true }).click();
    await expect(page.locator('.account-page h1')).toHaveText('Address book');
    const phone = page.locator('.account-form .phone-field');
    const country = phone.getByRole('combobox'), number = phone.getByRole('textbox');
    await expect(country.locator('option')).toHaveCount(245);
    await country.selectOption('+1:CA');
    await expect(country.locator('option:checked')).toHaveText('+1 · Canada');
    await number.fill('4165550123');
    await expect(country.locator('option:checked')).toHaveText('+1 · Canada');
    await country.selectOption('+7:KZ');
    await expect(country.locator('option:checked')).toHaveText('+7 · Kazakhstan');
    await country.selectOption('+63');
    await expect(country.locator('option:checked')).toHaveText('+63 · Philippines');
    await country.selectOption('+91');
    const countryBox = await country.boundingBox(), numberBox = await number.boundingBox();
    assert.ok(countryBox.width >= 100 && numberBox.width >= 120, 'Calling code and phone number must not be squeezed');
    const phoneBox = await phone.boundingBox();
    assert.ok(Math.abs(countryBox.height - numberBox.height) < 1, 'Phone controls must have matching heights');
    if (phoneBox.width < 560) {
      assert.ok(numberBox.y >= countryBox.y + countryBox.height + 7, 'Narrow phone fields must stack the number below the full country selector');
      assert.ok(Math.abs(countryBox.width - phoneBox.width) < 1, 'Narrow country selector must use the full field width');
    } else {
      assert.ok(Math.abs(countryBox.y - numberBox.y) < 1, 'Wide phone fields must align their controls');
    }
    assert.equal(await phone.locator('label').evaluate(node => node.querySelectorAll('input,select').length), 0, 'Phone label must not wrap two form controls');
    await number.fill('9876543210');
    await country.selectOption('+44');
    await expect(country.locator('option:checked')).toHaveText('+44 · UK');
    const countryFits = await country.evaluate(select => {
      const style = getComputedStyle(select);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = style.font;
      const textWidth = context.measureText(select.selectedOptions[0].label).width;
      // Reserve native dropdown arrow and the full horizontal padding.
      return textWidth + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 28 <= select.clientWidth;
    });
    assert.ok(countryFits, 'The complete +44 · UK label must fit without truncation');
    await expect(number).toHaveValue('9876543210');
    await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Local Test');
    await page.getByRole('textbox', { name: 'Address line', exact: true }).fill('10 Test Road');
    await page.getByRole('textbox', { name: 'City / town', exact: true }).fill('London');
    await page.getByRole('textbox', { name: 'State / region', exact: true }).fill('London');
    await page.getByRole('textbox', { name: 'Postal code', exact: true }).fill('SW1A 1AA');
    await page.getByRole('textbox', { name: 'Country', exact: true }).fill('United Kingdom');
    await page.locator('.account-columns').screenshot({ path: `test-results/header-address-layout/address-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const axe = await new AxeBuilder({ page }).include('.account-form').withTags(['wcag2a', 'wcag2aa']).analyze();
    assert.deepEqual(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact)).map(item => item.id), []);
    await page.getByRole('button', { name: 'Save address', exact: true }).click();
    await expect(page.getByText('Address saved to your account.', { exact: true })).toBeVisible();
    assert.equal(submitted.phone, '+44 9876543210');
    await expect(number).toHaveValue('');
    results.push({ width, tools, countryBox, numberBox });
    console.log(`PASS ${width}px: right-aligned admin tools, exclusive menus, visible profile links and address phone/save`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
