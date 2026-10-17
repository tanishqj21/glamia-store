import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.WIBRAWL_HEADER_TEST_URL || 'http://127.0.0.1:5174';
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
const output = 'tmp/wibrawl-header-hover-review';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch(), errors = [];
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(value => localStorage.setItem('glamia-theme', value), theme);
    if (local) await context.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const data = path === '/api/session' ? { user: null } : path === '/api/storefront-settings' ? { announcement: { visible: false }, trust_strip: { visible: false }, seo: {}, customer_experience: {} } : { products: [], categories: [], slides: [], cart: [], wishlist: [], saved_for_later: [], balance: 0, pagination: { has_more: false } };
      return route.fulfill({ json: data });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if(message.type()==='error' && /Content Security Policy/i.test(message.text()))errors.push(message.text()); });
    await page.goto(base);
    const link = page.locator('.quick-links .wibrawl-store-link');
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), 'https://wibrawl.glamiastore.com');
    assert.equal(await link.locator('svg').count(), 0);
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.mouse.move(0,500);
      await page.waitForTimeout(250);
      const idle=await link.evaluate(node=>{
        const pill=node.querySelector('.wibrawl-store-pill');
        return {background:getComputedStyle(node).backgroundColor,border:getComputedStyle(node).borderWidth,face:getComputedStyle(pill,'::after').backgroundColor,header:getComputedStyle(document.body).backgroundColor,halo:getComputedStyle(pill,'::before').opacity};
      });
      assert.equal(idle.background,'rgba(0, 0, 0, 0)','No outer shell fill');
      assert.equal(idle.border,'0px','No outer shell border');
      assert.equal(idle.face,idle.header,'Button blends into the header theme');
      assert.equal(idle.halo,'0','Lime glow is hidden at rest');
      await page.locator('.site-header').screenshot({path:`${output}/${theme}-${width}-idle.png`});
      const before = await link.boundingBox();
      await link.hover();
      await page.waitForTimeout(250);
      assert.deepEqual(await link.boundingBox(), before, 'Hover does not move the link');
      const style = await link.evaluate(node => {
        const css = getComputedStyle(node);
        const pill = node.querySelector('.wibrawl-store-pill');
        return { color: css.color, background: css.backgroundColor, radius: css.borderRadius, halo: getComputedStyle(pill, '::before').opacity, inner: getComputedStyle(pill).backgroundColor, textCase: css.textTransform };
      });
      assert.equal(style.background, 'rgba(0, 0, 0, 0)');
      assert.equal(style.color, theme==='light'?'rgb(21, 21, 21)':'rgb(244, 244, 244)');
      assert.equal(style.radius, '999px');
      assert.equal(style.halo, '1');
      assert.equal(style.inner, idle.header);
      assert.equal(style.textCase, 'none');
      // Production paints the server header before the interactive client mounts.
      await expect.poll(async()=>{
        await link.hover({position:{x:8,y:22}});
        const leftAngle=await link.evaluate(node=>parseFloat(node.style.getPropertyValue('--wibrawl-glow-angle')));
        await link.hover({position:{x:before.width-8,y:22}});
        const rightAngle=await link.evaluate(node=>parseFloat(node.style.getPropertyValue('--wibrawl-glow-angle')));
        return Math.abs(leftAngle-rightAngle);
      },{timeout:15000,message:'The edge highlight follows the pointer from left to right'}).toBeGreaterThan(150);
      const rightAngle=await link.evaluate(node=>parseFloat(node.style.getPropertyValue('--wibrawl-glow-angle')));
      assert.equal(await link.locator('.wibrawl-store-pill').evaluate(node=>parseFloat(getComputedStyle(node).getPropertyValue('--wibrawl-glow-angle'))),rightAngle);
      await link.hover({position:{x:8,y:12}});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      const best = await page.getByRole('link', { name: 'Best sellers', exact: true }).boundingBox();
      const mark = await page.locator('.site-header .wordmark').boundingBox();
      assert.ok(best.x + best.width < before.x && before.x + before.width < mark.x, 'Header links remain separated from the wordmark');
      await page.locator('.site-header').screenshot({ path: `${output}/${theme}-${width}-hover.png` });
    }
    const axe = await new AxeBuilder({ page }).include('.quick-links').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(violation => violation.id), []);
    await page.mouse.move(0, 500);
    await page.keyboard.press('Tab');
    await link.focus();
    await page.waitForTimeout(250);
    assert.equal(await link.evaluate(node => node.matches(':focus-visible')), true);
    assert.equal(await link.evaluate(node => getComputedStyle(node).outlineColor), 'rgb(0, 200, 255)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await link.evaluate(node => getComputedStyle(node).transitionDuration.split(',').every(value => parseFloat(value) <= .001)));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await link.isVisible(), false, 'Existing mobile header layout is preserved');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Wibrawl pill hover, keyboard focus, contrast, reduced motion, link destination and responsive Glamia header passed.');
} finally { await browser.close(); }
