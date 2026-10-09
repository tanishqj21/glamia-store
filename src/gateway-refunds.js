// Provider callbacks are advisory; only authenticated status reads settle refunds.
// No auto-retry of create requests, no new key on timeout, no expiring claims.
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
// Table names are chosen from constants, never from request input.
const refundTable = refund => refund.kind === 'cancellation' ? 'cancellation_refunds' : 'gateway_refunds';
export function refundPaise(raw) {
  const value = String(raw ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw fail('Enter a refund amount with at most two decimal places', 400);
  const [whole, fraction = ''] = value.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || paise < 100) throw fail('Refund must be at least ₹1', 400);
  return paise;
}

export async function approveGatewayRefund(db, returnId, actor, rawAmount) {
  const returned = await db.prepare('SELECT * FROM return_requests WHERE id=?').bind(returnId).first();
  if (!returned) throw fail('Return request not found', 404);
  const existing = await db.prepare('SELECT * FROM gateway_refunds WHERE return_request_id=?').bind(returnId).first();
  if (existing) {
    if (rawAmount != null && refundPaise(rawAmount) !== existing.total_paise) throw fail('An approved refund amount cannot be changed');
    return existing;
  }
  const order = await db.prepare('SELECT * FROM orders WHERE id=?').bind(returned.order_id).first();
  if (!order || returned.type !== 'refund' || returned.refund_destination !== 'original'
    || !(returned.status === 'received' || (returned.status === 'approved' && returned.pickup_confirmed_at))
    || order.payment_status !== 'paid' || order.status !== 'delivered'
    || !['razorpay','phonepe'].includes(order.payment_gateway) || order.payment_method !== order.payment_gateway
    || !order.gateway_payment_id || !order.gateway_order_id) throw fail('A received or courier-collected original-payment return with a settled gateway payment is required');
  const total = refundPaise(order.total);
  const amount = rawAmount == null ? refundPaise(returned.refund_amount) : refundPaise(rawAmount);
  const credits = Number(order.credits_used || 0);
  const payable = refundPaise(order.payable_total ?? order.total);
  const prior=await db.prepare('SELECT COALESCE(SUM(total_paise),0) AS total,COALESCE(SUM(gateway_paise),0) AS gateway,COALESCE(SUM(credit_amount),0) AS credits FROM gateway_refunds WHERE order_id=?').bind(order.id).first();
  if (!Number.isSafeInteger(credits) || credits < 0 || payable + credits * 100 !== total || amount > total) throw fail('Refund amount or original payment split needs reconciliation');
  if(returned.requested_amount_paise!=null && amount>returned.requested_amount_paise) throw fail('Refund exceeds selected purchased items');
  // Merchant-authorised proportional allocation. Credits are indivisible units;
  // gateway paise absorb rounding so the combined refund stays exact.
  const proportionalCredits=Number((2n*BigInt(credits)*BigInt(amount)+BigInt(total))/(2n*BigInt(total)));
  const refundCredits=Math.min(credits-prior.credits,Math.floor(amount/100),amount===total-prior.total?credits-prior.credits:proportionalCredits);
  const gatewayAmount = amount - refundCredits * 100;
  if (gatewayAmount < 100 || gatewayAmount > payable-prior.gateway || amount>total-prior.total || refundCredits<0) throw fail('Refund exceeds the remaining original payment');
  const id = `gmrf_${crypto.randomUUID().replaceAll('-', '')}`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO gateway_refunds
      (id,return_request_id,order_id,provider,provider_order_id,provider_payment_id,total_paise,gateway_paise,credit_amount,order_total_paise,approved_by,last_actor,original_credit_amount,original_gateway_paise)
      SELECT ?,r.id,o.id,o.payment_gateway,o.gateway_order_id,o.gateway_payment_id,?,?,?,?,?,?,?,?
      FROM return_requests r JOIN orders o ON o.id=r.order_id
      WHERE r.id=? AND r.type='refund' AND r.refund_destination='original'
        AND (r.status='received' OR (r.status='approved' AND r.pickup_confirmed_at IS NOT NULL))
        AND o.payment_status='paid' AND o.status='delivered' AND o.gateway_order_id=? AND o.gateway_payment_id=?
        AND o.payment_gateway=? AND o.payment_method=? AND ROUND(o.total*100)=? AND ROUND(COALESCE(o.payable_total,o.total)*100)=?
        AND COALESCE(o.credits_used,0)=?`)
      .bind(id,amount,gatewayAmount,refundCredits,total,actor,actor,credits,payable,returnId,order.gateway_order_id,order.gateway_payment_id,order.payment_gateway,order.payment_method,total,payable,credits),
    db.prepare(`UPDATE return_requests SET refund_amount=?/100.0,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND EXISTS(SELECT 1 FROM gateway_refunds WHERE id=?)`).bind(amount,returnId,id)
  ]);
  const saved = await db.prepare('SELECT * FROM gateway_refunds WHERE return_request_id=?').bind(returnId).first();
  if (!saved || saved.total_paise !== amount) throw fail('Another refund or order change requires reconciliation');
  return saved;
}

function verifyRefund(refund, data) {
  let providerId, state;
  if (refund.provider === 'razorpay') {
    if (data.entity !== 'refund' || data.currency !== 'INR' || data.payment_id !== refund.provider_payment_id
      || !/^rfnd_[a-zA-Z0-9]+$/.test(data.id || '')) throw fail('Refund identity did not match', 422);
    providerId = data.id;
    state = { pending:'pending', processed:'processed', failed:'failed' }[data.status];
  } else {
    if (data.originalMerchantOrderId !== refund.provider_order_id || !data.refundId
      || (data.merchantRefundId && data.merchantRefundId !== refund.id)
      || (data.currency && data.currency !== 'INR')) throw fail('Refund identity did not match', 422);
    providerId = String(data.refundId);
    state = { PENDING:'pending', COMPLETED:'processed', FAILED:'failed' }[data.state];
  }
  if (!state || !Number.isSafeInteger(data.amount) || data.amount !== refund.gateway_paise
    || (refund.provider_refund_id && providerId !== refund.provider_refund_id)) throw fail('Refund amount, reference or state did not match', 422);
  return { state, providerId, evidence: JSON.stringify({ provider:refund.provider, id:providerId, amount_paise:data.amount, state, currency:'INR', verified_by:'authenticated_status_api' }) };
}

async function persistVerifiedRefund(db, refund, data, actor) {
  const verified = verifyRefund(refund, data);
  const table = refundTable(refund);
  if (refund.kind === 'cancellation') {
    await db.batch([
      db.prepare(`UPDATE cancellation_refunds SET state=?,provider_refund_id=?,evidence_json=?,last_error='',last_actor=?,
        checked_at=CURRENT_TIMESTAMP,next_check_at=datetime('now','+15 minutes'),updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND state IN ('submitting','pending','reconciliation_required')
          AND (provider_refund_id IS NULL OR provider_refund_id=?)`)
        .bind(verified.state,verified.providerId,verified.evidence,actor,refund.id,verified.providerId),
      // Cancellation's existing transaction restored credits. Do not restore them twice.
      db.prepare(`UPDATE orders SET payment_status='refunded',payment_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='cancelled' AND payment_status='paid'
          AND EXISTS(SELECT 1 FROM cancellation_refunds c WHERE c.id=? AND c.state='processed'
            AND c.total_paise=ROUND(orders.total*100) AND c.gateway_paise=ROUND(COALESCE(orders.payable_total,orders.total)*100)
            AND c.credit_amount=COALESCE(orders.credits_used,0))`).bind(refund.order_id,refund.id)
    ]);
    return db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(refund.id).first();
  }
  await db.batch([
    db.prepare(`UPDATE gateway_refunds SET state=?,provider_refund_id=?,evidence_json=?,last_error='',last_actor=?,
      checked_at=CURRENT_TIMESTAMP,next_check_at=datetime('now','+15 minutes'),updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND state IN ('submitting','pending','reconciliation_required')
        AND (provider_refund_id IS NULL OR provider_refund_id=?)`)
      .bind(verified.state,verified.providerId,verified.evidence,actor,refund.id,verified.providerId),
    // This unique ledger key and the D1 transaction make the credit restoration
    // exactly-once even if status checks overlap or a process dies afterwards.
    db.prepare(`INSERT OR IGNORE INTO store_credit_ledger
      (id,user_email,amount,kind,description,order_id,return_request_id,idempotency_key)
      SELECT 'gateway-credit:'||g.id,o.customer_email,g.credit_amount,'refund','Original store-credit payment restored',o.id,g.return_request_id,'gateway-credit:'||g.id
      FROM gateway_refunds g JOIN orders o ON o.id=g.order_id
      WHERE g.id=? AND g.state='processed' AND g.credit_amount>0`).bind(refund.id),
    db.prepare(`UPDATE return_requests SET status='refunded',refund_processed_at=COALESCE(refund_processed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND (status='received' OR (status='approved' AND pickup_confirmed_at IS NOT NULL))
        AND EXISTS(SELECT 1 FROM gateway_refunds WHERE id=? AND state='processed')`).bind(refund.return_request_id,refund.id),
    db.prepare(`UPDATE orders SET payment_status='refunded',payment_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND payment_status='paid' AND EXISTS(SELECT 1 FROM gateway_refunds WHERE id=? AND state='processed')
        AND (SELECT COALESCE(SUM(total_paise),0) FROM gateway_refunds WHERE order_id=orders.id AND state='processed')
          +(SELECT COALESCE(SUM(ROUND(refund_amount*100)),0) FROM return_requests WHERE order_id=orders.id AND refund_destination='store_credit' AND credit_approval_status='credited')=ROUND(total*100)`)
      .bind(refund.order_id,refund.id)
  ]);
  return db.prepare('SELECT * FROM gateway_refunds WHERE id=?').bind(refund.id).first();
}

async function uncertain(db, refund, actor, error) {
  const table = refundTable(refund);
  const provider = refund.provider === 'phonepe' ? 'PhonePe' : 'Razorpay';
  const diagnostic = Number.isInteger(error.gatewayHttpStatus)
    ? `${provider} ${error.gatewayStage || 'refund'} returned HTTP ${error.gatewayHttpStatus}${error.gatewayErrorCode ? ` (${error.gatewayErrorCode})` : ''}. Check provider status; do not create another refund.`
    : error.status === 422 ? 'Provider evidence mismatch. Investigate before retrying.' : 'Provider outcome unconfirmed. Check status; do not create another refund.';
  await db.prepare(`UPDATE ${table} SET state='reconciliation_required',last_error=?,last_actor=?,checked_at=CURRENT_TIMESTAMP,
    next_check_at=datetime('now','+15 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND state IN ('submitting','pending','reconciliation_required')`)
    .bind(diagnostic,actor,refund.id).run();
  return db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(refund.id).first();
}

export async function reconcileGatewayRefund(db, refund, transport, actor = 'system:refund-reconciliation') {
  if (['approved','processed','failed'].includes(refund.state)) return refund;
  // A status check must not race the in-flight verification/create operation.
  // Crash recovery becomes eligible when the durable lease's check time arrives.
  const checkTime=String(refund.next_check_at||'');
  const checkInstant=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(checkTime)?checkTime.replace(' ','T')+'Z':checkTime;
  if (refund.kind === 'cancellation' && refund.state === 'submitting' && !refund.provider_refund_id
    && Date.parse(checkInstant)>Date.now()) return refund;
  try {
    if (!['razorpay','phonepe'].includes(refund.provider)) throw fail('Payment requires owner review');
    if (refund.kind === 'cancellation' && !refund.create_attempted) throw fail('No refund submission is recorded. Owner review required');
    if (!refund.provider_refund_id && refund.provider === 'razorpay') throw fail('Refund reference requires owner recovery');
    const data = await transport(refund.provider, refund.provider === 'razorpay'
      ? `/refunds/${encodeURIComponent(refund.provider_refund_id)}` : `/payments/v2/refund/${encodeURIComponent(refund.id)}/status`);
    return await persistVerifiedRefund(db,refund,data,actor);
  } catch (error) { return uncertain(db,refund,actor,error); }
}

export async function executeGatewayRefund(db, refund, transport, actor) {
  if (refund.state !== 'approved') return reconcileGatewayRefund(db,refund,transport,actor);
  const table = refundTable(refund);
  // Reserve execution BEFORE any network operation. Concurrent clicks cannot POST twice.
  const eligibility = refund.kind === 'cancellation' ? `EXISTS(SELECT 1 FROM orders o WHERE o.id=cancellation_refunds.order_id
      AND o.status='cancelled' AND o.payment_status='paid' AND cancellation_refunds.dispatch_eligible=1
      AND o.gateway_order_id=cancellation_refunds.provider_order_id AND o.gateway_payment_id=cancellation_refunds.provider_payment_id
      AND ROUND(o.total*100)=cancellation_refunds.order_total_paise AND o.payment_gateway=cancellation_refunds.provider
      AND o.payment_method=cancellation_refunds.provider AND COALESCE(o.credits_used,0)=cancellation_refunds.original_credit_amount
      AND ROUND(COALESCE(o.payable_total,o.total)*100)=cancellation_refunds.original_gateway_paise
      AND cancellation_refunds.total_paise=cancellation_refunds.gateway_paise+cancellation_refunds.credit_amount*100
      AND NOT EXISTS(SELECT 1 FROM cancellation_refunds c WHERE c.id!=cancellation_refunds.id
        AND c.provider=cancellation_refunds.provider AND c.provider_payment_id=cancellation_refunds.provider_payment_id)
      AND NOT EXISTS(SELECT 1 FROM gateway_refunds g WHERE g.order_id=o.id OR g.provider_payment_id=o.gateway_payment_id))` : `EXISTS(SELECT 1 FROM orders o JOIN return_requests r ON r.order_id=o.id WHERE r.id=gateway_refunds.return_request_id
      AND (r.status='received' OR (r.status='approved' AND r.pickup_confirmed_at IS NOT NULL))
      AND o.payment_status='paid' AND o.status='delivered'
      AND o.gateway_order_id=gateway_refunds.provider_order_id AND o.gateway_payment_id=gateway_refunds.provider_payment_id
      AND ROUND(o.total*100)=gateway_refunds.order_total_paise AND o.payment_gateway=gateway_refunds.provider
      AND o.payment_method=gateway_refunds.provider AND COALESCE(o.credits_used,0)=gateway_refunds.original_credit_amount
      AND ROUND(COALESCE(o.payable_total,o.total)*100)=gateway_refunds.original_gateway_paise)`;
  const claimed = await db.prepare(`UPDATE ${table} SET state='submitting',attempts=attempts+1,last_actor=?,
    next_check_at=datetime('now','+15 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='approved'
    AND ${eligibility}`)
    .bind(actor,refund.id).run();
  if (!Number(claimed.meta?.changes)) {
    const current = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(refund.id).first();
    if (current?.state === 'approved') throw fail('The order changed after approval. Investigate before sending a refund.');
    return current;
  }
  try {
    // Re-read the actual payment before issuing funds. A local paid label alone
    // cannot authorize a refund of an unrelated payment or already-refunded amount.
    const payment = await transport(refund.provider,refund.provider === 'razorpay'
      ? `/payments/${encodeURIComponent(refund.provider_payment_id)}` : `/checkout/v2/order/${encodeURIComponent(refund.provider_order_id)}/status?details=true`);
    const expected = refund.original_gateway_paise;
    const priorRefunds=refund.kind==='cancellation'?[]:(await db.prepare("SELECT * FROM gateway_refunds WHERE order_id=? AND id!=?").bind(refund.order_id,refund.id).all()).results;
    if(priorRefunds.some(previous=>previous.state!=='processed'))throw fail('A previous refund still needs reconciliation',422);
    for(const previous of priorRefunds) {
      const evidence=await transport(previous.provider,previous.provider==='razorpay'?`/refunds/${encodeURIComponent(previous.provider_refund_id)}`:`/payments/v2/refund/${encodeURIComponent(previous.id)}/status`);
      if(verifyRefund(previous,evidence).state!=='processed')throw fail('Previous refund completion needs reconciliation',422);
    }
    const previouslyRefunded=priorRefunds.reduce((sum,previous)=>sum+previous.gateway_paise,0);
    if (payment.amount !== expected || (refund.provider === 'razorpay'
      ? payment.id !== refund.provider_payment_id || payment.order_id !== refund.provider_order_id || payment.currency !== 'INR'
        || payment.status !== 'captured' || payment.amount_refunded !== previouslyRefunded || refund.gateway_paise > payment.amount-previouslyRefunded
      : payment.state !== 'COMPLETED' || (payment.currency && payment.currency !== 'INR')
        || (payment.merchantOrderId && payment.merchantOrderId !== refund.provider_order_id)
        || !(payment.paymentDetails || []).some(detail => detail.transactionId === refund.provider_payment_id && detail.state === 'COMPLETED'))) throw fail('Original payment verification failed',422);
    await db.prepare(`UPDATE ${table} SET create_attempted=1,evidence_json=? WHERE id=? AND state='submitting'`)
      .bind(JSON.stringify({ stage:'original_payment_verified',amount_paise:payment.amount }),refund.id).run();
    const data = await transport(refund.provider,refund.provider === 'razorpay'
      ? `/payments/${encodeURIComponent(refund.provider_payment_id)}/refund` : '/payments/v2/refund', {
      method:'POST', headers:refund.provider === 'razorpay' ? { 'X-Refund-Idempotency':refund.id } : {},
      body:JSON.stringify(refund.provider === 'razorpay' ? { amount:refund.gateway_paise }
        : { merchantRefundId:refund.id, originalMerchantOrderId:refund.provider_order_id, amount:refund.gateway_paise })
    });
    // Initiation is NOT proof of completion. Persist only a routing reference;
    // amount/state verification comes from a separate authenticated status GET.
    const providerId = refund.provider === 'razorpay' ? data.id : data.refundId;
    if (providerId && /^[A-Za-z0-9_-]{1,160}$/.test(providerId)) await db.prepare(`UPDATE ${table} SET provider_refund_id=?
      WHERE id=? AND provider_refund_id IS NULL AND state!='processed'`).bind(providerId,refund.id).run();
    const current = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(refund.id).first();
    return await reconcileGatewayRefund(db,current,transport,actor);
  } catch (error) { return uncertain(db,refund,actor,error); }
}

// Explicit owner recovery only. Razorpay documents reusing this exact header
// and body; PhonePe recovery remains GET-only, never a new POST or new ID.
export async function recoverRazorpayRefund(db, refund, transport, actor) {
  if (refund.provider !== 'razorpay' || refund.state !== 'reconciliation_required' || refund.provider_refund_id || !refund.create_attempted) throw fail('This refund requires status reconciliation, not another create request');
  try {
    const table = refundTable(refund);
    const data = await transport('razorpay',`/payments/${encodeURIComponent(refund.provider_payment_id)}/refund`, {
      method:'POST',headers:{ 'X-Refund-Idempotency':refund.id },body:JSON.stringify({ amount:refund.gateway_paise })
    });
    if (!/^rfnd_[a-zA-Z0-9]+$/.test(data.id || '')) throw fail('Refund reference is missing',422);
    await db.prepare(`UPDATE ${table} SET provider_refund_id=? WHERE id=? AND provider_refund_id IS NULL AND state='reconciliation_required'`).bind(data.id,refund.id).run();
    const current = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(refund.id).first();
    return await reconcileGatewayRefund(db,current,transport,actor);
  } catch (error) { return uncertain(db,refund,actor,error); }
}

export function publicGatewayRefund(row) {
  if (!row?.id) return null;
  return { id:row.id,state:row.state,total:row.total_paise/100,gateway_amount:row.gateway_paise/100,credit_amount:row.credit_amount,
    provider:row.provider,provider_refund_id:row.provider_refund_id || null,approved_at:row.created_at,checked_at:row.checked_at,last_error:row.last_error,
    recovery_available:row.provider === 'razorpay' && row.state === 'reconciliation_required' && !row.provider_refund_id && Boolean(row.create_attempted) };
}
