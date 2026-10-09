// Sequential, fresh-browser Lighthouse runs. Report every result, not only the best.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [url = 'https://glamiastore.com/', countValue = '3', label = 'series'] = process.argv.slice(2);
const count = Number(countValue);
if (!Number.isInteger(count) || count < 1 || count > 5) throw Error('Use 1–5 repetitions');
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Use a lowercase report label');
if (!['http:', 'https:'].includes(new URL(url).protocol)) throw Error('Use an HTTP URL');
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
const runs = [];
const median = values => {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function audit(device, runLabel) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/lighthouse-audit.mjs', url, device, runLabel], { windowsHide: true });
    let diagnostics = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-8000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(Error(`Lighthouse exited ${code}: ${diagnostics}`)));
  });
  const prefix = path.resolve('tmp/lighthouse-reports', `${runLabel}-${device}`);
  const summary = JSON.parse(await readFile(`${prefix}-summary.json`, 'utf8'));
  const raw = JSON.parse(await readFile(`${prefix}.json`, 'utf8'));
  const run = {
    ...summary,
    entryScripts: raw.audits['network-requests'].details.items.filter(item => item.resourceType === 'Script' && /\/assets\/index-/.test(item.url)).map(item => item.url),
    environment: raw.environment,
    settings: { formFactor: raw.configSettings.formFactor, throttlingMethod: raw.configSettings.throttlingMethod, throttling: raw.configSettings.throttling },
  };
  runs.push(run);
  console.log(JSON.stringify({ run: runLabel, device, scores: run.scores, metrics: run.metrics, entryScripts: run.entryScripts, warnings: run.warnings }));
}

for (let attempt = 1; attempt <= count; attempt++) {
  for (const device of ['mobile', 'desktop']) await audit(device, `${label}-run-${attempt}`);
}
const devices = Object.fromEntries(['mobile', 'desktop'].map(device => {
  const results = runs.filter(run => run.device === device);
  return [device, {
    median: Object.fromEntries(categories.map(category => [category, median(results.map(run => run.scores[category]))])),
    range: Object.fromEntries(categories.map(category => [category, { min: Math.min(...results.map(run => run.scores[category])), max: Math.max(...results.map(run => run.scores[category])) }])),
    allRunsGood: results.every(run => categories.every(category => run.scores[category] >= 90)),
    allRuns100: results.every(run => categories.every(category => run.scores[category] === 100)),
  }];
}));
const report = { url, repetitionsPerDevice: count, finishedAt: new Date().toISOString(), devices, runs };
const output = path.resolve('tmp/lighthouse-reports', `${label}-series.json`);
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: output, devices }, null, 2));
