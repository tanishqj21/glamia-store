import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { money, refundDate } from '../lib/commerce';
import { useSupportRefresh } from '../lib/useSupportRefresh';

export function SupportProductSummary({ item, children }) {
  return <article className="support-product-row">
    {item.image_url && <img src={item.image_url} alt={item.product_name} loading="lazy" />}
    <div><strong>{item.product_name}</strong><small>{[item.color, item.size || 'One size', `Purchased × ${item.quantity}`].filter(Boolean).join(' · ')}</small>
      <span className={`return-policy-tag ${item.support_return_enabled ? 'exception-enabled' : ''}`}>
        {item.support_return_enabled ? 'Return enabled for this order' : item.standard_returnable ? 'Standard returns allowed' : item.policy_snapshot_known === false ? 'Saved policy unavailable — care review needed' : 'Non-returnable under standard policy'}
      </span>{children}</div>
  </article>;
}

export function SupportOrderContext({ ticketId, onDraft }) {
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useSupportRefresh(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/order-context`, data => {
    setContext(data.order ? data : { ...data, items: [] }); setError('');
  }, setError);
  const items = context?.items || [];
  const chosen = items.filter(item => selected.includes(item.line_id));
  async function save(enabled) {
    if (busy || !chosen.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/return-access`, {
        method: 'PATCH', body: JSON.stringify({ enabled, line_ids: chosen.map(item => item.line_id), reason: reason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Return access could not be saved');
      setContext(data); setSelected([]); setReason(''); refresh();
      setNotice(enabled ? 'Return access enabled. No refund or chat message was sent.' : 'Return exception disabled. Existing requests were not changed.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  const enabledItems = items.filter(item => item.support_return_enabled);
  return <section className="support-order-context" aria-label="Order and product context">
    <div className="support-context-heading"><h4>Order & product context</h4><button type="button" className="secondary-action" disabled={busy} onClick={refresh}>Refresh order</button></div>
    {!context && !error && <p role="status">Loading the linked order and purchased return policy…</p>}
    {context?.order ? <>
      <p><strong>{context.order.order_number}</strong> · {context.order.status} · {money(context.order.total)}</p>
      <p className="form-hint">{items.some(item => item.referenced) ? 'Customer-selected products are marked below.' : 'The customer linked this order without choosing a specific product. Confirm the item in chat.'}</p>
      {items.map(item => <SupportProductSummary key={item.line_id} item={item}>
        {item.referenced && <strong className="support-reference-mark">Customer is asking about this item</strong>}
        <small>{item.remaining_quantity} remaining for a new request</small>
        {!item.standard_returnable && <label className="support-item-check"><input type="checkbox" checked={selected.includes(item.line_id)} disabled={busy || (!item.can_enable && !item.support_return_enabled) || Boolean(context.eligibility_message)} onChange={event => setSelected(current => event.target.checked ? [...current, item.line_id] : current.filter(id => id !== item.line_id))} />Select for an order-specific exception</label>}
      </SupportProductSummary>)}
      {context.eligibility_message && <p className="inline-note">{context.eligibility_message}</p>}
      {items.some(item => !item.standard_returnable) && <div className="support-access-controls">
        <p>Manual return exception</p><small>This changes only the selected purchased items on this order. Delivery, payment, quantity and return-window checks still apply. It does not approve or pay a refund.</small>
        <label>Internal reason<textarea rows="2" minLength="10" maxLength="500" value={reason} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="Explain why this order is an exception (at least 10 characters)" /></label>
        <div className="refund-actions"><button type="button" className="primary-action" disabled={busy || reason.trim().length < 10 || !chosen.some(item => !item.support_return_enabled) || Boolean(context.eligibility_message)} onClick={() => save(true)}>{busy ? 'Saving…' : 'Enable return for selected items'}</button><button type="button" className="secondary-action" disabled={busy || reason.trim().length < 10 || !chosen.some(item => item.support_return_enabled) || Boolean(context.eligibility_message)} onClick={() => save(false)}>Disable exception</button></div>
      </div>}
      {enabledItems.length > 0 && <button type="button" className="secondary-action" onClick={() => onDraft(`We’ve enabled a return exception for ${enabledItems.map(item => `${item.product_name} (${item.size || 'One size'})`).join(', ')} on order ${context.order.order_number}. Open Your orders, choose Return / Exchange and refresh the options. The normal return window and remaining-quantity checks still apply. This is not a refund confirmation.`)}>Draft an update in chat</button>}
      <p className="form-hint">Chat updates are optional. Review the draft and click Send reply yourself.</p>
      {context.access_history?.length > 0 && <details><summary>Return-access audit · {context.access_history.length} recent changes</summary><ol className="support-access-log">{context.access_history.map(event => <li key={event.id}><strong>{event.enabled ? 'Enabled' : 'Disabled'}</strong> · {items.find(item => item.line_id === event.order_item_id)?.product_name || event.order_item_id}<small>{event.actor} · {refundDate(event.created_at)}</small><p>{event.reason}</p></li>)}</ol></details>}
    </> : context && <p>{context.eligibility_message || 'No verified customer order is linked. Ask the customer to start order help from their signed-in account.'}</p>}
    {notice && <p role="status" className="inline-note">{notice}</p>}{error && <p role="alert" className="inline-error">{error}</p>}
  </section>;
}

export function SupportProductPicker({ orderId, selected, onChange, disabled }) {
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  useSupportRefresh(`/api/orders/${encodeURIComponent(orderId)}/support-context`, data => {
    setContext(data); setError('');
    onChange(current => current.filter(id => (data.items || []).some(item => item.line_id === id)));
  }, setError);
  return <fieldset className="support-product-picker"><legend>Which product do you need help with?</legend><p className="form-hint">Optional: select the relevant items so care can see the exact size, colour and purchased policy. Leave all unchecked for general order help.</p>
    {!context && !error && <p role="status">Loading purchased products…</p>}
    {(context?.items || []).map(item => <SupportProductSummary key={item.line_id} item={item}><label className="support-item-check"><input type="checkbox" checked={selected.includes(item.line_id)} disabled={disabled} onChange={event => onChange(current => event.target.checked ? [...current, item.line_id] : current.filter(id => id !== item.line_id))} />I need help with this product</label></SupportProductSummary>)}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </fieldset>;
}
