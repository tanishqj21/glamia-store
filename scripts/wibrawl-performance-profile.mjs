// Read-only measurements of the deployed UI. Isolated guest sessions block
// production API writes. Keep other browser benchmarks idle during this run.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base = 'https://wibrawl.glamiastore.com', label = 'after'] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid output label');
mkdirSync('tmp/wibrawl-performance-review', { recursive: true });
const browser = await chromium.launch(), reports = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
    await context.addInitScript(() => {
      window.__wbCommits = 0;
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true, renderers: new Map(), inject(renderer) { this.renderers.set(1, renderer); return 1; },
        onCommitFiberRoot() { window.__wbCommits++; }, onCommitFiberUnmount() {}, onScheduleFiberRoot() {}, checkDCE() {},
      };
    });
    await context.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 204 }));
    const page = await context.newPage(), session = await context.newCDPSession(page);
    await session.send('Performance.enable'); await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(base); await page.locator('.wb-account-trigger:not(:disabled)').waitFor(); await page.waitForLoadState('networkidle');
    const before = await session.send('Performance.getMetrics');
    const initial = await page.evaluate(() => ({ commits: window.__wbCommits, nodes: document.querySelectorAll('*').length, images: document.images.length }));
    await page.waitForTimeout(6200);
    const after = await session.send('Performance.getMetrics');
    const summary = {
      width, initial, idleRootCommits: await page.evaluate(() => window.__wbCommits) - initial.commits,
      idleMetrics: Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'].map(name => [name, after.metrics.find(metric => metric.name === name).value - before.metrics.find(metric => metric.name === name).value])),
      images: await page.evaluate(() => performance.getEntriesByType('resource').filter(resource => resource.initiatorType === 'img').map(resource => ({ url: resource.name.split('/').pop(), bytes: resource.encodedBodySize, duration: Math.round(resource.duration) }))),
      blur: await page.evaluate(() => [...document.querySelectorAll('*')].filter(element => getComputedStyle(element).backdropFilter !== 'none').length),
    };
    reports.push(summary); console.log(JSON.stringify(summary)); await context.close();
  }
} finally {
  await browser.close(); writeFileSync(`tmp/wibrawl-performance-review/profile-${label}.json`, JSON.stringify(reports, null, 2));
}
