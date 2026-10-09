// Presentation only. A provider-confirmed refund is not a bank-posting confirmation.
const amount = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function refundTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  // SQLite CURRENT_TIMESTAMP is UTC, despite not including a timezone suffix.
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw) ? raw.replace(" ", "T") + "Z" : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function refundDate(value) {
  const date = refundTimestamp(value);
  return date ? date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) + " IST" : "";
}

export function refundTracking(request, order = {}) {
  const credit = request.refund_destination === "store_credit";
  const gateway = request.gateway_refund;
  const state = gateway?.state;
  const confirmed = credit ? request.credit_approval_status === "credited" : state === "processed";
  const stopped = !confirmed && ["rejected", "cancelled"].includes(request.status);
  const creditRejected = !confirmed && credit && request.credit_approval_status === "rejected";
  const pickedUp=Boolean(request.pickup_confirmed_at);
  const received = Boolean(request.returned_at) || (!pickedUp && (["received", "refunded", "completed"].includes(request.status) || confirmed || Boolean(gateway)));
  const approved = received || pickedUp || request.status === "approved";
  const provider = ({ razorpay: "Razorpay", phonepe: "PhonePe" })[String(gateway?.provider || order.payment_gateway || order.payment_method).toLowerCase()] || "Payment provider";
  const total = amount(gateway?.total) ?? amount(request.refund_amount);
  const originalAmount = amount(gateway?.gateway_amount);
  const creditAmount = credit ? total : amount(gateway?.credit_amount);
  let title = "Request sent", tone = "progress", next = "Glamia will review your return request. Approval and return instructions will be shared by email. Do not send the item until you receive instructions.";
  let current = 1;
  if (approved) {
    title = "Return approved";
    next = "Follow Glamia's return instructions. Refund processing becomes available after confirmed courier collection or warehouse receipt; authorised approval is still required.";
    current = 2;
  }
  if (received || pickedUp) {
    title = credit ? "Waiting for credit approval" : "Preparing your refund";
    next = `${received?'Glamia has received your return.':'Your courier has collected the return.'} ${credit?'Store credits will be issued after the authorised admin approves the refund.':'Your refund is eligible for processing; the authorised admin and payment provider must confirm it first.'} You do not need to submit another request.`;
    current = 3;
  }
  if (credit && !received && request.credit_approval_status === "approved") {
    next = "Your store-credit refund has been approved. Follow your return instructions; the credits will be issued once Glamia marks the item received.";
  }
  if (!credit && ["approved", "submitting", "pending"].includes(state)) {
    title = state === "approved" ? "Refund ready to send" : state === "submitting" ? "Sending your refund" : "Provider processing";
    next = `${provider} ${state === "pending" ? "is processing your refund" : "has not yet confirmed your refund"}. No further request is needed. This tracker updates when Glamia receives a confirmed status.`;
    current = 3;
  }
  if (!credit && ["failed", "reconciliation_required"].includes(state)) {
    title = state === "failed" ? "Refund needs attention" : "Refund being verified";
    tone = "attention";
    current = 3;
    next = state === "failed" ? "The payment provider could not complete the refund. Contact Glamia care with the request reference below; do not create another refund request." : "Glamia is checking the refund with the payment provider. The outcome is not confirmed yet. You do not need to retry or share any payment passwords.";
  }
  if (!credit && !gateway && request.refund_state === 'review_required') {
    title='Refund needs review'; tone='attention'; current=3;
    next='Glamia is checking the payment details before sending your refund. Contact care if you need an update; do not submit a second request.';
  }
  if (!credit && !gateway && ["refunded", "completed"].includes(request.status)) {
    title = "Awaiting refund confirmation";
    tone = "attention";
    next = "Your return is recorded, but a confirmed refund status is not available yet. Glamia care can check this with the payment provider. You do not need to create another request.";
  }
  if (confirmed) {
    title = credit ? "Store credits issued" : "Refund confirmed";
    tone = "success";
    current = 5;
    next = credit ? "Your refund has been added to your Glamia credits. Open your wallet to see the balance and transaction history." : `${provider} has confirmed the refund to your original payment method. Your bank may take additional time to show it. Check your bank statement, not just the order's payment status.${creditAmount > 0 ? " The store-credit portion has also been restored to your Glamia wallet." : ""}`;
  } else if (stopped || creditRejected) {
    title = request.status === "cancelled" ? "Request cancelled" : creditRejected ? "Credit refund not approved" : "Return not approved";
    tone = "attention";
    next = "This request has not resulted in a confirmed refund. Contact Glamia care if you need an explanation or help with the next step.";
  }
  const steps = [
    { title: "Request sent", description: refundDate(request.created_at) || "Request recorded" },
    { title: "Return approved", description: approved ? "Return accepted" : "Review by Glamia" },
    { title: pickedUp&&!received ? "Courier collected" : "Item received", description: refundDate(request.returned_at||request.pickup_confirmed_at) || (received ? "Receipt recorded" : "Awaiting your return") },
    { title: credit ? "Credit approval" : "Refund processing", description: credit ? (confirmed ? "Approved" : "Authorised approval required") : confirmed ? "Provider confirmed" : "Payment checks" },
    { title: credit ? "Credits issued" : "Refund confirmed", description: confirmed ? (refundDate(request.refund_processed_at) || "Confirmation recorded") : credit ? "Added to your wallet" : "Bank posting may follow" },
  ].map((step, index) => ({ ...step, state: index < current ? "done" : index === current && !stopped && !creditRejected ? "current" : "waiting" }));
  // Unknown/legacy refunded labels never stand in for verified payment evidence.
  return { title, tone, next, steps, confirmed, credit, provider, total, originalAmount, creditAmount,
    active: !confirmed && !stopped && !creditRejected && request.type !== "exchange",
    stopped: stopped || creditRejected,
    amountLabel: confirmed ? "Confirmed refund" : gateway ? "Approved refund amount" : "Requested refund amount",
  };
}

export function returnNeedsUpdates(request) {
  return request.type === "exchange" ? !["completed", "cancelled", "rejected"].includes(request.status) : refundTracking(request).active;
}
