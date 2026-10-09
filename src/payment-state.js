// Provider callbacks can race each other and admin actions. Guard the write,
// not just a previously fetched row, and release reservations in that transaction.
export async function applyGatewayState(db, id, { status, paymentId = '', reference = '', now = new Date().toISOString() }) {
  if (status === 'failed') {
    const results = await db.batch([
      db.prepare(`UPDATE orders SET status = 'cancelled', payment_status = 'failed',
        payment_reference = ?, payment_updated_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending', 'confirmed') AND payment_status IN ('pending', 'authorized')`)
        .bind(paymentId || reference || null, now, id),
      db.prepare(`INSERT OR IGNORE INTO order_stock_releases(order_id)
        SELECT id FROM orders WHERE id = ? AND status = 'cancelled' AND payment_status = 'failed'`).bind(id),
      db.prepare(`DELETE FROM coupon_redemptions WHERE order_id = ? AND EXISTS
        (SELECT 1 FROM orders WHERE id = ? AND status = 'cancelled' AND payment_status = 'failed')`).bind(id, id)
    ]);
    return Number(results[0]?.meta?.changes || 0) > 0;
  }
  if (!['paid', 'authorized'].includes(status)) return false;
  const eligible = status === 'paid' ? "payment_status IN ('pending', 'authorized')" : "payment_status = 'pending'";
  const result = await db.prepare(`UPDATE orders SET
    status = CASE WHEN ? = 'paid' AND status = 'pending' THEN 'confirmed' ELSE status END,
    payment_status = ?, payment_reference = ?, gateway_payment_id = ?,
    payment_updated_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status != 'cancelled' AND ${eligible}`)
    .bind(status, status, paymentId || reference || null, paymentId || null, now, id).run();
  return Number(result.meta?.changes || 0) > 0;
}
