import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { money } from "../lib/commerce";

function date(value) { return value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"; }

function useResource(path, key) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    apiFetch(path).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not load ${key}`);
      if (active) setItems(data[key] || []);
    }).catch((requestError) => active && setError(requestError.message));
    return () => { active = false; };
  }, [path, key, version]);
  return { items, setItems, error, refresh: () => setVersion((value) => value + 1) };
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
    setSelectedId(selected.id); setNote(selected.admin_note || ""); setPriority(selected.priority || "normal"); setTicketStatus(selected.status || "open");
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
    try { const response = await apiFetch(`/api/support/tickets/${encodeURIComponent(selected.id)}/messages`, { method: "POST", body: JSON.stringify({ message: reply.trim() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Reply could not be sent"); setMessages((items) => [...items, data.message]); resource.setItems((items) => items.map((item) => item.id === selected.id ? data.ticket : item)); setReply(""); setTicketStatus(data.ticket.status); } catch (error) { window.alert(error.message); } finally { setBusy(false); }
  }

  return <section className="admin-panel admin-wide-panel care-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Customer care</p><h2>Support inbox</h2></div><span>{visible.length} tickets</span></div>{resource.error && <p className="inline-note" role="alert">{resource.error}</p>}<div className="care-layout"><aside className="care-ticket-list"><label className="care-filter">Show<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All tickets</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label>{visible.map((ticket) => <button className={`care-ticket ${selected?.id === ticket.id ? "selected" : ""} ${ticket.priority === "urgent" ? "urgent" : ""}`} type="button" key={ticket.id} onClick={() => setSelectedId(ticket.id)}><span><strong>{ticket.subject}</strong><small>{ticket.ticket_number} · {ticket.customer_name || ticket.customer_email}</small></span><em>{ticket.status.replace("_", " ")}</em></button>)}{!visible.length && <div className="empty-state">No support tickets match this filter.</div>}</aside>{selected ? <section className="care-conversation"><div className="care-conversation-head"><div><p className="eyebrow">{selected.ticket_number}</p><h3>{selected.subject}</h3><p className="muted">{selected.customer_name || "Customer"} · {selected.customer_email}{selected.order_id ? ` · Order ${selected.order_id}` : ""}</p></div><span className={`status-pill ${selected.priority === "urgent" ? "status-cancelled" : "live"}`}>{selected.priority}</span></div><div className="care-messages" role="log" aria-live="polite">{messages.map((message) => <article className={`care-message ${message.sender_role === "admin" ? "from-admin" : "from-customer"}`} key={message.id}><div><strong>{message.sender_role === "admin" ? "Glamia care" : "Customer"}</strong><small>{date(message.created_at)}</small></div><p>{message.message}</p></article>)}{!messages.length && <div className="empty-state">No messages yet.</div>}</div><form className="care-reply-form" onSubmit={sendReply}><label>Reply<textarea rows="3" value={reply} onChange={(event) => setReply(event.target.value)} required placeholder="Write a clear reply…" /></label>{replyError && <p className="inline-error" role="alert">{replyError}</p>}<button className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send reply"} <span aria-hidden="true">↗</span></button></form><div className="care-controls"><label>Status<select value={ticketStatus} onChange={(event) => setTicketStatus(event.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Internal note<textarea rows="2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Visible to admins only" /></label><button className="secondary-action" type="button" disabled={busy} onClick={saveTicket}>Save ticket</button></div></section> : <div className="care-empty"><strong>Select a ticket to open the conversation.</strong><span>Messages, priority, status, and internal notes stay together in one view.</span></div>}</div></section>;
}

const RETURN_STATUSES = ["requested", "approved", "rejected", "received", "refunded", "completed", "cancelled"];

export function ReturnsView() {
  const resource = useResource("/api/returns?scope=admin", "requests");
  const [status, setStatus] = useState("all");
  const [busyId, setBusyId] = useState("");
  const visible = useMemo(() => resource.items.filter((request) => status === "all" || request.status === status), [resource.items, status]);
  async function update(request, nextStatus) {
    setBusyId(request.id);
    try { const response = await apiFetch(`/api/admin/returns/${encodeURIComponent(request.id)}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, notes: request.notes || "", refund_amount: request.refund_amount ?? request.order?.total ?? 0 }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "After-sales request could not be updated"); resource.setItems((items) => items.map((item) => item.id === request.id ? data.request : item)); } catch (error) { window.alert(error.message); } finally { setBusyId(""); }
  }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Customer care</p><h2>Returns and exchanges</h2></div><span>{visible.length} requests</span></div><div className="admin-filters"><label>Show<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All requests</option>{RETURN_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><div className="operations-list">{visible.map((request) => <article className={`operation-row return-operation-row ${request.type === "exchange" ? "is-exchange" : ""}`} key={request.id}><div className="return-type-mark">{request.type === "exchange" ? "EX" : "RF"}</div><div className="operation-main"><strong>{request.type === "exchange" ? "Exchange request" : "Return / Refund request"}</strong><span>{request.order?.order_number || request.order_id || "Order unavailable"} · {request.customer_name || request.customer_email}</span><small>{request.customer_email} · {date(request.created_at)} · {request.reason}</small>{request.type === "exchange" && <small>Size {request.exchange_from_size || "—"} → {request.exchange_to_size || "—"}{request.replacement_order_number ? ` · Replacement ${request.replacement_order_number}` : ""}</small>}{request.refund_destination === "store_credit" && <span className="store-credit-note">Store credit refund · {money(request.refund_amount || request.order?.total)}</span>}</div><div className="operation-actions"><span className={`status-pill ${request.status === "refunded" || request.status === "completed" ? "live" : request.status === "requested" ? "status-cancelled" : ""}`}>{request.status}</span><select aria-label={`Update request ${request.id}`} value={request.status} disabled={busyId === request.id} onChange={(event) => update(request, event.target.value)}>{RETURN_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></div></article>)}{!visible.length && <div className="empty-state">No requests match this filter.</div>}</div></section>;
}
