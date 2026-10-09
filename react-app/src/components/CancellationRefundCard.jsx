import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { money } from '../lib/commerce';
import { refundDate } from '../lib/refundTracking';
import '../return-lifecycle.css';

const copy = {
  approved: ['Refund queued', 'Your order is cancelled. Its refund to the original payment method is queued for verification.'],
  submitting: ['Sending your refund', 'Your payment is being checked and the refund submitted. You do not need to submit another request.'],
  pending: ['Provider processing', 'The payment provider is processing your cancellation refund. It has not confirmed completion yet.'],
  processed: ['Cancellation refund confirmed', 'Your refund is confirmed. Bank posting may take additional time.'],
  reconciliation_required: ['Refund needs review', 'Glamia is checking the payment provider’s outcome. Do not retry a payment or submit another refund.'],
  review_required: ['Refund needs review', 'Glamia care needs to check this earlier cancellation and confirm where its refund stands.'],
  failed: ['Refund needs attention', 'The payment provider could not complete the refund. Contact Glamia care using your order number.']
};

export function CancellationRefundCard({order,onNavigate,admin=false,canManage=false,onChanged}) {
  const refund=order.cancellation_refund;
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  if(!refund)return null;
  const [title,message]=copy[refund.state]||copy.review_required;
  const confirmed=refund.state==='processed';
  const review=['review_required','reconciliation_required','failed'].includes(refund.state);
  async function action(kind) {
    if(busy)return;
    if(kind==='recover'&&!window.confirm('Recover the original Razorpay refund using its existing idempotency key? This does not create a new refund case.'))return;
    if(kind==='process'&&refund.verification_retry_available&&!window.confirm('Re-check the original payment and process this cancellation refund? No previous provider refund submission is recorded.'))return;
    setBusy(true);setError('');
    try {
      const response=await apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}/cancellation-refund/${kind}`,{method:'POST',body:'{}'});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Refund status could not be checked');
      onChanged?.(data.order);
    }catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  return <section className={`refund-tracker cancellation-refund-card refund-tone-${confirmed?'success':review?'attention':'progress'}`} aria-label="Cancellation refund">
    <header className="refund-tracker-heading"><div><p className="eyebrow">Cancelled order · refund</p><h3 aria-live="polite">{title}</h3></div><span className="refund-state-label">{confirmed?'Confirmed':review?'Under review':'In progress'}</span></header>
    <p>{refund.gateway_amount===0&&confirmed?'Your original store credits have been restored. No bank transfer was needed.':message}</p>
    <dl className="refund-split"><div><dt>{confirmed?'Confirmed refund':'Refund amount'}</dt><dd>{money(refund.total)}</dd></div>{refund.gateway_amount>0&&<div><dt>Original payment · {refund.provider}</dt><dd>{money(refund.gateway_amount)}</dd></div>}{refund.credit_amount>0&&<div><dt>Store credits {refund.credits_restored?'restored':'to verify'}</dt><dd>{money(refund.credit_amount)}</dd></div>}</dl>
    {refund.provider_refund_id&&<p className="form-hint">Provider refund reference: {refund.provider_refund_id}</p>}
    {refund.checked_at&&<p className="form-hint">Provider last checked: {refundDate(refund.checked_at)}</p>}
    {!admin&&onNavigate&&<div className="refund-actions"><button type="button" className="secondary-action" onClick={()=>onNavigate(`/support?order=${encodeURIComponent(order.order_number||order.id)}`)}>Get refund help</button>{refund.credit_amount>0&&<button type="button" className="secondary-action" onClick={()=>onNavigate('/credits')}>View store credits</button>}</div>}
    {admin&&canManage&&refund.id&&!confirmed&&<div className="refund-actions"><button type="button" className="secondary-action" disabled={busy} onClick={()=>action(refund.state==='approved'?'process':'reconcile')}>{busy?'Checking…':refund.state==='approved'?'Process queued refund':'Check provider status'}</button>{refund.verification_retry_available&&<button type="button" className="secondary-action" disabled={busy} onClick={()=>action('process')}>Verify &amp; process refund</button>}{refund.recovery_available&&<button type="button" className="secondary-action" disabled={busy} onClick={()=>action('recover')}>Recover original refund</button>}</div>}
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {review&&<p className="form-hint">An unconfirmed refund is never displayed as money returned. Keep your order number when contacting care.</p>}
  </section>;
}
