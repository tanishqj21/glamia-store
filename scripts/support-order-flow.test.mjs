import assert from 'node:assert/strict';
import test from 'node:test';
import { adminReturnsFixture, customer } from './lib/admin-returns-fixture.mjs';
import { workerFunctions } from './lib/worker-fixture.mjs';

test('support uses authenticated identity, optional name/email and verifies order ownership', async () => {
  const f = await adminReturnsFixture();
  const worker = await workerFunctions(['createSupportTicket', 'listSupportTickets']);
  const create = (body, actor = customer) => worker.createSupportTicket(new Request('http://localhost/api/support/tickets', { method: 'POST', body: JSON.stringify({ subject: 'Return or exchange help', message: 'Please help me exchange the size.', ...body }) }), f.env, actor);
  try {
    const response = await create({ topic: 'return_exchange', order_id: 'manual-order', email: 'intruder@example.com' });
    assert.equal(response.status, 201);
    const { ticket } = await response.json();
    assert.equal(ticket.customer_email, customer.email);
    assert.equal(ticket.customer_name, customer.name);
    assert.equal(ticket.order_id, 'manual-order');
    assert.equal((await create({ topic: 'return_exchange' })).status, 400);
    assert.equal((await create({ topic: 'return_exchange', order_id: 'missing-order' })).status, 400);
    assert.equal((await create({ topic: 'return_exchange', order_id: 'manual-order' }, { ...customer, email: 'intruder@example.com' })).status, 403);
    assert.equal((await create({ topic: 'return_exchange', order_id: 'manual-order', email: customer.email }, null)).status, 401);
    assert.equal((await create({ order_id: 'manual-order', email: customer.email }, null)).status, 401);
    assert.equal((await create({ email: 'guest@example.com' }, null)).status, 201, 'general guest support stays available');
    assert.equal((await create({}, null)).status, 400, 'guests still need a reply address');
    const history = await (await worker.listSupportTickets(f.env, customer)).json();
    assert.equal(history.tickets.length, 1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 0, 'support never creates a financial request');
    assert.equal(f.networkCalls(), 0);
  } finally { f.db.close(); }
});
