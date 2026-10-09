import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredPaymentMethods, unavailableCheckoutLines } from '../../glamia-shoppers-app/src/checkoutRules.js';

test('missing gateway credentials never produce invented payment methods', () => {
  assert.deepEqual(configuredPaymentMethods(null), []);
  assert.deepEqual(configuredPaymentMethods({ payments: { methods: [] } }), []);
  assert.deepEqual(configuredPaymentMethods({ payments: { methods: [{ id: 'razorpay' }, { id: 'demo' }] } }), [{ id: 'razorpay' }]);
});

test('checkout refuses missing, sold-out and invalid-size lines', () => {
  const products = [{ id: 'shirt', stock: 2, sizes: ['M', 'L'], size_stock: { M: 1, L: 1 } }];
  assert.equal(unavailableCheckoutLines([{ id: 'shirt', size: 'M', quantity: 1 }], products).length, 0);
  assert.equal(unavailableCheckoutLines([{ id: 'shirt', size: 'S', quantity: 1 }], products).length, 1);
  assert.equal(unavailableCheckoutLines([{ id: 'missing', size: 'M', quantity: 1 }], products).length, 1);
  assert.equal(unavailableCheckoutLines([{ id: 'shirt', size: 'M', quantity: 2 }], products).length, 1);
  assert.equal(unavailableCheckoutLines([{ id: 'shirt', size: 'M', quantity: 0 }], products).length, 1);
  assert.equal(unavailableCheckoutLines([{ id: 'shirt', size: 'M', quantity: 1 }, { id: 'shirt', size: 'M', quantity: 1 }], products).length, 2);
});

test('checkout respects combined stock and preorder limits', () => {
  const products = [{ id: 'dress', stock: 1, sizes: ['M', 'L'], size_stock: { M: 1, L: 1 } }];
  assert.equal(unavailableCheckoutLines([{ id: 'dress', size: 'M', quantity: 1 }, { id: 'dress', size: 'L', quantity: 1 }], products).length, 2);
  const preorder = [{ id: 'dress', preorder_enabled: true, preorder_limit: 5, preorder_sold: 3, sizes: ['M'] }];
  assert.equal(unavailableCheckoutLines([{ id: 'dress', size: 'M', quantity: 2 }], preorder).length, 0);
  assert.equal(unavailableCheckoutLines([{ id: 'dress', size: 'M', quantity: 3 }], preorder).length, 1);
});

test('uncapped preorders stay available, but explicit zero caps and invalid sizes do not', () => {
  const lines = [{ id: 'preorder', size: 'M', quantity: 3 }, { id: 'preorder', size: 'L', quantity: 2 }];
  for (const limit of [null, undefined]) {
    const product = { id: 'preorder', preorder_enabled: true, preorder_limit: limit, preorder_sold: 100, stock: 0, sizes: ['M', 'L'] };
    assert.deepEqual(unavailableCheckoutLines(lines, [product]), []);
    assert.equal(unavailableCheckoutLines([{ id: 'preorder', size: 'S', quantity: 1 }], [product]).length, 1);
  }
  assert.equal(unavailableCheckoutLines(lines, [{ id: 'preorder', preorder_enabled: true, preorder_limit: 0 }]).length, 2);
});
