import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const base = process.env.CONSUMER_PREVIEW_URL || 'http://127.0.0.1:8081';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2kAAAAASUVORK5CYII=';
const product = { id: 'test-shirt', name: 'Local test shirt', brand: 'Glamia', category: 'Clothing', price: 1000, stock: 4, sizes: ['M'], size_stock: { M: 4 }, thumbnail_url: pixel, images: [pixel] };
const browser = await chromium.launch();
const errors = [];
try {
  for (const visible of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://glamiastore.com/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const data = path === '/api/hero' ? { slides: [] }
        : path === '/api/categories' ? { categories: [] }
          : path === '/api/products' ? { products: [product], pagination: { has_more: false } }
            : path === '/api/storefront-settings' ? {
              announcement: { visible, text: 'Local announcement', items: [] },
              trust_strip: { visible, items: [{ id: 'shipping', visible: true, title: 'Local delivery', body: 'Carefully packed' }] },
              socials: { instagram: visible ? 'https://instagram.com/glamia_local_test/' : '' },
              support_contact: { visible, country_code: '+91', phone_number: '9990116600' },
              cinematic_reel: { visible, eyebrow: 'Local reel', title: 'Selected pieces', emphasis: 'for you', description: 'Local reel copy', product_ids: ['test-shirt'] }
            } : {};
      return route.fulfill({ json: data });
    });
    await page.goto(base);
    await page.getByText('Explore as guest').click();
    await expect(page.getByText('Worth a closer look.')).toBeVisible();
    if (visible) {
      await expect(page.getByText('Local announcement')).toBeVisible();
      await expect(page.getByText('Local delivery')).toBeVisible();
      await expect(page.getByText('Carefully packed')).toBeVisible();
      await expect(page.getByText('Selected pieces')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Glamia on Instagram' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Call Glamia +919990116600' })).toBeVisible();
    } else {
      await expect(page.getByText('Local announcement')).toHaveCount(0);
      await expect(page.getByText('Local delivery')).toHaveCount(0);
      await expect(page.getByText('Selected pieces')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Glamia on Instagram' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Call Glamia +919990116600' })).toHaveCount(0);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await context.close();
    console.log(`PASS consumer settings visible=${visible}`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
