import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { money } from "../lib/commerce";
import { AdminReturnLogistics } from './AdminReturnLogistics';
import { AdminReturnModal } from './AdminReturnModal';
import { AdminComplaintCompletion } from './AdminComplaintCompletion';
import { useOrderActions } from '../lib/useOrderActions';
import { reportAdminError } from '../lib/adminFeedback';
import { SupportOrderContext } from './SupportOrderContext';

function date(value) { return value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"; }

function useResource(path, key) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [meta, setMeta] = useState({});
  useEffect(() => {
    let active = true;
    apiFetch(path).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not load ${key}`);
      if (active) { setItems(data[key] || []); setMeta({ gateway_refunds_enabled: data.gateway_refunds_enabled, automatic_gateway_refunds_enabled: data.automatic_gateway_refunds_enabled }); setError(""); }
    }).catch((requestError) => active && setError(requestError.message));
    return () => { active = false; };
  }, [path, key, version]);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  return { items, setItems, error, meta, refresh };
}

export function SupportView() {
  const resource = useResource("/api/admin/support/tickets", "tickets");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState("normal");
  const [ticketStatus, setTicketStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  const [replyError, setReplyError] = useState("");
  const visible = resource.items.filter((ticket) => status === "all" || ticket.status === status);
  const selected = resource.items.find((ticket) => ticket.id === selectedId) || visible[0];

  useEffect(() => {
    if (!selected) { setSelectedId(""); setMessages([]); return; }
    setSelectedId(selected.id); setMessages([]); setReply(''); setReplyError(''); setNote(selected.admin_note || ""); setPriority(selected.priority || "normal"); setTicketStatus(selected.status || "open");
    let active = true;
    apiFetch(`/api/support/tickets/${encodeURIComponent(selected.id)}/messages`).then(async (response) => { const data = await response.json(); if (active && response.ok) setMessages(data.messages || []); }).catch(() => active && setMessages([]));
    return () => { active = false; };
  }, [selected?.id]);

  async function saveTicket() {
    if (!selected) return;
    setBusy(true);
    try { const response = await apiFetch(`/api/admin/support/tickets/${encodeURIComponent(selected.id)}`, { method: "PATCH", body: JSON.stringify({ status: ticketStatus, priority, admin_note: note }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Ticket could not be updated"); resource.setItems((items) => items.map((item) => item.id === selected.id ? data.ticket : item)); } catch (error) { setReplyError(error.message); } finally { setBusy(false); }
  }
  async function sendReply(event) {
    event.preventDefault();
    if (!selected || !reply.trim()) return; setReplyError("");
    setBusy(true);
    try { const response = await apiFetch(`/api/support/tickets/${encodeURIComponent(selected.id)}/messages`, { method: "POST", body: JSON.stringify({ message: reply.trim() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Reply could not be sent"); setMessages((items) => [...items, data.message]); resource.setItems((items) => items.map((item) => item.id === selected.id ? data.ticket : item)); setReply(""); setTicketStatus(data.ticket.status); } catch (error) { reportAdminError(error); } finally { setBusy(false); }
  }

return <section className="admin-panel admin-wide-panel care-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Customer care</p><h2>Support inbox</h2></div><span>{visible.length} tickets</span></div>{resource.error && <p className="inline-note" role="alert">{resource.error}</p>}<div className="care-layout"><aside className="care-ticket-list"><label className="care-filter">Show<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All tickets</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label>{visible.map((ticket) => <button className={`care-ticket ${selected?.id === ticket.id ? "selected" : ""} ${ticket.priority === "urgent" ? "urgent" : ""}`} type="button" key={ticket.id} onClick={() => setSelectedId(ticket.id)}><span><strong>{ticket.subject}</strong><small>{ticket.ticket_number} · {ticket.customer_name || ticket.customer_email}</small></span><em>{ticket.status.replace("_", " ")}</em></button>)}{!visible.length && <div className="empty-state">No support tickets match this filter.</div>}</aside>{selected ? <section className="care-conversation"><div className="care-conversation-head"><div><p className="eyebrow">{selected.ticket_number}</p><h3>{selected.subject}</h3><p className="muted">{selected.customer_name || "Customer"} · {selected.customer_email}{selected.order_id ? ` · Order ${selected.order_id}` : ""}</p></div><span className={`status-pill ${selected.priority === "urgent" ? "status-cancelled" : "live"}`}>{selected.priority}</span></div><SupportOrderContext key={selected.id} ticketId={selected.id} onDraft={draft => setReply(current => current.trim() ? `${current}\n\n${draft}` : draft)} /><div className="care-messages" role="log" aria-live="polite">{messages.map((message) => <article className={`care-message ${message.sender_role === "admin" ? "from-admin" : "from-customer"}`} key={message.id}><div><strong>{message.sender_role === "admin" ? "Glamia care" : "Customer"}</strong><small>{date(message.created_at)}</small></div><p>{message.message}</p></article>)}{!messages.length && <div className="empty-state">No messages yet.</div>}</div><form className="care-reply-form" onSubmit={sendReply}><label>Reply<textarea rows="3" value={reply} onChange={(event) => setReply(event.target.value)} required placeholder="Write a clear reply…" /></label>{replyError && <p className="inline-error" role="alert">{replyError}</p>}<button className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send reply"} </button></form><div className="care-controls"><label>Status<select value={ticketStatus} onChange={(event) => setTicketStatus(event.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Internal note<textarea rows="2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Visible to admins only" /></label><button className="secondary-action" type="button" disabled={busy} onClick={saveTicket}>Save ticket</button></div></section> : <div className="care-empty"><strong>Select a ticket to open the conversation.</strong><span>Messages, priority, status, and internal notes stay together in one view.</span></div>}</div></section>;
}

const RETURN_STATUSES = ["requested", "approved", "rejected", "received", "refunded", "completed", "cancelled"];

function selectedReturnItems(value) {
  try { const items = JSON.parse(value || '[]'); return Array.isArray(items) ? items.filter(item => item && typeof item === 'object') : []; }
  catch { return []; }
}

function GatewayRefundControls({ request, user, enabled, onChanged }) {
  const refund = request.gateway_refund;
  const amount = String(request.refund_amount ?? request.order?.total ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState(null);
  const owner = Boolean(user?.is_owner);
  async function act(action) {
    if (!owner || busy) return;
    if (["approve", "execute", "recover", "process"].includes(action) && !window.confirm(action === "process" ? `Process ${money(request.refund_amount)} for the collected return? The saved purchased-item amount and original payment split are used. Confirmation depends on the provider.` : action === "approve"
      ? `Approve ₹${amount} for this returned order? The approved amount and original payment split will be locked.`
      : action === "recover" ? "Recover the existing Razorpay refund using its SAME idempotency key? This never creates a replacement refund ID."
      : `Send ${money(refund.gateway_amount)} back through ${refund.provider}${refund.credit_amount ? ` and restore ${money(refund.credit_amount)} to store credits once confirmed` : ""}?`)) return;
    setBusy(true); setError("");
    try {
      const response = await apiFetch(`/api/admin/returns/${encodeURIComponent(request.id)}/refund/${action}`, {
        method: "POST", body: JSON.stringify(action === "approve" ? { amount } : {})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Refund action failed");
      onChanged(data.request); setEvents(null);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  async function loadLog() {
    setBusy(true); setError("");
    try {
      const response = await apiFetch(`/api/admin/returns/${encodeURIComponent(request.id)}/refund`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load refund log");
      setEvents(data.events || []);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  if (request.type !== "refund" || request.refund_destination !== "original" || (!refund && request.status !== "received" && !request.pickup_confirmed_at)) return null;
  const labels = { approved: "Owner approved · not sent", submitting: "Sending · outcome not yet confirmed", pending: "Provider processing", reconciliation_required: "Needs reconciliation · do not create another refund", processed: "Payment provider confirmed", failed: "Provider reported failure · investigate" };
  return <div className="care-controls gateway-refund-controls">
    <strong>{refund?.state === "approved" && request.automatic_refund_requested_at && !request.automatic_refund_error ? "Automatic refund queued" : refund ? labels[refund.state] || refund.state : "Original-payment refund"}</strong>
    {request.automatic_refund_requested_at && <small>Automatically initiated from owner-confirmed return receipt.</small>}
    {request.automatic_refund_error && <p className="inline-error" role="alert">{request.automatic_refund_error}</p>}
    {refund ? <>
      <small>{money(refund.gateway_amount)} via {refund.provider}{refund.credit_amount ? ` + ${money(refund.credit_amount)} original store credits` : ""}</small>
      {refund.provider_refund_id && <small>Provider reference: {refund.provider_refund_id}</small>}
      {refund.checked_at && <small>Last checked: {date(refund.checked_at)}</small>}
      {refund.last_error && <p className="inline-error" role="status">{refund.last_error}</p>}
      {owner && refund.state === "approved" && (!request.automatic_refund_requested_at || request.automatic_refund_error) && <button type="button" className="primary-action" disabled={busy || !enabled} onClick={() => act("execute")}>Send approved refund</button>}
      {owner && ["submitting", "pending", "reconciliation_required"].includes(refund.state) && <button type="button" className="secondary-action" disabled={busy} onClick={() => act("reconcile")}>Check provider status</button>}
      {owner && refund.recovery_available && <button type="button" className="secondary-action" disabled={busy || !enabled} onClick={() => act("recover")}>Recover same Razorpay refund</button>}
      <button type="button" className="secondary-action" disabled={busy} onClick={loadLog}>View refund log</button>
    </> : request.automatic_refund_requested_at && !request.automatic_refund_error ? <>
      <small>Automatic refund queued · {money(request.automatic_refund_amount_paise / 100)}. The payment provider will be checked before money is marked refunded.</small>
    </> : owner ? <>
      <p>Saved selected-item refund: <strong>{money(request.refund_amount)}</strong></p>
      <small>Partial refunds use the purchased-item amount. Mixed payments split proportionally; whole-credit rounding is balanced through the gateway.</small>
      <button type="button" className="primary-action" disabled={busy || !enabled} onClick={() => act("process")}>Process refund</button>
    </> : <small>A whitelisted owner must approve and send this refund.</small>}
    {!enabled && owner && (!refund || refund.state === "approved" || refund.recovery_available) && <small>Gateway execution is disabled until sandbox verification is complete.</small>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {events && <ol aria-label="Refund audit log">{events.map((event, index) => <li key={index}><strong>{labels[event.state] || event.state}</strong> · {date(event.created_at)} · {event.actor}{event.provider_refund_id ? ` · ${event.provider_refund_id}` : ""}</li>)}{!events.length && <li>No refund actions recorded.</li>}</ol>}
  </div>;
}

function CreditRefundControls({request,user,onRefresh}) {
  const actions=useOrderActions(()=>onRefresh());
  if(request.type!=='refund'||request.refund_destination!=='store_credit'||request.credit_approval_status==='credited')return null;
  const eligible=request.status==='received'||(request.status==='approved'&&request.pickup_confirmed_at);
  return <div className="care-controls"><p>Store-credit payout requires confirmed collection or warehouse receipt and whitelisted-admin approval.</p>{user?.is_owner&&<button type="button" className="primary-action" disabled={!eligible||actions.busy} onClick={()=>{if(window.confirm(`Issue ${money(request.refund_amount)} in store credits for this collected return?`))actions.processCreditRefund(request.id);}}>Process store-credit refund</button>}{!user?.is_owner&&<p className="form-hint">A whitelisted admin must process this refund.</p>}{actions.error&&<p role="alert" className="inline-error">{actions.error}</p>}</div>;
}

export function ReturnsView({ user }) {
  const resource = useResource("/api/returns?scope=admin", "requests");
  const [status, setStatus] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [manageId,setManageId]=useState('');
  const [completionId,setCompletionId]=useState('');
  const managed=resource.items.find(request=>request.id===manageId);
  const visible = useMemo(() => resource.items.filter((request) => status === "all" || (request.case_completed_at ? 'completed' : request.status) === status), [resource.items, status]);
  const automaticPending = resource.items.some(request => request.automatic_refund_requested_at && !request.automatic_refund_error
    && (!request.gateway_refund || ["approved", "submitting"].includes(request.gateway_refund.state)) && request.status === "received");
  const refresh = resource.refresh;
  useEffect(() => {
    if (!automaticPending) return undefined;
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [automaticPending, refresh]);
  async function update(request, nextStatus) {
    if (nextStatus === "received" && request.type === "refund" && request.refund_destination === "original" && resource.meta.automatic_gateway_refunds_enabled
      && !window.confirm(`Mark this return Received and automatically refund ${money(request.refund_amount)} through the original payment? Only confirm after receiving the selected returned goods.`)) return;
    if(nextStatus==='rejected') { const note=window.prompt('Explain the decision to the customer (at least 10 characters)',request.notes||''); if(note===null)return;request={...request,notes:note}; }
    setBusyId(request.id);
    try { const response = await apiFetch(`/api/admin/returns/${encodeURIComponent(request.id)}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, notes: request.notes || "", refund_amount: request.refund_amount ?? request.order?.total ?? 0 }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "After-sales request could not be updated"); resource.setItems((items) => items.map((item) => item.id === request.id ? data.request : item)); } catch (error) { reportAdminError(error); } finally { setBusyId(""); }
  }
  function changed(next) { resource.setItems(items => items.map(item => item.id === next.id ? next : item)); }
  return <section className="admin-panel admin-wide-panel">
    <div className="admin-panel-heading"><div><p className="eyebrow">Customer care</p><h2>Returns and exchanges</h2></div><span>{visible.length} requests</span></div>
    {resource.error && <p className="inline-error" role="alert">{resource.error}</p>}
    {resource.meta.automatic_gateway_refunds_enabled && <p className="inline-note">Original-payment refunds start automatically when a whitelisted owner marks the selected return items Received. Only the saved selected-item amount is refunded. Mixed payments use a proportional split. Store-credit refunds retain separate owner approval.</p>}
    <button type="button" className="secondary-action" onClick={refresh}>Refresh requests</button>
    <div className="admin-filters"><label>Show<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All requests</option>{RETURN_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    <div className="operations-list">{visible.map(request => <article className={`operation-row return-operation-row ${request.type === "exchange" ? "is-exchange" : ""}`} key={request.id}>
      <div className="return-type-mark">{request.type === "exchange" ? "EX" : "RF"}</div>
      <div className="operation-main"><strong>{request.type === "exchange" ? "Exchange request" : "Return / Refund request"}</strong>
        <span>{request.order?.order_number || request.order_id || "Order unavailable"} · {request.customer_name || request.customer_email}</span>
        <small>{request.customer_email} · {date(request.created_at)} · {request.reason}</small>
        {request.type === "exchange" && <small>Size {request.exchange_from_size || "—"} → {request.exchange_to_size || "—"}{request.replacement_order_number ? ` · Replacement ${request.replacement_order_number}` : ""}</small>}
        {request.refund_destination === "store_credit" && <span className="store-credit-note">Store credit refund · {money(request.refund_amount || request.order?.total)}</span>}
        <GatewayRefundControls request={request} user={user} enabled={resource.meta.gateway_refunds_enabled === true} onChanged={changed} />
        <CreditRefundControls request={request} user={user} onRefresh={refresh}/>
        {selectedReturnItems(request.selected_items_json).length > 0 && <small>Selected: {selectedReturnItems(request.selected_items_json).map(item=>`${item.product_name} · ${item.size||'One size'} × ${item.quantity}`).join('; ')}</small>}
        <AdminReturnLogistics key={request.id} request={request} onChanged={changed}/>
        <button type="button" className="secondary-action" onClick={()=>setManageId(request.id)}>Manage request / approval</button>
        {!request.case_completed_at&&<button type="button" className="secondary-action" disabled={Boolean(completionId&&completionId!==request.id)} aria-expanded={completionId===request.id} aria-controls={`complaint-completion-${request.id}`} onClick={()=>setCompletionId(request.id)}>Mark complaint completed</button>}
        <div id={`complaint-completion-${request.id}`} hidden={completionId!==request.id}>
          {completionId===request.id&&<AdminComplaintCompletion key={request.id} request={request} onChanged={changed} inline onCancel={()=>setCompletionId('')}/>}
        </div>
        {request.case_completed_at&&<small>Complaint completed · {date(request.case_completed_at)}. Refund and fulfilment remain tracked separately.</small>}
      </div>
      <div className="operation-actions"><span className={`status-pill ${request.case_completed_at || ["refunded","completed"].includes(request.status) ? "live" : request.status === "requested" ? "status-cancelled" : ""}`}>{request.case_completed_at ? 'Complaint completed' : request.status}</span>
        {request.case_completed_at&&<small>Workflow: {request.status}</small>}
        <select aria-label={`Update request ${request.id}`} value={request.status} disabled={busyId === request.id || Boolean(request.gateway_refund && request.gateway_refund.state !== "processed")} onChange={event => update(request,event.target.value)}>
          {RETURN_STATUSES.filter(value => value === request.status || (request.gateway_refund ? request.gateway_refund.state === "processed" && value === "completed"
            : value !== "refunded" && (value !== "completed" || request.type === "exchange" || request.credit_approval_status === "credited")))
            .filter(value => value !== "received" || request.status === "received" || user?.is_owner || !resource.meta.automatic_gateway_refunds_enabled || request.type !== "refund" || request.refund_destination !== "original")
            .map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </article>)}{!visible.length && <div className="empty-state">No requests match this filter.</div>}</div>
    {managed&&<AdminReturnModal request={managed} onChanged={changed} onClose={()=>setManageId('')}/>}
  </section>;
}
