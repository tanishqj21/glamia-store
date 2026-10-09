// Customer-safe projection. Raw gateway errors/evidence and staff identity stay private.
export function cancellationRefundView(refund, order) {
  if (!refund && !(order?.status === 'cancelled' && ['paid','refunded'].includes(order.payment_status)
    && order.order_type !== 'replacement')) return null;
  if (!refund) return {
    id: null, state: 'review_required', total: Number(order.total || 0),
    gateway_amount: Number(order.payable_total ?? order.total), credit_amount: Number(order.credits_used || 0),
    credits_restored: false, provider: order.payment_gateway || order.payment_method,
    provider_refund_id: null, checked_at: null, recovery_available: false,
    message: 'This earlier cancellation needs Glamia care to confirm its refund. No automatic payout has been started by this update.'
  };
  return {
    id: refund.id, state: refund.state, total: refund.total_paise / 100,
    gateway_amount: refund.gateway_paise / 100, credit_amount: refund.credit_amount,
    credits_restored: refund.credit_amount > 0, provider: refund.provider,
    provider_refund_id: refund.provider_refund_id || null, checked_at: refund.checked_at,
    created_at: refund.created_at,
    recovery_available: refund.provider === 'razorpay' && refund.state === 'reconciliation_required'
      && !refund.provider_refund_id && Boolean(refund.create_attempted),
    verification_retry_available: refund.state==='reconciliation_required' && !refund.create_attempted
      && Boolean(refund.dispatch_eligible) && ['razorpay','phonepe'].includes(refund.provider)
      && Boolean(refund.provider_payment_id&&refund.provider_order_id)
  };
}

// One indexed/batched read for the cancelled orders, not an extra read per order.
export async function attachCancellationRefunds(env, orders) {
  const ids = orders.filter(order => order.status === 'cancelled'
    && ['paid','refunded'].includes(order.payment_status)).map(order => order.id);
  if (!ids.length) return orders;
  const { results } = await env.DB.prepare(`SELECT * FROM cancellation_refunds
    WHERE order_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all();
  const byOrder = new Map(results.map(refund => [refund.order_id, refund]));
  return orders.map(order => ({ ...order, cancellation_refund: cancellationRefundView(byOrder.get(order.id),order) }));
}
