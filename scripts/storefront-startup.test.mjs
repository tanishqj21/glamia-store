import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const entry = readFileSync('react-app/src/entry.js', 'utf8')
  .replace(/^import '\.\/[^']+\.css';\r?\n/gm, '')
  .replace("import('./main.jsx')", 'Promise.resolve({ mountApplication: mounted })');

test('public controls start on the next task even if animation frames do not run', async () => {
  let queued, ready = false;
  vm.runInNewContext(entry, {
    mounted: async () => { ready = true; },
    document: { querySelector: () => ({}), querySelectorAll: () => [], getElementById: () => ({ hasChildNodes: () => true }) },
    window: { setTimeout: (callback, delay) => { assert.equal(delay, 0); queued = callback; } },
    requestAnimationFrame: () => { assert.fail('Startup must not wait on a rendering frame'); },
    console,
  });
  assert.equal(ready, false);
  assert.equal(typeof queued, 'function');
  await queued();
  assert.equal(ready, true);
});

test('routes without a public server screen still start controls immediately', async () => {
  let ready = false;
  await vm.runInNewContext(entry, {
    mounted: async () => { ready = true; },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { setTimeout: () => { assert.fail('Private route startup must remain immediate'); } },
    console,
  });
  assert.equal(ready, true);
});
