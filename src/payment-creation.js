// The conditional write is the cross-isolate lock. No time-based lease or
// automatic unlock: neither provider promises POST-order idempotency here.
export async function claimPaymentCreation(db, id, provider) {
  const claim = crypto.randomUUID();
  const result = await db.prepare(`UPDATE orders SET payment_creation_state = 'creating',
    payment_creation_claim = ?, payment_updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND payment_gateway = ? AND payment_creation_state = 'idle'
      AND gateway_order_id IS NULL AND status != 'cancelled'
      AND payment_status = 'pending'`).bind(claim, id, provider).run();
  return Number(result.meta?.changes || 0) === 1 ? claim : null;
}
