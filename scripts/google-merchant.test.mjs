import assert from 'node:assert/strict';
import test from 'node:test';
import { merchantConfig, merchantOffers } from '../src/google-merchant.js';

const product = {
  id: 'e2aeb883-b86f-4cc2-83db-46ff23d4c312', name: 'Night Suit — Chocolate Brown',
  description: 'Cotton night suit with long sleeves.', category: 'Women', subcategory: 'Nightwear',
  status: 'live', brand: 'Glamia', price: 949, mrp: 1999, color: 'Chocolate Brown',
  variant_group: 'night-suit', images_json: '["/api/assets/products/a/image.png"]',
  sizes_json: '["L","XL"]', preorder_enabled: 0, returnable: 1
};
const helpers = { path: () => '/women/nightwear/night-suit-id', price: p => p.price };

test('Merchant mapping makes a separate stable offer and landing page for each size', async () => {
  const offers = await merchantOffers(product, [{ size: 'L', stock: 2 }, { size: 'XL', stock: 0 }], {}, helpers);
  assert.equal(offers.length, 2);
  assert.notEqual(offers[0].input.offerId, offers[1].input.offerId);
  assert.equal(offers[0].input.productAttributes.size, 'L');
  assert.equal(offers[0].input.productAttributes.availability, 'IN_STOCK');
  assert.equal(offers[1].input.productAttributes.availability, 'OUT_OF_STOCK');
  assert.equal(offers[1].input.productAttributes.link, 'https://glamiastore.com/women/nightwear/night-suit-id?size=XL');
  assert.equal(offers[0].input.productAttributes.price.amountMicros, '949000000');
  assert.equal(offers[0].input.productAttributes.maximumRetailPrice.amountMicros, '1999000000');
  assert.equal(offers[0].input.productAttributes.returns[0].windowDays, '7');
  assert.equal(offers[0].input.productAttributes.imageLink, 'https://glamiastore.com/api/assets/products/a/image.png');
  assert.deepEqual(offers.map(o => o.fingerprint), (await merchantOffers(product, [{ size: 'L', stock: 2 }, { size: 'XL', stock: 0 }], {}, helpers)).map(o => o.fingerprint));
});

test('Unpublished products disappear and nonreturnable products get a no-returns rule', async () => {
  assert.deepEqual(await merchantOffers({ ...product, status: 'hold' }, [{ size: 'L', stock: 2 }], {}, helpers), []);
  const offers = await merchantOffers({ ...product, returnable: 0 }, [{ size: 'L', stock: 2 }], {}, helpers);
  assert.equal(offers[0].input.productAttributes.returns[0].windowType, 'NO_RETURNS');
});

test('A product with declared sizes cannot silently use aggregate stock', async () => {
  await assert.rejects(merchantOffers(product, [], {}, helpers), /Size-level inventory is missing/);
});

test('Merchant credentials remain disabled until configured and enabled', () => {
  const config = merchantConfig({ MERCHANT_ACCOUNT_ID: '5859812746', MERCHANT_DATA_SOURCE_ID: '10750523846', MERCHANT_USE_GA4_SERVICE_ACCOUNT: 'true', GA4_CLIENT_EMAIL: 'example@project.iam.gserviceaccount.com', GA4_PRIVATE_KEY: 'private', MERCHANT_SYNC_ENABLED: 'false' });
  assert.equal(config.configured, true);
  assert.equal(config.enabled, false);
  assert.equal(config.source, 'accounts/5859812746/dataSources/10750523846');
});
