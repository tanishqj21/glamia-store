import { formatIST } from '../lib/commerce';
import { useState } from "react";
import { apiFetch } from "../lib/api";
import { CancellationRefundCard } from './CancellationRefundCard';

const trackingSteps = ["pending", "confirmed", "shipped", "delivered"];

function statusLabel(value) {
  return String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value) {
  return value ? formatIST(value) : "—";
}

export function OrderTrackingPage() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setOrder(null);
    try {
      const response = await apiFetch(`/api/order-tracking?order_id=${encodeURIComponent(orderId)}&email=${encodeURIComponent(email)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Order could not be found");
      setOrder(data.order);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  const currentStatus = order?.status || "pending";
  const currentIndex = trackingSteps.indexOf(currentStatus);
  const isCancelled = currentStatus === "cancelled";
  return <main className="page-main"><section className="account-page tracking-page"><p className="eyebrow">Order care</p><h1 className="page-title">Track your order</h1><p className="tracking-intro">Enter the order number from your confirmation and the email used at checkout. Guest orders stay private without signing in.</p><form className="tracking-search" onSubmit={search}><label htmlFor="trackingOrderId">Order number<input id="trackingOrderId" value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="GM-20260911-ABC123" required autoComplete="off" /></label><label htmlFor="trackingEmail">Checkout email<input id="trackingEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required autoComplete="email" /></label><button className="primary-action" disabled={busy}>{busy ? "Searching…" : "Track order"} </button></form>{status && <p className="inline-error" role="alert">{status}</p>}{order && <section className="tracking-result" aria-live="polite" aria-labelledby="tracking-result-title"><div className="tracking-result-head"><div><p className="eyebrow">{order.order_type === "replacement" ? "Replacement product order" : "Order status"}</p><h2 id="tracking-result-title">{order.order_number}</h2><p className="muted">Placed {date(order.created_at)} · {String(order.payment_method || "demo").toUpperCase()}</p></div><span className={`status-pill status-${currentStatus}`}>{statusLabel(currentStatus)}</span></div>{isCancelled ? <p className="tracking-cancelled">This order was cancelled. Please contact support if you need help.</p> : <div className="tracking-timeline" aria-label={`Order status: ${statusLabel(currentStatus)}`}>{trackingSteps.map((step, index) => <div className={`tracking-step ${index <= currentIndex ? "is-complete" : ""} ${step === currentStatus ? "is-current" : ""}`} key={step}><span aria-hidden="true">{index <= currentIndex ? "✓" : index + 1}</span><strong>{statusLabel(step)}</strong></div>)}</div>}{isCancelled && <CancellationRefundCard order={order}/>}<div className="tracking-meta"><div><span>Last updated</span><strong>{date(order.updated_at || order.created_at)}</strong></div><div><span>Courier tracking</span><strong>{order.tracking_number || "Not assigned yet"}</strong></div></div>{order.items?.length > 0 && <div className="tracking-items"><p className="eyebrow">Items</p>{order.items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}{item.size ? ` · Size ${item.size}` : ""}</span><strong>× {item.quantity}</strong></div>)}</div>}</section>}</section></main>;
}
