import { useEffect, useId, useState } from "react";
import { apiFetch } from "../lib/api";
import { money } from "../lib/commerce";

export function AdminOrderAfterSales({ order, onNavigate }) {
  const id = useId();
  const [open, setOpen] = useState(false), [options, setOptions] = useState(null), [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [type, setType] = useState("refund"), [destination, setDestination] = useState("original"), [reason, setReason] = useState("");
  const [lineIndex, setLineIndex] = useState("0"), [toSize, setToSize] = useState("");
  const [override, setOverride] = useState(false), [exception, setException] = useState("");
  const [quantities,setQuantities]=useState({}),[policyOverride,setPolicyOverride]=useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    apiFetch(`/api/admin/returns/orders/${encodeURIComponent(order.id)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request options could not be loaded");
      if (!active) return;
      setOptions(data);
      setQuantities(Object.fromEntries((data.purchased_items||[]).map(item=>[item.line_id,item.quantity])));
      setDestination(data.original_refund_available ? "original" : "store_credit");
      setType(data.refund_available ? "refund" : "exchange");
    }).catch(cause => { if (active) setError(cause.name === "AbortError" ? "Checking the order timed out. Recheck the order and stock to try again." : cause.message); }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [open, order.id, version]);
  const line = options?.exchange_items?.[Number(lineIndex)];
  const selected=(options?.purchased_items||[]).filter(item=>Number(quantities[item.line_id])>0 && (type!=='exchange'||item.line_id===line?.line_id));
  const policyException=selected.some(item=>!item.returnable);
  const estimate=selected.reduce((sum,item)=>sum+Math.floor(item.amount_paise/item.quantity)*Number(quantities[item.line_id])+Math.min(Number(quantities[item.line_id]),item.amount_paise%item.quantity),0)/100;
  const eligible = options?.order?.status === "delivered" && (type === "refund" ? options.refund_available : options.exchange_available);
  const canSubmit = eligible && selected.length>0 && (!policyException || (policyOverride&&options.can_override_return_window&&exception.trim().length>=10)) && !options.existing_request && (!options.return_window_expired || (override && options.can_override_return_window && exception.trim().length >= 10)) && reason.trim().length >= 3 && (type !== "exchange" || Boolean(toSize));
  function toggleOptions() {
    if (!open) { setLoading(true); setOptions(null); setError(""); setLineIndex("0"); setToSize(""); setOverride(false); setException(""); }
    setOpen(value => !value);
  }
  function recheck() { setLoading(true); setOptions(null); setError(""); setToSize(""); setVersion(value => value + 1); }
  async function submit(event) {
    event.preventDefault();
    if (busy || !canSubmit) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await apiFetch(`/api/admin/returns/orders/${encodeURIComponent(order.id)}`, { method: "POST", body: JSON.stringify({
        type, reason: reason.trim(), refund_destination: destination,
        items:selected.map(item=>({line_id:item.line_id,quantity:Number(quantities[item.line_id])})),
        exchange_line_id:type==='exchange'?line.line_id:undefined,
        exchange_product_id: type === "exchange" ? line.product_id : undefined,
        exchange_from_size: type === "exchange" ? line.size : undefined,
        exchange_to_size: type === "exchange" ? toSize : undefined,
        override_return_window: override, override_return_policy:policyOverride,override_reason: (override||policyOverride) ? exception.trim() : undefined,
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request could not be created");
      setOptions(current => ({ ...current, existing_request: data.request }));
      setSuccess(data.request?.type==='exchange' ? 'Exchange placed. The ₹0 replacement is in the normal packing queue. Arrange return pickup and save tracking in Returns.' : "Refund request created for the customer. Arrange return pickup and save tracking in Returns. No money has been refunded yet.");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <section className="admin-order-after-sales" aria-labelledby={`${id}-heading`}>
    <header><div><h3 id={`${id}-heading`}>Refund or exchange</h3><p className="muted">Create a request on the customer’s behalf. It stays linked to this order and is recorded in the audit log.</p></div><button className="secondary-action" type="button" aria-expanded={open} aria-controls={`${id}-form`} disabled={busy} onClick={toggleOptions}>{open ? "Close request options" : "Create refund / exchange"}</button></header>
    {open && <div id={`${id}-form`}>
      {loading && <p role="status">Checking payment, existing requests and replacement stock…</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {error && <button className="secondary-action" type="button" disabled={busy || loading} onClick={recheck}>Recheck order &amp; stock</button>}
      {success && <p className="inline-note" role="status">{success}</p>}
      {options?.existing_request ? <div className="admin-after-sales-existing"><strong>{options.existing_request.type === "exchange" ? "Exchange" : "Refund"} request · {options.existing_request.status.replaceAll("_", " ")}</strong><span>Reference: {options.existing_request.id}</span><button className="secondary-action" type="button" onClick={() => onNavigate("/admin/returns")}>Manage in Returns</button></div>
        : options && <form onSubmit={submit} className="admin-after-sales-form">
          {!eligible && <p className="inline-note">{options.order?.status !== "delivered" ? "Returns and exchanges open after delivery. For undelivered orders, use the cancellation workflow instead." : "This request needs an eligible settled payment. Unpaid or already-refunded orders cannot receive another refund."}</p>}
          <div className="form-row"><label>Request type<select value={type} disabled={busy} onChange={event => { setType(event.target.value); setToSize(""); }}><option value="refund" disabled={!options.refund_available}>Return / Refund</option><option value="exchange" disabled={!options.exchange_available}>Exchange for another size</option></select></label><div className="admin-after-sales-customer"><small>For customer</small><strong>{options.order.customer_name || "Customer"}</strong><span>{options.order.customer_email}</span></div></div>
          <fieldset><legend>Purchased quantities to return</legend>{options.purchased_items?.filter(item=>type!=='exchange'||item.line_id===line?.line_id).map(item=><label key={item.line_id}>{item.product_name} · {item.size||'One size'}<select value={quantities[item.line_id]||0} disabled={busy} onChange={event=>setQuantities(current=>({...current,[item.line_id]:Number(event.target.value)}))}>{Array.from({length:item.quantity+1},(_,i)=><option key={i} value={i}>{i===0?'Keep this item':`${i} of ${item.quantity}`}</option>)}</select>{!item.returnable&&<small>Not eligible for standard returns</small>}</label>)}</fieldset>
          {policyException && <div className="admin-after-sales-exception"><label className="checkbox-label"><input type="checkbox" checked={policyOverride} disabled={busy||!options.can_override_return_window} onChange={e=>setPolicyOverride(e.target.checked)}/>Authorise a purchased-return-policy exception as an owner</label><label>Policy exception reason (audit log)<textarea value={exception} onChange={e=>setException(e.target.value)} minLength={10} maxLength={500}/></label></div>}
          {type === "refund" && <><label>Refund destination<select value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}><option value="original" disabled={!options.original_refund_available}>Original payment method</option><option value="store_credit">Glamia store credits</option></select></label><p className="inline-note">Requested amount: {money(destination === "original" ? estimate : Math.floor(estimate))}. {destination === "original" ? "Creating a request does not send money. Owner-confirmed receipt starts eligible refunds for the selected items, using a proportional payment split." : "Whole credits are issued only after return receipt and owner approval. Fractional rupees are not issued as credits."}</p></>}
          {type === "exchange" && <><div className="form-row"><label>Purchased item<select value={lineIndex} disabled={busy} onChange={event => { setLineIndex(event.target.value); setToSize(""); }}>{options.exchange_items.map((item, index) => <option value={index} key={`${item.product_id}-${item.size}`}>{item.product_name} · {item.size} · Qty {item.quantity}</option>)}</select></label><label>Replacement size<select value={toSize} disabled={busy || !line?.available_sizes.filter(item=>item.stock>=Number(quantities[line.line_id]||1)).length} required onChange={event => setToSize(event.target.value)}><option value="">Choose an available size</option>{line?.available_sizes.filter(item=>item.stock>=Number(quantities[line.line_id]||1)).map(item => <option key={item.size} value={item.size}>{item.size} · {item.stock} in stock</option>)}</select></label></div>{!line?.available_sizes.length && <p className="inline-note">No different size has enough stock. Choose another purchased item or use Return / Refund.</p>}<p className="inline-note">Submission immediately places the selected quantity in a ₹0 replacement for normal packing and delivery. Arrange the original item’s return pickup separately.</p></>}
          <label>Reason for this request<textarea value={reason} disabled={busy} onChange={event => setReason(event.target.value)} required minLength={3} maxLength={500} rows={3} placeholder="Explain the customer's request. This reason is visible to the customer." /></label>
          {options.return_window_expired && <div className="admin-after-sales-exception"><strong>Outside the {options.return_window_days}-day return window</strong>{options.can_override_return_window ? <><label className="checkbox-label"><input type="checkbox" checked={override} disabled={busy} onChange={event => setOverride(event.target.checked)} />Authorise a return-window exception as an owner</label>{override && <label>Exception reason (audit log)<textarea value={exception} disabled={busy} onChange={event => setException(event.target.value)} required minLength={10} maxLength={500} rows={2} /></label>}</> : <p>A whitelisted owner must authorise any return-window exception. Payment and stock safeguards still apply.</p>}</div>}
          <div className="admin-after-sales-submit"><small>This starts at Requested, not Received or Refunded. The customer receives the normal request email.</small><button className="primary-action" disabled={busy || !canSubmit}>{busy ? "Creating request…" : type === "exchange" ? "Create exchange request" : "Create refund request"}</button></div>
        </form>}
    </div>}
  </section>;
}
