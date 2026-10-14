import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { money, formatIST } from "../lib/commerce";
import { ReplacementOrderBadge } from './OrderDetails';
import { CancellationRefundCard } from './CancellationRefundCard';

function date(value) {
  return formatIST(value, {dateStyle:'medium',timeStyle:'medium'}) || '—';
}

export function CustomerOrderHistory({ customer, onBack }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState({ requestKey: "", orders: [], pagination: null, error: "" });
  const requestKey = JSON.stringify([customer.email, search, page, retry]);
  useEffect(() => {
    if (query.trim() === search) return undefined;
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: search, page: String(page), limit: "25" });
    apiFetch(`/api/admin/customers/${encodeURIComponent(customer.email)}/orders?${params}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Order history could not be loaded");
        if (!controller.signal.aborted) setResult({ requestKey, orders: data.orders || [], pagination: data.pagination, error: "" });
      }).catch(error => { if (!controller.signal.aborted) setResult({ requestKey, orders: [], pagination: null, error: error.message }); });
    return () => controller.abort();
  }, [customer.email, search, page, retry, requestKey]);
  const searching = query.trim() !== search;
  const loading = result.requestKey !== requestKey || searching;
  return <section className="admin-panel admin-wide-panel customer-order-history">
    <button type="button" className="secondary-action" onClick={onBack}>Back to customers</button>
    <div className="admin-panel-heading"><div><p className="eyebrow">Customer order history</p><h2>{customer.name || "Customer"}</h2><p className="muted">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p></div><span>{!loading && result.pagination ? `${result.pagination.total} ${search ? "matching " : ""}${result.pagination.total === 1 ? "order" : "orders"}` : "Orders"}</span></div>
    <div className="admin-filters"><label className="sr-only" htmlFor="customerOrderSearch">Search customer orders</label><input id="customerOrderSearch" type="search" placeholder="Search order number or product" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} />{query && <button type="button" className="secondary-action" onClick={() => setQuery("")}>Clear search</button>}</div>
    {loading ? <div className="loading-card" role="status">Loading order history…</div> : result.error ? <div role="alert"><p className="inline-error">{result.error}</p><button type="button" className="secondary-action" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : <>
      <div className="customer-history-orders">{result.orders.map(order => <article className="customer-history-order" key={order.id}>
        <ReplacementOrderBadge order={order}/>
        <div className="customer-history-order-heading"><div><h3>{order.order_number}</h3><time>{date(order.created_at)}</time></div><strong>{money(order.total)}</strong></div>
        <div className="customer-history-statuses"><span className={`status-pill status-${order.status}`}>{String(order.status || "pending").replaceAll("_", " ")}</span><span className={`status-pill status-${order.payment_status === "paid" ? "delivered" : order.payment_status === "failed" ? "cancelled" : "pending"}`}>Payment: {order.payment_status || "pending"}</span><span className="status-pill">{order.packing_status === "not_required" ? "Packing not required" : order.packing_status === "packed" ? "Packed" : "Awaiting pack"}</span></div>
        <p className="customer-history-payment">Payment method: {String(order.payment_method || "Not recorded").replaceAll("_", " ")}</p>
        <CancellationRefundCard order={order} admin/>
        <ul className="customer-history-items">{order.items.map((item, index) => <li key={index}><span>{item.name}{item.color ? ` · ${item.color}` : ""}{item.size ? ` · Size ${item.size}` : ""}</span><span>Qty {item.quantity}</span></li>)}</ul>
      </article>)}</div>
      {!result.orders.length && <div className="empty-state">{search ? "No orders match this search." : "This customer has not placed any orders yet."}</div>}
      {result.pagination?.pages > 1 && <nav className="customer-history-pagination" aria-label="Customer order history pages"><button type="button" className="secondary-action" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {result.pagination.pages}</span><button type="button" className="secondary-action" disabled={!result.pagination.has_more} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
    </>}
  </section>;
}
