import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { linkedSpecificationCopy } from '../src/product-trust.js';

test('shared lines update while each colourway keeps its own colour and product line', () => {
  const own = { name: 'Blue suit', color: 'Blue', specifications: 'Product name: Blue suit\nColor: Navy blue\nMaterial: Cotton' };
  assert.equal(linkedSpecificationCopy('Product: Pink suit\nColour: Rose Pink\nMaterial: Fleece\nCare: Hand wash', own), 'Product name: Blue suit\nColor: Navy blue\nMaterial: Fleece\nCare: Hand wash');
});

test('missing identity lines use the sibling identity and removal cannot delete its own lines', () => {
  assert.equal(linkedSpecificationCopy('Name: Pink suit\nColourway: Pink', { name: 'Green suit', color: 'Green' }), 'Name: Green suit\nColourway: Green');
  assert.equal(linkedSpecificationCopy('Care: Hand wash', { specifications: 'Product: Blue suit\r\nColour: Blue\r\nCare: Dry clean' }), 'Care: Hand wash\nProduct: Blue suit\nColour: Blue');
});

for (const [label, patch] of [
  ['specification edit', { specifications: 'Product: Edited rose suit\nColour: Dusty Rose\nMaterial: Fleece\nCare: Hand wash' }],
  ['unrelated price edit', { price: 700 }],
  ['unrelated feature edit', { featured: true }],
]) {
  test(`${label} cannot overwrite sibling-specific specification lines`, async t => {
    const { db, env } = localDatabase(); t.after(() => db.close());
    const rows = db.prepare('SELECT id FROM products LIMIT 3').all();
    const colours = ['Rose Pink', 'Midnight Blue', 'Sage Green'];
    rows.forEach((row, index) => db.prepare("UPDATE products SET name=?,color=?,specifications=?,variant_group='spec-test',status='live',price=600,mrp=900,what_in_box='1 suit',material='Cotton',variants_json='[]',cost_price=0 WHERE id=?")
      .run('Night Suit — ' + colours[index], colours[index], `Product: Night Suit — ${colours[index]}\nColour: ${colours[index]}\nMaterial: Cotton`, row.id));
    const before = rows.map(row => db.prepare('SELECT * FROM products WHERE id=?').get(row.id));
    env.PRODUCT_IMAGES = { delete() { throw new Error('Unchanged images must be preserved'); } };
    const worker = await workerFunctions(['updateProduct']);
    const response = await worker.updateProduct(new Request('https://glamiastore.com/api/admin/products/' + rows[0].id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }), env, rows[0].id);
    assert.equal(response.status, 200, await response.clone().text());
    const after = rows.map(row => db.prepare('SELECT * FROM products WHERE id=?').get(row.id));
    assert.equal(after[0].specifications, patch.specifications ?? before[0].specifications);
    for (let index = 1; index < rows.length; index++) {
      if (patch.specifications !== undefined) {
        assert.equal(after[index].specifications, `Product: Night Suit — ${colours[index]}\nColour: ${colours[index]}\nMaterial: Fleece\nCare: Hand wash`);
      } else assert.equal(after[index].specifications, before[index].specifications);
      for (const field of ['name', 'color', 'stock', 'sizes_json', 'images_json']) assert.equal(after[index][field], before[index][field]);
      if (patch.price) assert.equal(after[index].price, patch.price);
    }
  });
}

test('empty specifications on one listing do not erase sibling identity lines', () => {
  assert.equal(linkedSpecificationCopy('', { specifications: 'Colour: Blue\nCare: Hand wash' }), 'Colour: Blue');
});
