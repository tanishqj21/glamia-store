import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { SupportOrderDetails, SupportOrderPicker } from "./SupportOrderPicker";
import { useSupportRefresh } from '../lib/useSupportRefresh';
import { refundDate } from '../lib/commerce';
import { SupportProductPicker } from './SupportOrderContext';

function readJson(response) {
  return response.json().catch(() => ({})).then((data) => ({ response, data }));
}

function SupportTopics({ onChoose, disabled }) {
  const topics = [
    ["Where is my order?", "Order tracking", "Delivery, tracking, or order status"],
    ["I need help with a return or exchange", "Return or exchange", "Size change, return, or refund help"],
    ["I have a product question", "Product question", "Fit, fabric, care, or availability"],
  ];
  return <div className="customer-support-topics">{topics.map(([subject, title, detail], index) => <button type="button" className="customer-support-topic" disabled={disabled} key={subject} onClick={() => onChoose(subject)}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><strong>{title}</strong><small>{detail}</small></button>)}</div>;
}

function SupportConversation({ ticket, messages, user, onReply, onEscalate, replyHours }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setNow(Date.now());},60000);return()=>clearInterval(timer);},[]);
  if (!ticket) return <div className="customer-support-empty"><strong>Select a request</strong><span>Your conversation will appear here.</span></div>;
  const latest=messages.at(-1);
  const raw=latest?.created_at||ticket.created_at;
  const waitingSince=Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw||'')?raw.replace(' ','T')+'Z':raw);
  const waiting=latest?.sender_role!=='admin'&&!['resolved','closed'].includes(ticket.status);
  const overdue=waiting&&Number.isFinite(waitingSince)&&now-waitingSince>replyHours*3600000;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onReply(ticket.id, message); setMessage(""); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  return <section className="customer-support-conversation"><div className="customer-support-conversation-head"><div><p className="eyebrow">{ticket.ticket_number}</p><h2>{ticket.subject}</h2><span>{ticket.status.replace(/_/g, " ")} · {ticket.priority} priority</span></div><span className="support-status-dot" /></div><p className="inline-note">{waiting ? `Reply target: ${replyHours} hours from your latest message (a target, not a guaranteed response time).` : 'The care team has replied. You can continue below.'}</p>{overdue && <button type="button" className="secondary-action" onClick={()=>onEscalate(ticket.id)} disabled={ticket.priority==='urgent'}>{ticket.priority==='urgent'?'Priority review requested':'Request priority review'}</button>}<div className="customer-support-messages" role="log" aria-live="polite">{messages.map((item) => <article className={`customer-support-message ${item.sender_role === "customer" ? "from-customer" : "from-admin"}`} key={item.id}><div><strong>{item.sender_role === "admin" ? "Glamia care" : "You"}</strong><small>{item.created_at ? refundDate(item.created_at) : ""}</small></div><p>{item.message}</p></article>)}</div>{user ? <form className="customer-support-reply" onSubmit={submit}><label>Reply<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows="3" maxLength="2000" required placeholder="Add more context or reply to the care team…" /></label>{error && <p className="inline-error" role="alert">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send reply"} </button></form> : <p className="inline-note">Sign in to continue this conversation.</p>}</section>;
}

export function CustomerSupportPage({ user, onNavigate, storefront, render }) {
  // Switching accounts or signing out clears private orders and conversations.
  return <CustomerSupportContent key={user?.email || "guest"} user={user} onNavigate={onNavigate} storefront={storefront} render={render} />;
}

function CustomerSupportContent({ user, onNavigate, storefront, render }) {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [form, setForm] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    const orderReference = (query.get("order") || "").slice(0, 100);
    const refundReference = (query.get("refund") || "").slice(0, 100);
    return { email: user?.email || "", name: user?.name || "", order_id: orderReference,
      subject: refundReference ? "Help with my refund" : query.get('topic') === 'return_exchange' ? 'I need help with a return or exchange' : "",
      message: refundReference ? `I'd like an update on refund request ${refundReference}${orderReference ? ` for order ${orderReference}` : ""}.` : "" };
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requesting,setRequesting]=useState(false);
  const replyHours=Number(storefront?.customer_experience?.support_hours)||48;

  const [afterSales, setAfterSales] = useState(() => { const query = new URLSearchParams(window.location.search); return Boolean(query.get('refund')) || query.get('topic') === 'return_exchange'; });
  const [supportLines, setSupportLines] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const selectSupportOrder = useCallback(order => {
    const query = new URLSearchParams(window.location.search);
    const linkedItem = (query.get('item') || '').slice(0, 100);
    setSupportLines(linkedItem && [order.id, order.order_number].includes(query.get('order')) ? [linkedItem] : []);
    setSelectedOrder({ ...order, supportAccountEmail: user?.email });
    setForm(current => ({ ...current, order_id: order.order_number || order.id }));
  }, [user?.email]);
  const accountOrder = user && selectedOrder?.supportAccountEmail === user.email ? selectedOrder : null;

  const refreshTickets=useSupportRefresh(user?'/api/support/tickets':null,data=>{setTickets(data.tickets||[]);setSelectedId(current=>current||data.tickets?.[0]?.id||'');},setError);
  const refreshMessages=useSupportRefresh(user&&selectedId?`/api/support/tickets/${encodeURIComponent(selectedId)}/messages`:null,data=>{setMessages(data.messages||[]);},setError);
  async function escalate(id){
    const {response,data}=await readJson(await apiFetch(`/api/support/tickets/${encodeURIComponent(id)}/escalate`,{method:'POST',body:'{}'}));
    if(!response.ok){setError(data.error||'Could not request priority review');return;}
    setStatus('Priority review requested. The care team has been notified.');refreshTickets();
  }

  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function chooseSubject(subject) { setRequesting(false); setAfterSales(subject === "I need help with a return or exchange"); setSelectedOrder(null); setError(""); setStatus(""); setForm((current) => ({ ...current, subject, order_id: "" })); document.getElementById("customer-support-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  async function createTicket(event) {
    event.preventDefault();
    if (busy) return;
    if (afterSales && (!user || !accountOrder)) { setError("Choose the order you need help with first."); return; }
    setBusy(true); setStatus(""); setError("");
    try {
      const payload = { ...form, ...(user ? { email: user.email, name: form.name || user.name || "" } : {}), ...(afterSales ? { topic: "return_exchange", order_id: accountOrder.id, item_line_ids: supportLines } : {}) };
      const { response, data } = await readJson(await apiFetch("/api/support/tickets", { method: "POST", body: JSON.stringify(payload) }));
      if (!response.ok) throw new Error(data.error || "Support request could not be sent");
      setStatus("Your request is with the Glamia care team.");
      setForm(current => ({ ...current, order_id: "", subject: "", message: "" }));
      setSelectedOrder(null); setAfterSales(false);
      if (user) {
        // Sending succeeded even if a subsequent history refresh fails.
        if (data.ticket) { setTickets(current => [data.ticket, ...current.filter(ticket => ticket.id !== data.ticket.id)]); setMessages([]); setSelectedId(data.ticket.id); }
      } else { setSelectedId(data.ticket?.id || ""); setMessages([{ id: `new-${Date.now()}`, sender_role: "customer", message: form.message, created_at: new Date().toISOString() }]); }
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  async function reply(ticketId, message) { const { response, data } = await readJson(await apiFetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: "POST", body: JSON.stringify({ message }) })); if (!response.ok) throw new Error(data.error || "Reply could not be sent"); setMessages((current) => [...current, data.message]); setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, ...data.ticket } : ticket)); }

  if (render) return render({ user, onNavigate, storefront, tickets, selectedId, setSelectedId, messages, setMessages, form, setForm, status, error, busy, replyHours, afterSales, setAfterSales, supportLines, setSupportLines, accountOrder, selectSupportOrder, refreshTickets, refreshMessages, escalate, change, chooseSubject, createTicket, reply });
  return <main className="page-main"><section className="customer-support-page">
    <div className="customer-support-hero"><div><p className="eyebrow">Glamia care</p><h1 className="page-title">How can we help?</h1><p className="muted">Share a question, order concern, or sizing issue. Your request stays connected to the conversation.</p></div><div className="support-response-card"><span className="support-status-dot" /><strong>Care team</strong><small>We’ll keep your order details in context.</small></div></div>
    <div className="refund-actions"><button type="button" className="secondary-action" onClick={()=>{chooseSubject("I need help with a return or exchange");setRequesting(true);}}>Start a return or exchange</button><button type="button" className="secondary-action" onClick={()=>{chooseSubject("I need help with a return or exchange");setRequesting(false);}}>Help with an existing request</button></div><div className="customer-support-layout">
      <aside className="customer-support-guide"><p className="eyebrow">Start here</p><h2>What do you need?</h2><p className="muted">Choose a topic to start your request, or write your own.</p><SupportTopics onChoose={chooseSubject} disabled={busy} /><button className="text-link" type="button" onClick={() => onNavigate("/return-policy")}>Read returns policy</button></aside>
      <form id="customer-support-form" className="customer-support-form" onSubmit={createTicket}>
        <div className="customer-support-form-head"><div><p className="eyebrow">Send a request</p><h2>{afterSales ? "Return, refund or exchange help" : "Tell us what happened"}</h2></div></div>
        {afterSales && (!user ? <div className="customer-support-empty"><strong>Sign in to choose your order</strong><span>Your order details and account contact information will be filled automatically.</span><button className="primary-action" type="button" onClick={() => onNavigate("/login")}>Sign in</button></div> : !accountOrder ? <SupportOrderPicker key={user.email} initialReference={form.order_id} onSelect={selectSupportOrder} onNavigate={onNavigate} /> : <section className="support-selected-order" aria-label="Selected order"><p className="eyebrow">01 / Your selected order</p><SupportOrderDetails order={accountOrder} />{requesting && <button className="primary-action" type="button" onClick={()=>setRequesting('open')}>Choose items and refund / exchange</button>}<button className="secondary-action" type="button" disabled={busy} onClick={() => { setSelectedOrder(null); setForm(current => ({ ...current, order_id: "" })); }}>Choose another order</button></section>)}
        {(!afterSales || accountOrder) && <>
          {afterSales && <><SupportProductPicker key={accountOrder.id} orderId={accountOrder.id} selected={supportLines} onChange={setSupportLines} disabled={busy} /><div><p className="eyebrow">02 / Tell us what you need</p><p className="muted">Describe the issue or ask for a status update. This sends a message to Glamia care, not a new refund or exchange request.</p></div></>}
          {user ? <div className="support-account-contact"><p>We’ll use the name and email on your signed-in account. You don’t need to enter them again.</p><details><summary>Contact details · optional</summary><div className="form-row"><label>Email <span className="form-hint">from your account</span><input name="email" type="email" value={user.email || ""} readOnly /></label><label>Name <span className="form-hint">optional</span><input name="name" value={form.name} onChange={change} maxLength="100" disabled={busy} placeholder="Your name" /></label></div></details></div> : <div className="form-row"><label>Email <span className="form-hint">needed for a reply when not signed in</span><input name="email" type="email" value={form.email} onChange={change} required maxLength="254" placeholder="you@example.com" /></label><label>Name <span className="form-hint">optional</span><input name="name" value={form.name} onChange={change} maxLength="100" placeholder="Your name" /></label></div>}
          <div className="form-row"><label>Order number <span className="form-hint">{afterSales ? "selected above" : "optional"}</span><input name="order_id" value={form.order_id} onChange={change} readOnly={afterSales} disabled={busy} maxLength="100" placeholder="Your Glamia order number" /></label><label>Subject<input name="subject" value={form.subject} onChange={change} disabled={busy} required maxLength="140" placeholder="What can we help with?" /></label></div>
          <label>Message<textarea name="message" value={form.message} onChange={change} disabled={busy} required minLength="10" maxLength="2000" rows="5" placeholder="Add the details our care team should know." /></label>
          <div className="form-actions"><span className="form-hint">Please don’t include payment passwords or one-time codes.</span><button className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send request"}</button></div>
        </>}
        {error && <p className="inline-error" role="alert">{error}</p>}{status && <p className="inline-note" role="status">{status}</p>}
      </form>
    </div>
    <section className="customer-support-history"><div className="customer-support-history-head"><div><p className="eyebrow">Your requests</p><h2>Support history</h2></div><button type="button" className="secondary-action" onClick={()=>{refreshTickets();refreshMessages();}}>Refresh conversations</button><span>{tickets.length} request{tickets.length === 1 ? "" : "s"}</span></div><div className="customer-support-history-layout"><div className="customer-support-ticket-list">{tickets.map((ticket) => <button type="button" className={`customer-support-ticket ${selectedId === ticket.id ? "selected" : ""} ${ticket.priority === "urgent" ? "urgent" : ""}`} key={ticket.id} onClick={() => { if(selectedId!==ticket.id)setMessages([]); setSelectedId(ticket.id); }}><strong>{ticket.subject}</strong><small>{ticket.ticket_number} · {ticket.status.replace(/_/g, " ")}</small><span>{refundDate(ticket.updated_at || ticket.created_at)}</span></button>)}{!tickets.length && <div className="customer-support-empty"><strong>{user ? "No requests yet" : "Sign in to see your history"}</strong><span>{user ? "Send a request above and your conversation will stay here." : "You can still send a general request as a guest using your email."}</span></div>}</div><SupportConversation key={selectedId} ticket={tickets.find((ticket) => ticket.id === selectedId)} messages={messages} user={user} onReply={reply} onEscalate={escalate} replyHours={replyHours} /></div></section>
  {requesting==='open'&&accountOrder&&<AfterSalesDialog order={accountOrder} onClose={()=>setRequesting(false)} onComplete={()=>{setRequesting(false);setStatus('Request submitted. Track your return and replacement in Your orders.');onNavigate('/orders');}}/>}</section></main>;
}

export function AfterSalesDialog({ order, onClose, onComplete, render }) {
  return <AfterSalesContent key={order.id} order={order} onClose={onClose} onComplete={onComplete} render={render} />;
}

function AfterSalesContent({ order, onClose, onComplete, render }) {
  const dialogRef = useRef(null);
  const initialized = useRef(false);
  const previousPolicies = useRef({});
  const [type, setType] = useState("refund");
  const [options,setOptions]=useState(null);
  const [lineId,setLineId]=useState('');
  const [quantities,setQuantities]=useState({});
  const [toSize, setToSize] = useState("");
  const demoPayment = ["cod", "demo"].includes(order?.payment_method);
  const [destination, setDestination] = useState(demoPayment ? "store_credit" : "original");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const chosenItem = options?.items.find(item=>item.line_id===lineId);
  const fromSize=chosenItem?.size||'';
  const productId=chosenItem?.product_id||'';
  const availableSizes = (chosenItem?.available_sizes||[]).filter(item=>item.stock>=Number(quantities[lineId]||1));
  const isExchangeUnavailable = type === "exchange" && !availableSizes.length;
  const selected=(options?.items||[]).filter(item=>quantities[item.line_id]>0 && (type!=='exchange'||item.line_id===lineId));
  const estimate=selected.reduce((sum,item)=>sum+Math.floor(item.amount_paise/(item.purchased_quantity||item.quantity))*quantities[item.line_id]+Math.max(0,Math.min(quantities[item.line_id],item.amount_paise%(item.purchased_quantity||item.quantity)-(item.returned_quantity||0))),0)/100;

  const refreshOptions = useSupportRefresh(`/api/orders/${encodeURIComponent(order.id)}/returns`, data => {
    if (!Array.isArray(data.items)) { setOptions(null); return; }
    setOptions(data); setStatus('');
    setLineId(current => data.items.some(item => item.line_id === current && item.returnable) ? current : data.items.find(item => item.returnable)?.line_id || '');
    const previous = previousPolicies.current;
    setQuantities(current => Object.fromEntries(data.items.map(item => [item.line_id, item.returnable ? Math.min(item.quantity, previous[item.line_id] === false ? item.quantity : current[item.line_id] ?? item.quantity) : 0])));
    previousPolicies.current = Object.fromEntries(data.items.map(item => [item.line_id, item.returnable]));
    if (!initialized.current) {
      if (!data.refund_available && data.exchange_available) setType('exchange');
      initialized.current = true;
    }
    if (!data.original_refund_available) setDestination('store_credit');
  }, setStatus);
  const blockedReason = !options ? 'Checking this order before you can submit.' : !options.eligible ? options.eligibility_message || 'This order is not eligible for a new request. Contact care for help.' : !selected.length ? 'Select at least one eligible item and quantity to continue.' : isExchangeUnavailable ? 'No replacement size is available for the selected quantity.' : type === 'exchange' && !availableSizes.some(item => item.size === toSize) ? 'Choose an available replacement size to continue.' : '';
  const careLink = `/support?order=${encodeURIComponent(order.order_number || order.id)}&topic=return_exchange`;

  useEffect(() => {
    const previous = document.activeElement;
    // Close remains focusable even while eligibility is loading or blocked.
    dialogRef.current?.querySelector('.modal-close')?.focus();
    return () => previous?.focus?.();
  }, []);
  function dialogKeys(event) {
    if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]")];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  async function submit(event) {
    event.preventDefault(); if (busy || blockedReason) return; setBusy(true); setStatus("");
    try { const { response, data } = await readJson(await apiFetch(`/api/orders/${encodeURIComponent(order.id)}/returns`, { method: "POST", body: JSON.stringify({ type: type === "refund" ? "return_refund" : type, reason, refund_destination: destination,items:selected.map(item=>({line_id:item.line_id,quantity:quantities[item.line_id]})),exchange_line_id:lineId, exchange_product_id: productId, exchange_from_size: fromSize, exchange_to_size: toSize }) })); if (!response.ok) throw new Error(data.error || "Request could not be submitted"); onComplete(data); } catch (requestError) { setStatus(requestError.message); } finally { setBusy(false); }
  }

  if (render) return render({ order, onClose, onComplete, type, setType, options, lineId, setLineId, quantities, setQuantities, toSize, setToSize, destination, setDestination, demoPayment, reason, setReason, status, busy, chosenItem, fromSize, availableSizes, selected, estimate, refreshOptions, blockedReason, careLink, submit });
  return <div className="modal-backdrop" role="presentation"><section ref={dialogRef} onKeyDown={dialogKeys} className="after-sales-dialog" role="dialog" aria-modal="true" aria-labelledby="after-sales-title">
    <div className="customer-support-form-head"><div><p className="eyebrow">After-sales care</p><h2 id="after-sales-title">{type === "exchange" ? "Exchange this item" : "Return / Refund"}</h2></div><button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close">×</button></div>
    <p className="muted">Order {order.order_number} · Delivered orders can be requested within the return window.</p>
    <form className="account-form" onSubmit={submit}>
<label>Request type<select disabled={busy || !options?.eligible} value={type} onChange={(event) => setType(event.target.value)}><option value="refund" disabled={options?.refund_available===false}>Return / Refund</option><option value="exchange" disabled={options?.exchange_available===false}>Exchange for another size</option></select></label>
      {!options && !status && <p role="status">Checking purchased items and live exchange stock…</p>}
      {options?.eligibility_message && <div className="return-eligibility-notice" role="status"><strong>Why you can’t submit yet</strong><p>{options.eligibility_message}</p><a className="secondary-action" href={careLink}>Contact care about this order</a></div>}
      <button type="button" className="secondary-action" disabled={busy} onClick={refreshOptions}>Refresh return eligibility</button>
      {options?.items.some(item=>item.policy_snapshot_known===false && !item.support_return_enabled) && <p className="inline-note">This older order has no saved return-policy record. Contact care to review an order-specific exception.</p>}
{type==='refund' && <fieldset><legend>Items to return</legend>{options?.items.map(item=><div className="return-item-choice" key={item.line_id}><strong>{item.product_name}</strong><small>{[item.color,item.size || 'One size'].filter(Boolean).join(' · ')}</small>{item.returnable ? <><span className="return-policy-tag">{item.support_return_enabled ? 'Care enabled a return exception for this order' : 'Eligible for standard returns'}</span><label>Quantity to return<select aria-label={`Quantity to return: ${item.product_name} ${item.size}`} value={quantities[item.line_id]||0} disabled={busy} onChange={event=>setQuantities(current=>({...current,[item.line_id]:Number(event.target.value)}))}>{Array.from({length:item.quantity+1},(_,i)=><option key={i} value={i}>{i===0?'Do not return this item':`${i} of ${item.quantity}`}</option>)}</select></label></> : <><span className="return-policy-tag">Not eligible for standard returns</span><p>You cannot select this item yet. Contact care for damaged, incorrect items or an order-specific exception.</p><a className="secondary-action" href={`${careLink}&item=${encodeURIComponent(item.line_id)}`}>Ask care about this item</a></>}</div>)}</fieldset>}
      {type === "exchange" && options?.eligible && <><label>Purchased item<select value={lineId} onChange={(event) => { setLineId(event.target.value); setToSize("");setQuantities(current=>({...current,[event.target.value]:current[event.target.value]||1})); }}>{options?.items.filter(item=>item.returnable).map(item=><option key={item.line_id} value={item.line_id}>{item.product_name} · {item.size || 'One size'}</option>)}</select></label><label>Current size<input value={fromSize} readOnly /></label>{chosenItem && <label>Quantity<select value={quantities[lineId]||1} onChange={event=>{setQuantities(current=>({...current,[lineId]:Number(event.target.value)}));setToSize('');}}>{Array.from({length:chosenItem.quantity},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>}{isExchangeUnavailable ? <p className="inline-note">No other size is available for this product. Please proceed with Return / Refund.</p> : <label>Replacement size<select required value={toSize} onChange={(event) => setToSize(event.target.value)}><option value="">Choose an available size</option>{availableSizes.map(item=><option key={item.size} value={item.size}>{item.size} · {item.stock} available</option>)}</select></label>}<p className="inline-note">Submitting an eligible exchange immediately places your ₹0 replacement for normal packing and delivery. Care arranges the original item’s return pickup separately.</p></>}
      {type !== "exchange" && options?.eligible && <>
        <label>Refund destination<select value={destination} onChange={(event) => setDestination(event.target.value)} disabled={demoPayment} aria-describedby="refund-destination-help"><option value="store_credit">Glamia store credits</option>{options?.original_refund_available && <option value="original">Original payment method</option>}</select>{demoPayment && <small className="form-hint">This payment method supports store-credit refunds only.</small>}</label>
        {selected.length>0 && <p className="inline-note">Requested amount: ₹{(destination==='store_credit'?Math.floor(estimate):estimate).toFixed(2)}. Discounts and order charges are allocated proportionally to selected items.{destination==='store_credit' && ' Credits are whole units; the fractional rupee is not issued. Choose original payment for an exact-paise refund where available.'}</p>}
        <div className="refund-destination-help" id="refund-destination-help">{destination === "store_credit" ? "Credits are issued after Glamia receives your return and an authorised admin approves the refund. They appear in your wallet, not your bank account." : "After Glamia approves the return and confirms courier collection or warehouse receipt, eligible original-payment refunds start automatically, subject to payment checks. Bank posting time varies. Any store credits used on the order are restored separately when the refund is confirmed."} Track each step in Your orders. Submitting this form does not issue money immediately.</div>
      </>}
      {options?.eligible && <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength="3" maxLength="500" rows="4" required placeholder="Tell us what happened…" /></label>}
      {status && <p className="inline-error" role="alert">{status}</p>}
      {blockedReason && <p className="return-submit-explanation" id="return-submit-explanation">{blockedReason}</p>}
      <div className="form-actions"><button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-action" aria-describedby={blockedReason ? 'return-submit-explanation' : undefined} disabled={busy || Boolean(blockedReason)}>{busy ? "Submitting…" : "Submit request"}</button></div>
    </form>
  </section></div>;
}
