import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

for (const [label, patch] of [
  ['name', { name: 'Renamed suit — Rose Pink' }],
  ['shared price', { price: 700 }],
  ['feature', { featured: true }],
  ['status', { status: 'hold' }],
  ['full editor save', { name: 'Renamed suit — Rose Pink', price: 700, mrp: 900, color: 'Rose Pink', featured: true }],
]) {
  test(`${label} edit preserves linked colourway names and identities`, async t => {
    const { db, env } = localDatabase();
    t.after(() => db.close());
    const rows = db.prepare('SELECT id FROM products LIMIT 3').all();
    assert.equal(rows.length, 3);
    const names = ['Night Suit — Rose Pink', 'Night Suit — Midnight Blue', 'Night Suit — Sage Green'];
    const colours = ['Rose Pink', 'Midnight Blue', 'Sage Green'];
    rows.forEach((row, index) => db.prepare("UPDATE products SET name=?,color=?,variant_group='name-test',status='live',price=600,mrp=900,what_in_box='1 suit',material='Cotton',variants_json='[]',cost_price=0 WHERE id=?").run(names[index], colours[index], row.id));
    const before = rows.map(row => db.prepare('SELECT * FROM products WHERE id=?').get(row.id));
    env.PRODUCT_IMAGES = { delete() { throw new Error('Unchanged images must be preserved'); } };
    const worker = await workerFunctions(['updateProduct']);
    const response = await worker.updateProduct(new Request('https://glamiastore.com/api/admin/products/' + rows[0].id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }), env, rows[0].id);
    assert.equal(response.status, 200, await response.clone().text());
    const after = rows.map(row => db.prepare('SELECT * FROM products WHERE id=?').get(row.id));
    assert.equal(after[0].name, patch.name || names[0]);
    for (let index = 1; index < rows.length; index++) {
      assert.equal(after[index].name, names[index]);
      for (const field of ['color', 'sizes_json', 'stock', 'image_url', 'images_json', 'thumbnail_url']) assert.equal(after[index][field], before[index][field], field);
      if (patch.price !== undefined) assert.equal(after[index].price, patch.price);
      if (patch.featured !== undefined) assert.equal(after[index].featured, 1);
      if (patch.status !== undefined) assert.equal(after[index].status, patch.status);
    }
  });
}

test('admin optimistic updates exclude names from fields copied to siblings', () => {
  const source = readFileSync('react-app/src/components/AdminWorkspace.jsx', 'utf8');
  const fields = JSON.parse('[' + source.match(/const SHARED_PRODUCT_FIELDS = \[([^]*?)\];/)[1] + ']');
  assert.ok(!fields.includes('name'));
  assert.ok(!fields.includes('video_url'));
  assert.ok(fields.includes('price'));
  assert.match(source, /Product name, colour, sizes, stock, images, and video stay specific/);
});
