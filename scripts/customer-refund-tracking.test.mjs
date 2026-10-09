import test from 'node:test';
import assert from 'node:assert/strict';
import { refundTracking, refundTimestamp, refundDate, returnNeedsUpdates } from '../react-app/src/lib/refundTracking.js';

const base = { id: 'return-local', type: 'refund', status: 'requested', refund_destination: 'original', refund_amount: 949.5, created_at: '2026-10-03 08:00:00' };
const model = changes => refundTracking({ ...base, ...changes }, { payment_method: 'phonepe' });
for (const [state, title] of [['approved', 'Refund ready to send'], ['submitting', 'Sending your refund'], ['pending', 'Provider processing'], ['reconciliation_required', 'Refund being verified'], ['failed', 'Refund needs attention'], ['processed', 'Refund confirmed']]) {
  test(`provider state ${state} has honest customer copy`, () => {
    const result = model({ status: 'received', gateway_refund: { state, provider: 'phonepe', total: 949.5, gateway_amount: 849.5, credit_amount: 100 } });
    assert.equal(result.title, title);
    assert.equal(result.confirmed, state === 'processed');
    assert.equal(result.active, state !== 'processed');
    assert.equal(result.originalAmount, 849.5);
    assert.equal(result.creditAmount, 100);
    if (state === 'processed') { assert.match(result.next, /bank may take additional time/); assert.match(result.next, /restored/); assert.ok(result.steps.every(step => step.state === 'done')); }
  });
}
for (const [status, title] of [['requested', 'Request sent'], ['approved', 'Return approved'], ['received', 'Preparing your refund'], ['refunded', 'Awaiting refund confirmation'], ['completed', 'Awaiting refund confirmation'], ['rejected', 'Return not approved'], ['cancelled', 'Request cancelled']]) {
  test(`return ${status} without verified provider evidence cannot claim a refund`, () => {
    const result = model({ status, refund_processed_at: '2026-10-03 09:00:00' });
    assert.equal(result.title, title);
    assert.equal(result.confirmed, false);
    assert.equal(result.active, !['rejected', 'cancelled'].includes(status));
  });
}
test('credits need both receipt and authorisation, not just a refunded label', () => {
  assert.equal(model({ refund_destination: 'store_credit', status: 'received', credit_approval_status: 'pending' }).title, 'Waiting for credit approval');
  const beforeReturn = model({ refund_destination: 'store_credit', credit_approval_status: 'approved' });
  assert.equal(beforeReturn.confirmed, false);
  assert.match(beforeReturn.next, /once Glamia marks the item received/);
  assert.equal(model({ refund_destination: 'store_credit', status: 'refunded' }).confirmed, false);
  const issued = model({ refund_destination: 'store_credit', credit_approval_status: 'credited' });
  assert.equal(issued.title, 'Store credits issued');
  assert.equal(issued.active, false);
});
test('credit rejection is clearly closed, without claiming issuance', () => {
  const result = model({ refund_destination: 'store_credit', status: 'received', credit_approval_status: 'rejected' });
  assert.equal(result.title, 'Credit refund not approved');
  assert.equal(result.active, false);
  assert.equal(result.confirmed, false);
});
test('missing amounts are not silently shown as zero or the full order total', () => {
  assert.equal(model({ refund_amount: undefined }).total, null);
  assert.equal(model({ refund_amount: 'invalid' }).total, null);
  assert.equal(model({ refund_amount: 0 }).total, 0);
  assert.equal(model({ gateway_refund: { total: 40.25 } }).total, 40.25);
});
test('internal provider errors and privileged actors never appear in customer copy', () => {
  const result = model({ gateway_refund: { state: 'reconciliation_required', last_error: 'AUTHORIZATION_FAILED secret-token' }, credit_approved_by: 'owner@example.com' });
  assert.doesNotMatch(JSON.stringify(result), /secret-token|AUTHORIZATION_FAILED|owner@example/);
});
test('SQLite UTC and explicit offsets render the same instant in IST', () => {
  assert.equal(refundTimestamp('2026-10-03 08:00:00').toISOString(), '2026-10-03T08:00:00.000Z');
  assert.equal(refundTimestamp('2026-10-03T13:30:00+05:30').toISOString(), '2026-10-03T08:00:00.000Z');
  assert.equal(refundTimestamp('invalid'), null);
  assert.match(refundDate('2026-10-03 08:00:00'), /1:30 pm IST/i);
  assert.equal(refundDate('invalid'), '');
});
test('exchange polling stops at completion and stays separate from refunds', () => {
  assert.equal(returnNeedsUpdates({ ...base, type: 'exchange', status: 'completed' }), false);
  assert.equal(returnNeedsUpdates({ ...base, type: 'exchange', status: 'approved' }), true);
});
