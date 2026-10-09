// Audit the actual page using Lighthouse's unmodified mobile/desktop presets.
// Install the isolated tool with: npm install --prefix tmp/lighthouse-tool lighthouse
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const toolRoot = path.resolve('tmp/lighthouse-tool/node_modules');
const { default: lighthouse } = await import(pathToFileURL(path.join(toolRoot, 'lighthouse/core/index.js')));
const { launch } = await import(pathToFileURL(path.join(toolRoot, 'chrome-launcher/dist/index.js')));
const { default: desktopConfig } = await import(pathToFileURL(path.join(toolRoot, 'lighthouse/core/config/desktop-config.js')));
const [url = 'https://glamiastore.com/', device = 'mobile', label = 'audit'] = process.argv.slice(2);
if (!['mobile', 'desktop'].includes(device)) throw new Error('Use mobile or desktop');
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a lowercase report label');
const directory = path.resolve('tmp/lighthouse-reports');
await mkdir(directory, { recursive: true });
const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run'] });
try {
  const result = await lighthouse(url, { port: chrome.port, output: ['html', 'json'], logLevel: 'error' }, device === 'desktop' ? desktopConfig : undefined);
  if (result.lhr.runtimeError) throw new Error(JSON.stringify(result.lhr.runtimeError));
  const prefix = path.join(directory, `${label}-${device}`);
  await writeFile(`${prefix}.html`, result.report[0]);
  await writeFile(`${prefix}.json`, result.report[1]);
  const { lhr } = result;
  const summary = {
    url: lhr.finalDisplayedUrl, device, lighthouseVersion: lhr.lighthouseVersion,
    fetchedAt: lhr.fetchTime,
    scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)])),
    metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].map(id => [id, lhr.audits[id].displayValue])),
    warnings: lhr.runWarnings,
    failed: Object.values(lhr.audits).filter(audit => audit.score !== null && audit.score < 1).map(audit => ({
      id: audit.id, title: audit.title, score: audit.score, value: audit.displayValue,
      savings: audit.details?.overallSavingsMs,
      items: Array.isArray(audit.details?.items) ? audit.details.items.slice(0, 10) : audit.details?.items,
    })),
    report: `${prefix}.html`,
  };
  await writeFile(`${prefix}-summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, failed: summary.failed.map(({ items: _items, ...audit }) => audit) }, null, 2));
} finally {
  await chrome.kill();
}
