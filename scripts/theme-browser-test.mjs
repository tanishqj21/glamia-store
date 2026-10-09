import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Theme tests require a local server.');
const routes = ['/', '/admin/employees', '/admin/coupons', '/admin/tax', '/admin/notifications'];
const errors = [];
const browser = await chromium.launch();
try {
  for (const theme of ['dark', 'light']) {
    // Authenticate against the isolated demo rather than reading production signing secrets.
    const response = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
    assert.equal(response.status, 302, 'Enable demo admin on the isolated local Worker.');
    const [name, ...value] = response.headers.get('set-cookie').split(';', 1)[0].split('=');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name, value: value.join('='), url: base }]);
    await context.addInitScript(value => localStorage.setItem('glamia-theme', value), theme);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${theme}: ${error.message}`));
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.locator('h1').first().waitFor();
      await page.waitForFunction(() => !/Preparing your|Loading product|Loading collection/.test(document.querySelector('#main-content')?.textContent || ''));
      assert.equal(new URL(page.url()).pathname, route, 'Admin checks must not silently redirect.');
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const issues = axe.violations.filter(issue => ['serious', 'critical'].includes(issue.impact));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      console.log(`${theme} ${route}: overflow=${overflow}, accessibility=${issues.map(issue => issue.id).join(',') || 'pass'}`);
      for (const issue of issues) errors.push(`${theme} ${route}: ${issue.id}: ${issue.nodes.map(node => node.target.join(' ') + ': ' + node.failureSummary).join('; ')}`);
      if (overflow) errors.push(`${theme} ${route}: horizontal overflow`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
console.log('Passed 10 mobile light/dark theme checks.');
