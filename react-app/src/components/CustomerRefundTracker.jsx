import { useId } from "react";
import { refundDate, refundTracking } from "../lib/refundTracking";
import { Icon } from "./Icon";
import { CustomerReturnDetails } from './CustomerReturnDetails';

const refundMoney = value => value === null ? "To be confirmed" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);

export function CustomerRefundTracker({ request, order, onNavigate }) {
  const id = useId();
  const model = refundTracking(request, order);
  return <section className={`refund-tracker refund-tone-${model.tone}`} aria-labelledby={`${id}-title`}>
    <header className="refund-tracker-heading">
      <div><p className="eyebrow">Your return &amp; refund</p><h3 id={`${id}-title`} aria-live="polite">{model.title}</h3></div>
      <span className="refund-state-label"><span className={model.active ? "refund-live-dot" : "refund-state-dot"} aria-hidden="true" />{model.confirmed ? "Confirmed" : model.stopped ? "Request closed" : model.tone === "attention" ? "Under review" : "In progress"}</span>
    </header>
    <ol className="refund-timeline" aria-label="Return and refund progress">
      {model.steps.map((step, index) => <li key={step.title} className={`refund-step-${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
        <span className="refund-step-marker" aria-hidden="true">{step.state === "done" ? <Icon name="check" size={17} /> : index + 1}</span>
        <div><strong>{step.title}</strong><small>{step.description}</small><span className="visually-hidden">{step.state === "done" ? ", completed" : step.state === "current" ? ", current step" : ", not completed"}</span></div>
      </li>)}
    </ol>
    <div className="refund-body">
      <div className="refund-next"><span className="refund-overline">{model.confirmed ? "What this means" : "What happens next"}</span><p>{model.next}</p>
        <div className="refund-actions"><button className="secondary-action" type="button" onClick={() => onNavigate(`/support?order=${encodeURIComponent(order.order_number || order.id)}&refund=${encodeURIComponent(request.id)}`)}>Get refund help</button>{(model.credit || model.creditAmount > 0) && <button className="secondary-action" type="button" onClick={() => onNavigate("/credits")}>View store credits</button>}</div>
      </div>
      <aside className="refund-amount" aria-label="Refund amount and destination">
        <span className="refund-overline">{model.amountLabel}</span><strong>{refundMoney(model.total)}</strong>
        <span>{model.credit ? "Glamia store credits" : "Original payment method"}</span>
        {!model.credit && <small>Handled by {model.provider}</small>}
        {!model.confirmed && !request.gateway_refund && <small>The final approved amount may differ from the requested amount.</small>}
        {!model.credit && model.originalAmount !== null && <dl className="refund-split"><div><dt>Original payment</dt><dd>{refundMoney(model.originalAmount)}</dd></div>{model.creditAmount > 0 && <div><dt>Store credits {model.confirmed ? "restored" : "to restore"}</dt><dd>{refundMoney(model.creditAmount)}</dd></div>}</dl>}
      </aside>
    </div>
    <CustomerReturnDetails request={request}/>
    <details className="refund-details"><summary>Request details &amp; refund guidance</summary>
      <dl><div><dt>Request reference</dt><dd>{request.id}</dd></div><div><dt>Order</dt><dd>{order.order_number}</dd></div><div><dt>Requested on</dt><dd>{refundDate(request.created_at) || "Not recorded"}</dd></div><div><dt>Your reason</dt><dd>{request.reason || "Not recorded"}</dd></div>{request.gateway_refund?.checked_at && <div><dt>Provider last checked</dt><dd>{refundDate(request.gateway_refund.checked_at) || "Not recorded"}</dd></div>}</dl>
      {request.gateway_refund?.provider_refund_id && <p>Provider refund reference: {request.gateway_refund.provider_refund_id}</p>}
      <p>{model.credit ? "Store credits are released only after the return is received and an authorised admin approves the refund. They are not a bank transfer." : "Bank posting times vary. Provider confirmation means the provider has processed the refund, not that your bank statement has already updated."}</p>
      <p>Keep your request reference when contacting Glamia care. Never share an OTP, PIN or payment password for a refund.</p>
      <button className="secondary-action" type="button" onClick={() => onNavigate("/return-policy")}>Read return policy</button>
    </details>
  </section>;
}
