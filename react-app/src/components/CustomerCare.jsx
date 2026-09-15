import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

function readJson(response) {
  return response.json().catch(() => ({})).then((data) => ({ response, data }));
}

function SupportTopics({ onChoose }) {
  const topics = [
    ["Where is my order?", "Order tracking", "Delivery, tracking, or order status", "↗"],
    ["I need help with a return or exchange", "Return or exchange", "Size change, return, or refund help", "↺"],
    ["I have a product question", "Product question", "Fit, fabric, care, or availability", "?"],
  ];
  return <div className="customer-support-topics">{topics.map(([subject, title, detail, icon]) => <button type="button" className="customer-support-topic" key={subject} onClick={() => onChoose(subject)}><span>{icon}</span><strong>{title}</strong><small>{detail}</small></button>)}</div>;
}

function SupportConversation({ ticket, messages, user, onReply }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!ticket) return <div className="customer-support-empty"><strong>Select a request</strong><span>Your conversation will appear here.</span></div>;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onReply(ticket.id, message); setMessage(""); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  return <section className="customer-support-conversation"><div className="customer-support-conversation-head"><div><p className="eyebrow">{ticket.ticket_number}</p><h2>{ticket.subject}</h2><span>{ticket.status.replace(/_/g, " ")} · {ticket.priority} priority</span></div><span className="support-status-dot" /></div><div className="customer-support-messages" role="log" aria-live="polite">{messages.map((item) => <article className={`customer-support-message ${item.sender_role === "customer" ? "from-customer" : "from-admin"}`} key={item.id}><div><strong>{item.sender_role === "admin" ? "Glamia care" : "You"}</strong><small>{item.created_at ? new Date(item.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : ""}</small></div><p>{item.message}</p></article>)}</div>{user ? <form className="customer-support-reply" onSubmit={submit}><label>Reply<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows="3" maxLength="2000" required placeholder="Add more context or reply to the care team…" /></label>{error && <p className="inline-error" role="alert">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send reply"} <span aria-hidden="true">↗</span></button></form> : <p className="inline-note">Sign in to continue this conversation.</p>}</section>;
}

export function CustomerSupportPage({ user, onNavigate }) {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [form, setForm] = useState({ email: user?.email || "", name: user?.name || "", order_id: "", subject: "", message: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setForm((current) => ({ ...current, email: user?.email || current.email, name: user?.name || current.name })); }, [user]);
  useEffect(() => { let active = true; if (!user) return undefined; apiFetch("/api/support/tickets").then(readJson).then(({ response, data }) => { if (!response.ok) throw new Error(data.error || "Support history could not be loaded"); if (active) { setTickets(data.tickets || []); if (data.tickets?.[0]) setSelectedId(data.tickets[0].id); } }).catch((requestError) => active && setError(requestError.message)); return () => { active = false; }; }, [user]);
  useEffect(() => { let active = true; if (!selectedId) { setMessages([]); return undefined; } apiFetch(`/api/support/tickets/${encodeURIComponent(selectedId)}/messages`).then(readJson).then(({ response, data }) => { if (!response.ok) throw new Error(data.error || "Conversation could not be loaded"); if (active) setMessages(data.messages || []); }).catch((requestError) => active && setError(requestError.message)); return () => { active = false; }; }, [selectedId]);

  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function chooseSubject(subject) { setForm((current) => ({ ...current, subject })); document.getElementById("customer-support-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  async function createTicket(event) {
    event.preventDefault(); setBusy(true); setStatus(""); setError("");
    try { const { response, data } = await readJson(await apiFetch("/api/support/tickets", { method: "POST", body: JSON.stringify(form) })); if (!response.ok) throw new Error(data.error || "Support request could not be sent"); setStatus("Your request is with the Glamia care team."); setForm((current) => ({ ...current, order_id: "", subject: "", message: "" })); if (user) { const list = await readJson(await apiFetch("/api/support/tickets")); if (list.response.ok) { setTickets(list.data.tickets || []); setSelectedId(data.ticket?.id || ""); } } else { setSelectedId(data.ticket?.id || ""); setMessages([{ id: `new-${Date.now()}`, sender_role: "customer", message: form.message, created_at: new Date().toISOString() }]); } } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  async function reply(ticketId, message) { const { response, data } = await readJson(await apiFetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: "POST", body: JSON.stringify({ message }) })); if (!response.ok) throw new Error(data.error || "Reply could not be sent"); setMessages((current) => [...current, data.message]); setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, ...data.ticket } : ticket)); }

  return <main className="page-main"><section className="customer-support-page"><div className="customer-support-hero"><div><p className="eyebrow">Glamia care</p><h1 className="page-title">How can we help?</h1><p className="muted">Share a question, order concern, or sizing issue. Your request stays connected to the conversation.</p></div><div className="support-response-card"><span className="support-status-dot" /><strong>Care team</strong><small>We’ll keep your order details in context.</small></div></div><div className="customer-support-layout"><aside className="customer-support-guide"><p className="eyebrow">Start here</p><h2>What do you need?</h2><p className="muted">Choose a topic to prefill your request, or write your own.</p><SupportTopics onChoose={chooseSubject} /><button className="text-link" type="button" onClick={() => onNavigate("/return-policy")}>Read returns policy ↗</button></aside><form id="customer-support-form" className="customer-support-form" onSubmit={createTicket}><div className="customer-support-form-head"><div><p className="eyebrow">Send a request</p><h2>Tell us what happened</h2></div><span>Usually answered in context</span></div><div className="form-row"><label>Email<input name="email" type="email" value={form.email} onChange={change} required maxLength="254" placeholder="you@example.com" /></label><label>Name<input name="name" value={form.name} onChange={change} maxLength="100" placeholder="Your name" /></label></div><div className="form-row"><label>Order number <span className="form-hint">optional</span><input name="order_id" value={form.order_id} onChange={change} maxLength="100" placeholder="GM-20260909-…" /></label><label>Subject<input name="subject" value={form.subject} onChange={change} required maxLength="140" placeholder="What can we help with?" /></label></div><label>Message<textarea name="message" value={form.message} onChange={change} required minLength="10" maxLength="2000" rows="7" placeholder="Add the details our care team should know." /></label>{error && <p className="inline-error" role="alert">{error}</p>}{status && <p className="inline-note" role="status">{status}</p>}<div className="form-actions"><span className="form-hint">Please don’t include payment passwords or one-time codes.</span><button className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send request"} <span aria-hidden="true">↗</span></button></div></form></div><section className="customer-support-history"><div className="customer-support-history-head"><div><p className="eyebrow">Your requests</p><h2>Support history</h2></div><span>{tickets.length} request{tickets.length === 1 ? "" : "s"}</span></div><div className="customer-support-history-layout"><div className="customer-support-ticket-list">{tickets.map((ticket) => <button type="button" className={`customer-support-ticket ${selectedId === ticket.id ? "selected" : ""} ${ticket.priority === "urgent" ? "urgent" : ""}`} key={ticket.id} onClick={() => setSelectedId(ticket.id)}><strong>{ticket.subject}</strong><small>{ticket.ticket_number} · {ticket.status.replace(/_/g, " ")}</small><span>{new Date(ticket.updated_at || ticket.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span></button>)}{!tickets.length && <div className="customer-support-empty"><strong>{user ? "No requests yet" : "Sign in to see your history"}</strong><span>{user ? "Send a request above and your conversation will stay here." : "You can still send a request as a guest using your email."}</span></div>}</div><SupportConversation ticket={tickets.find((ticket) => ticket.id === selectedId)} messages={messages} user={user} onReply={reply} /></div></section></section></main>;
}

export function AfterSalesDialog({ order, products, onClose, onComplete }) {
  const [type, setType] = useState("refund");
  const firstItem = order?.items?.[0] || {};
  const [productId, setProductId] = useState(firstItem.product_id || firstItem.id || "");
  const [fromSize, setFromSize] = useState(firstItem.size || "");
  const [toSize, setToSize] = useState("");
  const demoPayment = ["cod", "demo"].includes(order?.payment_method);
  const [destination, setDestination] = useState(demoPayment ? "store_credit" : "original");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const chosenItem = (order?.items || []).find((item) => (item.product_id || item.id) === productId && (!fromSize || item.size === fromSize)) || firstItem;
  const product = products.find((entry) => entry.id === productId);
  const sizeStock = product?.size_stock || {};
  const availableSizes = (product?.sizes || Object.keys(sizeStock)).filter((size) => String(size).toLowerCase() !== String(fromSize).toLowerCase() && (sizeStock[size] === undefined || Number(sizeStock[size]) >= Number(chosenItem.quantity || 1)));
  const isExchangeUnavailable = type === "exchange" && !availableSizes.length;

  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus("");
    try { const { response, data } = await readJson(await apiFetch(`/api/orders/${encodeURIComponent(order.id)}/returns`, { method: "POST", body: JSON.stringify({ type: type === "refund" ? "return_refund" : type, reason, refund_destination: destination, exchange_product_id: productId, exchange_from_size: fromSize, exchange_to_size: toSize }) })); if (!response.ok) throw new Error(data.error || "Request could not be submitted"); onComplete(data); } catch (requestError) { setStatus(requestError.message); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" role="presentation"><section className="after-sales-dialog" role="dialog" aria-modal="true" aria-labelledby="after-sales-title"><div className="customer-support-form-head"><div><p className="eyebrow">After-sales care</p><h2 id="after-sales-title">{type === "exchange" ? "Exchange this item" : "Return / Refund"}</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button></div><p className="muted">Order {order.order_number} · Delivered orders can be requested within the return window.</p><form className="account-form" onSubmit={submit}><label>Request type<select value={type} onChange={(event) => setType(event.target.value)}><option value="refund">Return / Refund</option><option value="exchange">Exchange for another size</option></select></label>{type === "exchange" && <><label>Product<select value={productId} onChange={(event) => { setProductId(event.target.value); setToSize(""); }}>{(order.items || []).map((item) => <option key={`${item.product_id || item.id}-${item.size}`} value={item.product_id || item.id}>{item.name || item.product_name || item.id}{item.size ? ` · ${item.size}` : ""}</option>)}</select></label><label>Current size<input value={fromSize} onChange={(event) => { setFromSize(event.target.value); setToSize(""); }} /></label>{isExchangeUnavailable ? <p className="inline-note">No other size is available for this product. Please proceed with Return / Refund.</p> : <label>Replacement size<select required value={toSize} onChange={(event) => setToSize(event.target.value)}><option value="">Choose an available size</option>{availableSizes.map((size) => <option key={size} value={size}>{size}{sizeStock[size] !== undefined ? ` · ${sizeStock[size]} available` : ""}</option>)}</select></label>}</>}{type !== "exchange" && <label>Refund destination<select value={destination} onChange={(event) => setDestination(event.target.value)} disabled={demoPayment}><option value="store_credit">Glamia store credits · instant</option><option value="original">Original payment method · bank processing time</option></select>{demoPayment && <small className="form-hint">Demo-payment refunds are available only as store credits.</small>}</label>}<label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength="3" maxLength="500" rows="4" required placeholder="Tell us what happened…" /></label>{status && <p className="inline-error" role="alert">{status}</p>}<div className="form-actions"><button className="secondary-action" type="button" onClick={onClose}>Cancel</button><button className="primary-action" disabled={busy || isExchangeUnavailable || (type === "exchange" && !toSize)}>{busy ? "Submitting…" : "Submit request"} <span aria-hidden="true">↗</span></button></div></form></section></div>;
}
