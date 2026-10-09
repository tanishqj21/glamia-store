import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { money } from "../lib/commerce";
import { refundDate } from "../lib/refundTracking";

const label = value => String(value || "Not available").replaceAll("_", " ");

export function SupportOrderDetails({ order }) {
  return <div className="support-order-details">
    <div className="support-order-heading"><strong>{order.order_number || order.id}</strong><b>{money(order.total)}</b></div>
    <span className="support-order-date">Placed {refundDate(order.created_at) || "date unavailable"}</span>
    <div className="support-order-status"><span>Order · {label(order.status)}</span><span>Payment · {label(order.payment_status)}</span><span>Method · {label(order.payment_method)}</span></div>
    <ul>{(order.items || []).map((item, index) => <li key={`${item.product_id || item.id}-${index}`}><strong>{item.name || item.product_name || "Ordered item"}</strong><span>{[item.color || item.colour || item.variant, item.size && `Size ${item.size}`, `Qty ${item.quantity || 1}`].filter(Boolean).join(" · ")}</span></li>)}</ul>
    {order.tracking_number && <small>Tracking: {order.tracking_number}</small>}
    {order.shipping?.city && <small>Delivery: {[order.shipping.city, order.shipping.state, order.shipping.pin || order.shipping.postal_code].filter(Boolean).join(", ")}</small>}
  </div>;
}

export function SupportOrderPicker({ initialReference, onSelect, onNavigate }) {
  const [orders, setOrders] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    // No admin scope: even an owner sees only their own customer orders here.
    apiFetch("/api/orders", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Sign in again to see your orders." : "Your orders could not be loaded. Please try again.");
      if (!active) return;
      const entries = data.orders || [];
      setOrders(entries);
      if (initialReference) {
        const match = entries.find(order => [order.id, order.order_number].includes(initialReference));
        if (match) onSelect(match);
      }
    }).catch(cause => { if (active) setError(cause.name === "AbortError" ? "Loading your orders timed out. Please try again." : cause.message); }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [initialReference, onSelect, retry]);
  const matches = orders.filter(order => [order.order_number, order.id, order.status, ...(order.items || []).flatMap(item => [item.name, item.product_name, item.color, item.size])].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="support-order-picker" aria-labelledby="support-order-picker-title">
    <p className="eyebrow">01 / Choose your order</p><h3 id="support-order-picker-title">Which order needs help?</h3><p className="muted">Choose from your own orders. You can ask about any status; sending a support request does not approve a return or issue a refund.</p>
    {loading ? <div className="support-order-loading" role="status">Loading your order details…</div> : error ? <div><p className="inline-error" role="alert">{error}</p><button type="button" className="secondary-action" onClick={() => { setError(""); setLoading(true); setOrders([]); setRetry(value => value + 1); }}>Retry loading orders</button></div> : orders.length ? <>
      <label className="support-order-search">Search your orders<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Order number, product, colour or size" /></label>
      <p className="form-hint" role="status">{matches.length} of {orders.length} orders</p>
      <div className="support-order-options">{matches.map(order => <button type="button" className="support-order-option" key={order.id} onClick={() => onSelect(order)} aria-label={`Choose order ${order.order_number || order.id}`}><SupportOrderDetails order={order} /><span className="support-order-select">Choose this order</span></button>)}</div>
      {!matches.length && <p className="inline-note">No matching orders. Try another product name or clear your search.</p>}
    </> : <div className="customer-support-empty"><strong>No orders on this account yet</strong><span>Use the account that placed the order, or choose another support topic for general help.</span><button type="button" className="secondary-action" onClick={() => onNavigate("/orders")}>Open your orders</button></div>}
  </section>;
}
